import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { normalizeUrl, validateUrl, fetchPage } from "@/lib/seo/analyzer";
import type { AuditIssue, AuditPageResult, SiteAuditResult } from "@/lib/seo/types";

const MAX_PAGES = 50;
const CONCURRENCY = 3;
const PAGE_TIMEOUT = 30_000;

function extractInternalLinks($: cheerio.CheerioAPI, pageUrl: string, baseDomain: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;

    try {
      const linkUrl = new URL(href, pageUrl);
      // Same domain only
      if (linkUrl.hostname !== baseDomain) return;
      // Normalize: remove hash, ensure trailing consistency
      linkUrl.hash = "";
      const normalized = linkUrl.toString().replace(/\/$/, "");
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch { /* ignore malformed */ }
  });

  return links;
}

function auditPage($: cheerio.CheerioAPI, pageUrl: string, status: number, baseDomain: string, depth: number): { issues: AuditIssue[]; pageResult: AuditPageResult } {
  const issues: AuditIssue[] = [];

  const title = $("title").first().text().trim() || null;
  const description = $('meta[name="description"]').attr("content")?.trim() || null;
  const h1s = $("h1");
  const textContent = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

  // Status code issues
  if (status >= 400) {
    issues.push({ type: "Broken Page", severity: "critical", message: `Page returned HTTP ${status}`, url: pageUrl });
  }

  // Title checks
  if (!title) {
    issues.push({ type: "Missing Title", severity: "critical", message: "Page has no <title> tag", url: pageUrl });
  } else if (title.length < 10) {
    issues.push({ type: "Short Title", severity: "warning", message: `Title is too short (${title.length} chars)`, url: pageUrl, details: title });
  } else if (title.length > 60) {
    issues.push({ type: "Long Title", severity: "warning", message: `Title is too long (${title.length} chars) and may be truncated`, url: pageUrl, details: title });
  }

  // Meta description checks
  if (!description) {
    issues.push({ type: "Missing Description", severity: "warning", message: "No meta description found", url: pageUrl });
  } else if (description.length < 70) {
    issues.push({ type: "Short Description", severity: "warning", message: `Meta description is too short (${description.length} chars)`, url: pageUrl });
  } else if (description.length > 160) {
    issues.push({ type: "Long Description", severity: "info", message: `Meta description may be truncated (${description.length} chars)`, url: pageUrl });
  }

  // H1 checks
  if (h1s.length === 0) {
    issues.push({ type: "Missing H1", severity: "warning", message: "No H1 heading found", url: pageUrl });
  } else if (h1s.length > 1) {
    issues.push({ type: "Multiple H1", severity: "warning", message: `${h1s.length} H1 tags found (should be 1)`, url: pageUrl });
  }

  // Images without alt text
  const images = $("img");
  const noAlt = images.filter((_, el) => {
    const alt = $(el).attr("alt");
    return !alt || alt.trim() === "";
  });
  if (noAlt.length > 0) {
    issues.push({ type: "Missing Alt Text", severity: "warning", message: `${noAlt.length} image(s) missing alt text`, url: pageUrl });
  }

  // Missing canonical
  const canonical = $('link[rel="canonical"]').attr("href");
  if (!canonical) {
    issues.push({ type: "Missing Canonical", severity: "info", message: "No canonical tag found", url: pageUrl });
  }

  // Noindex check
  const robotsMeta = $('meta[name="robots"]').attr("content") || "";
  if (robotsMeta.includes("noindex")) {
    issues.push({ type: "Noindex Page", severity: "warning", message: "Page is set to noindex", url: pageUrl });
  }

  // Missing OG tags
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (!ogTitle && !ogImage) {
    issues.push({ type: "Missing OG Tags", severity: "info", message: "No Open Graph tags found", url: pageUrl });
  }

  // Thin content
  if (wordCount < 300 && status < 400) {
    issues.push({ type: "Thin Content", severity: "warning", message: `Only ${wordCount} words — content may be too thin`, url: pageUrl });
  }

  // Deep pages
  if (depth > 3) {
    issues.push({ type: "Deep Page", severity: "info", message: `Page is ${depth} clicks from start URL`, url: pageUrl });
  }

  return {
    issues,
    pageResult: {
      url: pageUrl,
      status,
      title,
      description,
      h1Count: h1s.length,
      wordCount,
      issueCount: issues.length,
      depth,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { url: rawUrl, maxPages } = body as { url?: string; maxPages?: number };
    if (!rawUrl || typeof rawUrl !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const url = normalizeUrl(rawUrl);
    let parsedUrl: URL;
    try {
      parsedUrl = validateUrl(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid URL";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const baseDomain = parsedUrl.hostname;
    const pageLimit = Math.min(maxPages || MAX_PAGES, MAX_PAGES);

    // BFS crawl
    const visited = new Set<string>();
    const queue: { url: string; depth: number }[] = [{ url: url.replace(/\/$/, ""), depth: 0 }];
    const allIssues: AuditIssue[] = [];
    const allPages: AuditPageResult[] = [];

    while (queue.length > 0 && visited.size < pageLimit) {
      // Take a batch
      const batch: { url: string; depth: number }[] = [];
      while (batch.length < CONCURRENCY && queue.length > 0) {
        const item = queue.shift()!;
        const normalized = item.url.replace(/\/$/, "");
        if (visited.has(normalized)) continue;
        visited.add(normalized);
        batch.push({ ...item, url: normalized });
      }

      if (batch.length === 0) break;

      // Process batch in parallel
      const results = await Promise.all(
        batch.map(async ({ url: pageUrl, depth }) => {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT);

            const page = await fetchPage(pageUrl);
            clearTimeout(timer);

            const $ = cheerio.load(page.body);
            const { issues, pageResult } = auditPage($, pageUrl, page.statusCode, baseDomain, depth);
            const internalLinks = extractInternalLinks($, pageUrl, baseDomain);

            return { issues, pageResult, internalLinks, depth };
          } catch {
            return {
              issues: [{ type: "Unreachable Page", severity: "critical" as const, message: "Could not fetch page", url: pageUrl }],
              pageResult: { url: pageUrl, status: 0, title: null, description: null, h1Count: 0, wordCount: 0, issueCount: 1, depth },
              internalLinks: [] as string[],
              depth,
            };
          }
        })
      );

      for (const result of results) {
        allIssues.push(...result.issues);
        allPages.push(result.pageResult);

        // Add discovered links to queue
        for (const link of result.internalLinks) {
          const normalized = link.replace(/\/$/, "");
          if (!visited.has(normalized) && visited.size + queue.length < pageLimit) {
            queue.push({ url: normalized, depth: result.depth + 1 });
          }
        }
      }
    }

    // Check for duplicate titles across pages
    const titleMap: Record<string, string[]> = {};
    for (const page of allPages) {
      if (page.title) {
        if (!titleMap[page.title]) titleMap[page.title] = [];
        titleMap[page.title].push(page.url);
      }
    }
    for (const [title, urls] of Object.entries(titleMap)) {
      if (urls.length > 1) {
        allIssues.push({
          type: "Duplicate Title",
          severity: "warning",
          message: `${urls.length} pages share the same title`,
          url: urls[0],
          details: `Title: "${title}" found on: ${urls.slice(0, 3).join(", ")}${urls.length > 3 ? ` (+${urls.length - 3} more)` : ""}`,
        });
      }
    }

    // Check for duplicate descriptions
    const descMap: Record<string, string[]> = {};
    for (const page of allPages) {
      if (page.description) {
        if (!descMap[page.description]) descMap[page.description] = [];
        descMap[page.description].push(page.url);
      }
    }
    for (const [desc, urls] of Object.entries(descMap)) {
      if (urls.length > 1) {
        allIssues.push({
          type: "Duplicate Description",
          severity: "info",
          message: `${urls.length} pages share the same meta description`,
          url: urls[0],
          details: `Description: "${desc.substring(0, 80)}..." found on ${urls.length} pages`,
        });
      }
    }

    // Categorize issues
    const critical = allIssues.filter(i => i.severity === "critical");
    const warnings = allIssues.filter(i => i.severity === "warning");
    const info = allIssues.filter(i => i.severity === "info");

    // Issues by type
    const issuesByType: Record<string, number> = {};
    for (const issue of allIssues) {
      issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
    }

    const result: SiteAuditResult = {
      url: url,
      scannedAt: new Date().toISOString(),
      pagesScanned: allPages.length,
      totalIssues: allIssues.length,
      issues: { critical, warnings, info },
      pages: allPages,
      issuesByType,
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
