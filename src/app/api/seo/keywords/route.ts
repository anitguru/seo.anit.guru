import { NextRequest, NextResponse } from "next/server";
import { checkQuota } from "@/lib/quota";

const QUESTION_PREFIXES = [
  "how to", "what is", "what are", "why does", "why is",
  "can you", "can i", "where to", "when to", "is it",
  "does", "should i", "which", "who",
];

const COMPARISON_MODIFIERS = [
  "vs", "versus", "or", "alternative to", "compared to",
  "better than", "difference between",
];

const LONG_TAIL_MODIFIERS = [
  "for beginners", "for small business", "for free", "near me",
  "online", "best", "top", "cheap", "free", "review",
  "examples", "tutorial", "guide", "tips",
];

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

async function fetchAutocomplete(query: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0" },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!resp.ok) return [];
    const data = await resp.json();
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].filter((s: unknown) => typeof s === "string" && s.toLowerCase() !== query.toLowerCase());
    }
    return [];
  } catch {
    return [];
  }
}

async function fetchBatch(queries: string[], concurrency: number = 5): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fetchAutocomplete));
    for (const r of batchResults) results.push(...r);
  }
  return [...new Set(results)];
}

export async function POST(request: NextRequest) {
  try {
    if (!(await checkQuota("seo-keywords"))) {
      return NextResponse.json(
        { error: "Daily request limit reached for this tool. Try again tomorrow." },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { keyword } = body as { keyword?: string };
    if (!keyword || typeof keyword !== "string" || keyword.trim().length === 0) {
      return NextResponse.json({ error: "Keyword is required" }, { status: 400 });
    }

    let seed = keyword.trim().toLowerCase();

    // If the input looks like a URL, fetch the page and extract the title as the keyword seed
    const isUrl = /^(https?:\/\/|[a-z0-9][-a-z0-9]*\.[a-z]{2,})/i.test(seed);
    let extractedFrom: string | undefined;
    if (isUrl) {
      try {
        const fetchUrl = seed.startsWith("http") ? seed : `https://${seed}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(fetchUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SEO+/1.0)" },
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timer);
        if (resp.ok) {
          const html = await resp.text();
          // Extract page title
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch) {
            // Clean the title: remove site name suffix (e.g. " - Wayfinder", " | MySite")
            let title = titleMatch[1].trim();
            title = title.replace(/\s*[-|–—]\s*[^-|–—]+$/, "").trim();
            // Use the primary clause (before first colon/dash/pipe) for a more focused seed
            const primaryClause = title.split(/\s*[:|\-–—]\s*/)[0].trim();
            const bestSeed = primaryClause.length >= 3 ? primaryClause : title;
            if (bestSeed.length > 3) {
              extractedFrom = seed;
              seed = bestSeed.toLowerCase();
            }
          }
        }
      } catch {
        // If fetch fails, fall back to using the URL as-is (will produce poor results but won't break)
      }
    }

    // Run all queries in parallel groups
    const [baseSuggestions, alphaSuggestions, questionSuggestions, comparisonSuggestions, longTailSuggestions] = await Promise.all([
      // Base suggestions
      fetchAutocomplete(seed),
      // Alphabetical expansion
      fetchBatch(ALPHABET.map(l => `${seed} ${l}`), 6),
      // Question prefixes
      fetchBatch(QUESTION_PREFIXES.map(p => `${p} ${seed}`), 5),
      // Comparison modifiers
      fetchBatch(COMPARISON_MODIFIERS.map(m => `${seed} ${m}`), 4),
      // Long-tail modifiers
      fetchBatch(LONG_TAIL_MODIFIERS.map(m => `${seed} ${m}`), 5),
    ]);

    // Deduplicate across categories
    const seen = new Set<string>();
    const dedup = (arr: string[]) => {
      const result: string[] = [];
      for (const s of arr) {
        const lower = s.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          result.push(s);
        }
      }
      return result;
    };

    // Combine base + alphabetical as "Suggestions"
    const allSuggestions = dedup([...baseSuggestions, ...alphaSuggestions]);
    const questions = dedup(questionSuggestions);
    const comparisons = dedup(comparisonSuggestions);
    const longTail = dedup(longTailSuggestions);

    const totalCount = allSuggestions.length + questions.length + comparisons.length + longTail.length;

    return NextResponse.json({
      keyword: seed,
      ...(extractedFrom ? { extractedFrom } : {}),
      groups: [
        { type: "suggestions", label: "Suggestions", keywords: allSuggestions },
        { type: "questions", label: "Questions", keywords: questions },
        { type: "comparisons", label: "Comparisons", keywords: comparisons },
        { type: "longTail", label: "Long-tail", keywords: longTail },
      ],
      totalCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
