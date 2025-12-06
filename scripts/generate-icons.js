const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Couleur de marque Moana
const BRAND_COLOR = '#0284c7';

// Créer le dossier icons s'il n'existe pas
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Fonction pour créer un SVG simple avec une ancre
function createIconSVG(size) {
  return Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${BRAND_COLOR}"/>
      <text
        x="50%"
        y="50%"
        font-family="Arial, sans-serif"
        font-size="${size * 0.6}"
        font-weight="bold"
        fill="white"
        text-anchor="middle"
        dominant-baseline="central"
      >M</text>
    </svg>
  `);
}

// Générer les icônes
async function generateIcons() {
  console.log('🎨 Génération des icônes PWA...\n');

  const icons = [
    { name: 'icon-192x192.png', size: 192 },
    { name: 'icon-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  for (const icon of icons) {
    const svgBuffer = createIconSVG(icon.size);
    const outputPath = path.join(iconsDir, icon.name);

    await sharp(svgBuffer)
      .resize(icon.size, icon.size)
      .png()
      .toFile(outputPath);

    console.log(`✅ ${icon.name} (${icon.size}x${icon.size})`);
  }

  // Générer aussi le favicon.ico
  const faviconSvg = createIconSVG(32);
  const faviconPath = path.join(__dirname, '..', 'public', 'favicon.ico');

  await sharp(faviconSvg)
    .resize(32, 32)
    .png()
    .toFile(faviconPath);

  console.log(`✅ favicon.ico (32x32)`);

  console.log('\n🎉 Toutes les icônes ont été générées avec succès !');
  console.log('📁 Emplacement: public/icons/');
  console.log('\n💡 Conseil: Remplacez ces icônes par votre logo pour un design personnalisé.');
}

// Exécuter
generateIcons().catch((err) => {
  console.error('❌ Erreur lors de la génération des icônes:', err);
  process.exit(1);
});
