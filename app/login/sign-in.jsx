"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestReset, signIn } from "./actions";
import Logo from "../logo";

/**
 * The sign-in screen: the dark of the side menu over the whole screen, the wordmark in the corner and one white
 * card (Sign in, Reset your password). After a sign-in the button keeps its spinner while the
 * dashboard loads underneath a still copy of this screen; once it is there, app/dashboard/enter-reveal.jsx plays
 * the animation over the real page: the card dissolves, the dark narrows into the real side menu, the wordmark
 * slides to its place and the page fades in. On a phone the dark just fades.
 * The dashboard's sign-out plays the same thing backwards (app/dashboard/leave.js) and ends here.
 */

const NOTICES = {
  "idle-4d": "You were signed out after 4 days of inactivity. Sign in again to continue.",
  "idle-24h": "You were signed out after 24 hours of inactivity. Sign in again to continue.",
  ended: "You were signed in for 30 days, the longest a sign-in lasts. Sign in again to continue.",
  expired: "This link has expired, was already used or was opened in another browser. Sign in, or ask for a new link.",
};

const TITLE = { signin: "Sign in", reset: "Reset your password" };
const SUB = {
  signin: "to your DeusADS cabinet",
  reset: "We'll email you a link. It signs you in and opens your account, where you set a new password.",
};
const GO = { signin: "Sign in", reset: "Send link" };
const BUSY = { signin: "Signing in…", reset: "Sending…" };

// Ready-made test accounts for the RVO reviewers: a press on a link below the form fills in the email and password.
// Both are demo accounts with made-up data (no admin rights). Delete this list and the "si-demo" block to remove the links.
const DEMO = [
  { label: "Test developer", email: "rvo-developer@example.com", password: "DeusDev-Tf8mQ3-vW6nR1" },
  { label: "Test advertiser", email: "rvo-advertiser@example.com", password: "DeusAdv-Hk4pZ7-yB2sL9" },
];

const EMAIL_KEY = "deus-last-email";
const HINT_DELAY = 700; // ms the pointer rests on "Remember me" before its hint shows
const GIVE_UP = 20000; // ms: if the dashboard never arrives, the still copy of this screen goes away

function Icon({ kind }) {
  if (kind === "error") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.5v.1" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export default function SignIn({ notice }) {
  const router = useRouter();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [message, setMessage] = useState(notice && NOTICES[notice] ? { tone: "notice", text: NOTICES[notice] } : null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [entering, setEntering] = useState(false);
  const [hint, setHint] = useState(false);
  const rootRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const hintTimer = useRef(null);

  useEffect(() => {
    // The layers the dashboard's sign-out animation left on top: this screen now stands in their place.
    document.querySelectorAll(".si-leave, .si-leave-mark, .si-handoff").forEach((node) => node.remove());
    let last = "";
    try {
      last = localStorage.getItem(EMAIL_KEY) ?? "";
    } catch {
      // storage can be blocked: the field simply starts empty
    }
    if (last) setEmail((current) => current || last);
    setTimeout(() => (last ? passwordRef : emailRef).current?.focus(), 0);
    return () => clearTimeout(hintTimer.current);
  }, []);

  const hintLater = () => {
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(true), HINT_DELAY);
  };
  const hintOff = () => {
    clearTimeout(hintTimer.current);
    setHint(false);
  };

  const fail = (text) => {
    setMessage({ tone: "error", text: text || "Something went wrong. Try again." });
    setShake(false);
    requestAnimationFrame(() => setShake(true));
  };

  const switchTo = (next) => {
    setMode(next);
    setMessage(null);
    setPassword("");
    setShowPassword(false);
    setTimeout(() => emailRef.current?.focus(), 0);
  };

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setRemember(false);
    setShowPassword(false);
    setMessage(null);
    setTimeout(() => rootRef.current?.querySelector(".si-go")?.focus(), 0);
  };

  /**
   * Signed in: a still copy of this screen (spinner on the button) is laid over everything and the dashboard is
   * opened underneath it. The dashboard plays the animation on that copy once it has loaded.
   */
  function enter(home) {
    setEntering(true);
    hintOff();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const root = rootRef.current;
    if (!reduce && root) {
      const cover = root.cloneNode(true);
      cover.classList.add("si-handoff");
      cover.setAttribute("aria-hidden", "true");
      // what was typed (React keeps it in properties, which a copy does not carry), and no duplicate ids
      const typed = root.querySelectorAll("input");
      cover.querySelectorAll("input").forEach((input, index) => {
        input.value = typed[index]?.value ?? "";
        input.checked = Boolean(typed[index]?.checked);
      });
      cover.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      document.body.appendChild(cover);
      window.setTimeout(() => cover.isConnected && cover.remove(), GIVE_UP);
    }
    router.push(home);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || entering) return;
    setMessage(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const result = await signIn({ email, password, remember });
        if (!result?.ok) {
          setBusy(false);
          fail(result?.error);
          passwordRef.current?.select();
          return;
        }
        try {
          localStorage.setItem(EMAIL_KEY, email.trim());
        } catch {
          // not remembered: the field starts empty next time
        }
        enter(result.home);
        return;
      }
      const result = await requestReset({ email });
      setBusy(false);
      if (!result?.ok) {
        fail(result?.error);
        return;
      }
      setMessage({ tone: "notice", text: "If this email has an account, a link is on its way. Open it in this browser." });
    } catch {
      setBusy(false);
      fail("Connection lost. Try again.");
    }
  }

  return (
    <div className="si" ref={rootRef}>
      <div className="si-dark" aria-hidden="true" />
      <div className="si-mark" aria-hidden="true">
        <Logo />
      </div>

      <div className="si-stage">
        <section className={`si-card${shake ? " is-shake" : ""}`} aria-labelledby="si-title" inert={entering ? true : undefined} onAnimationEnd={() => setShake(false)}>
          <div className="si-head">
            <h1 id="si-title">{TITLE[mode]}</h1>
            <p>{SUB[mode]}</p>
          </div>

          {message && (
            <p className={`si-msg is-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
              <Icon kind={message.tone} />
              <span>{message.text}</span>
            </p>
          )}

          <form className="si-form" onSubmit={submit} noValidate>
            <div className="si-field">
              <label htmlFor="si-email">Email</label>
              <input
                id="si-email"
                ref={emailRef}
                className="si-input"
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            {mode !== "reset" && (
              <div className="si-field">
                <div className="si-row">
                  <label htmlFor="si-password">Password</label>
                  {mode === "signin" && (
                    <button type="button" className="si-link" onClick={() => switchTo("reset")}>
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="si-pw">
                  <input
                    id="si-password"
                    ref={passwordRef}
                    className="si-input"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="si-eye"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                      {showPassword && <path d="M4 4l16 16" />}
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {mode === "signin" && (
              <div className="si-check" onPointerEnter={hintLater} onPointerLeave={hintOff}>
                <input
                  id="si-remember"
                  type="checkbox"
                  checked={remember}
                  aria-describedby="si-remember-hint"
                  onChange={(event) => setRemember(event.target.checked)}
                  onFocus={(event) => event.target.matches(":focus-visible") && setHint(true)}
                  onBlur={hintOff}
                />
                <label htmlFor="si-remember">Remember me</label>
                <span id="si-remember-hint" role="tooltip" className={`si-hint${hint ? " is-on" : ""}`}>
                  <b>Remember me</b>
                  Keeps you signed in for 4 days after your last visit. Leave it off on a shared computer.
                </span>
              </div>
            )}

            <button type="submit" className="si-go" disabled={busy}>
              {busy && <span className="si-spin" aria-hidden="true" />}
              {busy ? BUSY[mode] : GO[mode]}
            </button>
          </form>

          {mode === "signin" && (
            <div className="si-demo">
              Try it with a test account:
              {DEMO.map((account) => (
                <button key={account.email} type="button" className="si-link" onClick={() => fillDemo(account)} disabled={busy || entering}>
                  {account.label}
                </button>
              ))}
            </div>
          )}

          {mode === "reset" && (
            <div className="si-foot">
              <button type="button" className="si-link" onClick={() => switchTo("signin")}>
                Back to sign in
              </button>
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
