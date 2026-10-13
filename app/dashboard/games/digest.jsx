"use client";

import { useState } from "react";
import Link from "next/link";
import { dismissDigest } from "./digest-actions";

/** "Since your last visit": what changed in the person's games, with a way to hide it until the next visit. */
export default function Digest({ since, lines }) {
  const [hidden, setHidden] = useState(false);
  if (hidden || lines.length === 0) return null;
  return (
    <div className="mg-banners">
      {lines.map((line, index) => (
        <div key={index} className="mg-banner" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a3a1d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          <div className="mg-banner-text">
            <b>{line.text}</b> <span>Since your last visit · {since}</span>
          </div>
          {line.href && (
            <Link href={line.href} className="mg-banner-link">
              View game
            </Link>
          )}
          {index === 0 && (
            <button
              type="button"
              className="mg-banner-x"
              aria-label="Dismiss"
              onClick={() => {
                setHidden(true);
                dismissDigest().catch(() => {});
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
