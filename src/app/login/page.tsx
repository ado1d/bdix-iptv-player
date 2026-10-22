"use client";

/**
 * Sign in / Create account page.
 *  - Standalone layout (no app header) at /login
 *  - Email + password auth, sessions live in httpOnly cookies
 *  - Signed-in users get their favorites, playlists & prefs synced to their
 *    account — nothing is lost if browser data is cleared
 *  - Shows the developer card (Ayman Chowdhury) under the form
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck, Tv, UserRound } from "lucide-react";
import { useIPTV, type AuthUser } from "@/store/iptv-store";
import { DeveloperCard } from "@/components/iptv/developer-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in?
  const meQuery = useQuery<{ user: AuthUser | null }>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return { user: null };
      return res.json();
    },
    retry: 1,
  });

  // hydrate persisted local state (guest data merges into the account on login)
  useEffect(() => {
    useIPTV.persist.rehydrate();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    const emailClean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailClean)) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode === "signup" ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup" ? { name: name.trim(), email: emailClean, password } : { email: emailClean, password }
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Something went wrong — please try again");
        setBusy(false);
        return;
      }
      // success — hydrate the session client-side, then head home
      useIPTV.getState().setAuthUser(body.user);
      queryClient.setQueryData(["auth", "me"], { user: body.user });
      router.push("/");
    } catch {
      setError("Network error — check your connection and try again");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 py-10 bg-zinc-50 dark:bg-zinc-950 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(16,185,129,0.10),transparent)] dark:bg-[radial-gradient(60%_50%_at_50%_0%,rgba(16,185,129,0.07),transparent)]">
      {/* Brand */}
      <Link href="/" className="flex items-center gap-3 group">
        <span className="grid place-items-center w-11 h-11 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 group-hover:bg-emerald-500 transition-colors">
          <Tv className="w-5.5 h-5.5" />
        </span>
        <span className="flex flex-col leading-none">
          <span className="font-bold tracking-tight text-lg text-zinc-900 dark:text-white">BDIX TV</span>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">live channels, always fresh</span>
        </span>
      </Link>

      {/* Auth card */}
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl shadow-zinc-950/5 dark:shadow-black/30 p-6 sm:p-7">
        {meQuery.data?.user ? (
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <span className="grid place-items-center w-12 h-12 rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <div>
              <p className="font-semibold">You&apos;re already signed in</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Signed in as {meQuery.data.user.name || meQuery.data.user.email}
              </p>
            </div>
            <Button asChild className="bg-emerald-600 hover:bg-emerald-500 text-white">
              <Link href="/">Go to the app</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1 mb-5">
              <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                Save your favorites, playlists and settings to your account — they follow you to any
                device and survive browser resets.
              </p>
            </div>

            {/* Mode tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/70 mb-5" role="tablist">
              {(["login", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors",
                    mode === m
                      ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                >
                  {m === "login" ? <LogIn className="w-4 h-4" /> : <UserRound className="w-4 h-4" />}
                  {m === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
              {mode === "signup" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name" className="text-[13px]">Name</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    maxLength={60}
                    className="h-10"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-[13px]">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-[13px]">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "login" ? "Your password" : "At least 6 characters"}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] text-rose-600 dark:text-rose-400 text-[13px] px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={busy}
                className="h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold mt-1"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <p className="mt-4 text-center text-[12px] text-zinc-400 dark:text-zinc-500">
              Just want to watch?{" "}
              <Link href="/" className="underline hover:text-emerald-500">
                Continue as guest
              </Link>
            </p>
          </>
        )}
      </div>

      {/* Developer details */}
      <div className="w-full max-w-md flex flex-col gap-2">
        <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
          Developed by
        </p>
        <DeveloperCard />
      </div>

      <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-600 max-w-sm">
        BDIX TV is a player, not a broadcaster — streams come from the public Mrgify BDIX IPTV playlist.
      </p>
    </div>
  );
}
