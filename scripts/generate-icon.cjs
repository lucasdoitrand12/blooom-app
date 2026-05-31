// Génère l'icône Blooom 1024x1024 px
// Usage : node scripts/generate-icon.js
const sharp = require("sharp");
const path = require("path");

// Coordonnées des 3 cercles (ooo) centrés dans 1024x1024
// Marges gauche/droite symétriques de 42px
const r1 = 120, r2 = 150, r3 = 180;
const gap = 20;
const cx1 = 42 + r1;                      // 162
const cx2 = cx1 + r1 + gap + r2;          // 452
const cx3 = cx2 + r2 + gap + r3;          // 802
const cy  = 512;
const ep1 = Math.round(r1 * 0.08);        // 10
const ep2 = Math.round(r2 * 0.08);        // 12
const ep3 = Math.round(r3 * 0.08);        // 14

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <!-- Fond -->
  <rect width="1024" height="1024" fill="#1c1014"/>

  <defs>
    <!-- Dégradé horizontal couvrant les 3 cercles -->
    <linearGradient id="g" x1="${cx1}" y1="${cy}" x2="${cx3}" y2="${cy}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#FF8A3D"/>
      <stop offset="35%"  stop-color="#FF5C9D"/>
      <stop offset="70%"  stop-color="#C65CE8"/>
      <stop offset="100%" stop-color="#4D7CFF"/>
    </linearGradient>
  </defs>

  <!-- Petit cercle (o) -->
  <circle cx="${cx1}" cy="${cy}" r="${r1}" fill="none" stroke="url(#g)" stroke-width="${ep1}"/>
  <!-- Cercle moyen (o) -->
  <circle cx="${cx2}" cy="${cy}" r="${r2}" fill="none" stroke="url(#g)" stroke-width="${ep2}"/>
  <!-- Grand cercle (o) -->
  <circle cx="${cx3}" cy="${cy}" r="${r3}" fill="none" stroke="url(#g)" stroke-width="${ep3}"/>
</svg>`.trim();

const outPath = path.join(__dirname, "..", "blooom-icon.png");

sharp(Buffer.from(svg))
  .png()
  .toFile(outPath)
  .then(() => console.log(`✓ blooom-icon.png créé dans ${outPath}`))
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exit(1);
  });
