import type { FunctionHandle } from "convex/server";
import { v } from "convex/values";
import {
  internalAction,
  internalQuery,
  internalMutation,
  type MutationCtx,
} from "./_generated/server.js";
import {
  runResult,
  type Options,
  type RunResult,
  type RunState,
} from "./schema.js";
import { internal } from "./_generated/api.js";
import { createLogger } from "./utils.js";
import type { Id } from "./_generated/dataModel.js";

export async function startRun(
  ctx: MutationCtx,
  functionHandle: string,
  functionArgs: any,
  options: Options,
) {
  const logger = createLogger(options.logLevel);
  const startTime = options.runAt ?? Date.now() + (options.runAfter ?? 0);
  const run = {
    functionHandle,
    functionArgs,
    options,
    state: { type: "inProgress", startTime } as RunState,
    numFailures: 0,
  };
  const runId = await ctx.db.insert("runs", run);
  const schedulerId = await ctx.scheduler.runAt(
    startTime,
    internal.run.execute,
    { runId },
  );
  run.state = {
    type: "inProgress",
    schedulerId,
    startTime,
  };
  await ctx.db.replace(runId, run);
  logger.debug(`Started run ${runId} @ ${startTime}`, run);

  const nextHeartbeat = startTime + withJitter(HEARTBEAT_INTERVAL_MS);
  const heartbeatId = await ctx.scheduler.runAt(
    nextHeartbeat,
    internal.run.heartbeat,
    { runId },
  );
  logger.debug(
    `Scheduled heartbeat for ${runId} in ${nextHeartbeat}ms: ${heartbeatId}`,
  );

  return runId;
}

export const execute = internalAction({
  args: {
    runId: v.id("runs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.run.load, { runId: args.runId });
    const logger = createLogger(run.options.logLevel);
    logger.debug(`Executing run ${args.runId}`, run);

    // Do a best effort check to see if we're already been completed.
    if (run.state.type === "completed") {
      logger.warn(
        `Run ${args.runId} already completed (state: ${run.state.result.type})`,
      );
      return;
    }
    if (run.state.type !== "inProgress" || !run.state.schedulerId) {
      throw new Error(
        `Invalid run state for ${args.runId}: ${JSON.stringify(run.state)}`,
      );
    }

    const handle = run.functionHandle as FunctionHandle<"action">;
    let result: RunResult;
    try {
      const startTime = Date.now();
      logger.debug(`Starting executing ${args.runId}`);
      const functionResult = await ctx.runAction(handle, run.functionArgs);
      const duration = Date.now() - startTime;
      logger.debug(
        `Finished executing ${args.runId} (${duration.toFixed(2)}ms)`,
      );
      result = {
        type: "success",
        returnValue: functionResult,
      };
    } catch (e: any) {
      logger.error(`Error executing ${args.runId}: ${e.message}`);
      result = {
        type: "failed",
        error: e.message,
      };
    }
    await ctx.runMutation(internal.run.finishExecution, {
      runId: args.runId,
      result,
    });
  },
});

// Since we clean ourselves up at the end of an action (even one that throws an exception),
// we only need heartbeats to detect when an action fails due to infrastructure failures
// or a timeout. Therefore, we don't need to let the user configure this polling interval.
//
// Later, we can removing polling entirely and have the heartbeat mutation be triggered by
// writes to the `_scheduled_functions` table.
const HEARTBEAT_INTERVAL_MS = 10_000;
const TRANSIENT_ERROR_MESSAGE = "Transient error when executing action";

export const heartbeat = internalMutation({
  args: {
    runId: v.id("runs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      return;
    }
    const logger = createLogger(run.options.logLevel);
    if (run.state.type !== "inProgress" || !run.state.schedulerId) {
      logger.debug(
        `Run ${args.runId} is no longer executing, skipping heartbeat`,
      );
      return;
    }
    const status = await ctx.db.system.get(run.state.schedulerId);
    logger.debug(`Run ${args.runId} scheduler status`, status);

    if (!status) {
      // If the scheduler entry has gone but we didn't update the run, we must
      // have (1) had a transient failure but then (2) not have the heartbeat
      // run for seven days. Consider this a transient error and retry.
      logger.warn(
        `Missing scheduler state for ${args.runId}:${run.state.schedulerId}.`,
      );
      const result: RunResult = {
        type: "failed",
        error: TRANSIENT_ERROR_MESSAGE,
      };
      await finishExecutionHandler(ctx, { runId: args.runId, result });
      return;
    }
    switch (status.state.kind) {
      // If we're pending or inProgress, schedule ourselves for a jittered
      // check in the future.
      case "pending":
      case "inProgress": {
        const nextCheck = withJitter(HEARTBEAT_INTERVAL_MS);
        const nextHeartbeatId = await ctx.scheduler.runAfter(
          nextCheck,
          internal.run.heartbeat,
          {
            runId: args.runId,
          },
        );
        logger.debug(
          `Scheduled next heartbeat for ${args.runId} at ${nextCheck}: ${nextHeartbeatId}`,
        );
        break;
      }
      // If the run failed but we still think it's executing, our
      // `execute` action must have died (either due to a timeout or
      // infrastructural failure).
      case "failed": {
        logger.debug(`Finishing run ${args.runId} after scheduler failure`);
        const result: RunResult = {
          type: "failed",
          error: TRANSIENT_ERROR_MESSAGE,
        };
        await finishExecutionHandler(ctx, { runId: args.runId, result });
        break;
      }
      // If the run succeeded but we think it's still executing, we
      // must have a broken invariant, since we don't return successfully
      // from `execute` without updating the run.
      case "success": {
        throw new Error(`Invalid scheduler state for ${args.runId}`);
      }
      // If the user canceled the action from the dashboard (sidestepping
      // our cancelation logic), mark ourselves as canceled.
      case "canceled": {
        logger.debug(`Finishing run ${args.runId} after scheduler cancelation`);
        const result: RunResult = { type: "canceled" };
        await finishExecutionHandler(ctx, { runId: args.runId, result });
        break;
      }
    }
  },
});

export const load = internalQuery({
  args: {
    runId: v.id("runs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error(`Run ${args.runId} not found`);
    }
    const logger = createLogger(run.options.logLevel);
    logger.debug(`Loaded run ${args.runId}`, run);
    return run;
  },
});

export const finishExecution = internalMutation({
  args: {
    runId: v.id("runs"),
    result: runResult,
  },
  handler: finishExecutionHandler,
});

export async function finishExecutionHandler(
  ctx: MutationCtx,
  args: { runId: Id<"runs">; result: RunResult },
) {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error(`Run ${args.runId} not found`);
  }
  const logger = createLogger(run.options.logLevel);
  logger.debug(`Finishing an execution of ${args.runId}`, run, args.result);

  if (run.state.type !== "inProgress") {
    logger.warn(
      `Run ${args.runId} is no longer executing, dropping result.`,
      args.result,
    );
    return;
  }

  // If we failed and have retries remaining, schedule a retry.
  if (
    args.result.type === "failed" &&
    run.numFailures < run.options.maxFailures
  ) {
    const backoffMs =
      run.options.initialBackoffMs *
      Math.pow(run.options.base, run.numFailures + 1);
    const nextAttempt = withJitter(backoffMs);
    const startTime = Date.now() + nextAttempt;
    logger.error(
      `Run ${args.runId} failed, retrying in ${nextAttempt.toFixed(2)} ms: ${args.result.error}`,
    );
    const nextSchedulerId = await ctx.scheduler.runAt(
      startTime,
      internal.run.execute,
      {
        runId: args.runId,
      },
    );
    run.state.startTime = startTime;
    run.state.schedulerId = nextSchedulerId;
    run.numFailures = run.numFailures + 1;
    logger.debug(`Retrying run ${args.runId}`, run);
    await ctx.db.replace(args.runId, run);
  }
  // Otherwise, complete the current run.
  else {
    switch (args.result.type) {
      case "success": {
        logger.info(`Run ${args.runId} succeeded.`);
        break;
      }
      case "failed": {
        logger.error(
          `Run ${args.runId} failed too many times, not retrying: ${args.result.error}`,
        );
        break;
      }
      case "canceled": {
        logger.info(`Run ${args.runId} canceled.`);
        break;
      }
    }
    if (run.options.onComplete) {
      try {
        logger.debug(`Running onComplete handler for ${args.runId}`);
        const handle = run.options.onComplete as FunctionHandle<
          "mutation",
          { runId: Id<"runs">; result: RunResult }
        >;
        await ctx.runMutation(handle, {
          runId: args.runId,
          result: args.result,
        });
        logger.debug(`Finished running onComplete handler for ${args.runId}`);
      } catch (e: any) {
        logger.error(
          `Error running onComplete handler for ${args.runId}: ${e.message}`,
        );
      }
    }
    run.state = {
      type: "completed",
      completedAt: Date.now(),
      result: args.result,
    };
    logger.debug(`Finishing run ${args.runId}`, run);
    await ctx.db.replace(args.runId, run);
  }
}

function withJitter(delay: number) {
  return delay * (0.5 + Math.random());
}

const CLEANUP_MIN_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 1 week
const MAX_CLEANUP_BATCH = 1024;

export const cleanupExpiredRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - CLEANUP_MIN_AGE_MS;
    const expired = await ctx.db
      .query("runs")
      .withIndex("by_state", (q) =>
        q.eq("state.type", "completed").lt("state.completedAt", cutoff),
      )
      .take(1024);
    for (const doc of expired) {
      await ctx.db.delete(doc._id);
    }
    console.log(`Cleaned up ${expired.length} expired runs`);
    if (expired.length === MAX_CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.run.cleanupExpiredRuns, {});
    }
  },
});
