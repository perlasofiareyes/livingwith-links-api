// Writes the frontend's backup content (content.fallback.json) from /content,
// so the page keeps working even if the Railway backend is down.
// Usage: npm run export-fallback   (expects ../livingwith-links-front next to this repo)
//        node scripts/export-fallback.js /path/to/livingwith-links-front
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const target = path.resolve(process.argv[2] || path.join(root, "..", "livingwith-links-front"));
const site = JSON.parse(fs.readFileSync(path.join(root, "content", "site.json"), "utf8"));
const postsDir = path.join(root, "content", "posts");

const posts = fs
  .readdirSync(postsDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const raw = fs.readFileSync(path.join(postsDir, f), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const meta = {};
    if (m) for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    if (meta.tags) meta.tags = meta.tags.split(",").map((t) => t.trim()).filter(Boolean);
    meta.slug = meta.slug || path.basename(f, ".md");
    meta.draft = meta.draft === "true";
    return { ...meta, body: m ? m[2] : raw };
  })
  .filter((p) => !p.draft)
  .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

const out = path.join(target, "content.fallback.json");
fs.writeFileSync(out, JSON.stringify({ ...site, posts }, null, 2) + "\n");
console.log(`Wrote ${out} (${site.links.length} links, ${posts.length} posts)`);
