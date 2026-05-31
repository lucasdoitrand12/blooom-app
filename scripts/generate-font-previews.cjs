// Génère 5 aperçus PNG de "Blooom" dans des polices Google Fonts distinctives
const sharp = require("sharp");
const https = require("https");
const path  = require("path");

const FONTS = [
  { label: "Playfair Display", family: "Playfair+Display", weight: "700" },
  { label: "Cormorant Garamond", family: "Cormorant+Garamond", weight: "700" },
  { label: "Fraunces",          family: "Fraunces",           weight: "700" },
  { label: "Syne",              family: "Syne",               weight: "800" },
  { label: "Space Grotesk",     family: "Space+Grotesk",      weight: "700" },
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko" }
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return fetchText(res.headers.location).then(resolve).catch(reject);
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(d));
    });
    req.on("error", reject);
  });
}

function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko" }
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return fetchBinary(res.headers.location).then(resolve).catch(reject);
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}

async function genPreview(font, index) {
  console.log(`  Téléchargement ${font.label}...`);

  // API v1 avec UA IE11 → retourne WOFF (compatible librsvg)
  const css = await fetchText(
    `https://fonts.googleapis.com/css?family=${font.family}:${font.weight}`
  );

  const match = css.match(/url\(([^)]+)\)/);
  if (!match) throw new Error(`URL introuvable pour ${font.label}\nCSS: ${css.slice(0, 300)}`);

  const fontUrl  = match[1].replace(/'/g, "");
  const fontBuf  = await fetchBinary(fontUrl);
  const isWoff2  = fontUrl.includes(".woff2");
  const mime     = isWoff2 ? "font/woff2" : "font/woff";
  const fmt      = isWoff2 ? "woff2"      : "woff";
  const b64      = fontBuf.toString("base64");

  const id = `f${index}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="230">
  <defs>
    <style>
      @font-face {
        font-family: '${id}';
        src: url('data:${mime};base64,${b64}') format('${fmt}');
        font-weight: ${font.weight};
      }
    </style>
    <linearGradient id="gr${id}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#FF8A3D"/>
      <stop offset="50%"  stop-color="#FF5C9D"/>
      <stop offset="100%" stop-color="#C65CE8"/>
    </linearGradient>
  </defs>
  <rect width="720" height="230" fill="#1c1014" rx="24"/>
  <text x="50" y="158"
    font-family="'${id}', serif"
    font-size="110"
    font-weight="${font.weight}"
    fill="url(#gr${id})">Blooom</text>
  <text x="52" y="202"
    font-family="sans-serif"
    font-size="14"
    letter-spacing="3"
    fill="#6B5B6E">${font.label.toUpperCase()}</text>
</svg>`;

  const out = path.join(__dirname, "..", `blooom-font-v${index}.png`);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(`  ✓ blooom-font-v${index}.png — ${font.label}`);
}

(async () => {
  console.log("Génération des aperçus de polices…\n");
  for (let i = 0; i < FONTS.length; i++) {
    try {
      await genPreview(FONTS[i], i + 1);
    } catch (e) {
      console.error(`  ✗ ${FONTS[i].label} : ${e.message}`);
    }
  }
  console.log("\nTerminé !");
})();
