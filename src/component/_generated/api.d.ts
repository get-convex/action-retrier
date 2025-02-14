/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as public from "../public.js";
import type * as run from "../run.js";
import type * as utils from "../utils.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  public: typeof public;
  run: typeof run;
  utils: typeof utils;
}>;
export type Mounts = {
  public: {
    cancel: FunctionReference<"mutation", "public", { runId: string }, boolean>;
    cleanup: FunctionReference<"mutation", "public", { runId: string }, any>;
    start: FunctionReference<
      "mutation",
      "public",
      {
        functionArgs: any;
        functionHandle: string;
        options: {
          base: number;
          initialBackoffMs: number;
          logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
          maxFailures: number;
          onComplete?: string;
          runAfter?: number;
          runAt?: number;
        };
      },
      string
    >;
    status: FunctionReference<
      "query",
      "public",
      { runId: string },
      | { type: "inProgress" }
      | {
          result:
            | { returnValue: any; type: "success" }
            | { error: string; type: "failed" }
            | { type: "canceled" };
          type: "completed";
        }
    >;
  };
};
// For now fullApiWithMounts is only fullApi which provides
// jump-to-definition in component client code.
// Use Mounts for the same type without the inference.
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
