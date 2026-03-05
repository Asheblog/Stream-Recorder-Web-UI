import { Router } from "express";
import { TaskStatus } from "@prisma/client";
import { z } from "zod";

import { asyncHandler } from "./helpers.js";
import { TaskService } from "../services/tasks.js";
import { TaskScheduler } from "../services/task-scheduler.js";

const statusSchema = z.nativeEnum(TaskStatus);
const listQuerySchema = z.object({
  status: statusSchema.optional(),
  keyword: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
});

export function createTaskRouter(taskService: TaskService, scheduler: TaskScheduler): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const created = await taskService.createMany(req.body);
      await scheduler.enqueuePending();
      res.status(201).json({ data: created });
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = listQuerySchema.parse({
        status: req.query.status,
        keyword: req.query.keyword,
        page: req.query.page,
        pageSize: req.query.pageSize
      });
      const tasks = await taskService.list(parsed);
      res.json({ data: tasks });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const taskId = String(req.params.id);
      const task = await taskService.detail(taskId);
      if (!task) {
        res.status(404).json({ message: "Task not found" });
        return;
      }
      res.json({ data: task, logs: scheduler.getTaskLogs(task.id) });
    })
  );

  router.get(
    "/:id/logs",
    asyncHandler(async (req, res) => {
      const taskId = String(req.params.id);
      res.json({ data: scheduler.getTaskLogs(taskId) });
    })
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const taskId = String(req.params.id);
      await scheduler.removeTask(taskId);
      res.status(204).send();
    })
  );

  router.post(
    "/:id/start",
    asyncHandler(async (req, res) => {
      const taskId = String(req.params.id);
      const task = await scheduler.requestStart(taskId);
      res.json({ data: task });
    })
  );

  router.post(
    "/:id/stop",
    asyncHandler(async (req, res) => {
      const taskId = String(req.params.id);
      const task = await scheduler.stopTask(taskId);
      res.json({ data: task });
    })
  );

  router.post(
    "/:id/retry",
    asyncHandler(async (req, res) => {
      const taskId = String(req.params.id);
      const task = await scheduler.retryTask(taskId);
      res.json({ data: task });
    })
  );

  router.post(
    "/batch",
    asyncHandler(async (req, res) => {
      const payload = taskService.parseBatchAction(req.body);

      if (payload.action === "start") {
        await Promise.all(payload.ids.map((id) => scheduler.requestStart(id)));
      } else if (payload.action === "stop") {
        await Promise.all(payload.ids.map((id) => scheduler.stopTask(id)));
      } else {
        await Promise.all(payload.ids.map((id) => scheduler.removeTask(id)));
      }

      res.json({ message: "ok" });
    })
  );

  return router;
}
