"use client"

import { useRef, useState } from "react"

type FieldError = "username" | "password" | null

export function LoginForm({ next, hasError }: { next: string; hasError: boolean }) {
  const [fieldError, setFieldError] = useState<FieldError>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const username = usernameRef.current?.value.trim() ?? ""
    const password = passwordRef.current?.value ?? ""

    if (!username) {
      e.preventDefault()
      setFieldError("username")
      usernameRef.current?.focus()
      return
    }
    if (!password) {
      e.preventDefault()
      setFieldError("password")
      passwordRef.current?.focus()
      return
    }
    // Both fields filled — let the browser submit the form natively
    // (real navigation, not intercepted) so it can offer to save the password.
  }

  return (
    <form action="/api/login" method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-xs font-medium text-white/45">Username</label>
        <input
          ref={usernameRef}
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          onChange={() => fieldError === "username" && setFieldError(null)}
          className={`rounded-lg bg-[#0d0d0d] border px-3 py-2.5 text-sm text-white/90 outline-none transition-colors
            ${fieldError === "username" ? "border-red-500/50 focus:border-red-500/60" : "border-[#2a2a2a] focus:border-white/25"}`}
        />
        {fieldError === "username" && (
          <p className="text-xs text-red-400" style={{ animation: "login-error-in 0.2s ease-out" }}>
            Username is required
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-medium text-white/45">Password</label>
        <input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          onChange={() => fieldError === "password" && setFieldError(null)}
          className={`rounded-lg bg-[#0d0d0d] border px-3 py-2.5 text-sm text-white/90 outline-none transition-colors
            ${fieldError === "password" ? "border-red-500/50 focus:border-red-500/60" : "border-[#2a2a2a] focus:border-white/25"}`}
        />
        {fieldError === "password" && (
          <p className="text-xs text-red-400" style={{ animation: "login-error-in 0.2s ease-out" }}>
            Password is required
          </p>
        )}
      </div>

      {hasError && (
        <p
          className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
          style={{ animation: "login-error-in 0.25s ease-out, login-shake 0.4s ease-in-out 0.25s" }}
        >
          Incorrect username or password
        </p>
      )}

      <button
        type="submit"
        className="mt-1 rounded-lg bg-white text-black text-sm font-semibold py-2.5 hover:bg-white/90 active:scale-[0.99] transition-all"
      >
        Sign in
      </button>
    </form>
  )
}
