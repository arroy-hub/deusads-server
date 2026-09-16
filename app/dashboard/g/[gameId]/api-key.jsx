"use client";

import { useEffect, useRef, useState } from "react";

/** The game's API key, labelled, with one-click copy. */
export default function ApiKey({ value }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      // Clipboard API unavailable (plain http, old browser): select the text instead.
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

  return (
    <div className="api-key">
      <span className="api-key-label" id="api-key-label">
        API key
      </span>
      <div className="api-key-box">
        <code ref={codeRef} aria-labelledby="api-key-label">
          {value}
        </code>
        <button
          type="button"
          className={`api-key-copy ${copied ? "is-copied" : ""}`}
          onClick={copy}
          aria-label={copied ? "API key copied" : "Copy API key"}
          title={copied ? "Copied" : "Copy"}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <span className="api-key-note" role="status" aria-live="polite">
        {copied ? "Copied to clipboard" : "Paste into Tools → DeusADS → Settings"}
      </span>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 3.2V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.3 6.6 11.3 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
