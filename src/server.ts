import { createServer } from "http";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, extname, join } from "path";

const PORT = parseInt(process.env.PORT || "8080", 10);
const ROOT = resolve(process.cwd());

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".md": "text/plain",
  ".txt": "text/plain",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".log": "text/plain",
};

function serveDirectory(dirPath: string): string {
  const entries = readdirSync(dirPath);
  const links = entries
    .map((e) => {
      const stat = statSync(join(dirPath, e));
      const suffix = stat.isDirectory() ? "/" : "";
      return `<a href="${e}${suffix}">${e}${suffix}</a>`;
    })
    .join("\n");
  return `<pre>${links}</pre>`;
}

const server = createServer((req, res) => {
  const rawUrl = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(rawUrl.pathname);
  const filePath = resolve(ROOT, pathname.replace(/^\//, ""));

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const stat = statSync(filePath);

  if (stat.isDirectory()) {
    // Serve index.html if it exists, otherwise directory listing
    const indexPath = join(filePath, "index.html");
    if (existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(readFileSync(indexPath));
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(serveDirectory(filePath));
    }
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  res.end(readFileSync(filePath));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Visualizer server running at http://localhost:${PORT}`);
});
