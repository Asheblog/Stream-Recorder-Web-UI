import { describe, expect, it } from "vitest";

import { parseStdoutLine } from "../../src/server/engine/stdout-parser.js";

describe("parseStdoutLine", () => {
  it("parses progress/speed/filesize from downloader output", () => {
    const line = "[DL] 67.3% 25.4 MB/s 4.2 GB";
    const parsed = parseStdoutLine(line);

    expect(parsed).toEqual({
      progress: 67.3,
      speed: "25.4 MB/s",
      fileSize: "4.2 GB"
    });
  });

  it("returns null for non-progress lines", () => {
    expect(parseStdoutLine("[INFO] parsing completed")).toBeNull();
  });

  it("caps progress to 100", () => {
    const parsed = parseStdoutLine("[DL] 124% 10 MB/s 1 GB");
    expect(parsed?.progress).toBe(100);
  });
});
