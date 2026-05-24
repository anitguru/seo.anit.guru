"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { SeoAnalysisResult, SeoCategoryKey } from "@/lib/seo/types";
import type { KeywordResult } from "@/lib/seo/types";
import type { SiteAuditResult } from "@/lib/seo/types";

const MAIN_SITE = process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://anit.guru";

// ─── Types ───────────────────────────────────────────────────────────

type Tab = "analyzer" | "keywords" | "audit";

interface SeoCheck {
  name: string;
  status: "pass" | "warn" | "fail" | "info";
  value: string;
  description: string;
  fix?: string;
}

interface SeoCategoryResult {
  score: number;
  checks: SeoCheck[];
}

// ─── Category Config ─────────────────────────────────────────────────

const CATEGORY_META: Record<SeoCategoryKey, { label: string; color: string; bgColor: string; borderColor: string; barColor: string; icon: React.ReactNode }> = {
  content: {
    label: "Content",
    color: "text-ctp-green",
    bgColor: "bg-ctp-green/10",
    borderColor: "border-ctp-green/30",
    barColor: "bg-ctp-green",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg>,
  },
  technical: {
    label: "Technical",
    color: "text-ctp-mauve",
    bgColor: "bg-ctp-mauve/10",
    borderColor: "border-ctp-mauve/30",
    barColor: "bg-ctp-mauve",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13l-2 2 2 2" /><path d="M14 13l2 2-2 2" /><circle cx="12" cy="12" r="10" /></svg>,
  },
  links: {
    label: "Links",
    color: "text-ctp-sapphire",
    bgColor: "bg-ctp-sapphire/10",
    borderColor: "border-ctp-sapphire/30",
    barColor: "bg-ctp-sapphire",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  },
  social: {
    label: "Social",
    color: "text-ctp-pink",
    bgColor: "bg-ctp-pink/10",
    borderColor: "border-ctp-pink/30",
    barColor: "bg-ctp-pink",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
  },
  performance: {
    label: "Performance",
    color: "text-ctp-peach",
    bgColor: "bg-ctp-peach/10",
    borderColor: "border-ctp-peach/30",
    barColor: "bg-ctp-peach",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  },
};

const CATEGORY_ORDER: SeoCategoryKey[] = ["content", "technical", "links", "social", "performance"];

const SCANNING_MESSAGES: Record<Tab, string[]> = {
  analyzer: ["Fetching page...", "Analyzing content...", "Checking technical SEO...", "Inspecting links...", "Evaluating social tags..."],
  keywords: ["Querying suggestions...", "Expanding alphabet...", "Finding questions...", "Discovering comparisons...", "Gathering long-tail keywords..."],
  audit: ["Crawling pages...", "Following internal links...", "Checking titles...", "Scanning for issues...", "Analyzing site structure..."],
};

// ─── Helpers ─────────────────────────────────────────────────────────

function getGradeColor(grade: string): string {
  if (grade === "A+" || grade === "A") return "text-ctp-green";
  if (grade === "B") return "text-ctp-teal";
  if (grade === "C") return "text-ctp-yellow";
  if (grade === "D") return "text-ctp-peach";
  return "text-ctp-red";
}

function getGradeRingColor(grade: string): string {
  if (grade === "A+" || grade === "A") return "stroke-ctp-green";
  if (grade === "B") return "stroke-ctp-teal";
  if (grade === "C") return "stroke-ctp-yellow";
  if (grade === "D") return "stroke-ctp-peach";
  return "stroke-ctp-red";
}

function getGradeTrailColor(grade: string): string {
  if (grade === "A+" || grade === "A") return "stroke-ctp-green/15";
  if (grade === "B") return "stroke-ctp-teal/15";
  if (grade === "C") return "stroke-ctp-yellow/15";
  if (grade === "D") return "stroke-ctp-peach/15";
  return "stroke-ctp-red/15";
}

function getGradeGlowColor(grade: string): string {
  if (grade === "A+" || grade === "A") return "drop-shadow-[0_0_24px_rgba(166,227,161,0.3)]";
  if (grade === "B") return "drop-shadow-[0_0_24px_rgba(148,226,213,0.3)]";
  if (grade === "C") return "drop-shadow-[0_0_24px_rgba(249,226,175,0.3)]";
  if (grade === "D") return "drop-shadow-[0_0_24px_rgba(250,179,135,0.3)]";
  return "drop-shadow-[0_0_24px_rgba(243,139,168,0.3)]";
}

function getScoreBarColor(score: number): string {
  if (score >= 80) return "bg-ctp-green";
  if (score >= 60) return "bg-ctp-teal";
  if (score >= 40) return "bg-ctp-yellow";
  if (score >= 20) return "bg-ctp-peach";
  return "bg-ctp-red";
}

function getStatusIcon(status: SeoCheck["status"]): React.ReactNode {
  switch (status) {
    case "pass": return <div className="w-5 h-5 rounded-full bg-ctp-green/15 flex items-center justify-center shrink-0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-ctp-green"><polyline points="20 6 9 17 4 12" /></svg></div>;
    case "warn": return <div className="w-5 h-5 rounded-full bg-ctp-yellow/15 flex items-center justify-center shrink-0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-ctp-yellow"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg></div>;
    case "fail": return <div className="w-5 h-5 rounded-full bg-ctp-red/15 flex items-center justify-center shrink-0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-ctp-red"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></div>;
    case "info": return <div className="w-5 h-5 rounded-full bg-ctp-blue/15 flex items-center justify-center shrink-0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-ctp-blue"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg></div>;
  }
}

function countByStatus(checks: SeoCheck[]) {
  let pass = 0, warn = 0, fail = 0;
  for (const c of checks) {
    if (c.status === "pass") pass++;
    else if (c.status === "warn") warn++;
    else if (c.status === "fail") fail++;
  }
  return { pass, warn, fail };
}

// ─── Components ──────────────────────────────────────────────────────

function ToolLogo({ onReset }: { onReset?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Link href={`${MAIN_SITE}/tools`} className="text-[11px] text-ctp-overlay0 hover:text-ctp-blue transition-colors">&larr; Tools</Link>
      <span className="text-ctp-surface2">|</span>
      <button onClick={onReset} className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" title="Reset">
        <div className="w-9 h-9 rounded-lg bg-ctp-blue/15 flex items-center justify-center border border-ctp-blue/25">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ctp-blue"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="m8 11 2 2 4-4" /></svg>
        </div>
        <div className="text-left">
          <h1 className="text-lg font-bold text-ctp-text tracking-tight leading-tight">SEO+</h1>
          <p className="text-[11px] text-ctp-overlay1 leading-tight">SEO Analysis Suite</p>
        </div>
      </button>
    </div>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "analyzer", label: "Page Analyzer", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg> },
    { key: "keywords", label: "Keywords", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> },
    { key: "audit", label: "Site Audit", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /></svg> },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-ctp-surface0/50 rounded-xl border border-ctp-surface0/80 w-fit mx-auto">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
            active === tab.key
              ? "bg-ctp-blue text-ctp-crust shadow-sm"
              : "text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0/80"
          }`}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function ScanningAnimation({ tab }: { tab: Tab }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const messages = SCANNING_MESSAGES[tab];

  useEffect(() => {
    const interval = setInterval(() => setMsgIndex(prev => (prev + 1) % messages.length), 1800);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="flex flex-col items-center gap-6 py-20">
      <div className="w-16 h-16 rounded-2xl bg-ctp-blue/10 border-2 border-ctp-blue/30 flex items-center justify-center animate-pulse-glow-blue">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ctp-blue animate-spin-slow"><circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
      </div>
      <div className="text-center">
        <p className="text-ctp-text font-medium mb-1">{tab === "audit" ? "Crawling site..." : tab === "keywords" ? "Researching keywords..." : "Analyzing page..."}</p>
        <p className="text-ctp-overlay1 text-sm h-5 transition-all duration-300">{messages[msgIndex]}</p>
      </div>
      <div className="w-64 h-1.5 bg-ctp-surface0 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-ctp-blue to-ctp-sapphire rounded-full scan-progress" />
      </div>
    </div>
  );
}

function ExamplePill({ text, onClick }: { text: string; onClick: (text: string) => void }) {
  return (
    <button onClick={() => onClick(text)} className="px-3.5 py-1.5 text-xs rounded-full bg-ctp-surface0/60 text-ctp-subtext0 border border-ctp-surface1/60 hover:border-ctp-blue/40 hover:text-ctp-blue hover:bg-ctp-surface0/80 transition-all cursor-pointer">
      {text}
    </button>
  );
}

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${getGradeGlowColor(grade)}`}>
        <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
          <circle cx="90" cy="90" r={radius} fill="none" strokeWidth="10" className={getGradeTrailColor(grade)} />
          <circle cx="90" cy="90" r={radius} fill="none" strokeWidth="10" strokeLinecap="round" className={`${getGradeRingColor(grade)} transition-all duration-1000 ease-out`} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-bold ${getGradeColor(grade)} leading-none`}>{grade}</span>
          <span className="text-2xl font-semibold text-ctp-text mt-1">{animatedScore}</span>
          <span className="text-[10px] text-ctp-overlay0 uppercase tracking-wider mt-0.5">/ 100</span>
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ categoryKey, categoryResult, delay, onClick, isActive, prevScore }: { categoryKey: SeoCategoryKey; categoryResult: SeoCategoryResult; delay: number; onClick: () => void; isActive: boolean; prevScore?: number }) {
  const meta = CATEGORY_META[categoryKey];
  const { pass, warn, fail } = countByStatus(categoryResult.checks);

  return (
    <button onClick={onClick} className={`animate-slide-up text-left w-full p-4 rounded-xl border transition-all duration-200 cursor-pointer hover:translate-y-[-1px] hover:shadow-lg hover:shadow-ctp-crust/20 ${isActive ? `${meta.borderColor} ${meta.bgColor} shadow-lg shadow-ctp-crust/20` : "border-ctp-surface0/80 bg-ctp-mantle/50 hover:border-ctp-surface1"}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-7 h-7 rounded-lg ${meta.bgColor} flex items-center justify-center`}><span className={meta.color}>{meta.icon}</span></div>
        <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
      </div>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xl font-bold text-ctp-text">{categoryResult.score}</span>
          <div className="flex items-center gap-1">
            {prevScore !== undefined && (() => {
              const d = categoryResult.score - prevScore;
              if (d > 0) return <span className="text-[9px] text-ctp-green font-medium">+{d}</span>;
              if (d < 0) return <span className="text-[9px] text-ctp-red font-medium">{d}</span>;
              return null;
            })()}
            <span className="text-[10px] text-ctp-overlay0">/ 100</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-ctp-surface0 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ease-out ${getScoreBarColor(categoryResult.score)}`} style={{ width: `${categoryResult.score}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px]">
        {pass > 0 && <span className="flex items-center gap-1 text-ctp-green"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>{pass}</span>}
        {warn > 0 && <span className="flex items-center gap-1 text-ctp-yellow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>{warn}</span>}
        {fail > 0 && <span className="flex items-center gap-1 text-ctp-red"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>{fail}</span>}
      </div>
    </button>
  );
}

function CheckItem({ check }: { check: SeoCheck }) {
  const statusTextColor = check.status === "pass" ? "text-ctp-green" : check.status === "warn" ? "text-ctp-yellow" : check.status === "fail" ? "text-ctp-red" : "text-ctp-blue";

  return (
    <div className="py-3 px-4 rounded-xl bg-ctp-surface0/30 border border-ctp-surface0/60 hover:bg-ctp-surface0/50 transition-colors">
      <div className="flex items-start gap-3">
        {getStatusIcon(check.status)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ctp-text">{check.name}</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${check.status === "pass" ? "bg-ctp-green/10 text-ctp-green border-ctp-green/20" : check.status === "warn" ? "bg-ctp-yellow/10 text-ctp-yellow border-ctp-yellow/20" : check.status === "fail" ? "bg-ctp-red/10 text-ctp-red border-ctp-red/20" : "bg-ctp-blue/10 text-ctp-blue border-ctp-blue/20"}`}>{check.status}</span>
          </div>
          <p className={`text-xs font-mono mt-1 ${statusTextColor} break-all`}>{check.value}</p>
          <p className="text-[11px] text-ctp-overlay0 mt-1 leading-relaxed">{check.description}</p>
          {check.fix && (check.status === "warn" || check.status === "fail") && (
            <div className={`mt-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed ${check.status === "fail" ? "bg-ctp-red/8 border border-ctp-red/15 text-ctp-red" : "bg-ctp-yellow/8 border border-ctp-yellow/15 text-ctp-yellow"}`}>
              <span className="font-semibold">Fix: </span>{check.fix}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailedSection({ categoryKey, categoryResult, isOpen, onToggle, delay }: { categoryKey: SeoCategoryKey; categoryResult: SeoCategoryResult; isOpen: boolean; onToggle: () => void; delay: number }) {
  const meta = CATEGORY_META[categoryKey];

  return (
    <div className="animate-slide-up rounded-2xl bg-ctp-mantle/50 border border-ctp-surface0/80 overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-ctp-surface0/20 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-lg ${meta.bgColor} flex items-center justify-center`}><span className={meta.color}>{meta.icon}</span></div>
          <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
          <span className="text-[10px] font-mono text-ctp-overlay0 bg-ctp-surface0/80 px-1.5 py-0.5 rounded-md">{categoryResult.score}/100</span>
        </div>
        <div className="flex items-center gap-3">
          {(() => { const { pass, warn, fail } = countByStatus(categoryResult.checks); return (
            <div className="flex items-center gap-2 text-[11px]">
              {pass > 0 && <span className="text-ctp-green">{pass} passed</span>}
              {warn > 0 && <span className="text-ctp-yellow">{warn} warning{warn > 1 ? "s" : ""}</span>}
              {fail > 0 && <span className="text-ctp-red">{fail} failed</span>}
            </div>
          ); })()}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-ctp-overlay0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </button>
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-5 pb-5 space-y-2">
          {categoryResult.checks.map((check, i) => <CheckItem key={`${check.name}-${i}`} check={check} />)}
        </div>
      </div>
    </div>
  );
}

// ─── History helpers ─────────────────────────────────────────────────

const HISTORY_KEY = "anit-seo-history";
const MAX_HISTORY = 20;

interface HistoryEntry {
  url: string;
  scannedAt: string;
  overallScore: number;
  grade: string;
  categories: Record<SeoCategoryKey, { score: number }>;
}

function saveToHistory(result: SeoAnalysisResult) {
  try {
    const existing: HistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    const entry: HistoryEntry = {
      url: result.url,
      scannedAt: result.scannedAt,
      overallScore: result.overallScore,
      grade: result.grade,
      categories: Object.fromEntries(
        CATEGORY_ORDER.map(k => [k, { score: result.categories[k].score }])
      ) as Record<SeoCategoryKey, { score: number }>,
    };
    const filtered = existing.filter(e => e.url !== result.url);
    filtered.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
  } catch { /* localStorage unavailable */ }
}

function getHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch { return []; }
}

function getPreviousScan(url: string): HistoryEntry | null {
  const history = getHistory();
  return history.find(h => h.url === url) || null;
}

function AnalyzerResults({ result, scanTime }: { result: SeoAnalysisResult; scanTime: number | null }) {
  const [activeCategory, setActiveCategory] = useState<SeoCategoryKey | null>(null);
  const [previousScan] = useState<HistoryEntry | null>(() => {
    const prev = getPreviousScan(result.url);
    return prev && prev.scannedAt !== result.scannedAt ? prev : null;
  });
  const [openSections, setOpenSections] = useState<Set<SeoCategoryKey>>(() => {
    const autoOpen = new Set<SeoCategoryKey>();
    for (const key of CATEGORY_ORDER) {
      const cat = result.categories[key];
      if (cat.checks.some(c => c.status === "warn" || c.status === "fail")) autoOpen.add(key);
    }
    return autoOpen;
  });

  const hostname = (() => { try { return new URL(result.url).hostname; } catch { return result.url; } })();

  useEffect(() => {
    saveToHistory(result);
  }, [result]);

  const toggleSection = (key: SeoCategoryKey) => {
    setOpenSections(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const exportAnalyzerCsv = () => {
    const rows = ["Category,Check,Status,Value,Description,Fix"];
    for (const key of CATEGORY_ORDER) {
      const cat = result.categories[key];
      const label = CATEGORY_META[key].label;
      for (const c of cat.checks) {
        rows.push(`"${label}","${c.name.replace(/"/g, '""')}","${c.status}","${c.value.replace(/"/g, '""')}","${c.description.replace(/"/g, '""')}","${(c.fix || "").replace(/"/g, '""')}"`);
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-analysis-${hostname}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pb-16">
      {/* Site info header */}
      <div className="animate-fade-in bg-ctp-mantle rounded-2xl border border-ctp-surface0 p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src={`https://${hostname}/favicon.ico`} alt="" className="w-8 h-8 rounded-lg bg-white p-1 shrink-0 border border-ctp-surface1/50" onError={(e) => { const img = e.target as HTMLImageElement; if (img.src.includes("favicon.ico") && !img.src.includes("duckduckgo")) { img.src = `https://icons.duckduckgo.com/ip3/${hostname}.ico`; } else if (img.src.includes("duckduckgo")) { img.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`; } else { img.style.display = "none"; } }} />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-ctp-text truncate">{hostname}</h2>
              <p className="text-[11px] text-ctp-overlay1 truncate">{result.url}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                const shareUrl = `${window.location.origin}?url=${encodeURIComponent(result.url)}`;
                navigator.clipboard.writeText(shareUrl).catch(() => {});
              }}
              className="p-2 rounded-lg bg-ctp-surface0/40 border border-ctp-surface1/40 text-ctp-overlay0 hover:text-ctp-mauve hover:border-ctp-mauve/20 transition-all cursor-pointer"
              title="Copy share link"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
            </button>
            <button onClick={exportAnalyzerCsv} className="px-3 py-1.5 rounded-lg bg-ctp-blue/10 text-ctp-blue border border-ctp-blue/20 text-[11px] font-medium hover:bg-ctp-blue/20 transition-all cursor-pointer">
              Export CSV
            </button>
            {scanTime !== null && <span className="text-[11px] text-ctp-overlay0 font-mono">{(scanTime / 1000).toFixed(1)}s</span>}
            <div className="flex items-center gap-2 text-[11px] text-ctp-overlay0">
              <span>{result.meta.wordCount} words</span>
              <span>&middot;</span>
              <span>{result.meta.imageCount} images</span>
              <span>&middot;</span>
              <span>{result.meta.internalLinks + result.meta.externalLinks} links</span>
            </div>
          </div>
        </div>

        {result.redirectChain && result.redirectChain.length > 0 && (
          <div className="mt-3 pt-3 border-t border-ctp-surface0/50">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-ctp-overlay0 font-medium shrink-0">Redirects:</span>
              {result.redirectChain.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px]">
                  <span className="text-ctp-yellow font-mono">{r.status}</span>
                  <span className="text-ctp-overlay0 truncate max-w-[200px]">{r.url.replace(/^https?:\/\//, "")}</span>
                  <span className="text-ctp-surface2">&rarr;</span>
                </span>
              ))}
              <span className="text-[10px] text-ctp-green font-mono">200</span>
              <span className="text-[10px] text-ctp-overlay0 truncate max-w-[200px]">{result.url.replace(/^https?:\/\//, "")}</span>
            </div>
          </div>
        )}

        {(result.robotsTxt || result.sitemap) && (
          <div className="mt-3 pt-3 border-t border-ctp-surface0/50 flex items-center gap-2 flex-wrap">
            {result.robotsTxt && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                result.robotsTxt.found
                  ? result.robotsTxt.blocksPage
                    ? "bg-ctp-red/10 text-ctp-red border border-ctp-red/20"
                    : "bg-ctp-green/10 text-ctp-green border border-ctp-green/20"
                  : "bg-ctp-yellow/10 text-ctp-yellow border border-ctp-yellow/20"
              }`}>
                {result.robotsTxt.found
                  ? result.robotsTxt.blocksPage ? "robots.txt blocks page" : `robots.txt (${result.robotsTxt.rules.length} rules)`
                  : "No robots.txt"}
              </span>
            )}
            {result.sitemap && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                result.sitemap.found
                  ? "bg-ctp-green/10 text-ctp-green border border-ctp-green/20"
                  : "bg-ctp-yellow/10 text-ctp-yellow border border-ctp-yellow/20"
              }`}>
                {result.sitemap.found ? `Sitemap (${result.sitemap.urlCount} URLs)` : "No sitemap.xml"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Score gauge */}
      <div className="animate-slide-up flex flex-col items-center py-8 mb-8" style={{ animationDelay: "50ms" }}>
        <ScoreGauge score={result.overallScore} grade={result.grade} />
        <p className="text-sm text-ctp-subtext0 mt-4">Overall SEO Score</p>
        {previousScan && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {(() => {
              const diff = result.overallScore - previousScan.overallScore;
              if (diff > 0) return <span className="text-ctp-green flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>+{diff} pts since last scan</span>;
              if (diff < 0) return <span className="text-ctp-red flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>{diff} pts since last scan</span>;
              return <span className="text-ctp-overlay1">No change since last scan</span>;
            })()}
            <span className="text-ctp-overlay0/50">({new Date(previousScan.scannedAt).toLocaleDateString()})</span>
          </div>
        )}
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {CATEGORY_ORDER.map((key, i) => (
          <CategoryCard key={key} categoryKey={key} categoryResult={result.categories[key]} delay={100 + i * 60} onClick={() => setActiveCategory(activeCategory === key ? null : key)} isActive={activeCategory === key} prevScore={previousScan?.categories[key]?.score} />
        ))}
      </div>

      {/* Detailed results */}
      <div className="space-y-3">
        {CATEGORY_ORDER.map((key, i) => (
          <DetailedSection key={key} categoryKey={key} categoryResult={result.categories[key]} isOpen={openSections.has(key)} onToggle={() => toggleSection(key)} delay={300 + i * 60} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-10 pt-5 border-t border-ctp-surface0/60 text-center">
        <p className="text-[11px] text-ctp-overlay0 font-mono">
          Scanned {new Date(result.scannedAt).toLocaleString()}
          {scanTime !== null && <> &middot; Completed in {(scanTime / 1000).toFixed(1)}s</>}
          {" "}&middot; Grade: {result.grade} ({result.overallScore}/100)
        </p>
      </div>
    </div>
  );
}

// ─── Keywords Results ────────────────────────────────────────────────

function KeywordsResults({ result }: { result: KeywordResult }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(result.groups.filter(g => g.keywords.length > 0).map(g => g.type)));
  const [copiedGroup, setCopiedGroup] = useState<string | null>(null);

  const toggleGroup = (type: string) => {
    setExpandedGroups(prev => { const next = new Set(prev); if (next.has(type)) next.delete(type); else next.add(type); return next; });
  };

  const copyKeywords = async (keywords: string[], groupType: string) => {
    await navigator.clipboard.writeText(keywords.join("\n"));
    setCopiedGroup(groupType);
    setTimeout(() => setCopiedGroup(null), 2000);
  };

  const exportCsv = () => {
    const rows = ["Keyword,Type"];
    for (const group of result.groups) {
      for (const kw of group.keywords) {
        rows.push(`"${kw.replace(/"/g, '""')}","${group.label}"`);
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-${result.keyword.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const groupColors: Record<string, { text: string; bg: string; border: string }> = {
    suggestions: { text: "text-ctp-blue", bg: "bg-ctp-blue/10", border: "border-ctp-blue/30" },
    questions: { text: "text-ctp-green", bg: "bg-ctp-green/10", border: "border-ctp-green/30" },
    comparisons: { text: "text-ctp-peach", bg: "bg-ctp-peach/10", border: "border-ctp-peach/30" },
    longTail: { text: "text-ctp-mauve", bg: "bg-ctp-mauve/10", border: "border-ctp-mauve/30" },
  };

  return (
    <div className="pb-16 animate-fade-in">
      <div className="bg-ctp-mantle rounded-2xl border border-ctp-surface0 p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ctp-text">
              &ldquo;{result.keyword}&rdquo;
            </h2>
            {result.extractedFrom && (
              <p className="text-xs text-ctp-overlay0 mt-0.5">Keyword extracted from page title at {result.extractedFrom}</p>
            )}
            <p className="text-sm text-ctp-overlay1">{result.totalCount} keywords found</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => copyKeywords(result.groups.flatMap(g => g.keywords), "all")} className="px-4 py-2 rounded-xl bg-ctp-surface0/70 border border-ctp-surface1/60 text-xs font-medium text-ctp-subtext0 hover:text-ctp-blue hover:border-ctp-blue/40 transition-all cursor-pointer">
              {copiedGroup === "all" ? "Copied!" : "Copy all"}
            </button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-xl bg-ctp-blue text-ctp-crust font-semibold text-xs hover:bg-ctp-blue/85 transition-all cursor-pointer">
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {result.groups.map((group) => {
          const colors = groupColors[group.type] || groupColors.suggestions;
          const isExpanded = expandedGroups.has(group.type);

          return (
            <div key={group.type} className="rounded-2xl bg-ctp-mantle/50 border border-ctp-surface0/80 overflow-hidden">
              <div role="button" tabIndex={0} onClick={() => toggleGroup(group.type)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGroup(group.type); } }} className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-ctp-surface0/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`px-2.5 py-1 rounded-lg ${colors.bg} ${colors.text} text-xs font-semibold`}>{group.label}</div>
                  <span className="text-sm text-ctp-overlay0">{group.keywords.length} keyword{group.keywords.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  {group.keywords.length > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); copyKeywords(group.keywords, group.type); }} className="px-3 py-1 rounded-lg text-[11px] text-ctp-overlay0 hover:text-ctp-blue hover:bg-ctp-surface0/60 transition-all cursor-pointer">
                      {copiedGroup === group.type ? "Copied!" : "Copy"}
                    </button>
                  )}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-ctp-overlay0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              </div>
              <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? "max-h-[4000px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-5 pb-5">
                  {group.keywords.length === 0 ? (
                    <p className="text-sm text-ctp-overlay0 py-3">No keywords found in this category</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {group.keywords.map((kw, i) => (
                        <span key={i} className={`px-3 py-1.5 rounded-lg text-xs ${colors.bg} ${colors.border} border ${colors.text}`}>{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Audit Results ───────────────────────────────────────────────────

function AuditResults({ result }: { result: SiteAuditResult }) {
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set(["critical"]));
  const [showPages, setShowPages] = useState(false);

  const toggleIssue = (key: string) => {
    setExpandedIssues(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const exportAuditCsv = () => {
    const rows = ["Severity,Type,Message,URL,Details"];
    const allIssues = [
      ...result.issues.critical.map(i => ({ ...i, sev: "critical" })),
      ...result.issues.warnings.map(i => ({ ...i, sev: "warning" })),
      ...result.issues.info.map(i => ({ ...i, sev: "info" })),
    ];
    for (const i of allIssues) {
      rows.push(`"${i.sev}","${i.type.replace(/"/g, '""')}","${i.message.replace(/"/g, '""')}","${i.url.replace(/"/g, '""')}","${(i.details || "").replace(/"/g, '""')}"`);
    }
    rows.push("");
    rows.push("URL,Status,Title,Description,H1 Count,Word Count,Issues,Depth");
    for (const p of result.pages) {
      rows.push(`"${p.url}",${p.status},"${(p.title || "").replace(/"/g, '""')}","${(p.description || "").replace(/"/g, '""')}",${p.h1Count},${p.wordCount},${p.issueCount},${p.depth}`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const domain = (() => { try { return new URL(result.url).hostname; } catch { return "site"; } })();
    a.download = `seo-audit-${domain}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const severityConfig = {
    critical: { label: "Critical", color: "text-ctp-red", bg: "bg-ctp-red/10", border: "border-ctp-red/30" },
    warnings: { label: "Warnings", color: "text-ctp-yellow", bg: "bg-ctp-yellow/10", border: "border-ctp-yellow/30" },
    info: { label: "Info", color: "text-ctp-blue", bg: "bg-ctp-blue/10", border: "border-ctp-blue/30" },
  };

  return (
    <div className="pb-16 animate-fade-in">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="p-4 rounded-xl bg-ctp-mantle border border-ctp-surface0/80">
          <p className="text-[11px] text-ctp-overlay0 mb-1">Pages Scanned</p>
          <p className="text-2xl font-bold text-ctp-text">{result.pagesScanned}</p>
        </div>
        <div className="p-4 rounded-xl bg-ctp-mantle border border-ctp-surface0/80">
          <p className="text-[11px] text-ctp-overlay0 mb-1">Total Issues</p>
          <p className="text-2xl font-bold text-ctp-text">{result.totalIssues}</p>
        </div>
        <div className="p-4 rounded-xl bg-ctp-red/8 border border-ctp-red/20">
          <p className="text-[11px] text-ctp-red/70 mb-1">Critical</p>
          <p className="text-2xl font-bold text-ctp-red">{result.issues.critical.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-ctp-yellow/8 border border-ctp-yellow/20">
          <p className="text-[11px] text-ctp-yellow/70 mb-1">Warnings</p>
          <p className="text-2xl font-bold text-ctp-yellow">{result.issues.warnings.length}</p>
        </div>
        <button onClick={exportAuditCsv} className="p-4 rounded-xl bg-ctp-blue/8 border border-ctp-blue/20 hover:bg-ctp-blue/15 transition-all cursor-pointer text-left">
          <p className="text-[11px] text-ctp-blue/70 mb-1">Export</p>
          <p className="text-sm font-bold text-ctp-blue">CSV</p>
        </button>
      </div>

      {Object.keys(result.issuesByType).length > 0 && (
        <div className="bg-ctp-mantle rounded-2xl border border-ctp-surface0 p-5 mb-6">
          <h3 className="text-sm font-semibold text-ctp-text mb-3">Issues by Type</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.issuesByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <span key={type} className="px-3 py-1.5 rounded-lg text-xs bg-ctp-surface0/60 border border-ctp-surface1/60 text-ctp-subtext0">
                {type}: <span className="font-semibold text-ctp-text">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {(["critical", "warnings", "info"] as const).map(severity => {
          const issues = result.issues[severity];
          if (issues.length === 0) return null;
          const config = severityConfig[severity];
          const isExpanded = expandedIssues.has(severity);

          return (
            <div key={severity} className="rounded-2xl bg-ctp-mantle/50 border border-ctp-surface0/80 overflow-hidden">
              <button onClick={() => toggleIssue(severity)} className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-ctp-surface0/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`px-2.5 py-1 rounded-lg ${config.bg} ${config.color} text-xs font-semibold`}>{config.label}</div>
                  <span className="text-sm text-ctp-overlay0">{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-ctp-overlay0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? "max-h-[4000px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-5 pb-5 space-y-2">
                  {issues.map((issue, i) => (
                    <div key={i} className="py-3 px-4 rounded-xl bg-ctp-surface0/30 border border-ctp-surface0/60">
                      <div className="flex items-start gap-3">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${config.bg} ${config.color}`}>{issue.type}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ctp-text">{issue.message}</p>
                          <p className="text-[11px] text-ctp-overlay0 mt-1 truncate">{issue.url}</p>
                          {issue.details && <p className="text-[11px] text-ctp-overlay1 mt-1">{issue.details}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-ctp-mantle/50 border border-ctp-surface0/80 overflow-hidden">
        <button onClick={() => setShowPages(!showPages)} className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-ctp-surface0/20 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-ctp-text">Crawled Pages</span>
            <span className="text-sm text-ctp-overlay0">{result.pages.length} pages</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-ctp-overlay0 transition-transform duration-200 ${showPages ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showPages ? "max-h-[4000px] opacity-100" : "max-h-0 opacity-0"}`}>
          <div className="px-5 pb-5 space-y-2">
            {result.pages.map((page, i) => (
              <div key={i} className="py-3 px-4 rounded-xl bg-ctp-surface0/30 border border-ctp-surface0/60">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ctp-text truncate">{page.title || "(no title)"}</p>
                    <p className="text-[11px] text-ctp-overlay0 truncate">{page.url}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-[11px]">
                    <span className={page.status >= 400 ? "text-ctp-red" : "text-ctp-green"}>{page.status || "err"}</span>
                    <span className="text-ctp-overlay0">{page.wordCount}w</span>
                    {page.issueCount > 0 && <span className="text-ctp-yellow">{page.issueCount} issues</span>}
                    <span className="text-ctp-overlay0">depth {page.depth}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 pt-5 border-t border-ctp-surface0/60 text-center">
        <p className="text-[11px] text-ctp-overlay0 font-mono">
          Scanned {new Date(result.scannedAt).toLocaleString()} &middot; {result.pagesScanned} pages &middot; {result.totalIssues} issues
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function SeoPage() {
  const [activeTab, setActiveTab] = useState<Tab>("analyzer");
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanTime, setScanTime] = useState<number | null>(null);

  const [analyzerResult, setAnalyzerResult] = useState<SeoAnalysisResult | null>(null);
  const [keywordsResult, setKeywordsResult] = useState<KeywordResult | null>(null);
  const [auditResult, setAuditResult] = useState<SiteAuditResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");
    if (urlParam) {
      setInput(urlParam);
      setActiveTab("analyzer");
      setTimeout(() => handleScan(urlParam), 0);
    } else {
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReset = () => {
    setInput("");
    setAnalyzerResult(null);
    setKeywordsResult(null);
    setAuditResult(null);
    setError(null);
    setScanning(false);
    setScanTime(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleScan = async (targetInput?: string) => {
    const scanInput = targetInput || input;
    if (!scanInput.trim()) return;

    setScanning(true);
    setError(null);
    setScanTime(null);
    if (targetInput) setInput(targetInput);

    const startTime = Date.now();

    try {
      const endpoint = activeTab === "analyzer" ? "/api/seo/analyze" : activeTab === "keywords" ? "/api/seo/keywords" : "/api/seo/audit";
      const bodyData = activeTab === "keywords" ? { keyword: scanInput } : { url: scanInput };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); return; }

      const elapsed = Date.now() - startTime;
      setScanTime(elapsed);

      if (activeTab === "analyzer") setAnalyzerResult(data as SeoAnalysisResult);
      else if (activeTab === "keywords") setKeywordsResult(data as KeywordResult);
      else setAuditResult(data as SiteAuditResult);

      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 300);
    } catch {
      setError("Failed to connect. Please check your input and try again.");
    } finally {
      setScanning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleScan(); };

  const currentResult = activeTab === "analyzer" ? analyzerResult : activeTab === "keywords" ? keywordsResult : auditResult;
  const hasResults = currentResult && !scanning;

  const placeholders: Record<Tab, string> = {
    analyzer: "Enter a URL (e.g. example.com)",
    keywords: "Enter a keyword (e.g. next.js)",
    audit: "Enter a site URL to audit (e.g. example.com)",
  };

  const examples: Record<Tab, string[]> = {
    analyzer: ["github.com", "stripe.com", "vercel.com", "mozilla.org"],
    keywords: ["next.js", "tailwind css", "react hooks", "web analytics"],
    audit: ["anit.guru", "github.com", "vercel.com"],
  };

  return (
    <div className="min-h-screen bg-ctp-base flex flex-col">
      {/* Header */}
      <div className="border-b border-ctp-surface0/40 bg-ctp-mantle/30">
        <div className="max-w-4xl mx-auto px-5 sm:px-10 h-14 flex items-center justify-between">
          <ToolLogo onReset={handleReset} />
          <span className="text-ctp-overlay0 text-[11px] tracking-wide">Ad-free &middot; Open Source</span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-5 sm:px-10">
        {/* Hero */}
        <section className={`text-center transition-all duration-500 ${hasResults ? "pt-6 pb-4" : "pt-16 sm:pt-24 pb-8"}`}>
          {!hasResults && !scanning && (
            <>
              <div className="flex justify-center mb-5">
                <div className="w-16 h-16 rounded-2xl bg-ctp-blue/10 border-2 border-ctp-blue/20 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-ctp-blue">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="m8 11 2 2 4-4" />
                  </svg>
                </div>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-ctp-text mb-3 tracking-tight">
                Comprehensive{" "}
                <span className="bg-gradient-to-r from-ctp-blue to-ctp-sapphire bg-clip-text text-transparent">SEO analysis</span>
              </h2>
              <p className="text-ctp-subtext0 text-base sm:text-lg max-w-lg mx-auto mb-8">
                Analyze pages, research keywords, and audit entire sites for SEO issues.
              </p>
            </>
          )}

          {/* Tab bar */}
          <div className="mb-6">
            <TabBar active={activeTab} onChange={handleTabChange} />
          </div>

          {/* Search Bar */}
          <div className="mx-auto max-w-2xl">
            <div className="relative group">
              <div className="absolute inset-0 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 shadow-[0_0_12px_2px_rgba(137,180,250,0.2),0_0_4px_1px_rgba(116,199,236,0.15)] pointer-events-none" />
              <div className="relative flex items-center bg-ctp-surface0/70 rounded-2xl border border-ctp-surface1/60 group-focus-within:border-ctp-blue/40 transition-all duration-200">
                <div className="pl-4 pr-2 text-ctp-overlay1">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholders[activeTab]}
                  className="no-focus-ring flex-1 bg-transparent text-ctp-text placeholder:text-ctp-overlay0 py-3.5 px-2 text-[15px] outline-none min-w-0"
                  disabled={scanning}
                />
                <button
                  onClick={() => handleScan()}
                  disabled={scanning || !input.trim()}
                  className="m-1.5 px-5 sm:px-6 py-2.5 rounded-xl bg-ctp-blue text-ctp-crust font-semibold text-sm hover:bg-ctp-blue/85 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer shrink-0 active:scale-95"
                >
                  {scanning ? (activeTab === "audit" ? "Crawling..." : "Scanning...") : activeTab === "keywords" ? "Research" : "Analyze"}
                </button>
              </div>
            </div>

            {!currentResult && !scanning && !error && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <span className="text-[11px] text-ctp-overlay0 self-center">Try:</span>
                {examples[activeTab].map(ex => <ExamplePill key={ex} text={ex} onClick={handleScan} />)}
              </div>
            )}
          </div>
        </section>

        {scanning && <ScanningAnimation tab={activeTab} />}

        {error && (
          <div className="max-w-2xl mx-auto animate-fade-in mt-4">
            <div className="bg-ctp-red/8 border border-ctp-red/20 rounded-2xl p-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-ctp-red/10 flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ctp-red"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              </div>
              <p className="text-ctp-red font-semibold mb-1">Analysis Failed</p>
              <p className="text-ctp-subtext0 text-sm">{error}</p>
            </div>
          </div>
        )}

        {hasResults && activeTab === "analyzer" && analyzerResult && <AnalyzerResults key={analyzerResult.scannedAt} result={analyzerResult} scanTime={scanTime} />}
        {hasResults && activeTab === "keywords" && keywordsResult && <KeywordsResults result={keywordsResult} />}
        {hasResults && activeTab === "audit" && auditResult && <AuditResults result={auditResult} />}

        {!currentResult && !scanning && !error && (
          <section className="py-16">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
              {[
                { title: "Page Analyzer", desc: "Analyze 40+ on-page SEO factors: content, technical, links, social tags, and performance.", accent: "text-ctp-blue", bg: "bg-ctp-blue/8", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg> },
                { title: "Keyword Research", desc: "Discover hundreds of keyword ideas from Google Autocomplete: suggestions, questions, comparisons, and long-tail.", accent: "text-ctp-green", bg: "bg-ctp-green/8", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> },
                { title: "Site Audit", desc: "Crawl up to 50 pages and find SEO issues: missing titles, thin content, broken links, duplicate tags, and more.", accent: "text-ctp-peach", bg: "bg-ctp-peach/8", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg> },
              ].map(f => (
                <div key={f.title} className="text-center p-6 rounded-2xl bg-ctp-mantle/70 border border-ctp-surface0/60 hover:border-ctp-surface1 transition-all duration-200 hover:translate-y-[-2px]">
                  <div className={`w-11 h-11 rounded-xl ${f.bg} flex items-center justify-center mx-auto mb-4`}><span className={f.accent}>{f.icon}</span></div>
                  <h3 className="text-sm font-semibold text-ctp-text mb-2">{f.title}</h3>
                  <p className="text-xs text-ctp-overlay1 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
