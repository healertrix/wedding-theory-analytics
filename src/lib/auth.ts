// Signed, expiring session token — no external session store needed since
// there's exactly one shared credential pair (no per-user data to look up).

export const SESSION_COOKIE = "wt_session"
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10 // 10 years — effectively never expires

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is not set")
  return secret
}

async function hmacSign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  return Buffer.from(sig).toString("base64url")
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  const payload = String(expiresAt)
  const sig = await hmacSign(payload)
  return `${payload}.${sig}`
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return false
  if (Number(payload) < Date.now()) return false
  const expected = await hmacSign(payload)
  return timingSafeEqual(expected, sig)
}

export function checkCredentials(username: string, password: string): boolean {
  const validUser = process.env.DASHBOARD_USERNAME ?? ""
  const validPass = process.env.DASHBOARD_PASSWORD ?? ""
  return timingSafeEqual(username, validUser) && timingSafeEqual(password, validPass)
}
