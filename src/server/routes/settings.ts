import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "./helpers.js";
import { SettingService } from "../services/settings.js";
import { TaskScheduler } from "../services/task-scheduler.js";

export function createSettingRouter(settings: SettingService, scheduler: TaskScheduler): Router {
  const router = Router();
  const validateSchema = z.object({
    key: z.enum(["engine.n_m3u8dl_path", "engine.ffmpeg_path", "storage.save_dir"]),
    path: z.string().trim().min(1).optional()
  });

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const data = await settings.getAll();
      res.json({ data });
    })
  );

  router.put(
    "/",
    asyncHandler(async (req, res) => {
      const payload = typeof req.body === "object" && req.body ? req.body : {};
      const data = await settings.updateMany(payload as Record<string, unknown>);
      await scheduler.enqueuePending();
      res.json({ data });
    })
  );

  router.post(
    "/validate-path",
    asyncHandler(async (req, res) => {
      const payload = validateSchema.parse(req.body);
      const pathValue =
        payload.path ??
        String(
          await settings.get<string>(
            payload.key,
            payload.key === "storage.save_dir"
              ? process.platform === "win32"
                ? "C:\\stream-recorder\\videos"
                : "./data/videos"
              : ""
          )
        );

      const expect = payload.key === "storage.save_dir" ? "directory" : "file";
      const executable = payload.key !== "storage.save_dir";

      const data = await settings.validatePath({
        pathValue,
        expect,
        executable
      });

      res.json({ data });
    })
  );

  return router;
}
