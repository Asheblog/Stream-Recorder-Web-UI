import { createWriteStream, existsSync, promises as fs } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const RELEASE_BASE = "https://github.com/nilaoda/N_m3u8DL-RE/releases/latest/download";

const PLATFORM_MAP: Record<string, string> = {
  "linux-x64": "N_m3u8DL-RE_linux-x64",
  "linux-arm64": "N_m3u8DL-RE_linux-arm64",
  "darwin-x64": "N_m3u8DL-RE_osx-x64",
  "darwin-arm64": "N_m3u8DL-RE_osx-arm64",
  "win32-x64": "N_m3u8DL-RE_win-x64.exe"
};

async function main() {
  const platformKey = `${os.platform()}-${os.arch()}`;
  const remoteName = PLATFORM_MAP[platformKey];

  if (!remoteName) {
    throw new Error(`Unsupported platform: ${platformKey}`);
  }

  const root = path.resolve(process.cwd(), "bin");
  await fs.mkdir(root, { recursive: true });

  const localName = os.platform() === "win32" ? "N_m3u8DL-RE.exe" : "N_m3u8DL-RE";
  const target = path.join(root, localName);

  if (existsSync(target)) {
    console.log(`Engine already exists: ${target}`);
    return;
  }

  const url = `${RELEASE_BASE}/${remoteName}`;
  console.log(`Downloading ${url}`);

  await downloadWithRedirect(url, target);

  if (os.platform() !== "win32") {
    await fs.chmod(target, 0o755);
  }

  console.log(`Engine downloaded: ${target}`);
}

function downloadWithRedirect(url: string, target: string, depth = 0): Promise<void> {
  if (depth > 5) {
    return Promise.reject(new Error("Too many redirects while downloading engine"));
  }

  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "stream-recorder-setup"
        }
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;

        if (status >= 300 && status < 400 && location) {
          response.resume();
          downloadWithRedirect(location, target, depth + 1).then(resolve).catch(reject);
          return;
        }

        if (status !== 200) {
          response.resume();
          reject(new Error(`Download failed with status ${status}`));
          return;
        }

        const output = createWriteStream(target);
        response.pipe(output);

        output.on("finish", () => {
          output.close();
          resolve();
        });

        output.on("error", (error) => {
          reject(error);
        });
      }
    );

    request.on("error", (error) => reject(error));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
