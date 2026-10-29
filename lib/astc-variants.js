import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { chmod, copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync, gzipSync } from "node:zlib";
import sharp from "sharp";
import { PROCESS_PIXEL_LIMIT } from "./creative-image.js";

const run = promisify(execFile);
const require = createRequire(import.meta.url);

/**
 * Compressed copies of a creative picture for headsets and phones.
 *
 * Each copy is ASTC 4x4 (8 bits a pixel, a quarter of RGBA32) with every mip level, in a small container the SDK hands to
 * the graphics card as it is. Copies are made at a ladder of sizes, never bigger than the picture itself, so a banner seen
 * from afar needs only the small one and the SDK fetches a bigger one only when a player comes close.
 *
 * File layout ("DAST", all numbers little-endian):
 *   0   4  magic "DAST"
 *   4   1  version, 1
 *   5   1  format, 1 = ASTC 4x4
 *   6   1  mip levels
 *   7   1  flags, bit 0 = the picture has transparency, bit 1 = everything after the header is gzip-compressed (the
 *           mip levels below are what it unpacks to). Compressed, a file is about as big as the PNG; unpacked it is 8 bits a pixel.
 *   8   4  width in pixels
 *   12  4  height in pixels
 *   16  .  the mip levels, largest first, each stored bottom row first (the way Unity's textures run), each ceil(w/4) * ceil(h/4) * 16 bytes, no padding between them
 */
export const LADDER = [1024, 2048, 4096];
export const FORMAT = "astc4x4";
export const HEADER_BYTES = 16;
const BLOCK = 4;
const BLOCK_BYTES = 16;

/** The longest sides copies are made at: the ladder steps below the picture, then the picture's own size (when within the ladder's top). */
export function ladderFor(width, height) {
  const longest = Math.max(width, height);
  const top = LADDER[LADDER.length - 1];
  const sides = LADDER.filter((side) => side < longest);
  sides.push(Math.min(longest, top));
  return [...new Set(sides)];
}

const snap = (value) => Math.max(BLOCK, Math.round(value / BLOCK) * BLOCK);

/** Width and height of the copy whose longest side is `side`: the picture's shape, both a multiple of 4 so no block is half empty. */
export function variantSize(width, height, side) {
  const scale = side / Math.max(width, height);
  return { width: snap(width * scale), height: snap(height * scale) };
}

/** Sizes of all mip levels, largest first, down to 1 x 1 (the same halving Unity uses). */
export function mipSizes(width, height) {
  const sizes = [{ width, height }];
  while (width > 1 || height > 1) {
    width = Math.max(1, width >> 1);
    height = Math.max(1, height >> 1);
    sizes.push({ width, height });
  }
  return sizes;
}

export const levelBytes = (width, height) => Math.ceil(width / BLOCK) * Math.ceil(height / BLOCK) * BLOCK_BYTES;
export const totalBytes = (width, height) => HEADER_BYTES + mipSizes(width, height).reduce((sum, level) => sum + levelBytes(level.width, level.height), 0);

export function header({ width, height, mips, alpha }) {
  const head = Buffer.alloc(HEADER_BYTES);
  head.write("DAST", 0, "ascii");
  head.writeUInt8(1, 4);
  head.writeUInt8(1, 5);
  head.writeUInt8(mips, 6);
  head.writeUInt8(alpha ? 1 : 0, 7);
  head.writeUInt32LE(width, 8);
  head.writeUInt32LE(height, 12);
  return head;
}

/** The file as it is stored and sent: the header as it was, the mip levels gzip-compressed, flag bit 1 set. */
export function packVariant(file) {
  const head = Buffer.from(file.subarray(0, HEADER_BYTES));
  head.writeUInt8(head.readUInt8(7) | 2, 7);
  return Buffer.concat([head, gzipSync(file.subarray(HEADER_BYTES), { level: 9 })]);
}

/** The reverse of packVariant (what the SDK does on the device). A file that is not packed comes back as it is. */
export function unpackVariant(file) {
  if (!(file.readUInt8(7) & 2)) return file;
  const head = Buffer.from(file.subarray(0, HEADER_BYTES));
  head.writeUInt8(head.readUInt8(7) & ~2, 7);
  return Buffer.concat([head, gunzipSync(file.subarray(HEADER_BYTES))]);
}

// ------------------------------------------------------------------ the encoder (Arm's astcenc, a native program)

const PACKAGES = { "linux-x64": "@astcenc/linux-x64", "darwin-arm64": "@astcenc/darwin-arm64", "darwin-x64": "@astcenc/darwin-x64" };
let encoders = null;

/** The astcenc programs for this machine, fastest first. Each is copied to the temporary folder and made executable: the deployed files are read-only. */
async function findEncoders() {
  if (encoders) return encoders;
  const name = PACKAGES[`${process.platform}-${process.arch}`];
  if (!name) throw new Error(`No ASTC encoder for ${process.platform}-${process.arch}.`);
  // Where the program is: next to the code in node_modules. Looked up by path first (a deployed function has the
  // files but may not resolve them like a module), by module resolution second.
  const candidates = [path.join(process.cwd(), "node_modules", name, "bin")];
  try {
    candidates.push(path.join(path.dirname(require.resolve(`${name}/package.json`)), "bin"));
  } catch {
    // not resolvable as a module: the path above has to do
  }
  let folder = null;
  for (const candidate of candidates) {
    try {
      await stat(path.join(candidate, "astcenc-avx2"));
      folder = candidate;
      break;
    } catch {
      try {
        await stat(path.join(candidate, "astcenc"));
        folder = candidate;
        break;
      } catch {
        // try the next place
      }
    }
  }
  if (!folder) throw new Error(`The ASTC encoder is missing (looked in ${candidates.join(", ")}).`);
  const found = [];
  for (const file of ["astcenc-avx2", "astcenc-sse4.1", "astcenc-sse2", "astcenc-neon", "astcenc"]) {
    const from = path.join(folder, file);
    try {
      await stat(from);
    } catch {
      continue;
    }
    const to = path.join(tmpdir(), `deusads-${file}`);
    await copyFile(from, to);
    await chmod(to, 0o755);
    found.push(to);
  }
  if (!found.length) throw new Error("The ASTC encoder is missing.");
  encoders = found;
  return found;
}

async function astc(input, output) {
  const programs = await findEncoders();
  let last;
  for (const program of programs) {
    try {
      await run(program, ["-cs", input, output, "4x4", "-medium", "-silent"], { timeout: 120_000 });
      return;
    } catch (error) {
      last = error;
      if (error.code === "ENOENT" || error.signal === "SIGILL" || error.code === "ENOEXEC") continue; // this CPU cannot run that build
      throw error;
    }
  }
  throw last;
}

/**
 * The compressed file for one copy: every mip level encoded and packed. `source` is the original picture (any size);
 * levels are made from it directly, so each is a fresh high-quality reduction.
 */
export async function encodeVariant(source, { width, height, alpha }) {
  const folder = await mkdtemp(path.join(tmpdir(), "dast-"));
  try {
    const levels = mipSizes(width, height);
    const parts = [];
    for (let index = 0; index < levels.length; index++) {
      const level = levels[index];
      const input = path.join(folder, `m${index}.png`);
      const output = path.join(folder, `m${index}.astc`);
      let pipeline = sharp(source, { limitInputPixels: PROCESS_PIXEL_LIMIT })
        .rotate()
        .resize({ width: level.width, height: level.height, fit: "fill", kernel: "lanczos3" })
        .flip() // Unity's textures run from the bottom row up
        .toColourspace("srgb");
      pipeline = alpha ? pipeline.ensureAlpha() : pipeline.removeAlpha();
      await writeFile(input, await pipeline.png({ compressionLevel: 1 }).toBuffer());
      await astc(input, output);
      const file = await readFile(output);
      const blocks = file.subarray(16); // astcenc's own 16-byte header
      if (blocks.length !== levelBytes(level.width, level.height)) throw new Error(`Unexpected ASTC size for ${level.width}x${level.height}.`);
      parts.push(blocks);
    }
    return Buffer.concat([header({ width, height, mips: levels.length, alpha }), ...parts]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ storage and database

const BUCKET = "variants";

/**
 * Makes (when missing) the compressed copies of the picture at `sourcePath` in the "creatives" bucket and records them.
 * Safe to call again: sizes that exist are left alone. Failures are logged and skipped; the picture is still served as PNG/JPG.
 * Returns the rows now present.
 */
export async function makeVariants(service, sourcePath) {
  const { data: existing, error: listError } = await service.from("creative_variants").select("width, height").eq("source_path", sourcePath).eq("format", FORMAT);
  if (listError) {
    console.error("[DeusADS] variants not available (migration 0055?):", listError.message);
    return [];
  }

  const { data: blob, error: readError } = await service.storage.from("creatives").download(sourcePath);
  if (readError || !blob) {
    console.error("[DeusADS] variants: picture not readable:", sourcePath);
    return [];
  }
  const source = Buffer.from(await blob.arrayBuffer());

  let meta;
  let alpha;
  try {
    meta = await sharp(source, { limitInputPixels: PROCESS_PIXEL_LIMIT }).metadata();
    alpha = meta.hasAlpha ? !(await sharp(source, { limitInputPixels: PROCESS_PIXEL_LIMIT }).stats()).isOpaque : false;
  } catch (error) {
    console.error("[DeusADS] variants: picture not understood:", sourcePath, error.message);
    return [];
  }
  const sideways = meta.orientation >= 5 && meta.orientation <= 8;
  const pictureWidth = sideways ? meta.height : meta.width;
  const pictureHeight = sideways ? meta.width : meta.height;

  const have = new Set((existing ?? []).map((row) => row.width));
  const folder = sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1);
  const made = [];
  for (const side of ladderFor(pictureWidth, pictureHeight)) {
    const size = variantSize(pictureWidth, pictureHeight, side);
    if (have.has(size.width)) continue;
    const storagePath = `${folder}${crypto.randomUUID()}-${size.width}x${size.height}.dast`;
    try {
      const file = packVariant(await encodeVariant(source, { ...size, alpha }));
      const { error: uploadError } = await service.storage.from(BUCKET).upload(storagePath, file, { contentType: "application/octet-stream", cacheControl: "31536000", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const row = { source_path: sourcePath, format: FORMAT, width: size.width, height: size.height, mips: mipSizes(size.width, size.height).length, bytes: file.length, alpha, storage_path: storagePath };
      const { error: insertError } = await service.from("creative_variants").insert(row);
      if (insertError) {
        await service.storage.from(BUCKET).remove([storagePath]);
        throw new Error(insertError.message);
      }
      made.push(row);
    } catch (error) {
      console.error("[DeusADS] variant not made:", sourcePath, size.width, error.message);
    }
  }
  return made;
}

/** Removes the compressed copies of pictures that are being deleted or replaced. */
export async function removeVariants(service, sourcePaths) {
  const paths = [...new Set((sourcePaths ?? []).filter(Boolean))];
  if (!paths.length) return;
  const { data } = await service.from("creative_variants").select("id, storage_path").in("source_path", paths);
  if (!data?.length) return;
  await service.storage.from(BUCKET).remove(data.map((row) => row.storage_path));
  await service.from("creative_variants").delete().in("id", data.map((row) => row.id));
}

/** Rows for the manifest: source path -> [{ f, w, h, bytes, alpha, url }] smallest first. */
export async function variantsBySource(service, sourcePaths) {
  const paths = [...new Set((sourcePaths ?? []).filter(Boolean))];
  const bySource = new Map();
  if (!paths.length) return bySource;
  const { data, error } = await service
    .from("creative_variants")
    .select("source_path, format, width, height, bytes, alpha, storage_path")
    .in("source_path", paths)
    .eq("format", FORMAT);
  if (error) return bySource; // migration 0055 not applied yet: no variants
  for (const row of data ?? []) {
    const list = bySource.get(row.source_path) ?? [];
    list.push({
      f: row.format,
      w: row.width,
      h: row.height,
      bytes: row.bytes,
      alpha: row.alpha,
      url: service.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl,
    });
    bySource.set(row.source_path, list);
  }
  for (const list of bySource.values()) list.sort((a, b) => a.w * a.h - b.w * b.h);
  return bySource;
}
