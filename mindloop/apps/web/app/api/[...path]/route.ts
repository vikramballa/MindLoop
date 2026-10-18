import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to the FastAPI backend, resolved at runtime (API_INTERNAL_URL).
 * Streams request and response bodies, so SSE (Talk) and audio uploads pass straight through.
 * Keeping the API same-origin lets the refresh token live in an httpOnly, SameSite=Strict cookie.
 */
export const dynamic = "force-dynamic";

const HOP_BY_HOP = ["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "content-length"];

async function proxy(req: NextRequest, ctx: RouteContext<"/api/[...path]">): Promise<Response> {
  const { path } = await ctx.params;
  const upstreamBase = process.env.API_INTERNAL_URL ?? "http://localhost:8000";
  const url = new URL(`/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`, upstreamBase);

  const headers = new Headers(req.headers);
  HOP_BY_HOP.forEach((h) => headers.delete(h));
  headers.delete("accept-encoding"); // keep SSE unbuffered and uncompressed

  const hasBody = !["GET", "HEAD"].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: req.signal,
      // Required by Node's fetch when streaming a request body.
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch {
    return Response.json({ error: { code: "upstream_unavailable", message: "Service unavailable" } }, { status: 502 });
  }

  const resHeaders = new Headers(upstream.headers);
  ["content-encoding", "transfer-encoding", "connection", "content-length"].forEach((h) => resHeaders.delete(h));
  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
