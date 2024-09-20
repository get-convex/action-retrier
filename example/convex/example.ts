import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
} from "./_generated/server";
import { internal, components } from "./_generated/api";
import { ActionRetrier, runResultValidator } from "@convex-dev/action-retrier";

const actionRetrier = new ActionRetrier(components.actionRetrier);

const action = v.union(
  v.literal("succeed"),
  v.literal("fail randomly"),
  v.literal("fail always")
);

// You can fetch data from and send data to third-party APIs via an action:
export const myAction = internalAction({
  args: { action },
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
  args: { action },
  handler: async (ctx, args) => {
    const id: any = await actionRetrier.run(
      ctx,
      internal.example.myAction,
      {
        action: args.action,
      },
      {
        initialBackoffMs: 1000,
        base: 2,
        maxFailures: 2,
        onComplete: internal.example.completion,
      }
    );
    return id;
  },
});
