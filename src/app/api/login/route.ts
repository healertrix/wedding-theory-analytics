import { NextResponse } from "next/server"
import { checkCredentials, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"

// Blunts naive brute-force scripts against the single shared credential pair.
const FAILED_ATTEMPT_DELAY_MS = 700

export async function POST(req: Request) {
  const formData = await req.formData()
  const username  = String(formData.get("username") ?? "")
  const password  = String(formData.get("password") ?? "")
  const next      = String(formData.get("next") ?? "/")
  const safeNext  = next.startsWith("/") ? next : "/"

  if (!checkCredentials(username, password)) {
    await new Promise(r => setTimeout(r, FAILED_ATTEMPT_DELAY_MS))
    const failUrl = new URL("/login", req.url)
    failUrl.searchParams.set("error", "1")
    failUrl.searchParams.set("next", safeNext)
    return NextResponse.redirect(failUrl, 303)
  }

  const res = NextResponse.redirect(new URL(safeNext, req.url), 303)
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   SESSION_MAX_AGE_SECONDS,
    path:     "/",
  })
  return res
}
