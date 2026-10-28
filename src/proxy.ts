import { NextResponse, type NextRequest } from "next/server";

// A quick first gate for the dashboard: without a session cookie there is no
// point rendering it. The real check (session in the database, account active,
// role) happens in every page and action through requireUser().
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("__Host-ls_session") || request.cookies.has("ls_session");
  if (!hasSession) return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
