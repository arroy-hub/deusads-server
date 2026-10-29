import assert from "node:assert/strict";
import sharp from "sharp";
import { sizeAdvice } from "../lib/creative-size.js";
import { LONG_SIDE_LIMIT, fitSize, fitStoredPicture, overLimit, resizedNotice, shrinkPicture } from "../lib/creative-image.js";

const png = (width, height, channels = 4) =>
  sharp({ create: { width, height, channels, background: channels === 4 ? { r: 200, g: 30, b: 30, alpha: 0.5 } : { r: 200, g: 30, b: 30 } } }).png().toBuffer();
const jpg = (width, height) => sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } }).jpeg().toBuffer();

// sizes
assert.deepEqual(fitSize(1920, 1080), { width: 1920, height: 1080, resized: false });
assert.deepEqual(fitSize(4096, 2048), { width: 4096, height: 2048, resized: false });
assert.deepEqual(fitSize(8192, 4096), { width: 4096, height: 2048, resized: true });
assert.deepEqual(fitSize(3000, 6000), { width: 2048, height: 4096, resized: true });
assert.equal(overLimit(4097, 10), true);
assert.equal(overLimit(4096, 4096), false);
assert.match(resizedNotice({ width: 8000, height: 4000 }, { width: 4096, height: 2048 }), /4096 px.*8000 × 4000.*4096 × 2048.*not kept/);

// a picture that fits comes back as the same bytes
const small = await png(800, 600);
const same = await shrinkPicture(small, "image/png");
assert.equal(same.resized, false);
assert.equal(same.buffer, small);

// a big PNG becomes 4096 on the long side, keeps its shape and its transparency
const big = await png(6000, 3000);
const shrunk = await shrinkPicture(big, "image/png");
assert.equal(shrunk.resized, true);
assert.equal(shrunk.width, LONG_SIDE_LIMIT);
assert.equal(shrunk.height, 2048);
const meta = await sharp(shrunk.buffer).metadata();
assert.equal(meta.format, "png");
assert.equal(meta.hasAlpha, true);
assert.equal(meta.width, 4096);

// a big JPG stays a JPG
const bigJpg = await shrinkPicture(await jpg(5000, 5000), "image/jpeg");
assert.equal((await sharp(bigJpg.buffer).metadata()).format, "jpeg");
assert.equal(bigJpg.width, 4096);
assert.equal(bigJpg.height, 4096);

// a photo stored sideways (EXIF orientation 6) is measured and written as it is displayed
const sideways = await sharp({ create: { width: 6000, height: 2000, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
const turned = await shrinkPicture(sideways, "image/jpeg");
assert.equal(turned.from.width, 2000);
assert.equal(turned.from.height, 6000);
assert.equal(turned.width, 1365);
assert.equal(turned.height, 4096);

// not an image, wrong type
await assert.rejects(() => shrinkPicture(Buffer.from("hello"), "image/png"));
await assert.rejects(() => shrinkPicture(small, "image/gif"));

// storage: a stand-in for the service client
function storage(files) {
  const calls = { removed: [], uploaded: [] };
  const service = {
    storage: {
      from: () => ({
        download: async (path) => (files.has(path) ? { data: new Blob([files.get(path)]), error: null } : { data: null, error: { message: "missing" } }),
        upload: async (path, body, options) => {
          calls.uploaded.push({ path, size: body.length, options });
          files.set(path, body);
          return { error: null };
        },
        remove: async (paths) => {
          calls.removed.push(...paths);
          paths.forEach((path) => files.delete(path));
          return { error: null };
        },
      }),
    },
  };
  return { service, calls };
}

{
  const files = new Map([["u1/a.png", small]]);
  const { service, calls } = storage(files);
  const result = await fitStoredPicture(service, { path: "u1/a.png", type: "image/png", width: 800, height: 600 });
  assert.deepEqual(result, { path: "u1/a.png", width: 800, height: 600, resized: false });
  assert.equal(calls.uploaded.length, 0); // not even downloaded
}
{
  const files = new Map([["u1/b.png", big]]);
  const { service, calls } = storage(files);
  const result = await fitStoredPicture(service, { path: "u1/b.png", type: "image/png", width: 6000, height: 3000 });
  assert.equal(result.resized, true);
  assert.match(result.path, /^u1\/[0-9a-f-]{36}\.png$/);
  assert.notEqual(result.path, "u1/b.png"); // a new name: the old one may be cached
  assert.equal(result.width, 4096);
  assert.equal(result.height, 2048);
  assert.deepEqual(calls.removed, ["u1/b.png"]); // the original is not kept
  assert.equal(files.has("u1/b.png"), false);
  assert.equal(files.get(result.path).length, result.size);
  assert.match(result.notice, /exceeded/);
}
{
  const { service } = storage(new Map());
  const result = await fitStoredPicture(service, { path: "u1/missing.png", type: "image/png", width: 9000, height: 9000 });
  assert.match(result.error, /Upload failed/);
}
{
  const files = new Map([["u1/bad.png", Buffer.from("not an image")]]);
  const { service, calls } = storage(files);
  const result = await fitStoredPicture(service, { path: "u1/bad.png", type: "image/png", width: 9000, height: 9000 });
  assert.match(result.error, /too large to process|does not open/);
  assert.equal(calls.removed.length, 0); // the caller removes the file it rejects
}

// advice before upload
assert.equal(sizeAdvice(2048, 1152), null);
assert.equal(sizeAdvice(0, 0), null);
assert.equal(sizeAdvice(1280, 720), null);
assert.equal(sizeAdvice(1279, 720).tone, "warn");
assert.match(sizeAdvice(512, 512).text, /512 px/);
assert.equal(sizeAdvice(8192, 4096).tone, "info");
assert.match(sizeAdvice(8192, 4096).text, /8192 × 4096.*4096 × 2048/);

console.log("creative-image: ok");
