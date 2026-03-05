import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/server/app.js";
import { createPrismaClient } from "../../src/server/prisma.js";

process.env.ENGINE_MODE = "mock";
process.env.MOCK_TICK_MS = "40";
process.env.MOCK_MERGE_DELAY_MS = "50";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/test.db";

describe("API integration", () => {
  const prisma = createPrismaClient(databaseUrl);
  let server: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    server = await createApp({ prisma });
  });

  beforeEach(async () => {
    await prisma.taskConfig.deleteMany();
    await prisma.mediaFile.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it("returns default settings and supports update", async () => {
    const getRes = await request(server.httpServer).get("/api/settings");
    expect(getRes.status).toBe(200);
    expect(getRes.body.data).toHaveProperty("task.max_concurrent");

    const putRes = await request(server.httpServer)
      .put("/api/settings")
      .send({ "task.max_concurrent": 1, "task.default_threads": 24 });

    expect(putRes.status).toBe(200);
    expect(putRes.body.data["task.max_concurrent"]).toBe(1);
    expect(putRes.body.data["task.default_threads"]).toBe(24);

    const validateRes = await request(server.httpServer)
      .post("/api/settings/validate-path")
      .send({
        key: "storage.save_dir",
        path: "./data/videos"
      });

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.data.ok).toBe(true);
  });

  it(
    "creates, starts and completes a task then exposes media file",
    async () => {
    const createRes = await request(server.httpServer)
      .post("/api/tasks")
      .send({
        tasks: [
          {
            url: "https://example.com/stream/demo.m3u8",
            name: "demo-task",
            saveName: "demo-output",
            saveDir: "integration"
          }
        ]
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.data[0].id as string;

    const startRes = await request(server.httpServer).post(`/api/tasks/${taskId}/start`);
    expect(startRes.status).toBe(200);

    const completed = await waitFor(async () => {
      const detailRes = await request(server.httpServer).get(`/api/tasks/${taskId}`);
      return detailRes.body.data?.status === "COMPLETED";
    }, 10000);

    expect(completed).toBe(true);

    const detailRes = await request(server.httpServer).get(`/api/tasks/${taskId}`);
    expect(detailRes.body.data.progress).toBe(100);
    expect(detailRes.body.data.outputPath).toContain("demo-output.mp4");

    const filesRes = await request(server.httpServer).get("/api/files");
    expect(filesRes.status).toBe(200);
    expect(filesRes.body.data.length).toBeGreaterThan(0);
    expect(filesRes.body.data[0].fileSize).toBeTypeOf("string");
    },
    15000
  );

  it("supports stop and retry workflow", async () => {
    const createRes = await request(server.httpServer)
      .post("/api/tasks")
      .send({
        tasks: [
          {
            url: "https://example.com/stream/live.m3u8",
            name: "retry-task"
          }
        ]
      });

    const taskId = createRes.body.data[0].id as string;

    await request(server.httpServer).post(`/api/tasks/${taskId}/start`);
    const stopRes = await request(server.httpServer).post(`/api/tasks/${taskId}/stop`);

    expect(stopRes.status).toBe(200);
    expect(stopRes.body.data.status).toBe("STOPPED");

    const retryRes = await request(server.httpServer).post(`/api/tasks/${taskId}/retry`);
    expect(retryRes.status).toBe(200);
    expect(["RETRYING", "DOWNLOADING", "QUEUED"]).toContain(retryRes.body.data.status);
  });

  it("supports list pagination and keyword filtering", async () => {
    await request(server.httpServer)
      .post("/api/tasks")
      .send({
        tasks: [
          { url: "https://example.com/a.m3u8", name: "alpha-video" },
          { url: "https://example.com/b.m3u8", name: "beta-video" },
          { url: "https://example.com/c.m3u8", name: "gamma-video" }
        ]
      });

    const listPage1 = await request(server.httpServer).get("/api/tasks?page=1&pageSize=2");
    expect(listPage1.status).toBe(200);
    expect(listPage1.body.data.items).toHaveLength(2);
    expect(listPage1.body.data.total).toBeGreaterThanOrEqual(3);

    const filtered = await request(server.httpServer).get("/api/tasks?keyword=beta&page=1&pageSize=10");
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items).toHaveLength(1);
    expect(filtered.body.data.items[0].name).toContain("beta");
  });

  it("rejects non-http url task creation", async () => {
    const response = await request(server.httpServer)
      .post("/api/tasks")
      .send({
        tasks: [{ url: "ftp://example.com/video.m3u8", name: "invalid" }]
      });

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toContain("HTTP(S)");
  });
});

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  return false;
}
