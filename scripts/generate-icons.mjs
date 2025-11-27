import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "..", "public");
const iconsDir = join(publicDir, "icons");

// Read SVG file
const svg192 = readFileSync(join(iconsDir, "icon-192x192.svg"));
const svg512 = readFileSync(join(iconsDir, "icon-512x512.svg"));

// Generate PNG icons
async function generateIcons() {
  console.log("Generating PNG icons...");

  // 192x192 icon
  await sharp(svg192).resize(192, 192).png().toFile(join(iconsDir, "icon-192x192.png"));
  console.log("✓ Generated icon-192x192.png");

  // 512x512 icon
  await sharp(svg512).resize(512, 512).png().toFile(join(iconsDir, "icon-512x512.png"));
  console.log("✓ Generated icon-512x512.png");

  // Apple touch icon (180x180)
  await sharp(svg192).resize(180, 180).png().toFile(join(publicDir, "apple-touch-icon.png"));
  console.log("✓ Generated apple-touch-icon.png");

  // Favicon (32x32)
  await sharp(svg192).resize(32, 32).png().toFile(join(publicDir, "favicon-32x32.png"));
  console.log("✓ Generated favicon-32x32.png");

  // Favicon (16x16)
  await sharp(svg192).resize(16, 16).png().toFile(join(publicDir, "favicon-16x16.png"));
  console.log("✓ Generated favicon-16x16.png");

  console.log("\nDone! PNG icons generated successfully.");
}

generateIcons().catch(console.error);
