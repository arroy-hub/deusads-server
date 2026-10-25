"use client";

import { useLayoutEffect } from "react";

const OUT_MS = 380; // the card dissolves
const SHRINK_MS = 850; // the dark narrows into the side menu
const FADE_MS = 450; // on a phone the dark fades instead
const WAIT_LIMIT = 2500; // ms at most for fonts and pictures before the animation starts anyway

/** Resolves when the page's fonts and pictures are in (or after WAIT_LIMIT). */
function settled(root) {
  const pictures = [...root.querySelectorAll("img")].filter((img) => !img.complete);
  const waits = [
    document.fonts?.ready ?? Promise.resolve(),
    ...pictures.map((img) => new Promise((done) => {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    })),
  ];
  return Promise.race([Promise.all(waits), new Promise((done) => setTimeout(done, WAIT_LIMIT))]);
}

/**
 * The sign-in animation, played over the real dashboard. The sign-in screen leaves a still copy of itself on top
 * (.si-handoff, spinner on the button) and opens the dashboard underneath. Once the page is here and its fonts and
 * pictures have loaded, the card dissolves, the dark narrows into the real side menu, the wordmark slides to its
 * place in it, and then the menu items and the page fade in. On a phone the dark fades instead of narrowing.
 */
export default function EnterReveal() {
  useLayoutEffect(() => {
    const cover = document.querySelector(".si-handoff");
    const shell = document.querySelector(".shell");
    if (!cover) return;
    if (!shell) {
      cover.remove();
      return;
    }
    shell.classList.add("is-arriving"); // menu items and page stay hidden under the dark until it has narrowed

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cover.remove();
      shell.classList.remove("is-arriving");
      shell.classList.add("is-entering");
      setTimeout(() => shell.classList.remove("is-entering"), 1200);
    };

    settled(shell).then(() =>
      requestAnimationFrame(() => {
        const phone = window.matchMedia?.("(max-width: 800px)").matches;
        const rail = shell.querySelector(".rail");
        const real = rail?.querySelector(".rail-mark");
        const mark = cover.querySelector(".si-mark");
        let narrow = false;
        if (!phone && rail && real && mark) {
          const css = getComputedStyle(real);
          const size = parseFloat(css.fontSize) || 17;
          const line = parseFloat(css.lineHeight);
          Object.assign(mark.style, {
            fontFamily: css.fontFamily,
            fontWeight: css.fontWeight,
            letterSpacing: css.letterSpacing,
            lineHeight: Number.isFinite(line) ? String(line / size) : "1.2",
          });
          const from = mark.getBoundingClientRect();
          const to = real.getBoundingClientRect();
          const scale = size / (parseFloat(getComputedStyle(mark).fontSize) || 22);
          cover.style.setProperty("--si-rail", `${rail.getBoundingClientRect().width}px`);
          mark.dataset.to = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`;
          narrow = true;
        }
        cover.classList.add("is-out");
        setTimeout(() => {
          if (narrow) {
            cover.classList.add("is-shrunk");
            mark.style.transform = mark.dataset.to;
          } else {
            cover.classList.add("is-faded");
          }
        }, OUT_MS);
        setTimeout(finish, OUT_MS + (narrow ? SHRINK_MS : FADE_MS));
      })
    );
  }, []);
  return null;
}
