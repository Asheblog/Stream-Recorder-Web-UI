import { Router } from "express";
import { createReadStream } from "node:fs";

import { asyncHandler } from "./helpers.js";
import { FileService } from "../services/files.js";

export function createFileRouter(fileService: FileService): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const files = await fileService.listFiles();
      res.json({ data: files });
    })
  );

  router.get(
    "/:id/stream",
    asyncHandler(async (req, res) => {
      const fileId = String(req.params.id);
      const media = await fileService.getFileById(fileId);
      if (!media) {
        res.status(404).json({ message: "File not found" });
        return;
      }

      res.setHeader("Content-Type", media.mimeType);
      createReadStream(media.filePath).pipe(res);
    })
  );

  router.get(
    "/:id/download",
    asyncHandler(async (req, res) => {
      const fileId = String(req.params.id);
      const media = await fileService.getFileById(fileId);
      if (!media) {
        res.status(404).json({ message: "File not found" });
        return;
      }

      res.download(media.filePath, media.fileName);
    })
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const fileId = String(req.params.id);
      await fileService.deleteFile(fileId);
      res.status(204).send();
    })
  );

  return router;
}
