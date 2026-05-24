// ─── SEO Analyzer Types ──────────────────────────────────────────────

export interface SeoCheck {
  name: string;
  status: "pass" | "warn" | "fail" | "info";
  value: string;
  description: string;
  fix?: string;
}

export interface SeoCategoryResult {
  score: number;
  checks: SeoCheck[];
}

export type SeoCategoryKey = "content" | "technical" | "links" | "social" | "performance";

export interface SeoAnalysisResult {
  url: string;
  scannedAt: string;
  overallScore: number;
  grade: string;
  categories: Record<SeoCategoryKey, SeoCategoryResult>;
  meta: {
    title: string | null;
    description: string | null;
    h1: string | null;
    wordCount: number;
    imageCount: number;
    internalLinks: number;
    externalLinks: number;
  };
  redirectChain: Array<{ url: string; status: number }>;
  robotsTxt: { found: boolean; blocksPage: boolean; sitemapUrls: string[]; rules: string[] } | null;
  sitemap: { found: boolean; urlCount: number; sitemapUrl: string } | null;
}

// ─── Keyword Research Types ──────────────────────────────────────────

export interface KeywordGroup {
  type: "suggestions" | "questions" | "comparisons" | "longTail";
  label: string;
  keywords: string[];
}

export interface KeywordResult {
  keyword: string;
  extractedFrom?: string;
  groups: KeywordGroup[];
  totalCount: number;
}

// ─── Site Audit Types ────────────────────────────────────────────────

export interface AuditIssue {
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  url: string;
  details?: string;
}

export interface AuditPageResult {
  url: string;
  status: number;
  title: string | null;
  description: string | null;
  h1Count: number;
  wordCount: number;
  issueCount: number;
  depth: number;
}

export interface SiteAuditResult {
  url: string;
  scannedAt: string;
  pagesScanned: number;
  totalIssues: number;
  issues: {
    critical: AuditIssue[];
    warnings: AuditIssue[];
    info: AuditIssue[];
  };
  pages: AuditPageResult[];
  issuesByType: Record<string, number>;
}
