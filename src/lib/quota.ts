import { getStore } from "@netlify/blobs";

const DAILY_LIMIT = Number(process.env.DAILY_FUNCTION_QUOTA || 1000);

/**
 * Approximate per-route daily invocation cap, backed by Netlify Blobs.
 * Read-then-write, not atomic — a soft cost-control cap against bot/scraper
 * drain, not a hard security boundary, so a small race-condition overcount
 * is acceptable. Fails open if Blobs is unavailable so the tool still works.
 */
export async function checkQuota(routeName: string): Promise<boolean> {
  try {
    const store = getStore("api-quota");
    const day = new Date().toISOString().slice(0, 10);
    const key = `${routeName}:${day}`;
    const current = Number((await store.get(key)) ?? "0");
    if (current >= DAILY_LIMIT) return false;
    await store.set(key, String(current + 1));
    return true;
  } catch (err) {
    console.error("quota check failed:", err);
    return true;
  }
}
