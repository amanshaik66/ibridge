import { NextRequest, NextResponse } from "next/server";

export const DEMO_KEY = "ibridge_demo_key_2026";

// Rate limit: 60 requests / minute per key (in-memory, per instance).
const hits = new Map<string, { count: number; reset: number }>();

export function apiKey(req: NextRequest): string | null {
  const h = req.headers.get("x-api-key");
  if (h) return h;
  const q = req.nextUrl.searchParams.get("api_key");
  return q;
}

export function authorized(req: NextRequest): boolean {
  const key = apiKey(req);
  if (!key) return false;
  const expected = process.env.IBRIDGE_API_KEY || DEMO_KEY;
  return key === expected || key === DEMO_KEY;
}

export function rateLimited(key: string): boolean {
  const t = Date.now();
  const rec = hits.get(key);
  if (!rec || t > rec.reset) {
    hits.set(key, { count: 1, reset: t + 60_000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 60;
}

export function guard(req: NextRequest): NextResponse | null {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Provide a valid API key via the x-api-key header." },
      { status: 401 }
    );
  }
  if (rateLimited(apiKey(req)!)) {
    return NextResponse.json(
      { error: "rate_limited", message: "60 requests/minute exceeded. Slow down." },
      { status: 429 }
    );
  }
  return null;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function readJson(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
