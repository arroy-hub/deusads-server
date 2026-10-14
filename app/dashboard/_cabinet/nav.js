/** Tells the loading veil that a page is about to be fetched (call it right before router.push / router.replace). */
export const navigating = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("deusads:navigating"));
};
