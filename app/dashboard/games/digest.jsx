"use client";

import { useState } from "react";
import Link from "next/link";
import { dismissDigest } from "./digest-actions";

/** "Since your last visit": what changed in the person's games, with a way to hide it until the next visit. */
export default function Digest({ since, lines }) {
  const [hidden, setHidden] = useState(false);
  if (hidden || lines.length === 0) return null;
  return (
    <section className="digest" role="region" aria-label="Since your last visit">
      <div className="digest-body">
        <h2>Since your last visit · {since}</h2>
        <ul>
          {lines.map((line, index) => (
            <li key={index}>
              <span className={`digest-dot${line.warn ? " warn" : ""}`} />
              <span>{line.href ? <Link href={line.href}>{line.text}</Link> : line.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className="button button-quiet button-small"
        onClick={() => {
          setHidden(true);
          dismissDigest().catch(() => {});
        }}
      >
        Dismiss
      </button>
    </section>
  );
}
