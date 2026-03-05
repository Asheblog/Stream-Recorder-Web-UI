import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Grid2X2, List, Play, Search, Trash2 } from "lucide-react";

import { api } from "../api/client.js";
import type { MediaFile } from "../types/index.js";
import { formatBytes, formatDateTime } from "../utils/format.js";

export function VideoLibraryPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadFiles = async () => {
    const data = await api.getFiles();
    setFiles(data);
  };

  useEffect(() => {
    loadFiles().catch((err) => setError((err as Error).message));
  }, []);

  const filtered = useMemo(() => {
    const input = keyword.trim().toLowerCase();
    if (!input) {
      return files;
    }
    return files.filter(
      (item) =>
        item.fileName.toLowerCase().includes(input) || item.filePath.toLowerCase().includes(input)
    );
  }, [files, keyword]);

  return (
    <div className="page-shell">
      <section className="toolbar">
        <div className="toolbar-left">
          <h2>视频库（{filtered.length}）</h2>
        </div>
        <div className="toolbar-right">
          <label className="search-box">
            <Search size={16} />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索文件名"
            />
          </label>
          <div className="segmented-control">
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => setViewMode("grid")}
            >
              <Grid2X2 size={16} />
            </button>
          </div>
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      {viewMode === "grid" ? (
        <section className="video-grid">
          {filtered.map((file) => (
            <article className="video-card" key={file.id}>
              <div className="video-thumb">
                <Play size={28} />
              </div>
              <div className="video-body">
                <h3>{file.fileName}</h3>
                <p>{formatBytes(Number(file.fileSize))}</p>
                <small>{formatDateTime(file.createdAt)}</small>
              </div>
              <div className="video-actions">
                <a className="icon-btn" href={`/api/files/${file.id}/stream`} target="_blank" rel="noreferrer">
                  <Play size={14} />
                </a>
                <a className="icon-btn" href={`/api/files/${file.id}/download`}>
                  <Download size={14} />
                </a>
                <button
                  className="icon-btn"
                  onClick={() => navigator.clipboard.writeText(file.filePath)}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="icon-btn"
                  onClick={async () => {
                    await api.deleteFile(file.id);
                    await loadFiles();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="card table-card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>大小</th>
                  <th>完成时间</th>
                  <th>路径</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((file) => (
                  <tr key={file.id}>
                    <td>{file.fileName}</td>
                    <td>{formatBytes(Number(file.fileSize))}</td>
                    <td>{formatDateTime(file.createdAt)}</td>
                    <td className="mono truncate-cell">{file.filePath}</td>
                    <td>
                      <div className="actions">
                        <a className="icon-btn" href={`/api/files/${file.id}/stream`} target="_blank" rel="noreferrer">
                          <Play size={14} />
                        </a>
                        <a className="icon-btn" href={`/api/files/${file.id}/download`}>
                          <Download size={14} />
                        </a>
                        <button
                          className="icon-btn"
                          onClick={() => navigator.clipboard.writeText(file.filePath)}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={async () => {
                            await api.deleteFile(file.id);
                            await loadFiles();
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      暂无视频文件
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
