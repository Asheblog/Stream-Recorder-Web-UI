import { describe, expect, it } from "vitest";

import { buildEngineCommand } from "../../src/server/engine/command-builder.js";

describe("buildEngineCommand", () => {
  it("builds command arguments with advanced task config", () => {
    const result = buildEngineCommand({
      enginePath: "/usr/local/bin/N_m3u8DL-RE",
      ffmpegPath: "/usr/bin/ffmpeg",
      saveRoot: "/data/videos",
      task: {
        id: "task-1",
        name: "movie",
        url: "https://example.com/live.m3u8",
        status: "QUEUED",
        progress: 0,
        speed: null,
        fileSize: null,
        outputPath: null,
        saveName: "custom-name",
        saveDir: "series",
        processId: null,
        errorMessage: null,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null
      },
      config: {
        id: "cfg-1",
        taskId: "task-1",
        userAgent: "Mozilla/5.0",
        headers: "Authorization: test",
        proxy: "http://127.0.0.1:7890",
        threads: 32,
        isLiveStream: true,
        extraArgs: "--sub-only --skip-merge"
      }
    });

    expect(result.command).toContain("N_m3u8DL-RE");
    expect(result.args).toContain("https://example.com/live.m3u8");
    expect(result.args).toContain("--thread-count");
    expect(result.args).toContain("32");
    expect(result.args).toContain("--live-real-time-merge");
    expect(result.args).toContain("--sub-only");
    expect(result.args).toContain("--skip-merge");
  });
});
