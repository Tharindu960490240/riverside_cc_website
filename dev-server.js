/**
 * Local preview: runs the same /api functions Vercel runs, plus the files in /public.
 *   npm run dev   → http://localhost:3000
 * (Not used on Vercel.)
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(root, "public");
const PORT = Number(process.env.PORT || 3000);
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    const m = url.pathname.match(/^\/api\/((?:cron\/)?[\w-]+)\/?$/);
    if (m) {
      const file = path.join(root, "api", `${m[1]}.js`);
      const mod = await import(pathToFileURL(file).href).catch(() => null);
      if (!mod) { res.writeHead(404); return res.end("Not found"); }
      return await mod.default(req, res);
    }
    if (url.pathname.split("/").some((s) => s.startsWith("."))) { res.writeHead(404); return res.end("Not found"); }
    let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    // Clean URLs, like Vercel: /about-us → about-us.html
    if (!path.extname(file)) file += ".html";
    const body = await readFile(file).catch(() => null);
    if (!body) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) { res.writeHead(500); res.end("Server error"); }
  }
}).listen(PORT, () => {
  console.log(`Riverside site running at http://localhost:${PORT}`);
  const e = process.env;
  console.log(`  PlayHQ key:  ${e.PLAYHQ_API_KEY ? "found" : "MISSING: check .env is in this folder"}`);
  console.log(`  Instagram:   ${e.INSTAGRAM_ACCESS_TOKEN ? "official token" : e.WIX_INSTANCE_ID ? "Wix backup (WIX_INSTANCE_ID found)" : "not set up (no INSTAGRAM_ACCESS_TOKEN or WIX_INSTANCE_ID in .env)"}`);
});
