"use client";

import { useLayoutEffect } from "react";

const ENTER_KEY = "deus-enter";

/**
 * The last part of the sign-in animation: right after the sign-in screen has narrowed into the side menu, the menu
 * items and the page fade in (once; the sign-in screen leaves a flag for it). Runs before the first paint.
 */
export default function EnterReveal() {
  useLayoutEffect(() => {
    let flag = null;
    try {
      flag = sessionStorage.getItem(ENTER_KEY);
      sessionStorage.removeItem(ENTER_KEY);
    } catch {
      return undefined;
    }
    if (!flag) return undefined;
    const shell = document.querySelector(".shell");
    if (!shell) return undefined;
    shell.classList.add("is-entering");
    const timer = setTimeout(() => shell.classList.remove("is-entering"), 1200);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
