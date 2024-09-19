import { v } from "convex/values";
import {
  components,
  internalAction,
  internalMutation,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ActionRetrier, runResultValidator } from "../../src/client/index.js";

const actionRetrier = new ActionRetrier(components.actionRetrier);

// You can fetch data from and send data to third-party APIs via an action:
export const myAction = internalAction({
  args: { action: v.string() },
  handler: async (_ctx, { action }) => {
    switch (action) {
      case "succeed":
        console.log("success");
        break;
      case "fail randomly":
        if (Math.random() < 0.8) {
          throw new Error("action failed.");
        }
        console.log("action succeded.");
        break;
      case "fail always":
        throw new Error("action failed.");
      default:
        throw new Error("invalid action");
    }
  },
});

export const completion = internalMutation({
  args: {
    result: runResultValidator,
  },
  handler: async (ctx, args) => {
    console.log(args.result);
  },
});

export const kickoffMyAction = mutation({
  args: {
    action: v.string(),
  },
  handler: async (ctx, args) => {
    const id: any = await actionRetrier.run(
      ctx,
      internal.myFunctions.myAction,
      {
        action: args.action,
      },
      {
        initialBackoffMs: 1000,
        base: 2,
        maxFailures: 2,
        onComplete: internal.myFunctions.completion,
      },
    );
    return id;
  },
});
