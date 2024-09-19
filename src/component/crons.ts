import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

crons.daily(
  "Cleanup expired runs",
  { hourUTC: 0, minuteUTC: 0 },
  internal.run.cleanupExpiredRuns,
  {},
);

export default crons;
