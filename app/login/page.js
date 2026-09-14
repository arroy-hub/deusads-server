"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    // Built here rather than during render: at build time the keys do not exist yet.
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    if (mode === "signup") {
      setMessage({
        tone: "notice",
        text: "Check your email to confirm the address, then sign in.",
      });
      setMode("signin");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="rail-mark" style={{ marginBottom: "1.5rem" }}>
          Deus<span>ADS</span>
        </div>

        <h1 style={{ marginBottom: "0.5rem" }}>
          {mode === "signin" ? "Sign in" : "Create an account"}
        </h1>
        <p className="lede">
          {mode === "signin"
            ? "Manage the ad placements in your games."
            : "One account covers every game you publish."}
        </p>

        <form onSubmit={submit} className="stack">
          <label>
            Email
            <input
              className="field"
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            Password
            <input
              className="field"
              type="password"
              value={password}
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button className="button" type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {message && (
          <p
            className={message.tone === "error" ? "error" : "notice"}
            style={{ marginTop: "1rem" }}
          >
            {message.text}
          </p>
        )}

        <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "var(--ink-2)" }}>
          {mode === "signin" ? "No account yet? " : "Already have an account? "}
          <button
            type="button"
            className="button button-quiet"
            style={{ padding: "0.15rem 0.5rem" }}
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage(null);
            }}
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
