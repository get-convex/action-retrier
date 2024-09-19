import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

crons.interval(
  "Cleanup expired runs",
  { hours: 24 },
  internal.run.cleanupExpiredRuns,
);

export default crons;
