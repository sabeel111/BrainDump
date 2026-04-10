/**
 * Chat session API — CRUD operations.
 * GET    /api/chat              → list sessions (summaries)
 * GET    /api/chat?sessionId=x  → get full session
 * POST   /api/chat              → create session
 * PATCH  /api/chat              → rename session
 * DELETE /api/chat?sessionId=x  → delete session
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  readSession,
  listSessions,
  updateSessionTitle,
  deleteSession,
} from "@/lib/core/session-manager";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (sessionId) {
    const session = await readSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(session);
  }

  const sessions = await listSessions();
  return NextResponse.json(sessions);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const session = await createSession(body.title);
  return NextResponse.json(session, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { sessionId, title } = body;

  if (!sessionId || !title) {
    return NextResponse.json(
      { error: "sessionId and title are required" },
      { status: 400 }
    );
  }

  const session = await updateSessionTitle(sessionId, title);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }
  return NextResponse.json(session);
}

export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  const deleted = await deleteSession(sessionId);
  if (!deleted) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true });
}
