import { LoginForm } from "./LoginForm"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  const hasError = error === "1"

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div
        key={hasError ? "error" : "idle"}
        className="w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-8 shadow-2xl shadow-black/50"
        style={{ animation: "login-card-in 0.35s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <h1 className="text-base font-semibold text-white/90 tracking-tight">Wedding Theory Analytics</h1>
        <p className="text-sm text-white/35 mt-1 mb-6">Sign in to view the dashboard</p>

        <LoginForm next={next ?? "/"} hasError={hasError} />
      </div>
    </div>
  )
}
