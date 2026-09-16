// Shared by the server page and the client card, so the crop warning and the
// ratio label stay identical on both sides.

/** How much of a creative is lost when cover-fitted to a surface. */
export function cropPercent(creative, surfaceAspect) {
  if (!creative?.width_px || !creative?.height_px) return 0;
  const creativeAspect = creative.width_px / creative.height_px;
  const visible =
    creativeAspect > surfaceAspect
      ? surfaceAspect / creativeAspect
      : creativeAspect / surfaceAspect;
  return Math.round((1 - visible) * 100);
}

export function ratioLabel(aspect) {
  const known = [
    [16 / 9, "16:9"],
    [4 / 3, "4:3"],
    [1, "1:1"],
    [3 / 4, "3:4"],
    [9 / 16, "9:16"],
    [21 / 9, "21:9"],
  ];
  const match = known.find(([value]) => Math.abs(value - aspect) / aspect < 0.04);
  return match ? match[1] : `${aspect.toFixed(2)}:1`;
}
