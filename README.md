# Convex Action Retrier

Actions can sometimes fail due to network errors, server restarts, or issues with a
3rd party API, and it's often useful to retry them. The Action Retrier component
makes this really easy.

```ts
import { ActionRetrier } from "@convex-dev/action-retrier/client";
import { components } from "./convex/_generated/server";

const retrier = new ActionRetrier(components.actionRetrier);

// Within your mutation or action...
await retrier.runWithRetries(ctx, internal.module.myAction, { arg: 123 });
```

Then, the retrier component will run the action and retry it on failure, sleeping with exponential backoff, until the action succeeds or the maximum number of retries is reached.

## Installation

First, add `@convex-dev/action-retrier` as an NPM dependency:

```
npm install @convex-dev/action-retrier
```

Then, install the component into your Convex project within the `convex/convex.config.ts` configuration file:

```ts
// convex/convex.config.ts
import actionRetrier from "@convex-dev/action-retrier/component";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(actionRetrier);

export default app;
```

Finally, create a new `ActionRetrier` within your Convex project, and point it to the installed component:

```ts
// convex/index.ts
import { ActionRetrier } from "@convex-dev/action-retrier/client";
import { components } from "./_generated/server";

const actionRetrier = new ActionRetrier(components.actionRetrier);
```

You can optionally configure the retrier's backoff behavior in the `ActionRetrier` constructor.

```ts
const actionRetrier = new ActionRetrier(components.actionRetrier, {
  base: 10,
  maxFailures: 4,
  retryBackoffMs: 10000,
  waitBackoffMs: 1000,
});
```

- `base` is the base for the exponential backoff (default: 2).
- `maxFailures` is the maximum number of times to retry the action (default: 16).
- `retryBackoffMs` is the initial delay after a failure before retrying (default: 100).
- `waitBackoffMs` is the initial delay before checking the action's status (default: 100).

## API

After installing the component, use the `runWithRetries` method to kick off an action.

```ts
// convex/index.ts

const exampleAction = internalAction({
  args: { failureRate: v.number() },
  handler: async (ctx, args) => {
    if (Math.random() < args.failureRate) {
      throw new Error("I can't go for that.");
    }
  },
});

const exampleMutation = mutation(async (ctx) => {
  await retrier.runWithRetries(ctx, internal.index.exampleAction, {
    failureRate: 0.8,
  });
});
```

You can also specify overrides for the backoff parameters when calling `runWithRetries`.

```ts
// convex/index.ts

const exampleMutation = mutation(async (ctx) => {
  await retrier.runWithRetries(ctx, internal.index.exampleAction, { failureRate: 0.8 }, {
    base: 10,
    maxFailures: 4,
    retryBackoffMs: 10000,
    waitBackoffMs: 1000,
});
```
