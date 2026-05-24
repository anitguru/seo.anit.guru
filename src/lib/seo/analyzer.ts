import * as cheerio from "cheerio";
import type {
  SeoCheck,
  SeoCategoryResult,
  SeoCategoryKey,
  SeoAnalysisResult,
} from "./types";

// ─── Constants ───────────────────────────────────────────────────────

const TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── URL Helpers (shared with checkup) ───────────────────────────────

export function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

export function validateUrl(url: string): URL {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }
  const hostname = parsed.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === "0.0.0.0"
  ) {
    throw new Error("Scanning private/local addresses is not allowed");
  }
  return parsed;
}

function gradeFromScore(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Fetch Page ──────────────────────────────────────────────────────

interface FetchedPage {
  finalUrl: string;
  statusCode: number;
  responseTime: number;
  headers: Record<string, string>;
  body: string;
  bodySize: number;
  compression: string | null;
  redirectChain: Array<{ url: string; status: number }>;
}

export async function fetchPage(url: string): Promise<FetchedPage> {
  let currentUrl = url;
  const maxRedirects = 10;
  const redirectChain: Array<{ url: string; status: number }> = [];

  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const start = performance.now();

    try {
      const resp = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
        redirect: "manual",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        redirectChain.push({ url: currentUrl, status: resp.status });
        const location = resp.headers.get("location");
        if (!location) {
          const body = await resp.text();
          const bodySize = new TextEncoder().encode(body).length;
          const headers: Record<string, string> = {};
          resp.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
          return { finalUrl: currentUrl, statusCode: resp.status, responseTime: performance.now() - start, headers, body, bodySize, compression: headers["content-encoding"] || null, redirectChain };
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      const body = await resp.text();
      const bodySize = parseInt(resp.headers.get("content-length") || "0", 10) || new TextEncoder().encode(body).length;
      const headers: Record<string, string> = {};
      resp.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      const responseTime = performance.now() - start;

      return { finalUrl: currentUrl, statusCode: resp.status, responseTime, headers, body, bodySize, compression: headers["content-encoding"] || null, redirectChain };
    } catch (err: unknown) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("abort")) throw new Error("Request timed out (15s)");
      throw new Error(`Could not reach the site: ${message}`);
    }
  }

  throw new Error("Too many redirects (>10)");
}

// ─── Robots.txt Check ────────────────────────────────────────────────

async function checkRobotsTxt(pageUrl: string): Promise<SeoAnalysisResult["robotsTxt"]> {
  try {
    const parsed = new URL(pageUrl);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(robotsUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) return { found: false, blocksPage: false, sitemapUrls: [], rules: [] };

    const text = await resp.text();
    const lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));

    const sitemapUrls: string[] = [];
    const rules: string[] = [];
    let inUserAgentBlock = false;
    let appliesToAll = false;
    let blocksPage = false;
    const pagePath = parsed.pathname;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("user-agent:")) {
        const agent = line.slice(11).trim();
        appliesToAll = agent === "*";
        inUserAgentBlock = true;
      } else if (lower.startsWith("sitemap:")) {
        sitemapUrls.push(line.slice(8).trim());
      } else if (lower.startsWith("disallow:") && inUserAgentBlock && appliesToAll) {
        const path = line.slice(9).trim();
        rules.push(`Disallow: ${path}`);
        if (path && pagePath.startsWith(path)) blocksPage = true;
      } else if (lower.startsWith("allow:") && inUserAgentBlock && appliesToAll) {
        const path = line.slice(6).trim();
        rules.push(`Allow: ${path}`);
        if (path && pagePath.startsWith(path)) blocksPage = false; // Allow overrides disallow
      }
    }

    return { found: true, blocksPage, sitemapUrls, rules: rules.slice(0, 20) };
  } catch {
    return null;
  }
}

// ─── Sitemap Check ───────────────────────────────────────────────────

async function checkSitemap(pageUrl: string, robotsSitemapUrls: string[]): Promise<SeoAnalysisResult["sitemap"]> {
  // Try sitemaps from robots.txt first, then default /sitemap.xml
  const parsed = new URL(pageUrl);
  const candidates = [
    ...robotsSitemapUrls,
    `${parsed.protocol}//${parsed.host}/sitemap.xml`,
  ];

  // Deduplicate
  const unique = [...new Set(candidates)];

  for (const sitemapUrl of unique) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(sitemapUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) continue;

      const text = await resp.text();
      // Count <url> tags (standard sitemap) or <sitemap> tags (sitemap index)
      const urlCount = (text.match(/<url>/gi) || []).length + (text.match(/<sitemap>/gi) || []).length;

      if (urlCount > 0 || text.includes("<?xml")) {
        return { found: true, urlCount, sitemapUrl };
      }
    } catch {
      continue;
    }
  }

  return { found: false, urlCount: 0, sitemapUrl: `${parsed.protocol}//${parsed.host}/sitemap.xml` };
}

// ─── Content Analysis ────────────────────────────────────────────────

function checkContent($: cheerio.CheerioAPI, body: string): SeoCategoryResult {
  const checks: SeoCheck[] = [];
  let score = 100;

  // Title
  const title = $("title").first().text().trim();
  if (!title) {
    checks.push({ name: "Title Tag", status: "fail", value: "Missing", description: "No <title> tag found", fix: "Add a descriptive <title> tag in the <head> section" });
    score -= 15;
  } else if (title.length < 10) {
    checks.push({ name: "Title Tag", status: "warn", value: `${title.length} chars — "${title}"`, description: "Title is too short (< 10 characters)", fix: "Write a descriptive title between 30-60 characters" });
    score -= 8;
  } else if (title.length > 60) {
    checks.push({ name: "Title Tag", status: "warn", value: `${title.length} chars — "${title.substring(0, 60)}..."`, description: "Title is too long (> 60 characters) and may be truncated in search results", fix: "Keep title under 60 characters for full visibility in SERPs" });
    score -= 5;
  } else {
    checks.push({ name: "Title Tag", status: "pass", value: `${title.length} chars — "${title}"`, description: "Title length is optimal" });
  }

  // Meta description
  const description = $('meta[name="description"]').attr("content")?.trim() || "";
  if (!description) {
    checks.push({ name: "Meta Description", status: "fail", value: "Missing", description: "No meta description found", fix: "Add <meta name=\"description\" content=\"...\"> with 120-160 characters" });
    score -= 12;
  } else if (description.length < 70) {
    checks.push({ name: "Meta Description", status: "warn", value: `${description.length} chars`, description: "Meta description is too short (< 70 characters)", fix: "Write a compelling description between 120-160 characters" });
    score -= 5;
  } else if (description.length > 160) {
    checks.push({ name: "Meta Description", status: "warn", value: `${description.length} chars`, description: "Meta description may be truncated (> 160 characters)", fix: "Keep description under 160 characters" });
    score -= 3;
  } else {
    checks.push({ name: "Meta Description", status: "pass", value: `${description.length} chars`, description: "Meta description length is optimal" });
  }

  // H1 tags
  const h1s = $("h1");
  if (h1s.length === 0) {
    checks.push({ name: "H1 Tag", status: "fail", value: "Missing", description: "No H1 heading found", fix: "Add exactly one H1 tag per page with your primary keyword" });
    score -= 10;
  } else if (h1s.length > 1) {
    checks.push({ name: "H1 Tag", status: "warn", value: `${h1s.length} H1 tags found`, description: "Multiple H1 tags can confuse search engines", fix: "Use only one H1 per page and use H2-H6 for subheadings" });
    score -= 5;
  } else {
    const h1Text = h1s.first().text().trim();
    checks.push({ name: "H1 Tag", status: "pass", value: h1Text.length > 80 ? h1Text.substring(0, 80) + "..." : h1Text, description: "Single H1 tag found" });
  }

  // Heading hierarchy
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  if (h2Count === 0) {
    checks.push({ name: "Heading Structure", status: "warn", value: "No H2 tags", description: "No H2 subheadings found", fix: "Use H2 tags to organize content into sections" });
    score -= 5;
  } else {
    checks.push({ name: "Heading Structure", status: "pass", value: `H2: ${h2Count}, H3: ${h3Count}`, description: "Good heading hierarchy" });
  }

  // Word count — extract main content text, ignoring nav/header/footer/aside
  const contentEl = $("article").length ? $("article")
    : $("main").length ? $("main")
    : $("[role='main']").length ? $("[role='main']")
    : $(".post-content, .article-body, .entry-content, .content").first().length ? $(".post-content, .article-body, .entry-content, .content").first()
    : $("body");
  // Remove nav, header, footer, aside, and script/style from the content clone
  const contentClone = contentEl.clone();
  contentClone.find("nav, header, footer, aside, script, style, noscript, [role='navigation'], [role='banner'], [role='contentinfo']").remove();
  const textContent = contentClone.text().replace(/\s+/g, " ").trim();
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 100) {
    checks.push({ name: "Word Count", status: "fail", value: `${wordCount} words`, description: "Very thin content (< 100 words)", fix: "Add more substantive content — aim for at least 300 words" });
    score -= 12;
  } else if (wordCount < 300) {
    checks.push({ name: "Word Count", status: "warn", value: `${wordCount} words`, description: "Content may be thin (< 300 words)", fix: "Consider expanding content to at least 300 words for better rankings" });
    score -= 5;
  } else {
    checks.push({ name: "Word Count", status: "pass", value: `${wordCount} words`, description: "Sufficient content length" });
  }

  // Keyword density (top 10 words)
  const stopWords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is", "it", "that", "this", "was", "are", "be", "has", "had", "have", "will", "would", "can", "could", "may", "might", "shall", "should", "do", "does", "did", "not", "no", "so", "if", "as", "its", "he", "she", "we", "they", "you", "i", "my", "your", "our", "their", "his", "her", "all", "more", "some", "any", "each", "about", "up", "out", "them", "then", "than", "also", "just", "get", "into", "over", "such", "only", "new", "been", "one", "two", "which", "when", "what", "how", "who", "where"]);
  const words = textContent.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const freq: Record<string, number> = {};
  for (const w of words) { freq[w] = (freq[w] || 0) + 1; }
  const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topWords.length > 0) {
    const topStr = topWords.map(([w, c]) => `${w} (${c})`).join(", ");
    checks.push({ name: "Top Keywords", status: "info", value: topStr, description: "Most frequent words on the page (excluding stop words)" });
  }

  // Images without alt text
  const images = $("img");
  const imagesWithoutAlt = images.filter((_, el) => {
    const alt = $(el).attr("alt");
    return !alt || alt.trim() === "";
  });
  if (images.length === 0) {
    checks.push({ name: "Images", status: "info", value: "No images found", description: "Page has no images" });
  } else if (imagesWithoutAlt.length > 0) {
    checks.push({ name: "Image Alt Text", status: "warn", value: `${imagesWithoutAlt.length}/${images.length} missing alt`, description: `${imagesWithoutAlt.length} image(s) missing alt text`, fix: "Add descriptive alt text to all images for accessibility and SEO" });
    score -= Math.min(10, imagesWithoutAlt.length * 2);
  } else {
    checks.push({ name: "Image Alt Text", status: "pass", value: `${images.length} images, all with alt text`, description: "All images have alt text" });
  }

  // Readability (Flesch-Kincaid)
  const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);
  const syllableCount = textContent.toLowerCase().split(/\s+/).reduce((total, word) => {
    // Simple syllable counting heuristic
    const w = word.replace(/[^a-z]/g, "");
    if (w.length <= 3) return total + 1;
    const count = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
      .replace(/^y/, "")
      .match(/[aeiouy]{1,2}/g)?.length || 1;
    return total + count;
  }, 0);
  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / Math.max(1, wordCount);
  // Flesch Reading Ease: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  const fleschScore = Math.round(Math.max(0, Math.min(100, 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord)));
  let readabilityLevel: string;
  let readabilityStatus: "pass" | "warn" | "info" = "info";
  if (fleschScore >= 60) { readabilityLevel = "Easy to read"; readabilityStatus = "pass"; }
  else if (fleschScore >= 30) { readabilityLevel = "Moderately difficult"; readabilityStatus = "warn"; }
  else { readabilityLevel = "Very difficult to read"; readabilityStatus = "warn"; }

  if (wordCount >= 50) {
    checks.push({
      name: "Readability",
      status: readabilityStatus,
      value: `Flesch score: ${fleschScore}/100 — ${readabilityLevel}`,
      description: `Avg ${avgWordsPerSentence.toFixed(1)} words/sentence, ${sentenceCount} sentences. Higher Flesch score = easier to read (60+ is good for web content)`,
      ...(fleschScore < 30 ? { fix: "Use shorter sentences and simpler words. Aim for 15-20 words per sentence." } : {}),
    });
    if (fleschScore < 30) score -= 5;
  }

  // ── Accessibility checks ──

  // Heading order (should be sequential: h1 -> h2 -> h3, no skipping)
  const headingLevels: number[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const tag = (el as unknown as { tagName?: string }).tagName?.toLowerCase();
    if (tag) headingLevels.push(parseInt(tag[1]));
  });
  let headingOrderOk = true;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      headingOrderOk = false;
      break;
    }
  }
  if (headingLevels.length > 1) {
    if (headingOrderOk) {
      checks.push({ name: "Heading Order", status: "pass", value: headingLevels.map(l => `H${l}`).join(" → "), description: "Headings follow a logical sequential order" });
    } else {
      checks.push({ name: "Heading Order", status: "warn", value: headingLevels.map(l => `H${l}`).join(" → "), description: "Heading levels skip (e.g., H1 → H3 without H2)", fix: "Use headings in sequential order — don't skip levels (H1 → H2 → H3)" });
      score -= 3;
    }
  }

  // ARIA landmarks
  const landmarks = new Set<string>();
  $("[role]").each((_, el) => {
    const role = $(el).attr("role");
    if (role && ["banner", "navigation", "main", "complementary", "contentinfo", "search", "form", "region"].includes(role)) {
      landmarks.add(role);
    }
  });
  // Also check HTML5 semantic elements
  if ($("header").length > 0) landmarks.add("banner");
  if ($("nav").length > 0) landmarks.add("navigation");
  if ($("main").length > 0) landmarks.add("main");
  if ($("aside").length > 0) landmarks.add("complementary");
  if ($("footer").length > 0) landmarks.add("contentinfo");

  if (landmarks.size >= 3) {
    checks.push({ name: "ARIA Landmarks", status: "pass", value: Array.from(landmarks).join(", "), description: "Good use of landmark regions for screen reader navigation" });
  } else if (landmarks.size > 0) {
    checks.push({ name: "ARIA Landmarks", status: "warn", value: Array.from(landmarks).join(", ") || "None", description: "Few landmark regions found — screen readers rely on these for navigation", fix: "Use semantic HTML elements (<header>, <nav>, <main>, <footer>) or ARIA role attributes" });
    score -= 2;
  } else {
    checks.push({ name: "ARIA Landmarks", status: "warn", value: "None found", description: "No landmark regions for screen reader navigation", fix: "Add <main>, <nav>, <header>, <footer> elements for better accessibility" });
    score -= 4;
  }

  // Skip navigation link
  const skipNav = $('a[href="#main-content"], a[href="#content"], a[href="#main"], a.skip-link, a.skip-nav, [class*="skip"]').first();
  if (skipNav.length > 0) {
    checks.push({ name: "Skip Navigation", status: "pass", value: "Present", description: "Skip navigation link found for keyboard users" });
  } else {
    checks.push({ name: "Skip Navigation", status: "info", value: "Not found", description: "No skip navigation link detected — helps keyboard users bypass repetitive navigation" });
  }

  // Form labels
  const inputs = $("input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']), textarea, select");
  if (inputs.length > 0) {
    let unlabeled = 0;
    inputs.each((_, el) => {
      const id = $(el).attr("id");
      const ariaLabel = $(el).attr("aria-label");
      const ariaLabelledBy = $(el).attr("aria-labelledby");
      const hasLabel = (id && $(`label[for="${id}"]`).length > 0) || ariaLabel || ariaLabelledBy;
      if (!hasLabel) unlabeled++;
    });
    if (unlabeled > 0) {
      checks.push({ name: "Form Labels", status: "warn", value: `${unlabeled}/${inputs.length} inputs unlabeled`, description: "Form inputs missing associated labels", fix: "Add <label for=\"...\"> or aria-label to all form inputs" });
      score -= Math.min(5, unlabeled * 2);
    } else {
      checks.push({ name: "Form Labels", status: "pass", value: `${inputs.length} inputs, all labeled`, description: "All form inputs have associated labels" });
    }
  }

  return { score: Math.max(0, score), checks };
}

// ─── Technical Analysis ──────────────────────────────────────────────

function checkTechnical($: cheerio.CheerioAPI, url: string, headers: Record<string, string>): SeoCategoryResult {
  const checks: SeoCheck[] = [];
  let score = 100;

  // Canonical tag
  const canonical = $('link[rel="canonical"]').attr("href");
  if (canonical) {
    checks.push({ name: "Canonical Tag", status: "pass", value: canonical.length > 80 ? canonical.substring(0, 80) + "..." : canonical, description: "Canonical URL is specified" });
  } else {
    checks.push({ name: "Canonical Tag", status: "warn", value: "Missing", description: "No canonical tag found", fix: "Add <link rel=\"canonical\" href=\"...\"> to prevent duplicate content issues" });
    score -= 8;
  }

  // Robots meta
  const robotsMeta = $('meta[name="robots"]').attr("content") || "";
  if (robotsMeta.includes("noindex")) {
    checks.push({ name: "Robots Meta", status: "warn", value: robotsMeta, description: "Page is set to noindex — it will not appear in search results", fix: "Remove noindex if you want this page to be indexed" });
    score -= 15;
  } else if (robotsMeta) {
    checks.push({ name: "Robots Meta", status: "pass", value: robotsMeta, description: "Robots meta tag is configured" });
  } else {
    checks.push({ name: "Robots Meta", status: "pass", value: "Not set (default: index, follow)", description: "No restrictive robots meta tag found — page is indexable" });
  }

  // Viewport
  const viewport = $('meta[name="viewport"]').attr("content");
  if (viewport) {
    checks.push({ name: "Viewport", status: "pass", value: viewport, description: "Viewport meta tag is set for mobile responsiveness" });
  } else {
    checks.push({ name: "Viewport", status: "fail", value: "Missing", description: "No viewport meta tag", fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> for mobile compatibility" });
    score -= 10;
  }

  // Language attribute
  const lang = $("html").attr("lang");
  if (lang) {
    checks.push({ name: "Language", status: "pass", value: lang, description: "Language attribute is set on HTML element" });
  } else {
    checks.push({ name: "Language", status: "warn", value: "Missing", description: "No lang attribute on <html>", fix: "Add lang attribute to <html> (e.g., <html lang=\"en\">)" });
    score -= 5;
  }

  // URL structure
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const hasUppercase = /[A-Z]/.test(path);
    const hasUnderscores = path.includes("_");
    const isClean = !hasUppercase && !hasUnderscores && !path.includes("//") && path.length < 100;
    if (isClean) {
      checks.push({ name: "URL Structure", status: "pass", value: path || "/", description: "URL is clean and SEO-friendly" });
    } else {
      const issues: string[] = [];
      if (hasUppercase) issues.push("contains uppercase");
      if (hasUnderscores) issues.push("uses underscores instead of hyphens");
      if (path.length >= 100) issues.push("very long path");
      checks.push({ name: "URL Structure", status: "warn", value: path, description: `URL issues: ${issues.join(", ")}`, fix: "Use lowercase, hyphen-separated, short URLs" });
      score -= 3;
    }
  } catch {
    checks.push({ name: "URL Structure", status: "info", value: url, description: "Could not parse URL structure" });
  }

  // Structured data (JSON-LD) — with validation
  const jsonLd = $('script[type="application/ld+json"]');
  if (jsonLd.length > 0) {
    const types: string[] = [];
    const validationIssues: string[] = [];
    jsonLd.each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        const items = data["@graph"] ? data["@graph"] : [data];
        for (const item of Array.isArray(items) ? items : [items]) {
          const type = item["@type"];
          if (type) types.push(type);
          // Validate required fields per common schema types
          if (!item["@context"] && !data["@context"]) validationIssues.push("Missing @context");
          if (!type) { validationIssues.push("Missing @type"); continue; }
          // Common type validations
          if (type === "WebPage" || type === "Article" || type === "BlogPosting" || type === "NewsArticle") {
            if (!item.name && !item.headline) validationIssues.push(`${type}: missing name/headline`);
          }
          if (type === "Organization" || type === "LocalBusiness") {
            if (!item.name) validationIssues.push(`${type}: missing name`);
            if (!item.url) validationIssues.push(`${type}: missing url`);
          }
          if (type === "Product") {
            if (!item.name) validationIssues.push(`${type}: missing name`);
            if (!item.offers) validationIssues.push(`${type}: missing offers`);
          }
          if (type === "BreadcrumbList") {
            if (!item.itemListElement || !Array.isArray(item.itemListElement)) validationIssues.push("BreadcrumbList: missing itemListElement");
          }
          if (type === "FAQPage") {
            if (!item.mainEntity || !Array.isArray(item.mainEntity)) validationIssues.push("FAQPage: missing mainEntity");
          }
        }
      } catch (e) {
        validationIssues.push("Invalid JSON in JSON-LD block");
      }
    });

    const uniqueIssues = Array.from(new Set(validationIssues));
    if (uniqueIssues.length > 0) {
      checks.push({ name: "Structured Data", status: "warn", value: types.length > 0 ? types.join(", ") : `${jsonLd.length} JSON-LD block(s)`, description: `Issues: ${uniqueIssues.slice(0, 3).join("; ")}`, fix: "Fix schema.org validation errors for better rich snippet eligibility" });
      score -= 3;
    } else {
      checks.push({ name: "Structured Data", status: "pass", value: types.join(", ") || `${jsonLd.length} JSON-LD block(s)`, description: "Valid structured data (JSON-LD) found" });
    }
  } else {
    checks.push({ name: "Structured Data", status: "warn", value: "None", description: "No JSON-LD structured data found", fix: "Add schema.org structured data to enhance search appearance" });
    score -= 5;
  }

  // Favicon
  const favicon = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  if (favicon.length > 0) {
    checks.push({ name: "Favicon", status: "pass", value: `${favicon.length} favicon link(s)`, description: "Favicon is configured" });
  } else {
    checks.push({ name: "Favicon", status: "warn", value: "Not found", description: "No favicon link tag found", fix: "Add a favicon for brand recognition in browser tabs and bookmarks" });
    score -= 3;
  }

  // X-Robots-Tag header
  const xRobots = headers["x-robots-tag"];
  if (xRobots && xRobots.includes("noindex")) {
    checks.push({ name: "X-Robots-Tag", status: "warn", value: xRobots, description: "X-Robots-Tag header includes noindex", fix: "Remove noindex from X-Robots-Tag if you want the page indexed" });
    score -= 10;
  }

  // Charset
  const charset = $('meta[charset]').attr("charset") || $('meta[http-equiv="Content-Type"]').attr("content");
  if (charset) {
    checks.push({ name: "Character Encoding", status: "pass", value: typeof charset === "string" ? charset : "set", description: "Character encoding is declared" });
  } else {
    checks.push({ name: "Character Encoding", status: "warn", value: "Not declared", description: "No charset declaration found", fix: "Add <meta charset=\"UTF-8\"> to the <head>" });
    score -= 3;
  }

  return { score: Math.max(0, score), checks };
}

// ─── Links Analysis ──────────────────────────────────────────────────

function checkLinks($: cheerio.CheerioAPI, pageUrl: string): SeoCategoryResult {
  const checks: SeoCheck[] = [];
  let score = 100;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(pageUrl);
  } catch {
    return { score: 0, checks: [{ name: "Links", status: "fail", value: "Error", description: "Could not parse page URL" }] };
  }

  const allLinks = $("a[href]");
  let internalCount = 0;
  let externalCount = 0;
  let nofollowCount = 0;
  let emptyAnchors = 0;
  const brokenHrefs: string[] = [];

  allLinks.each((_, el) => {
    const href = $(el).attr("href") || "";
    const rel = $(el).attr("rel") || "";
    const text = $(el).text().trim();

    if (!text && !$(el).find("img").length) emptyAnchors++;
    if (rel.includes("nofollow")) nofollowCount++;

    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;

    try {
      const linkUrl = new URL(href, pageUrl);
      if (linkUrl.hostname === parsedUrl.hostname) {
        internalCount++;
      } else {
        externalCount++;
      }
    } catch {
      brokenHrefs.push(href.substring(0, 60));
    }
  });

  // Internal links
  if (internalCount === 0) {
    checks.push({ name: "Internal Links", status: "warn", value: "0 found", description: "No internal links on the page", fix: "Add internal links to help search engines discover and understand your site structure" });
    score -= 10;
  } else {
    checks.push({ name: "Internal Links", status: "pass", value: `${internalCount} link(s)`, description: "Internal links found" });
  }

  // External links
  if (externalCount === 0) {
    checks.push({ name: "External Links", status: "info", value: "0 found", description: "No external links found" });
  } else {
    checks.push({ name: "External Links", status: "pass", value: `${externalCount} link(s)`, description: "External links add credibility and context" });
  }

  // Nofollow ratio
  const totalLinks = internalCount + externalCount;
  if (totalLinks > 0 && nofollowCount > 0) {
    const ratio = Math.round((nofollowCount / totalLinks) * 100);
    checks.push({ name: "Nofollow Links", status: ratio > 50 ? "warn" : "info", value: `${nofollowCount} (${ratio}%)`, description: `${nofollowCount} link(s) have rel="nofollow"`, ...(ratio > 50 ? { fix: "High nofollow ratio — ensure important links pass link equity" } : {}) });
    if (ratio > 50) score -= 5;
  }

  // Empty anchor text
  if (emptyAnchors > 0) {
    checks.push({ name: "Empty Anchor Text", status: "warn", value: `${emptyAnchors} link(s)`, description: "Links with no anchor text reduce SEO value", fix: "Add descriptive anchor text to all links" });
    score -= Math.min(8, emptyAnchors * 2);
  } else if (totalLinks > 0) {
    checks.push({ name: "Anchor Text", status: "pass", value: "All links have text", description: "All links have descriptive anchor text" });
  }

  // Broken href patterns
  if (brokenHrefs.length > 0) {
    checks.push({ name: "Malformed Links", status: "warn", value: `${brokenHrefs.length} found`, description: `Potentially broken hrefs: ${brokenHrefs.slice(0, 3).join(", ")}`, fix: "Fix malformed href attributes" });
    score -= Math.min(10, brokenHrefs.length * 3);
  }

  return { score: Math.max(0, score), checks };
}

// ─── Social / Open Graph Analysis ────────────────────────────────────

function checkSocial($: cheerio.CheerioAPI): SeoCategoryResult {
  const checks: SeoCheck[] = [];
  let score = 100;

  // Open Graph tags
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogUrl = $('meta[property="og:url"]').attr("content");
  const ogType = $('meta[property="og:type"]').attr("content");

  if (ogTitle) {
    checks.push({ name: "og:title", status: "pass", value: ogTitle.length > 80 ? ogTitle.substring(0, 80) + "..." : ogTitle, description: "Open Graph title is set" });
  } else {
    checks.push({ name: "og:title", status: "fail", value: "Missing", description: "No og:title found", fix: "Add <meta property=\"og:title\" content=\"...\"> for social sharing" });
    score -= 15;
  }

  if (ogDesc) {
    checks.push({ name: "og:description", status: "pass", value: ogDesc.length > 80 ? ogDesc.substring(0, 80) + "..." : ogDesc, description: "Open Graph description is set" });
  } else {
    checks.push({ name: "og:description", status: "warn", value: "Missing", description: "No og:description found", fix: "Add <meta property=\"og:description\" content=\"...\"> for social sharing" });
    score -= 10;
  }

  if (ogImage) {
    checks.push({ name: "og:image", status: "pass", value: ogImage.length > 80 ? ogImage.substring(0, 80) + "..." : ogImage, description: "Open Graph image is set" });
  } else {
    checks.push({ name: "og:image", status: "fail", value: "Missing", description: "No og:image found — shared links will have no preview image", fix: "Add <meta property=\"og:image\" content=\"...\"> (recommended: 1200x630px)" });
    score -= 20;
  }

  if (ogUrl) {
    checks.push({ name: "og:url", status: "pass", value: ogUrl, description: "Canonical URL for sharing is set" });
  } else {
    checks.push({ name: "og:url", status: "info", value: "Not set", description: "og:url not specified" });
  }

  if (ogType) {
    checks.push({ name: "og:type", status: "pass", value: ogType, description: "Content type for sharing is set" });
  } else {
    checks.push({ name: "og:type", status: "info", value: "Not set", description: "og:type not specified (defaults to website)" });
  }

  // Twitter Card
  const twitterCard = $('meta[name="twitter:card"]').attr("content") || $('meta[property="twitter:card"]').attr("content");
  const twitterTitle = $('meta[name="twitter:title"]').attr("content") || $('meta[property="twitter:title"]').attr("content");
  const twitterImage = $('meta[name="twitter:image"]').attr("content") || $('meta[property="twitter:image"]').attr("content");

  if (twitterCard) {
    checks.push({ name: "Twitter Card", status: "pass", value: twitterCard, description: "Twitter Card type is configured" });
  } else {
    checks.push({ name: "Twitter Card", status: "warn", value: "Missing", description: "No twitter:card meta tag", fix: "Add <meta name=\"twitter:card\" content=\"summary_large_image\"> for Twitter/X previews" });
    score -= 8;
  }

  if (twitterTitle || ogTitle) {
    checks.push({ name: "Twitter Title", status: "pass", value: twitterTitle || "Falls back to og:title", description: "Title is available for Twitter/X sharing" });
  }

  if (twitterImage || ogImage) {
    checks.push({ name: "Twitter Image", status: "pass", value: twitterImage ? "Custom image set" : "Falls back to og:image", description: "Image is available for Twitter/X sharing" });
  }

  return { score: Math.max(0, score), checks };
}

// ─── Performance Analysis ────────────────────────────────────────────

function checkPerformance(page: FetchedPage, $: cheerio.CheerioAPI): SeoCategoryResult {
  const checks: SeoCheck[] = [];
  let score = 100;

  // Response time
  const rt = page.responseTime;
  if (rt < 500) {
    checks.push({ name: "Response Time", status: "pass", value: `${Math.round(rt)} ms`, description: "Fast server response" });
  } else if (rt < 2000) {
    checks.push({ name: "Response Time", status: "warn", value: `${Math.round(rt)} ms`, description: "Moderate response time", fix: "Optimize server response time — aim for under 500ms" });
    score -= 10;
  } else {
    checks.push({ name: "Response Time", status: "fail", value: `${Math.round(rt)} ms`, description: "Slow response time (> 2s)", fix: "Investigate server performance, caching, and CDN setup" });
    score -= 25;
  }

  // Page size
  const size = page.bodySize;
  if (size < 100_000) {
    checks.push({ name: "Page Size", status: "pass", value: formatBytes(size), description: "Page size is efficient" });
  } else if (size < 500_000) {
    checks.push({ name: "Page Size", status: "warn", value: formatBytes(size), description: "Page is moderately large", fix: "Reduce HTML size, defer scripts, and lazy-load content" });
    score -= 10;
  } else {
    checks.push({ name: "Page Size", status: "fail", value: formatBytes(size), description: "Page is very large (> 500KB)", fix: "Significantly reduce page weight for better performance" });
    score -= 20;
  }

  // Compression
  if (page.compression) {
    checks.push({ name: "Compression", status: "pass", value: page.compression, description: `Response compressed with ${page.compression}` });
  } else {
    checks.push({ name: "Compression", status: "warn", value: "None", description: "No compression detected", fix: "Enable gzip or Brotli compression" });
    score -= 10;
  }

  // Image count
  const images = $("img");
  if (images.length > 30) {
    checks.push({ name: "Image Count", status: "warn", value: `${images.length} images`, description: "High number of images may slow page load", fix: "Lazy-load images below the fold and use modern formats (WebP, AVIF)" });
    score -= 8;
  } else {
    checks.push({ name: "Image Count", status: "pass", value: `${images.length} images`, description: "Reasonable number of images" });
  }

  // Render-blocking scripts
  const blockingScripts = $('script:not([async]):not([defer]):not([type="application/ld+json"]):not([type="module"])').filter((_, el) => !!$(el).attr("src"));
  if (blockingScripts.length > 3) {
    checks.push({ name: "Render-Blocking Scripts", status: "warn", value: `${blockingScripts.length} scripts`, description: "Multiple render-blocking scripts found", fix: "Add async or defer attributes to non-critical scripts" });
    score -= 8;
  } else if (blockingScripts.length > 0) {
    checks.push({ name: "Render-Blocking Scripts", status: "info", value: `${blockingScripts.length} script(s)`, description: "Some render-blocking scripts found" });
  } else {
    checks.push({ name: "Render-Blocking Scripts", status: "pass", value: "None", description: "No render-blocking scripts detected" });
  }

  return { score: Math.max(0, score), checks };
}

// ─── Main Analyzer ───────────────────────────────────────────────────

export async function analyzePage(url: string): Promise<SeoAnalysisResult> {
  const page = await fetchPage(url);
  const $ = cheerio.load(page.body);

  // Parallel: robots.txt + sitemap
  const robotsResult = await checkRobotsTxt(page.finalUrl);
  const sitemapResult = await checkSitemap(page.finalUrl, robotsResult?.sitemapUrls || []);

  const contentResult = checkContent($, page.body);
  const technicalResult = checkTechnical($, page.finalUrl, page.headers);

  // Add robots.txt & sitemap checks to technical category
  if (robotsResult) {
    technicalResult.checks.push({
      name: "robots.txt",
      status: robotsResult.found ? "pass" : "warn",
      value: robotsResult.found ? `Found (${robotsResult.rules.length} rules)` : "Not found",
      description: "robots.txt tells search engines which pages to crawl",
      ...(robotsResult.found ? {} : { fix: "Create a robots.txt file in your site root" }),
    });
    if (robotsResult.blocksPage) {
      technicalResult.checks.push({
        name: "Page blocked by robots.txt",
        status: "fail",
        value: "This page is disallowed in robots.txt",
        description: "Search engines are instructed not to crawl this page",
        fix: "Review your robots.txt Disallow rules",
      });
    }
  }
  if (sitemapResult) {
    technicalResult.checks.push({
      name: "XML Sitemap",
      status: sitemapResult.found ? "pass" : "warn",
      value: sitemapResult.found ? `Found (${sitemapResult.urlCount} URLs)` : "Not found",
      description: "XML sitemaps help search engines discover and index your pages",
      ...(sitemapResult.found ? {} : { fix: "Create a sitemap.xml file and reference it in robots.txt" }),
    });
  }

  const linksResult = checkLinks($, page.finalUrl);
  const socialResult = checkSocial($);
  const performanceResult = checkPerformance(page, $);

  // Weighted overall score
  const overallScore = Math.round(
    contentResult.score * 0.30 +
    technicalResult.score * 0.25 +
    linksResult.score * 0.15 +
    socialResult.score * 0.15 +
    performanceResult.score * 0.15
  );

  const grade = gradeFromScore(overallScore);

  // Extract meta summary
  const title = $("title").first().text().trim() || null;
  const description = $('meta[name="description"]').attr("content")?.trim() || null;
  const h1 = $("h1").first().text().trim() || null;
  const textContent = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
  const images = $("img");

  let parsedUrl: URL | null = null;
  try { parsedUrl = new URL(page.finalUrl); } catch { /* ignore */ }

  let internalLinks = 0;
  let externalLinks = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const linkUrl = new URL(href, page.finalUrl);
      if (parsedUrl && linkUrl.hostname === parsedUrl.hostname) internalLinks++;
      else externalLinks++;
    } catch { /* ignore */ }
  });

  return {
    url: page.finalUrl,
    scannedAt: new Date().toISOString(),
    overallScore,
    grade,
    categories: {
      content: contentResult,
      technical: technicalResult,
      links: linksResult,
      social: socialResult,
      performance: performanceResult,
    },
    meta: {
      title,
      description,
      h1,
      wordCount,
      imageCount: images.length,
      internalLinks,
      externalLinks,
    },
    redirectChain: page.redirectChain,
    robotsTxt: robotsResult,
    sitemap: sitemapResult,
  };
}
