import { defineApp } from "convex/server";
import component from "../../src/component/convex.config";

const app = defineApp();
app.use(component, { name: "actionRetrier" });

export default app;
