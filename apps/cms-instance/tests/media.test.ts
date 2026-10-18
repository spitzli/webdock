import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { validateRaster } from "../src/lib/media.ts";
test("raster uploads decode real bytes, reject disguised SVG and generate safe filenames", async () => {
  await assert.rejects(
    validateRaster({
      data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      name: "photo.png",
      mimetype: "image/png",
      size: 44,
    }),
  );
  const data = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  const result = await validateRaster({
    data,
    name: "../../overwritten.html",
    mimetype: "image/png",
    size: data.length,
  });
  assert.match(result.name, /^[a-f0-9-]{36}\.png$/);
  assert.equal(result.mimetype, "image/png");
  await assert.rejects(
    validateRaster({
      data,
      name: "x.jpg",
      mimetype: "image/jpeg",
      size: data.length,
    }),
  );
});
test("real AVIF bytes are accepted as heif with AV1 compression", async () => {
  const data = await sharp({
    create: { width: 3, height: 3, channels: 3, background: "#abc" },
  })
    .avif()
    .toBuffer();
  const metadata = await sharp(data).metadata();
  assert.equal(metadata.format, "heif");
  assert.equal(metadata.compression, "av1");
  const result = await validateRaster({
    data,
    name: "picture.avif",
    mimetype: "image/avif",
    size: data.length,
  });
  assert.match(result.name, /\.avif$/);
  assert.equal(result.mimetype, "image/avif");
});
