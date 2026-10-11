"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A game's API key, kept out of sight until asked for: one button shows it (with a copy button),
 * the same button hides it again. The key is part of the page either way; this only keeps it off the
 * screen, for example while sharing it.
 */
export default function GameKey({ value }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const codeRef = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      const range = document.createRange();
      range.selectNodeContents(codeRef.current);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      ok = document.execCommand?.("copy") ?? false;
    }
    if (!ok) return;
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  if (!shown) {
    return (
      <button type="button" className="button button-quiet key-toggle" onClick={() => setShown(true)} aria-expanded="false">
        Show key
      </button>
    );
  }

  return (
    <div className="key-open">
      <code ref={codeRef} className="key">
        {value}
      </code>
      <button type="button" className="button button-quiet key-toggle" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <button type="button" className="button button-quiet key-toggle" onClick={() => { setShown(false); setCopied(false); }} aria-expanded="true">
        Hide
      </button>
    </div>
  );
}
