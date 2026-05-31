// Version 3 : cercles en diagonale ascendante — petit en bas à gauche,
// grand en haut à droite — évoque la croissance et la floraison
const sharp = require("sharp");
const path  = require("path");

const r1 = 115, r2 = 150, r3 = 185;
const gap = 20;
const cx1 = 42  + r1;                          // 157
const cx2 = cx1 + r1 + gap + r2;               // 442
const cx3 = cx2 + r2 + gap + r3;               // 797
const cy1 = 620, cy2 = 512, cy3 = 404;         // diagonale ascendante
const ep1 = Math.round(r1 * 0.08);             //  9
const ep2 = Math.round(r2 * 0.08);             // 12
const ep3 = Math.round(r3 * 0.08);             // 15

// Dégradé diagonal : suit la direction de la composition
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#1c1014"/>

  <defs>
    <linearGradient id="g" x1="${cx1}" y1="${cy1}" x2="${cx3}" y2="${cy3}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#FF8A3D"/>
      <stop offset="35%"  stop-color="#FF5C9D"/>
      <stop offset="70%"  stop-color="#C65CE8"/>
      <stop offset="100%" stop-color="#4D7CFF"/>
    </linearGradient>
  </defs>

  <circle cx="${cx1}" cy="${cy1}" r="${r1}" fill="none" stroke="url(#g)" stroke-width="${ep1}"/>
  <circle cx="${cx2}" cy="${cy2}" r="${r2}" fill="none" stroke="url(#g)" stroke-width="${ep2}"/>
  <circle cx="${cx3}" cy="${cy3}" r="${r3}" fill="none" stroke="url(#g)" stroke-width="${ep3}"/>
</svg>`.trim();

sharp(Buffer.from(svg))
  .png()
  .toFile(path.join(__dirname, "..", "blooom-icon-v3.png"))
  .then(() => console.log("✓ blooom-icon-v3.png créé"))
  .catch((e) => { console.error(e.message); process.exit(1); });
