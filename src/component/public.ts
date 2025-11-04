import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import { options, runResult } from "./schema.js";
import { finishExecutionHandler, startRun } from "./run.js";

export const start = mutation({
  args: {
    functionHandle: v.string(),
    functionArgs: v.any(),
    options,
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await startRun(
      ctx,
      args.functionHandle,
      args.functionArgs,
      args.options,
    );
  },
});

export const status = query({
  args: {
    runId: v.string(),
  },
  returns: v.union(
    v.object({
      type: v.literal("inProgress"),
    }),
    v.object({
      type: v.literal("completed"),
      result: runResult,
    }),
  ),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("runs", args.runId);
    if (!id) {
      throw new Error(`Run ${args.runId} not found`);
    }
    const run = await ctx.db.get(id);
    if (!run) {
      throw new Error(`Run ${args.runId} not found`);
    }
    if (run.state.type === "inProgress") {
      return { type: "inProgress" as const };
    } else if (run.state.type === "completed") {
      return { type: "completed" as const, result: run.state.result };
    } else {
      throw new Error(`Invalid run state: ${JSON.stringify(run.state)}`);
    }
  },
});

export const cancel = mutation({
  args: {
    runId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("runs", args.runId);
    if (!id) {
      return false;
    }
    const run = await ctx.db.get(id);
    if (!run) {
      return false;
    }
    if (run.state.type !== "inProgress") {
      return false;
    }
    const schedulerId = run.state.schedulerId;
    if (!schedulerId) {
      return false;
    }
    // Note that this doesn't terminate execution immediately, but
    // we are guaranteed that `finishExecution` won't succeed.
    await ctx.scheduler.cancel(schedulerId);
    await finishExecutionHandler(ctx, {
      runId: id,
      result: { type: "canceled" },
    });
    return true;
  },
});

export const cleanup = mutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("runs", args.runId);
    if (!id) {
      throw new Error(`Run ${args.runId} not found`);
    }
    const run = await ctx.db.get(id);
    if (!run) {
      throw new Error(`Run ${args.runId} not found`);
    }
    if (run.state.type !== "completed") {
      throw new Error(`Run ${args.runId} hasn't completed.`);
    }
    await ctx.db.delete(id);
  },
});
