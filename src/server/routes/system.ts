import { Router } from "express";

import { asyncHandler } from "./helpers.js";
import { SystemService } from "../services/system.js";
import { TaskScheduler } from "../services/task-scheduler.js";

export function createSystemRouter(systemService: SystemService, scheduler: TaskScheduler): Router {
  const router = Router();

  router.get(
    "/info",
    asyncHandler(async (_req, res) => {
      const data = await systemService.getSystemInfo(scheduler.getDownloadSpeedSummary());
      res.json({ data });
    })
  );

  return router;
}
