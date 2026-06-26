import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

async function handleProxy(request: NextRequest, pathArray: string[]) {
  const session = await auth();

  let backendUrl = process.env.COGNEE_API_URL || process.env.NEXT_PUBLIC_COGNEE_API_URL;
  if (!backendUrl && process.env.VERCEL_URL) {
    backendUrl = `https://${process.env.VERCEL_URL}/backend`;
  }
  if (!backendUrl) {
    backendUrl = "http://localhost:8000";
  }
  const path = pathArray.join("/");
  const url = new URL(`${backendUrl}/${path}`);
  url.search = request.nextUrl.search;

  const headers = new Headers();
  headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");

  // Forward the shared access key so the backend authenticates requests from the proxy
  const accessKey = process.env.ENGRAM_ACCESS_KEY;
  if (accessKey) {
    headers.set("X-Engram-Key", accessKey);
  }

  // Thread session user ID to backend for per-user data routing
  if (session?.user?.id) {
    headers.set("X-User-Id", session.user.id);
  }

  try {
    const MAX_BODY = 12 * 1024 * 1024; // 12 MB
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_BODY) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    const requestBody = request.method !== "GET" && request.method !== "HEAD" 
      ? await request.arrayBuffer() 
      : undefined;

    if (requestBody && requestBody.byteLength > MAX_BODY) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    const res = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: requestBody,
    });

    const data = await res.arrayBuffer();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Proxy error details:", error);
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleProxy(request, params.path);
}

export async function POST(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleProxy(request, params.path);
}

export async function PUT(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleProxy(request, params.path);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleProxy(request, params.path);
}
