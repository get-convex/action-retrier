import { defineApp } from "convex/server";
import actionRetrier from "@convex-dev/action-retrier/convex.config.js";

const app = defineApp();
app.use(actionRetrier);
export default app;
