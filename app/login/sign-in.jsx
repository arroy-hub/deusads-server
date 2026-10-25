"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestReset, signIn, signUp } from "./actions";

/**
 * The sign-in screen: the dark of the side menu over the whole screen, the wordmark in the corner and one white
 * card (Sign in, Create an account, Reset your password). After a sign-in the card dissolves, the dark narrows
 * from the right into the side menu of the dashboard (as wide as that role's menu, measured from the real CSS),
 * the wordmark slides to its place in the menu, and the page opens beside it. On a phone the dark just fades.
 * The dashboard's sign-out plays the same thing backwards (app/dashboard/leave.js) and ends here.
 */

const NOTICES = {
  "idle-4d": "You were signed out after 4 days of inactivity. Sign in again to continue.",
  "idle-24h": "You were signed out after 24 hours of inactivity. Sign in again to continue.",
  ended: "You were signed in for 30 days, the longest a sign-in lasts. Sign in again to continue.",
  expired: "This link has expired, was already used or was opened in another browser. Sign in, or ask for a new link.",
};

const TITLE = { signin: "Sign in", signup: "Create an account", reset: "Reset your password" };
const SUB = {
  signin: "to your DeusADS cabinet",
  signup: "Choose whether you publish games or advertise in them.",
  reset: "We'll email you a link. It signs you in and opens your account, where you set a new password.",
};
const GO = { signin: "Sign in", signup: "Create account", reset: "Send link" };
const BUSY = { signin: "Signing in…", signup: "Creating…", reset: "Sending…" };

const EMAIL_KEY = "deus-last-email";
const ENTER_KEY = "deus-enter"; // read by app/dashboard/enter-reveal.jsx
const CORNER_SIZE = 22;
const ROLE_CLASS = { developer: "shell", advertiser: "shell is-adv", admin: "shell is-admin" };
const OUT_MS = 380;
const SHRINK_MS = 850;
const FADE_MS = 450;

/** Where the menu edge and the wordmark are in the dashboard for this role, read from a hidden copy so it follows the CSS. */
function measureRail(role) {
  const probe = document.createElement("div");
  probe.className = `${ROLE_CLASS[role] ?? "shell"} si-probe`;
  probe.setAttribute("aria-hidden", "true");
  probe.innerHTML = '<nav class="rail"><div class="rail-brand"><div><span class="rail-mark">Deus<span>ADS</span></span></div></div></nav><div class="content"></div>';
  document.body.appendChild(probe);
  const rail = probe.querySelector(".rail").getBoundingClientRect();
  const markNode = probe.querySelector(".rail-mark");
  const mark = markNode.getBoundingClientRect();
  const css = getComputedStyle(markNode);
  const size = parseFloat(css.fontSize) || 17;
  const line = parseFloat(css.lineHeight);
  const result = {
    width: rail.width,
    left: mark.left - rail.left,
    top: mark.top - rail.top,
    font: { family: css.fontFamily, weight: css.fontWeight, size, spacing: css.letterSpacing, line: Number.isFinite(line) ? line / size : 1.2 },
  };
  probe.remove();
  return result;
}

const fontStyle = (font) => (font ? { fontFamily: font.family, fontWeight: font.weight, lineHeight: font.line } : undefined);

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
  const [accountType, setAccountType] = useState("developer");
  const [message, setMessage] = useState(notice && NOTICES[notice] ? { tone: "notice", text: NOTICES[notice] } : null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle → out → shrink (or fade on a phone) → wait
  const [narrow, setNarrow] = useState(false);
  const [veil, setVeil] = useState(false);
  const [rail, setRail] = useState(null);
  const [font, setFont] = useState(null);
  const [markTo, setMarkTo] = useState(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const markRef = useRef(null);
  const timers = useRef([]);

  const later = (run, ms) => timers.current.push(setTimeout(run, ms));

  useEffect(() => {
    // The layers the dashboard's sign-out animation left on top: this screen now stands in their place.
    document.querySelectorAll(".si-leave, .si-leave-mark").forEach((node) => node.remove());
    setFont(measureRail("developer").font);
    let last = "";
    try {
      last = localStorage.getItem(EMAIL_KEY) ?? "";
    } catch {
      // storage can be blocked: the field simply starts empty
    }
    if (last) setEmail((current) => current || last);
    setTimeout(() => (last ? passwordRef : emailRef).current?.focus(), 0);
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

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

  function enter(role, home) {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const phone = window.matchMedia?.("(max-width: 800px)").matches;
    try {
      sessionStorage.setItem(ENTER_KEY, "1");
    } catch {
      // without storage the dashboard simply opens without its fade-in
    }
    router.prefetch(home);
    const go = () => {
      setPhase("wait");
      later(() => setVeil(true), 160);
      router.push(home);
    };
    if (reduce) return go();

    setNarrow(Boolean(phone));
    if (!phone) {
      const target = measureRail(role);
      const box = markRef.current?.getBoundingClientRect();
      setRail(target);
      setFont(target.font);
      if (box) setMarkTo(`translate(${target.left - box.left}px, ${target.top - box.top}px) scale(${target.font.size / CORNER_SIZE})`);
    }
    setPhase("out");
    later(() => setPhase(phone ? "fade" : "shrink"), OUT_MS);
    later(go, OUT_MS + (phone ? FADE_MS : SHRINK_MS));
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || phase !== "idle") return;
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
        enter(result.role, result.home);
        return;
      }
      if (mode === "signup") {
        const result = await signUp({ email, password, accountType });
        if (!result?.ok) {
          setBusy(false);
          fail(result?.error);
          return;
        }
        if (result.signedIn) {
          enter(result.role, result.home);
          return;
        }
        setBusy(false);
        setMode("signin");
        setPassword("");
        setMessage({ tone: "notice", text: "Check your email to confirm the address, then sign in." });
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

  const out = phase !== "idle";
  const shrunk = !narrow && (phase === "shrink" || phase === "wait") && rail;
  const faded = narrow && (phase === "fade" || phase === "wait");
  const classes = ["si", out && "is-out", shrunk && "is-shrunk", faded && "is-faded"].filter(Boolean).join(" ");

  return (
    <div className={classes} style={rail ? { "--si-rail": `${rail.width}px` } : undefined}>
      <div className="si-dark" aria-hidden="true" />
      <div className="si-mark" ref={markRef} aria-hidden="true" style={{ ...fontStyle(font), transform: shrunk && markTo ? markTo : undefined }}>
        Deus<span>ADS</span>
      </div>

      <div className="si-stage">
        <section className={`si-card${shake ? " is-shake" : ""}`} aria-labelledby="si-title" inert={out ? true : undefined} onAnimationEnd={() => setShake(false)}>
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
                autoComplete={mode === "signup" ? "email" : "username"}
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            {mode === "signup" && (
              <fieldset className="si-roles">
                <legend>I am</legend>
                <label className="si-role" htmlFor="si-type-developer">
                  <input id="si-type-developer" type="radio" name="si-type" checked={accountType === "developer"} onChange={() => setAccountType("developer")} />
                  <span>
                    <b>A developer</b>
                    <span>I publish games and show ads in them.</span>
                  </span>
                </label>
                <label className="si-role" htmlFor="si-type-advertiser">
                  <input id="si-type-advertiser" type="radio" name="si-type" checked={accountType === "advertiser"} onChange={() => setAccountType("advertiser")} />
                  <span>
                    <b>An advertiser</b>
                    <span>I want to advertise in games.</span>
                  </span>
                </label>
              </fieldset>
            )}

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
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
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
              <div className="si-check">
                <input id="si-remember" type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <div>
                  <label htmlFor="si-remember">Remember me for 4 days</label>
                  <small>Leave it off on a shared computer.</small>
                </div>
              </div>
            )}

            <button type="submit" className="si-go" disabled={busy}>
              {busy && <span className="si-spin" aria-hidden="true" />}
              {busy ? BUSY[mode] : GO[mode]}
            </button>
          </form>

          <div className="si-foot">
            {mode === "signin" && (
              <>
                New to DeusADS?{" "}
                <button type="button" className="si-link" onClick={() => switchTo("signup")}>
                  Create an account
                </button>
              </>
            )}
            {mode === "signup" && (
              <>
                Already have an account?{" "}
                <button type="button" className="si-link" onClick={() => switchTo("signin")}>
                  Sign in
                </button>
              </>
            )}
            {mode === "reset" && (
              <button type="button" className="si-link" onClick={() => switchTo("signin")}>
                Back to sign in
              </button>
            )}
          </div>
        </section>
      </div>

      {phase === "wait" && (
        <div className={`nav-fade${veil ? " is-on" : ""}`} style={{ left: narrow ? 0 : rail?.width ?? 0 }} role="status" aria-live="polite">
          <span className="nav-fade-spin" />
          <span className="nav-fade-text">Loading</span>
        </div>
      )}
    </div>
  );
}
