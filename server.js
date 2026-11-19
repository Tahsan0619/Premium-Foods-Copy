const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
};

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, MIME[ext] || "application/octet-stream");
  });
}

function safeJoin(root, ...parts) {
  const full = path.normalize(path.join(root, ...parts));
  if (!full.startsWith(path.normalize(root))) return null;
  return full;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveApi(apiRoot, pathname, searchParams) {
  const prefix = apiRoot === "pf" ? "/api/pf" : "/api/agro";
  const rel = pathname.slice(prefix.length) || "/";

  if (apiRoot === "pf") {
    if (rel === "/category/categories") {
      return path.join(ROOT, "data", "categories.json");
    }
    if (rel.startsWith("/product/list/")) {
      return path.join(ROOT, "data", "products.json");
    }
    if (rel.startsWith("/product/view/")) {
      const key = decodeURIComponent(rel.split("/").pop());
      const byId = path.join(ROOT, "data", "products", `${key}.json`);
      if (fs.existsSync(byId)) return byId;
      const list = readJson(path.join(ROOT, "data", "products.json"));
      const hit = (list.data || []).find((p) => p.slug === key || p._id === key);
      if (hit) {
        const f = path.join(ROOT, "data", "products", `${hit._id}.json`);
        if (fs.existsSync(f)) return f;
      }
      return null;
    }
    if (rel.startsWith("/product/filter/category/")) {
      const id = rel.split("/").pop();
      const f = path.join(ROOT, "data", "categories", `${id}.json`);
      return fs.existsSync(f) ? f : null;
    }
  }

  if (apiRoot === "agro") {
    if (rel === "/category/web") {
      return path.join(ROOT, "data", "agro-categories.json");
    }
    if (rel.startsWith("/product/list/")) {
      const cat = searchParams.get("category");
      if (cat === "6a9bfebd0640f098bdaa756a") {
        return path.join(ROOT, "data", "agro-pickles.json");
      }
      return path.join(ROOT, "data", "agro-products.json");
    }
  }

  return null;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    return res.end();
  }

  const parsed = new URL(req.url || "/", `http://localhost:${PORT}`);
  const urlPath = decodeURIComponent(parsed.pathname);

  if (urlPath.startsWith("/api/pf") || urlPath.startsWith("/api/agro")) {
    const apiRoot = urlPath.startsWith("/api/pf") ? "pf" : "agro";
    if (/\/(auth|order|complain|support)\//.test(urlPath)) {
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () =>
          send(res, 200, JSON.stringify({ ok: true }), MIME[".json"])
        );
        return;
      }
      return send(
        res,
        401,
        JSON.stringify({ message: "Login required (local mirror stub)" }),
        MIME[".json"]
      );
    }
    const file = resolveApi(apiRoot, urlPath, parsed.searchParams);
    if (file && fs.existsSync(file)) return sendFile(res, file);
    return send(
      res,
      404,
      JSON.stringify({ message: "API cache miss", path: urlPath }),
      MIME[".json"]
    );
  }

  // Legacy /cdn/ → assets/media
  let fileUrl = urlPath;
  if (fileUrl.startsWith("/cdn/")) {
    fileUrl = "/assets/media/" + fileUrl.slice("/cdn/".length);
  }

  if (fileUrl === "/" || fileUrl === "") {
    return sendFile(res, path.join(ROOT, "index.html"));
  }

  const filePath = safeJoin(ROOT, ...fileUrl.split("/").filter(Boolean));
  if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendFile(res, filePath);
  }

  // SPA fallback
  sendFile(res, path.join(ROOT, "index.html"));
});

server.listen(PORT, () => {
  console.log(`Premium Fruits → http://localhost:${PORT}`);
});
