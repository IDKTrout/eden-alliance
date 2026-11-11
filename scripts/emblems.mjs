// Makes the web copies of the guild emblems.
//
// 1. Download the PNGs from the "Eden Guild Emblems" Drive folder into assets/emblems/
//    (named after the guild, like moon_sword.png, the same as the sheet expects).
// 2. Run `npm run emblems`. Each one becomes public/emblems/<name>.webp at 256 px.
//
// The site picks an emblem by guild name: lower case, anything that isn't a letter or digit
// becomes "_" (Moon Sword -> moon_sword). A guild without a file shows its colour instead.

import { readdir, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const src = new URL('../assets/emblems/', import.meta.url);
const out = new URL('../public/emblems/', import.meta.url);
await mkdir(out, { recursive: true });

const files = (await readdir(src)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
for (const f of files) {
  const name = f.replace(/\.[^.]+$/, '').toLowerCase();
  const info = await sharp(new URL(f, src).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82 })
    .toFile(new URL(`${name}.webp`, out).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  console.log(`[emblems] ${name}.webp ${Math.round(info.size / 1024)} KB`);
}
console.log(`[emblems] ${files.length} emblem(s) written to public/emblems/`);
