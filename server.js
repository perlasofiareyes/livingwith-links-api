// livingwith-links-api — backend for the @livingwsofiaa link-in-bio page.
// Content lives in /content (site.json + posts/*.md). Edit those files, push,
// and Railway redeploys automatically.

const fs = require("fs");
const path = require("path");
const http = require("http");

const PORT = process.env.PORT || 3000;
const CONTENT_DIR = path.join(__dirname, "content");
// On Railway, attach a volume and set DATA_DIR to its mount path (e.g. /data)
// so collab requests and click counts survive redeploys.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, ".data");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

fs.mkdirSync(DATA_DIR, { recursive: true });
const COLLAB_FILE = path.join(DATA_DIR, "collabs.jsonl");
const CLICKS_FILE = path.join(DATA_DIR, "clicks.json");

// ---------- content ----------

function readSite() {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, "site.json"), "utf8"));
}

// Minimal front-matter parser: lines "key: value" between --- fences.
function parsePost(file) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  let body = raw;
  if (m) {
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    body = m[2];
  }
  if (meta.tags) meta.tags = meta.tags.split(",").map((t) => t.trim()).filter(Boolean);
  meta.slug = meta.slug || path.basename(file, ".md");
  meta.draft = meta.draft === "true";
  return { ...meta, body };
}

function readPosts() {
  const dir = path.join(CONTENT_DIR, "posts");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parsePost(path.join(dir, f)))
    .filter((p) => !p.draft)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

// ---------- tiny persistence helpers ----------

function readClicks() {
  try {
    return JSON.parse(fs.readFileSync(CLICKS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeClicks(obj) {
  fs.writeFileSync(CLICKS_FILE, JSON.stringify(obj, null, 2));
}

// Simple in-memory rate limit for the collab form (per IP, per hour).
const hits = new Map();
function rateLimited(ip, max = 5, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}


// ---------- http helpers ----------

function corsOrigin(origin) {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  return origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function send(req, res, status, data, extraHeaders = {}) {
  const headers = { "Content-Type": "application/json; charset=utf-8", ...extraHeaders };
  const origin = corsOrigin(req.headers.origin);
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 20 * 1024) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) req.destroy();
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

function isAdmin(req, url) {
  const token = req.headers["x-admin-token"] || url.searchParams.get("token");
  return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
}

// ---------- routes ----------

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const m = req.method;

  if (m === "OPTIONS") {
    const origin = corsOrigin(req.headers.origin);
    res.writeHead(204, {
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }

  if (m === "GET" && p === "/")
    return send(req, res, 200, { name: "livingwith-links-api", ok: true, endpoints: ["/health", "/api/site", "/api/posts", "/api/posts/:slug", "POST /api/collab", "POST /api/click"] });

  if (m === "GET" && p === "/health") return send(req, res, 200, { ok: true, time: new Date().toISOString() });

  // Everything the landing page needs in one request.
  if (m === "GET" && p === "/api/site") {
    const posts = readPosts().map(({ body, ...meta }) => meta);
    return send(req, res, 200, { ...readSite(), posts }, { "Cache-Control": "public, max-age=60" });
  }

  if (m === "GET" && p === "/api/posts") return send(req, res, 200, readPosts().map(({ body, ...meta }) => meta));

  const postMatch = p.match(/^\/api\/posts\/([a-z0-9-]+)$/i);
  if (m === "GET" && postMatch) {
    const post = readPosts().find((x) => x.slug === postMatch[1]);
    return post ? send(req, res, 200, post) : send(req, res, 404, { error: "not_found" });
  }

  // Collab / business inquiries.
  if (m === "POST" && p === "/api/collab") {
    if (rateLimited(clientIp(req))) return send(req, res, 429, { error: "too_many_requests" });
    const body = await readBody(req);
    if (!body) return send(req, res, 400, { error: "invalid_json" });
    if (body.website) return send(req, res, 200, { ok: true }); // honeypot — bots fill it, humans never see it
    const clean = (v, max) => String(v || "").trim().slice(0, max);
    const entry = {
      at: new Date().toISOString(),
      name: clean(body.name, 120),
      email: clean(body.email, 160),
      brand: clean(body.brand, 160),
      type: clean(body.type, 60),
      message: clean(body.message, 2000),
    };
    if (!entry.name || !/^\S+@\S+\.\S+$/.test(entry.email) || entry.message.length < 10)
      return send(req, res, 400, { error: "invalid", detail: "name, valid email and a message (10+ chars) are required" });
    fs.appendFileSync(COLLAB_FILE, JSON.stringify(entry) + "\n");
    console.log("[collab] new request from", entry.brand || entry.name);
    return send(req, res, 201, { ok: true });
  }

  if (m === "GET" && p === "/api/collab") {
    if (!isAdmin(req, url)) return send(req, res, 401, { error: "unauthorized" });
    let rows = [];
    try {
      rows = fs.readFileSync(COLLAB_FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    } catch {}
    return send(req, res, 200, rows.reverse());
  }

  // Click counter — shows which links (Canva templates, the guide…) get traction.
  if (m === "POST" && p === "/api/click") {
    const body = await readBody(req, 1024);
    const id = String((body && body.id) || "").slice(0, 60);
    if (!/^[a-z0-9-]+$/i.test(id)) return send(req, res, 400, { error: "invalid_id" });
    const clicks = readClicks();
    clicks[id] = (clicks[id] || 0) + 1;
    writeClicks(clicks);
    return send(req, res, 200, { ok: true });
  }

  if (m === "GET" && p === "/api/stats") {
    if (!isAdmin(req, url)) return send(req, res, 401, { error: "unauthorized" });
    return send(req, res, 200, readClicks());
  }

  return send(req, res, 404, { error: "not_found" });
}

http
  .createServer((req, res) =>
    handle(req, res).catch((err) => {
      console.error(err);
      send(req, res, 500, { error: "server_error" });
    })
  )
  .listen(PORT, () => console.log(`livingwith-links-api listening on :${PORT}`));
