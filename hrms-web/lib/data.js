// One tiny async key/value layer with two backends:
//   - Upstash Redis  (serverless-safe) when UPSTASH_REDIS_REST_URL/TOKEN (or Vercel KV_*) are set
//   - local JSON file (data/store.json) for local dev
// Everything above it (store.js, webpush.js) is backend-agnostic.
import fs from "fs";
import path from "path";

const URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

let redis = null;
if (URL && TOKEN) {
  // require (not import) so the dep is only pulled in when actually used
  const { Redis } = require("@upstash/redis");
  redis = new Redis({ url: URL, token: TOKEN });
}

export const usingRedis = !!redis;

const FILE = path.join(process.cwd(), "data", "store.json");

export async function getJSON(key, fallback) {
  if (redis) {
    const v = await redis.get(key);
    return v === null || v === undefined ? fallback : v;
  }
  try {
    const all = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return key in all ? all[key] : fallback;
  } catch {
    return fallback;
  }
}

export async function setJSON(key, value) {
  if (redis) {
    await redis.set(key, value);
    return;
  }
  let all = {};
  try { all = JSON.parse(fs.readFileSync(FILE, "utf-8")); } catch {}
  all[key] = value;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}
