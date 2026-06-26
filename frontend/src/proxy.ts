import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

// Next.js 16 renamed the "middleware" file convention to "proxy".
// Auth gate: redirect unauthenticated users to /login (landing + static assets excluded).
export default auth((req) => {
    if (!req.auth && req.nextUrl.pathname !== "/login") {
      const loginUrl = new URL("/login", req.nextUrl.origin)
      return NextResponse.redirect(loginUrl)
    }
})

export const config = {
  matcher: [
    "/((?!api/auth|api/proxy|_next/static|_next/image|favicon.ico|images/|login|.*\\..*|/?$).*)",
  ],
}
