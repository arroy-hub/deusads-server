import sharp from "sharp";

import { LONG_SIDE_LIMIT, fitSize, overLimit, resizedNotice } from "./creative-size.js";

export { LONG_SIDE_LIMIT, fitSize, overLimit, resizedNotice };

/** A picture with more pixels than this is refused instead of processed: decoding it would exhaust a serverless function. */
export const PROCESS_PIXEL_LIMIT = 100_000_000;

const TYPES = { "image/png": "png", "image/jpeg": "jpg" };

/**
 * Makes a picture fit the limit. Returns the picture unchanged (resized false) when it already fits, otherwise a
 * new file of the same type: PNG stays PNG with its transparency, JPG stays JPG at high quality. The orientation
 * stored in a photo is applied to its pixels, because the SDK reads pixels only.
 */
export async function shrinkPicture(buffer, type, limit = LONG_SIDE_LIMIT) {
  if (!TYPES[type]) throw new Error("Unsupported picture type.");

  const probe = sharp(buffer, { limitInputPixels: PROCESS_PIXEL_LIMIT });
  const meta = await probe.metadata();
  const sideways = meta.orientation >= 5 && meta.orientation <= 8;
  const width = sideways ? meta.height : meta.width;
  const height = sideways ? meta.width : meta.height;
  if (!(width > 0 && height > 0)) throw new Error("Not an image.");

  const target = fitSize(width, height, limit);
  if (!target.resized) return { buffer, width, height, resized: false, from: { width, height } };

  let pipeline = sharp(buffer, { limitInputPixels: PROCESS_PIXEL_LIMIT })
    .rotate()
    .resize({ ...(width >= height ? { width: target.width } : { height: target.height }), fit: "inside", kernel: "lanczos3", withoutEnlargement: true })
    .toColourspace("srgb");
  pipeline = type === "image/png"
    ? pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
    : pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height, resized: true, from: { width, height } };
}

/**
 * The picture the browser put in Storage, made to fit the limit. A picture that already fits is left alone and not
 * even downloaded. A bigger one is read, made smaller and written under a NEW name (the old name may already be
 * cached for a year), and the old file is removed. Returns { path, width, height, size, resized, notice } or { error }.
 * `service` is the service-role Supabase client; the caller has already checked the path is inside the user's folder.
 */
export async function fitStoredPicture(service, { path, type, width, height }) {
  if (!overLimit(width, height)) return { path, width, height, resized: false };

  const bucket = service.storage.from("creatives");
  const { data: blob, error: readError } = await bucket.download(path);
  if (readError || !blob) return { error: "Upload failed. Try again." };

  let result;
  try {
    result = await shrinkPicture(Buffer.from(await blob.arrayBuffer()), type);
  } catch {
    return { error: "This picture is too large to process or does not open as an image. Make it smaller than 10,000 px on a side." };
  }
  if (!result.resized) return { path, width: result.width, height: result.height, resized: false };

  const extension = TYPES[type];
  const next = `${path.slice(0, path.lastIndexOf("/") + 1)}${crypto.randomUUID()}.${extension}`;
  const { error: writeError } = await bucket.upload(next, result.buffer, { contentType: type, cacheControl: "31536000", upsert: false });
  if (writeError) return { error: "Could not process the picture. Try again." };

  await bucket.remove([path]);
  return {
    path: next,
    width: result.width,
    height: result.height,
    size: result.buffer.length,
    resized: true,
    notice: resizedNotice(result.from, { width: result.width, height: result.height }),
  };
}
