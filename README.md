# Convex Action Retrier

[![npm version](https://badge.fury.io/js/@convex-dev%2Faction-retrier.svg)](https://badge.fury.io/js/@convex-dev%2Faction-retrier)

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

Then, the retrier component will run the action and retry it on failure, sleeping with exponential backoff, until the action succeeds or the maximum number of retries is reached.

## Installation

First, add `@convex-dev/action-retrier` as an NPM dependency:

```sh
npm install @convex-dev/action-retrier
```

Then, install the component into your Convex project within the `convex/convex.config.ts` configuration file:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import actionRetrier from "@convex-dev/action-retrier/convex.config.js";

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
// convex/index.ts

export const exampleAction = internalAction({
  args: { failureRate: v.number() },
  handler: async (ctx, args) => {
    if (Math.random() < args.failureRate) {
      throw new Error("I can't go for that.");
    }
  },
});

export const kickoffExampleAction = action(async (ctx) => {
  const runId = await retrier.run(ctx, internal.index.exampleAction, {
    failureRate: 0.8,
  });
});
```

You can optionally specify overrides to the backoff parameters in an options argument.

```ts
// convex/index.ts

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

import { runResultValidator } from "@convex-dev/action-retrier";

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
  args: { result: runResultValidator },
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

# 🧑‍🏫 What is Convex?

[Convex](https://convex.dev) is a hosted backend platform with a
built-in database that lets you write your
[database schema](https://docs.convex.dev/database/schemas) and
[server functions](https://docs.convex.dev/functions) in
[TypeScript](https://docs.convex.dev/typescript). Server-side database
[queries](https://docs.convex.dev/functions/query-functions) automatically
[cache](https://docs.convex.dev/functions/query-functions#caching--reactivity) and
[subscribe](https://docs.convex.dev/client/react#reactivity) to data, powering a
[realtime `useQuery` hook](https://docs.convex.dev/client/react#fetching-data) in our
[React client](https://docs.convex.dev/client/react). There are also clients for
[Python](https://docs.convex.dev/client/python),
[Rust](https://docs.convex.dev/client/rust),
[ReactNative](https://docs.convex.dev/client/react-native), and
[Node](https://docs.convex.dev/client/javascript), as well as a straightforward
[HTTP API](https://docs.convex.dev/http-api/).

The database supports
[NoSQL-style documents](https://docs.convex.dev/database/document-storage) with
[opt-in schema validation](https://docs.convex.dev/database/schemas),
[relationships](https://docs.convex.dev/database/document-ids) and
[custom indexes](https://docs.convex.dev/database/indexes/)
(including on fields in nested objects).

The
[`query`](https://docs.convex.dev/functions/query-functions) and
[`mutation`](https://docs.convex.dev/functions/mutation-functions) server functions have transactional,
low latency access to the database and leverage our
[`v8` runtime](https://docs.convex.dev/functions/runtimes) with
[determinism guardrails](https://docs.convex.dev/functions/runtimes#using-randomness-and-time-in-queries-and-mutations)
to provide the strongest ACID guarantees on the market:
immediate consistency,
serializable isolation, and
automatic conflict resolution via
[optimistic multi-version concurrency control](https://docs.convex.dev/database/advanced/occ) (OCC / MVCC).

The [`action` server functions](https://docs.convex.dev/functions/actions) have
access to external APIs and enable other side-effects and non-determinism in
either our
[optimized `v8` runtime](https://docs.convex.dev/functions/runtimes) or a more
[flexible `node` runtime](https://docs.convex.dev/functions/runtimes#nodejs-runtime).

Functions can run in the background via
[scheduling](https://docs.convex.dev/scheduling/scheduled-functions) and
[cron jobs](https://docs.convex.dev/scheduling/cron-jobs).

Development is cloud-first, with
[hot reloads for server function](https://docs.convex.dev/cli#run-the-convex-dev-server) editing via the
[CLI](https://docs.convex.dev/cli),
[preview deployments](https://docs.convex.dev/production/hosting/preview-deployments),
[logging and exception reporting integrations](https://docs.convex.dev/production/integrations/),
There is a
[dashboard UI](https://docs.convex.dev/dashboard) to
[browse and edit data](https://docs.convex.dev/dashboard/deployments/data),
[edit environment variables](https://docs.convex.dev/production/environment-variables),
[view logs](https://docs.convex.dev/dashboard/deployments/logs),
[run server functions](https://docs.convex.dev/dashboard/deployments/functions), and more.

There are built-in features for
[reactive pagination](https://docs.convex.dev/database/pagination),
[file storage](https://docs.convex.dev/file-storage),
[reactive text search](https://docs.convex.dev/text-search),
[vector search](https://docs.convex.dev/vector-search),
[https endpoints](https://docs.convex.dev/functions/http-actions) (for webhooks),
[snapshot import/export](https://docs.convex.dev/database/import-export/),
[streaming import/export](https://docs.convex.dev/production/integrations/streaming-import-export), and
[runtime validation](https://docs.convex.dev/database/schemas#validators) for
[function arguments](https://docs.convex.dev/functions/args-validation) and
[database data](https://docs.convex.dev/database/schemas#schema-validation).

Everything scales automatically, and it’s [free to start](https://www.convex.dev/plans).
