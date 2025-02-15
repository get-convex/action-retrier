import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
} from "./_generated/server";
import { internal, components } from "./_generated/api";
import {
  ActionRetrier,
  runResultValidator,
  RunId,
  runIdValidator,
} from "@convex-dev/action-retrier";

const actionRetrier = new ActionRetrier(components.actionRetrier);

const action = v.union(
  v.literal("succeed"),
  v.literal("fail randomly"),
  v.literal("fail always"),
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
    runId: runIdValidator,
    result: runResultValidator,
  },
  handler: async (ctx, args) => {
    console.log(args.runId, args.result);
  },
});

export const kickoffMyAction = mutation({
  args: { action },
  handler: async (ctx, args) => {
    const runId: RunId = await actionRetrier.run(
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
      },
    );
    return runId;
  },
});

export const kickoffMyActionLater = mutation({
  args: {},
  handler: async (ctx) => {
    const runId: RunId = await actionRetrier.runAfter(
      ctx,
      1000,
      internal.example.myAction,
      { action: "succeed" },
    );
    await ctx.scheduler.runAfter(500, internal.example.getStatus, {
      runId,
    });
    await actionRetrier.runAt(
      ctx,
      Date.now() + 700,
      internal.example.myAction,
      { action: "succeed" },
    );
    return runId;
  },
});

export const getStatus = internalMutation({
  args: { runId: runIdValidator },
  handler: async (ctx, args) => {
    console.log(await actionRetrier.status(ctx, args.runId));
  },
});
