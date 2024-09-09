import { v } from "convex/values";
import { components, internalAction, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ActionRetrier } from "../../src/client/index.js";

const actionRetrier = new ActionRetrier(components.actionRetrier);

// You can fetch data from and send data to third-party APIs via an action:
export const myAction = internalAction({
  args: { failureRate: v.number() }, // 0.0 - 1.0
  handler: async (_ctx, { failureRate }) => {
    console.log("Running an action with failure rate " + failureRate);
    if (Math.random() < failureRate) {
      throw new Error("action failed.");
    }
    console.log("action succeded.");
  },
});

export const kickoffMyAction = mutation({
  handler: async (ctx) => {
    await actionRetrier.runWithRetries(ctx, internal.myFunctions.myAction, { 
      failureRate: 0.8,
    })
  }
})