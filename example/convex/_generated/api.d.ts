/* prettier-ignore-start */

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as example from "../example.js";

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
  example: typeof example;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {
  actionRetrier: {
    index: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          count?: number;
          key?: string;
          name: string;
          name2: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: boolean; retryAt?: number; ts?: number; value?: number }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          count?: number;
          key?: string;
          name: string;
          name2: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: boolean; retryAt?: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        any
      >;
    };
    public: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { runId: string },
        boolean
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { runId: string },
        any
      >;
      start: FunctionReference<
        "mutation",
        "internal",
        {
          functionArgs: any;
          functionHandle: string;
          options: {
            base: number;
            initialBackoffMs: number;
            logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
            maxFailures: number;
            onComplete?: string;
          };
        },
        string
      >;
      status: FunctionReference<
        "query",
        "internal",
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
};

/* prettier-ignore-end */
