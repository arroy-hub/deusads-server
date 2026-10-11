// Browser only: turns any picture into the game icon, a centred square of SIZE × SIZE pixels as a PNG.

export const ICON_SIZE = 256;
export const MAX_ICON_INPUT_BYTES = 10 * 1024 * 1024;

export async function squareIcon(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.getContext("2d").drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("no picture");
  return blob;
}
