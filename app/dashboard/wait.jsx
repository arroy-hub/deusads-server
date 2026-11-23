"use client";

// Waiting, said the same way everywhere: nothing a person did may look finished while its result is still on the way.
//   <Busy>Saving…</Busy>     the wheel inside the button that was pressed, while its request runs
//   refreshPage(router)      asks the server for the page's figures again (instead of router.refresh()) and tells the
//                            whole site that they are on their way
//   useWaitMark(flag)        a component says "I am waiting for the server" for as long as the flag is true
//   <WaitChip />             the small "Updating…" wheel of the dashboard frame: shown while either of the two lasts
//   useRefreshing()          true while the figures are being fetched again: a figure can then carry its own wheel
//   <Figure>                 a number that shows a wheel over itself while it is being fetched again

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

const SHOW_AFTER = 250; // ms: what answers at once never flashes the chip

const state = { marks: 0, refreshing: false, runRefresh: null };
const listeners = new Set();
const tell = () => listeners.forEach((listener) => listener());
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Fetch the figures of the page again after a change. Use it instead of router.refresh(): the frame then shows that the
 * result is still coming. Without the frame (a page outside the dashboard) it is a plain refresh.
 */
export function refreshPage(router) {
  if (state.runRefresh) state.runRefresh();
  else router?.refresh();
}

/** While `waiting` is true the frame shows that the site is working on what the person did. */
export function useWaitMark(waiting) {
  useEffect(() => {
    if (!waiting) return undefined;
    state.marks += 1;
    tell();
    return () => {
      state.marks -= 1;
      tell();
    };
  }, [waiting]);
}

/** True while the page's figures are being fetched again. */
export function useRefreshing() {
  return useSyncExternalStore(subscribe, () => state.refreshing, () => false);
}

/** The label of a button whose request is running: a wheel, then the words (or the wheel alone). */
export function Busy({ children = null }) {
  return (
    <>
      <span className={`wait-wheel${children ? "" : " is-alone"}`} aria-hidden="true" />
      {children}
    </>
  );
}

/** A figure that is about to change: while the page is fetched again it fades and a wheel turns over it. */
export function Figure({ children, className = "" }) {
  const waiting = useRefreshing();
  return (
    <span className={`wait-fig${waiting ? " is-on" : ""}${className ? ` ${className}` : ""}`} aria-busy={waiting || undefined}>
      <span className="wait-fig-in">{children}</span>
      {waiting && <span className="wait-fig-wheel" role="status" aria-label="Updating" />}
    </span>
  );
}

/** The frame's own wheel. It also owns the refresh, so a pop-up that closes at once does not lose track of it. */
export default function WaitChip() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(false);
  const timer = useRef(null);
  const waiting = useSyncExternalStore(subscribe, () => state.marks > 0 || state.refreshing, () => false);

  useEffect(() => {
    state.runRefresh = () => startTransition(() => router.refresh());
    return () => {
      state.runRefresh = null;
    };
  }, [router]);

  useEffect(() => {
    if (state.refreshing === pending) return;
    state.refreshing = pending;
    tell();
  }, [pending]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!waiting) {
      setOn(false);
      return undefined;
    }
    timer.current = setTimeout(() => setOn(true), SHOW_AFTER);
    return () => clearTimeout(timer.current);
  }, [waiting]);

  return (
    <div className={`wait-chip${on ? " is-on" : ""}`} role="status" aria-live="polite" aria-hidden={!on}>
      <span className="wait-wheel" aria-hidden="true" />
      <span>Updating…</span>
    </div>
  );
}
