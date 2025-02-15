import {
  createFunctionHandle,
  Expand,
  FunctionArgs,
  FunctionReference,
  FunctionVisibility,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { api } from "../component/_generated/api.js";
import { GenericId, v, VString } from "convex/values";
import { LogLevel, RunResult, runResult } from "../component/schema.js";

export type RunId = string & { __isRunId: true };
export const runIdValidator = v.string() as VString<RunId>;
export const onCompleteValidator = v.object({
  runId: runIdValidator,
  result: runResult,
});

export type RunStatus =
  | { type: "inProgress" }
  | { type: "completed"; result: RunResult };

export type Options = {
  /**
   * Iniital delay before retrying a failure, in milliseconds. Defaults to 250ms.
   */
  initialBackoffMs?: number;
  /**
   * Base for the exponential backoff. Defaults to 2.
   */
  base?: number;
  /**
   * The maximum number of times to retry failures before giving up. Defaults to 4.
   */
  maxFailures?: number;
  /**
   * The log level for the retrier. Defaults to `INFO`.
   */
  logLevel?: LogLevel;
};

export type RunOptions = Options & {
  /**
   * A mutation to run after the action succeeds, fails, or is canceled.
   * You can use the `onCompleteValidator` as an argument validator, like:
   * ```ts
   * export const onComplete = mutation({
   *   args: onCompleteValidator,
   *   handler: async (ctx, args) => {
   *     // ...
   *   },
   * });
   * ```
   */
  onComplete?: FunctionReference<
    "mutation",
    FunctionVisibility,
    { runId: RunId; result: RunResult }
  >;
};

const DEFAULT_INITIAL_BACKOFF_MS = 250;
const DEFAULT_BASE = 2;
const DEFAULT_MAX_FAILURES = 4;

export class ActionRetrier {
  options: Required<Options>;

  /**
   * Create a new ActionRetrier, which retries failed actions with exponential backoff.
   * ```ts
   * import { components } from "./_generated/server"
   * const actionRetrier = new ActionRetrier(components.actionRetrier)
   *
   * // In a mutation or action...
   * await actionRetrier.run(ctx, internal.module.myAction, { arg: 123 });
   * ```
   *
   * @param component - The registered action retrier from `components`.
   * @param options - Optional overrides for the default backoff and retry behavior.
   */
  constructor(
    private component: UseApi<typeof api>,
    options?: Options,
  ) {
    let DEFAULT_LOG_LEVEL: LogLevel = "INFO";
    if (process.env.ACTION_RETRIER_LOG_LEVEL) {
      if (
        !["DEBUG", "INFO", "WARN", "ERROR"].includes(
          process.env.ACTION_RETRIER_LOG_LEVEL,
        )
      ) {
        console.warn(
          `Invalid log level (${process.env.ACTION_RETRIER_LOG_LEVEL}), defaulting to "INFO"`,
        );
      }
      DEFAULT_LOG_LEVEL = process.env.ACTION_RETRIER_LOG_LEVEL as LogLevel;
    }
    this.options = {
      initialBackoffMs: options?.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS,
      base: options?.base ?? DEFAULT_BASE,
      maxFailures: options?.maxFailures ?? DEFAULT_MAX_FAILURES,
      logLevel: options?.logLevel ?? DEFAULT_LOG_LEVEL,
    };
  }

  /**
   * Run an action with retries, optionally with an `onComplete` mutation callback.
   *
   * @param ctx - The context object from your mutation or action.
   * @param reference - The function reference to run, e.g., `internal.module.myAction`.
   * @param args - Arguments for the action, e.g., `{ arg: 123 }`.
   * @param options.initialBackoffMs - Optional override for the default initial backoff on failure.
   * @param options.base - Optional override for the default base for the exponential backoff.
   * @param options.maxFailures - Optional override for the default maximum number of retries.
   * @param options.onComplete - Optional mutation to run after the function succeeds, fails,
   * or is canceled. This function must take in a single `result` argument of type `RunResult`: use
   * `runResultValidator` to validate this argument.
   * @returns - A `RunId` for the run that can be used to query its status below.
   */
  async run<F extends FunctionReference<"action", FunctionVisibility>>(
    ctx: RunMutationCtx,
    reference: F,
    args?: FunctionArgs<F>,
    options?: RunOptions,
  ): Promise<RunId> {
    const handle = await createFunctionHandle(reference);
    let onComplete: string | undefined;
    if (options?.onComplete) {
      onComplete = await createFunctionHandle(options.onComplete);
    }
    const runId = await ctx.runMutation(this.component.public.start, {
      functionHandle: handle,
      functionArgs: args ?? {},
      options: {
        ...this.options,
        ...stripUndefined(options),
        onComplete,
      },
    });
    return runId as RunId;
  }

  /**
   * Run an action like {@link run} but no earlier than a specific timestamp.
   *
   * @param ctx - The context object from your mutation or action.
   * @param runAtTimestampMs - The timestamp in milliseconds to run the action at.
   * @param reference - The function reference to run, e.g., `internal.module.myAction`.
   * @param args - Arguments for the action, e.g., `{ arg: 123 }`.
   * @param options - See {@link RunOptions}.
   */
  async runAt<F extends FunctionReference<"action", FunctionVisibility>>(
    ctx: RunMutationCtx,
    runAtTimestampMs: number,
    reference: F,
    args?: FunctionArgs<F>,
    options?: RunOptions,
  ) {
    const opts = {
      ...options,
      runAt: runAtTimestampMs,
    };
    return this.run(ctx, reference, args, opts);
  }

  /**
   * Run an action like {@link run} but no earlier than after specific delay.
   *
   * Note: the delay is from the time of calling this, not from when it's made
   * it to the front of the queue.
   *
   * @param ctx - The context object from your mutation or action.
   * @param runAfterMs - The delay in milliseconds before running the action.
   * @param reference - The function reference to run, e.g., `internal.module.myAction`.
   * @param args - Arguments for the action, e.g., `{ arg: 123 }`.
   * @param options - See {@link RunOptions}.
   */
  async runAfter<F extends FunctionReference<"action", FunctionVisibility>>(
    ctx: RunMutationCtx,
    runAfterMs: number,
    reference: F,
    args?: FunctionArgs<F>,
    options?: RunOptions,
  ) {
    const opts = {
      ...options,
      runAfter: runAfterMs,
    };
    return this.run(ctx, reference, args, opts);
  }

  /**
   * Query the status of a run.
   *
   * @param ctx - The context object from your query, mutation, or action.
   * @param runId - The `RunId` returned from `run`.
   * @returns - An object indicating whether the run is in progress or has completed. If
   * the run has completed, the `result.type` field indicates whether it succeeded,
   * failed, or was canceled.
   */
  async status(ctx: RunQueryCtx, runId: RunId): Promise<RunStatus> {
    return ctx.runQuery(this.component.public.status, { runId });
  }

  /**
   * Attempt to cancel a run. This method throws if the run isn't currently executing.
   * If the run is currently executing (and not waiting for retry), action execution may
   * continue after this method successfully returns.
   *
   * @param ctx - The context object from your mutation or action.
   * @param runId - The `RunId` returned from `run`.
   */
  async cancel(ctx: RunMutationCtx, runId: RunId) {
    await ctx.runMutation(this.component.public.cancel, { runId });
  }

  /**
   * Cleanup a completed run's storage from the system. This method throws if the run
   * doesn't exist or isn't in the completed state.
   *
   * The system will also automatically clean up runs that are more than 7 days old.
   *
   * @param ctx - The context object from your mutation or action.
   * @param runId - The `RunId` returned from `run`.
   */
  async cleanup(ctx: RunMutationCtx, runId: RunId) {
    await ctx.runMutation(this.component.public.cleanup, { runId });
  }
}

function stripUndefined<T extends object | undefined>(obj: T): T {
  if (obj === undefined) {
    return obj;
  }
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined),
  ) as T;
}

/**
 * Validator for the `result` argument of the `onComplete` callback.
 */
export const runResultValidator = runResult;

type UseApi<API> = Expand<{
  [mod in keyof API]: API[mod] extends FunctionReference<
    infer FType,
    "public",
    infer FArgs,
    infer FReturnType,
    infer FComponentPath
  >
    ? FunctionReference<
        FType,
        "internal",
        OpaqueIds<FArgs>,
        OpaqueIds<FReturnType>,
        FComponentPath
      >
    : UseApi<API[mod]>;
}>;

type OpaqueIds<T> =
  T extends GenericId<infer _T>
    ? string
    : T extends (infer U)[]
      ? OpaqueIds<U>[]
      : T extends object
        ? { [K in keyof T]: OpaqueIds<T[K]> }
        : T;

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};
