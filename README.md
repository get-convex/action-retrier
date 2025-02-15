# Convex Action Retrier

[![npm version](https://badge.fury.io/js/@convex-dev%2Faction-retrier.svg)](https://badge.fury.io/js/@convex-dev%2Faction-retrier)

<!-- START: Include on https://convex.dev/components -->

Actions can sometimes fail due to network errors, server restarts, or issues with a
3rd party API, and it's often useful to retry them. The Action Retrier component
makes this really easy.

```ts
import { ActionRetrier } from "@convex-dev/action-retrier";
import { components } from "./convex/_generated/server";

const retrier = new ActionRetrier(components.actionRetrier);

// `retrier.run` will automatically retry your action up to four times before giving up.
await retrier.run(ctx, internal.module.myAction, { arg: 123 });
```

The retrier component will run the action and retry it on failure, sleeping with exponential backoff, until the action succeeds or the maximum number of retries is reached.

## Pre-requisite: Convex

You'll need an existing Convex project to use the component.
Convex is a hosted backend platform, including a database, serverless functions,
and a ton more you can learn about [here](https://docs.convex.dev/get-started).

Run `npm create convex` or follow any of the [quickstarts](https://docs.convex.dev/home) to set one up.

## Installation

First, add `@convex-dev/action-retrier` as an NPM dependency:

```sh
npm install @convex-dev/action-retrier
```

Then, install the component into your Convex project within the `convex/convex.config.ts` configuration file:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import actionRetrier from "@convex-dev/action-retrier/convex.config";

const app = defineApp();
app.use(actionRetrier);
export default app;
```

Finally, create a new `ActionRetrier` within your Convex project, and point it to the installed component:

```ts
// convex/index.ts
import { ActionRetrier } from "@convex-dev/action-retrier";
import { components } from "./_generated/api";

export const retrier = new ActionRetrier(components.actionRetrier);
```

You can optionally configure the retrier's backoff behavior in the `ActionRetrier` constructor.

```ts
const retrier = new ActionRetrier(components.actionRetrier, {
  initialBackoffMs: 10000,
  base: 10,
  maxFailures: 4,
});
```

- `initialBackoffMs` is the initial delay after a failure before retrying (default: 250).
- `base` is the base for the exponential backoff (default: 2).
- `maxFailures` is the maximum number of times to retry the action (default: 4).

## API

### Starting a run

After installing the component, use the `run` method from either a mutation or action to kick off an action.

```ts
export const kickoffExampleAction = mutation({
  handler: async (ctx) => {
    const runId = await retrier.run(ctx, internal.index.exampleAction, {
      foo: "bar",
    });
    // ... optionally persist or pass along the runId
  },
});

export const exampleAction = internalAction({
  args: { foo: v.string() },
  handler: async (ctx, args) => {
    return operationThatMightFail(args);
  },
});
```

The return value of `retrier.run` is not the result of the action, but rather an ID that you can use to query its status or cancel it. The action's return value is saved along with the status, when it succeeds.

You can optionally specify overrides to the backoff parameters in an options argument.

```ts
export const kickoffExampleAction = action(async (ctx) => {
  const runId = await retrier.run(
    ctx,
    internal.index.exampleAction,
    { failureRate: 0.8 },
    {
      initialBackoffMs: 125,
      base: 2.71,
      maxFailures: 3,
    },
  );
});
```

You can specify an `onComplete` mutation callback in the options argument as well. This mutation is guaranteed to
eventually run exactly once.

```ts
// convex/index.ts

import { runResultValidator, runIdValidator } from "@convex-dev/action-retrier";

export const kickoffExampleAction = action(async (ctx) => {
  const runId = await retrier.run(
    ctx,
    internal.index.exampleAction,
    { failureRate: 0.8 },
    {
      onComplete: internal.index.exampleCallback,
    },
  );
});

export const exampleCallback = internalMutation({
  args: { id: runIdValidator, result: runResultValidator },
  handler: async (ctx, args) => {
    if (args.result.type === "success") {
      console.log(
        "Action succeeded with return value:",
        args.result.returnValue,
      );
    } else if (args.result.type === "failed") {
      console.log("Action failed with error:", args.result.error);
    } else if (args.result.type === "canceled") {
      console.log("Action was canceled.");
    }
  },
});
```

### Run status

The `run` method returns a `RunId`, which can then be used for querying a run's status.

```ts
export const kickoffExampleAction = action(async (ctx) => {
  const runId = await retrier.run(ctx, internal.index.exampleAction, {
    failureRate: 0.8,
  });
  while (true) {
    const status = await retrier.status(ctx, runId);
    if (status.type === "inProgress") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    } else {
      console.log("Run completed with result:", status.result);
      break;
    }
  }
});
```

### Canceling a run

You can cancel a run using the `cancel` method.

```ts
export const kickoffExampleAction = action(async (ctx) => {
  const runId = await retrier.run(ctx, internal.index.exampleAction, {
    failureRate: 0.8,
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await retrier.cancel(ctx, runId);
});
```

Runs that are currently executing will be canceled best effort, so they
may still continue to execute. A succcesful call to `cancel`, however,
does guarantee that subsequent `status` calls will indicate cancelation.

### Cleaning up completed runs

Runs take up space in the database, since they store their return values. After
a run completes, you can immediately clean up its storage by using `retrier.cleanup(ctx, runId)`.
The system will automatically cleanup completed runs after 7 days.

```ts
export const kickoffExampleAction = action(async (ctx) => {
  const runId = await retrier.run(ctx, internal.index.exampleAction, {
    failureRate: 0.8,
  });
  try {
    while (true) {
      const status = await retrier.status(ctx, runId);
      if (status.type === "inProgress") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      } else {
        console.log("Run completed with result:", status.result);
        break;
      }
    }
  } finally {
    await retrier.cleanup(ctx, runId);
  }
});
```

## Logging

You can set the `ACTION_RETRIER_LOG_LEVEL` to `DEBUG` to have the retrier log out more of
its internal information, which you can then view on the Convex dashboard.

```sh
npx convex env set ACTION_RETRIER_LOG_LEVEL DEBUG
```

The default log level is `INFO`, but you can also set it to `ERROR` for even fewer logs.

<!-- END: Include on https://convex.dev/components -->
