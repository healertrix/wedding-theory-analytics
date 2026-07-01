import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth"

export const config = {
  matcher: [
    "/((?!api/geo/refresh|api/login|login|_next/static|_next/image|favicon.ico).*)",
  ],
}

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const authed = await verifySessionToken(token)
  if (authed) return NextResponse.next()

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const loginUrl = new URL("/login", req.url)
  loginUrl.searchParams.set("next", req.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}
