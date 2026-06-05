// Génère icon-192.png et icon-512.png dans public/ depuis icon.svg
// Prérequis : npm install sharp
// Usage    : node scripts/generate-icons.js

import sharp from "sharp";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const path = { resolve };

const src = path.resolve(__dirname, "../public/icon.svg");

async function generate(size) {
  const dest = path.resolve(__dirname, `../public/icon-${size}.png`);
  await sharp(src).resize(size, size).png().toFile(dest);
  console.log(`✓ icon-${size}.png`);
}

(async () => {
  await generate(192);
  await generate(512);
  // Apple Touch Icon
  await sharp(src).resize(180, 180).png()
    .toFile(path.resolve(__dirname, "../public/apple-touch-icon.png"));
  console.log("✓ apple-touch-icon.png");
})();
