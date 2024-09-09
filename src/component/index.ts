import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server.js";
import { FunctionHandle } from "convex/server";
import { internal } from "./_generated/api.js";

const options = {
  waitBackoffMs: v.number(),
  retryBackoffMs: v.number(),
  base: v.number(),
  maxFailures: v.number(),
};

export const runWithRetries = mutation({
  args: v.object({
    functionHandle: v.string(),
    functionArgs: v.any(),
    options: v.object(options),
  }),
  handler: async (ctx, args) => {
    const handle = args.functionHandle as FunctionHandle<"action", any, any>;
    const jobId = await ctx.scheduler.runAfter(0, handle, args.functionArgs);    
    await ctx.scheduler.runAfter(
      withJitter(args.options.waitBackoffMs),
      internal.index.retry,
      {
        job: jobId,
        functionHandle: args.functionHandle,
        functionArgs: args.functionArgs,
        options: args.options,
      }
    );    
  },
});

export const retry = internalMutation({
  args: {
    job: v.id("_scheduled_functions"),
    functionHandle: v.string(),
    functionArgs: v.any(),
    options: v.object(options),
  },
  handler: async (ctx, args) => {
    const handle = args.functionHandle as FunctionHandle<"action", any, any>;    
    const status = await ctx.db.system.get(args.job);
    if (!status) {
      // There is a chance a job will be deleted - after 7 days.
      // For now, we give up. In the future you could store information about
      // the job's status in a table to know whether to keep retrying.
      // Or pessimistically just try it again.
      throw new Error(`Job ${args.job} not found`);
    }
    switch (status.state.kind) {
      case "pending":
      case "inProgress": {
        const nextCheck = withJitter(args.options.waitBackoffMs);
        console.log(
          `Job ${args.job} not yet complete, ` +
            `checking again in ${nextCheck.toFixed(2)} ms.`,
        ); 
        args.options.waitBackoffMs = args.options.retryBackoffMs * args.options.base;
        await ctx.scheduler.runAfter(nextCheck, internal.index.retry, args);        
        break;
      }
      case "failed": {
        if (args.options.maxFailures <= 0) {
          console.log(`Job ${args.job} failed too many times, not retrying.`);
          break;
        }
        const nextAttempt = withJitter(args.options.retryBackoffMs);        
        const newJobId = await ctx.scheduler.runAfter(
          withJitter(args.options.retryBackoffMs),
          handle,
          args.functionArgs,
        );
        console.log(
          `Job ${args.job} failed, retrying in ${nextAttempt.toFixed(2)} ms as ${newJobId}`,
        );

        const nextCheck = withJitter(args.options.retryBackoffMs + args.options.waitBackoffMs);
        args.job = newJobId;
        args.options.retryBackoffMs = args.options.retryBackoffMs * args.options.base;
        args.options.maxFailures = args.options.maxFailures - 1;
        await ctx.scheduler.runAfter(nextCheck, internal.index.retry, args);                  
        break;
      }
      case "success": {
        console.log(`Job ${args.job} succeeded.`);
        break;
      }
      case "canceled": {
        console.log(`Job ${args.job} was canceled. Not retrying.`);
        break;
      }
    }          
  }
})

function withJitter(delay: number) {
  return delay * (0.5 + Math.random());
}