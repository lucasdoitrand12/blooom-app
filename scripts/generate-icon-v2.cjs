// Version 2 : cercles qui se chevauchent + traits épais + halo lumineux
const sharp = require("sharp");
const path  = require("path");

const r1 = 130, r2 = 160, r3 = 190;
const overlap = 25;
const cx1 = 50  + r1;                          // 180
const cx2 = cx1 + r1 + r2 - overlap;           // 445
const cx3 = cx2 + r2 + r3 - overlap;           // 770
const cy  = 512;
const ep1 = Math.round(r1 * 0.12);             // 16
const ep2 = Math.round(r2 * 0.12);             // 19
const ep3 = Math.round(r3 * 0.12);             // 23

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#1c1014"/>

  <defs>
    <linearGradient id="g" x1="${cx1}" y1="${cy}" x2="${cx3}" y2="${cy}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#FF8A3D"/>
      <stop offset="35%"  stop-color="#FF5C9D"/>
      <stop offset="70%"  stop-color="#C65CE8"/>
      <stop offset="100%" stop-color="#4D7CFF"/>
    </linearGradient>

    <!-- Halo : double flou + fusion avec la source -->
    <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="blur2"/>
      <feMerge>
        <feMergeNode in="blur2"/>
        <feMergeNode in="blur1"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <g filter="url(#glow)">
    <circle cx="${cx1}" cy="${cy}" r="${r1}" fill="none" stroke="url(#g)" stroke-width="${ep1}"/>
    <circle cx="${cx2}" cy="${cy}" r="${r2}" fill="none" stroke="url(#g)" stroke-width="${ep2}"/>
    <circle cx="${cx3}" cy="${cy}" r="${r3}" fill="none" stroke="url(#g)" stroke-width="${ep3}"/>
  </g>
</svg>`.trim();

sharp(Buffer.from(svg))
  .png()
  .toFile(path.join(__dirname, "..", "blooom-icon-v2.png"))
  .then(() => console.log("✓ blooom-icon-v2.png créé"))
  .catch((e) => { console.error(e.message); process.exit(1); });
