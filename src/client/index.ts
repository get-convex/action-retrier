import { createFunctionHandle, Expand, FunctionArgs, FunctionReference, GenericActionCtx, GenericDataModel, GenericMutationCtx } from "convex/server";
import { api } from "../component/_generated/api.js"
import { GenericId } from "convex/values";

export type Options = {
  /**
   * Initial delay before checking action status, in milliseconds. Defaults to 100.
   */
  waitBackoffMs?: number,
  /**
   * Iniital delay before retrying a failure, in milliseconds. Defaults to 100.
   */
  retryBackoffMs?: number,
  /**
   * Base for the exponential backoff. Defaults to 2.
   */
  base?: number,
  /**
   * The maximum number of times to retry failures. Defaults to 16.
   */
  maxFailures?: number,
}

const DEFAULT_WAIT_BACKOFF_MS = 100;
const DEFAULT_RETRY_BACKOFF_MS = 100;
const DEFAULT_BASE = 2;
const DEFAULT_MAX_FAILURES = 16;

export class ActionRetrier {
  options: Required<Options>;

  /**
   * Create a new ActionRetrier, which retries failed actions with exponential backoff.
   * ```ts
   * import { components } from "./_generated/server"
   * const actionRetrier = new ActionRetrier(components.actionRetrier)
   * 
   * // In a mutation or action...
   * await actionRetrier.runWithRetries(ctx, internal.module.myAction, { arg: 123 });
   * ```
   * 
   * @param component - The registered action retrier from `components`.
   * @param options - Optional overrides for the default backoff and retry behavior.
   */
  constructor(private component: UseApi<typeof api>, options?: Options) {
    this.options = {
      waitBackoffMs: options?.waitBackoffMs ?? DEFAULT_WAIT_BACKOFF_MS,
      retryBackoffMs: options?.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS,
      base: options?.base ?? DEFAULT_BASE,
      maxFailures: options?.maxFailures ?? DEFAULT_MAX_FAILURES,
    };    
  }

  /**
   * 
   * @param ctx - The context object from your mutation or action.
   * @param reference - The function reference to run, e.g., `internal.module.myAction`.
   * @param args - Arguments for the action, e.g., `{ arg: 123 }`.
   * @param options - Optional overrides for the default backoff and retry behavior.
   */
  async runWithRetries<F extends FunctionReference<"action", any, any, any>>(
    ctx: GenericMutationCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    reference: F,
    args?: FunctionArgs<F>,
    options?: Options,  
  ): Promise<void> {
    const filledArgs = args ?? {};
    const filledOptions = {...this.options, ...(options ?? {})};
    const handle = await createFunctionHandle(reference);
    await ctx.runMutation(this.component.index.runWithRetries, {
      functionHandle: handle,
      functionArgs: filledArgs,
      options: filledOptions,
    });  
  }
}

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