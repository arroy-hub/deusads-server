import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { HEADER_BYTES, encodeVariant, ladderFor, levelBytes, makeVariants, mipSizes, removeVariants, totalBytes, variantSize, variantsBySource } from "../lib/astc-variants.js";

// the ladder never goes above the picture and ends at the picture's own size
assert.deepEqual(ladderFor(800, 400), [800]);
assert.deepEqual(ladderFor(1024, 512), [1024]);
assert.deepEqual(ladderFor(1600, 900), [1024, 1600]);
assert.deepEqual(ladderFor(3000, 2000), [1024, 2048, 3000]);
assert.deepEqual(ladderFor(4096, 2304), [1024, 2048, 4096]);
assert.deepEqual(ladderFor(2000, 5000 > 4096 ? 4096 : 5000), [1024, 2048, 4096]);

// sizes are multiples of 4 and keep the shape
assert.deepEqual(variantSize(1920, 1080, 1024), { width: 1024, height: 576 });
const odd = variantSize(1000, 333, 1000);
assert.equal(odd.width % 4, 0);
assert.equal(odd.height % 4, 0);
assert.ok(Math.abs(odd.width / odd.height - 1000 / 333) < 0.03);

// mips down to 1 x 1, and the byte count
assert.deepEqual(mipSizes(8, 4).map((m) => `${m.width}x${m.height}`), ["8x4", "4x2", "2x1", "1x1"]);
assert.equal(levelBytes(8, 4), 2 * 1 * 16);
assert.equal(levelBytes(1, 1), 16);
assert.equal(totalBytes(8, 4), 16 + 32 + 16 + 16 + 16);

// an encoded copy: header, size, and what it decodes to
const w = 256, h = 144;
const raw = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  raw[i] = (x / w) * 255; raw[i + 1] = (y / h) * 255; raw[i + 2] = ((x >> 4) + (y >> 4)) % 2 ? 230 : 40; raw[i + 3] = 255;
}
const source = await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
const file = await encodeVariant(source, { width: w, height: h, alpha: false });
assert.equal(file.length, totalBytes(w, h));
assert.equal(file.toString("ascii", 0, 4), "DAST");
assert.equal(file.readUInt8(4), 1);
assert.equal(file.readUInt8(5), 1);
assert.equal(file.readUInt8(6), mipSizes(w, h).length);
assert.equal(file.readUInt8(7), 0);
assert.equal(file.readUInt32LE(8), w);
assert.equal(file.readUInt32LE(12), h);

// decode the top level again with the same tool and compare with the source
{
  const { createRequire } = await import("node:module");
  const bin = path.join(path.dirname(createRequire(import.meta.url).resolve("@astcenc/linux-x64/package.json")), "bin", "astcenc-sse4.1");
  const dir = mkdtempSync(path.join(tmpdir(), "dast-test-"));
  const head = Buffer.from([0x13, 0xab, 0xa1, 0x5c, 4, 4, 1, w & 255, w >> 8, 0, h & 255, h >> 8, 0, 1, 0, 0]);
  writeFileSync(path.join(dir, "top.astc"), Buffer.concat([head, file.subarray(HEADER_BYTES, HEADER_BYTES + levelBytes(w, h))]));
  execFileSync(bin, ["-ds", path.join(dir, "top.astc"), path.join(dir, "top.png"), "-silent"]);
  const back = await sharp(path.join(dir, "top.png")).ensureAlpha().raw().toBuffer();
  let se = 0;
  // the file is stored bottom row first, so the decoded picture is the source turned upside down
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) se += (raw[(y * w + x) * 4 + c] - back[((h - 1 - y) * w + x) * 4 + c]) ** 2;
  const psnr = 10 * Math.log10((255 * 255) / (se / (raw.length * 0.75)));
  assert.ok(psnr > 38, `PSNR ${psnr.toFixed(1)} dB is too low`);
  assert.deepEqual(readdirSync(dir).sort(), ["top.astc", "top.png"]);
}

// transparency is flagged
const clear = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.4 } } }).png().toBuffer();
assert.equal((await encodeVariant(clear, { width: 64, height: 64, alpha: true })).readUInt8(7), 1);

// storage and table: a stand-in service client
function stub(files, rows) {
  const removed = [];
  const from = (table) => {
    const state = { filters: [] };
    const query = {
      select: () => query,
      eq: (c, v) => (state.filters.push([c, v]), query),
      in: (c, v) => (state.filters.push([c, v, "in"]), query),
      then: (resolve) => {
        const data = rows.filter((row) => state.filters.every(([c, v, k]) => (k ? v.includes(row[c]) : row[c] === v)));
        if (state.deleting) { state.filters.length && data.forEach((row) => rows.splice(rows.indexOf(row), 1)); return resolve({ data: null, error: null }); }
        return resolve({ data, error: null });
      },
      insert: async (row) => (rows.push({ id: String(rows.length + 1), ...row }), { error: null }),
      delete: () => ((state.deleting = true), query),
    };
    return query;
  };
  const bucket = (name) => ({
    download: async (p) => (files.has(`${name}/${p}`) ? { data: new Blob([files.get(`${name}/${p}`)]), error: null } : { data: null, error: { message: "missing" } }),
    upload: async (p, body) => (files.set(`${name}/${p}`, body), { error: null }),
    remove: async (ps) => (ps.forEach((p) => (removed.push(`${name}/${p}`), files.delete(`${name}/${p}`))), { error: null }),
    getPublicUrl: (p) => ({ data: { publicUrl: `https://x/${name}/${p}` } }),
  });
  return { service: { from, storage: { from: bucket } }, removed };
}

{
  const big = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toBuffer();
  const files = new Map([["creatives/u1/pic.png", big]]);
  const rows = [];
  const { service, removed } = stub(files, rows);
  const made = await makeVariants(service, "u1/pic.png");
  assert.deepEqual(made.map((r) => r.width), [1024, 1600]);
  assert.deepEqual(made.map((r) => r.height), [576, 900]);
  assert.ok(made.every((r) => r.alpha === false && r.bytes > 0));
  assert.equal(rows.length, 2);
  assert.equal((await makeVariants(service, "u1/pic.png")).length, 0); // again: nothing new
  const map = await variantsBySource(service, ["u1/pic.png", "other.png"]);
  assert.deepEqual(map.get("u1/pic.png").map((v) => v.w), [1024, 1600]);
  assert.match(map.get("u1/pic.png")[0].url, /^https:\/\/x\/variants\/u1\/.*\.dast$/);
  assert.equal(map.has("other.png"), false);
  await removeVariants(service, ["u1/pic.png"]);
  assert.equal(removed.length, 2);
}

console.log("astc-variants: ok");
