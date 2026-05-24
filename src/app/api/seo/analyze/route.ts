import { NextRequest, NextResponse } from "next/server";
import { normalizeUrl, validateUrl, analyzePage } from "@/lib/seo/analyzer";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { url: rawUrl } = body as { url?: string };
    if (!rawUrl || typeof rawUrl !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const url = normalizeUrl(rawUrl);

    try {
      validateUrl(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid URL";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const result = await analyzePage(url);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
