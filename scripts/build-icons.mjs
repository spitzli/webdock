import fs from "node:fs/promises";
import sharp from "sharp";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#17283e"/><path d="M14 16v26l9 8 9-8 9 8 9-8V16M32 16v26" fill="none" stroke="#ff995f" stroke-width="7" stroke-linecap="square" stroke-linejoin="round"/></svg>\n`;
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(size => sharp(Buffer.from(svg)).resize(size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const at = 6 + i * 16;
  header[at] = sizes[i]; header[at + 1] = sizes[i];
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(pngs[i].length, at + 8); header.writeUInt32LE(offset, at + 12);
  offset += pngs[i].length;
}
for (const app of ["web", "admin", "auth"]) {
  await fs.writeFile(`apps/${app}/src/app/icon.svg`, svg);
  await fs.writeFile(`apps/${app}/src/app/favicon.ico`, Buffer.concat([header, ...pngs]));
  await sharp(Buffer.from(svg)).resize(180).png().toFile(`apps/${app}/src/app/apple-icon.png`);
}
