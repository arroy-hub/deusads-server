"use client";

/**
 * Sign-out, played as the sign-in backwards: the page fades, the dark side menu widens over the whole screen and the
 * wordmark slides to the corner where the sign-in screen keeps it. `run` then signs out; it ends on the sign-in
 * screen, which removes these layers once it stands in their place. On a phone the dark simply fades in.
 */
const CORNER = { left: 28, top: 26, size: 22 };
const COVER_MS = 300;
const WIDEN_MS = 850;

export function leaveDashboard(run) {
  if (typeof document === "undefined") return run();
  if (document.querySelector(".si-leave")) return undefined; // already on the way out
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const phone = window.matchMedia?.("(max-width: 800px)").matches;
  const shell = document.querySelector(".shell");
  const rail = document.querySelector(".rail");
  if (reduce || !shell || !rail) return run();

  const box = rail.getBoundingClientRect();
  const veil = document.createElement("div");
  veil.className = "si-leave";
  veil.setAttribute("aria-hidden", "true");
  veil.style.width = phone ? "100%" : `${box.width}px`;
  document.body.appendChild(veil);

  let mark = null;
  const real = rail.querySelector(".rail-mark");
  if (real && !phone) {
    const place = real.getBoundingClientRect();
    const css = getComputedStyle(real);
    const size = parseFloat(css.fontSize) || 17;
    mark = document.createElement("div");
    mark.className = "si-leave-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = "Deus<span>ADS</span>";
    Object.assign(mark.style, {
      left: `${place.left}px`,
      top: `${place.top}px`,
      fontFamily: css.fontFamily,
      fontWeight: css.fontWeight,
      fontSize: css.fontSize,
      letterSpacing: css.letterSpacing,
      lineHeight: css.lineHeight,
    });
    mark.dataset.to = `translate(${CORNER.left - place.left}px, ${CORNER.top - place.top}px) scale(${CORNER.size / size})`;
    document.body.appendChild(mark);
  }

  shell.classList.add("is-leaving");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      veil.classList.add("is-cover");
      if (phone) return;
      setTimeout(() => {
        veil.classList.add("is-wide");
        if (mark) mark.style.transform = mark.dataset.to;
      }, COVER_MS);
    })
  );
  setTimeout(run, phone ? COVER_MS + 150 : COVER_MS + WIDEN_MS);
  return undefined;
}
