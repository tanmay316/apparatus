// Generates every app icon, splash and logo from assets/brand/logo-mark.png (transparent, light-coloured mark).
// Run after changing the logo:  node scripts/generate-icons.cjs   then  npx cap sync android
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets/brand/logo-mark.png');
const BG = '#4E230E'; // icon / splash background (from the brand icon artwork)
const RES = path.join(ROOT, 'android/app/src/main/res');
const DENSITIES = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const out = (p) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  return full;
};

async function loadMark() {
  const trimmed = await sharp(SRC).trim({ threshold: 1 }).png().toBuffer();
  const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

function rawPng(data, info) {
  return sharp(Buffer.from(data), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Dark brown version for light backgrounds: bright areas become deep brown, the darker grooves a lighter brown.
function brownVariant({ data, info }) {
  const outBuf = Buffer.alloc(data.length);
  const dark = [59, 26, 12];
  const mid = [138, 74, 46];
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const t = Math.min(1, Math.max(0, (245 - lum) / 120));
    for (let c = 0; c < 3; c++) outBuf[i + c] = Math.round(dark[c] + (mid[c] - dark[c]) * t);
    outBuf[i + 3] = data[i + 3];
  }
  return rawPng(outBuf, info);
}

// White silhouette for notification / monochrome icons; the dark grooves become gaps.
function silhouette({ data, info }) {
  const outBuf = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const keep = Math.min(1, Math.max(0, (lum - 120) / 40));
    outBuf[i] = outBuf[i + 1] = outBuf[i + 2] = 255;
    outBuf[i + 3] = Math.round(data[i + 3] * keep);
  }
  return rawPng(outBuf, info);
}

/** Places the mark centred on a square/rect canvas, scaled so its height is `heightRatio` of the canvas's short side. */
async function place(mark, w, h, heightRatio, background, { round = 0, circle = false } = {}) {
  const markH = Math.round(Math.min(w, h) * heightRatio);
  const resized = await sharp(mark).resize({ height: markH, fit: 'inside' }).png().toBuffer();
  const meta = await sharp(resized).metadata();
  let img = sharp({ create: { width: w, height: h, channels: 4, background: background || { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: Math.round((w - meta.width) / 2), top: Math.round((h - meta.height) / 2) }]);
  if (round || circle) {
    const r = circle ? w / 2 : round;
    const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  return img.png({ compressionLevel: 9 });
}

async function main() {
  const src = await loadMark();
  const cream = await rawPng(src.data, src.info);
  const brown = await brownVariant(src);
  const mono = await silhouette(src);

  // Web / PWA
  await sharp(cream).resize({ height: 512, fit: 'inside' }).png().toFile(out('public/logo-light.png'));
  await sharp(brown).resize({ height: 512, fit: 'inside' }).png().toFile(out('public/logo.png'));
  await sharp(brown).resize({ height: 512, fit: 'inside' }).png().toFile(out('src/assets/logo.png'));
  await sharp(cream).resize({ height: 512, fit: 'inside' }).png().toFile(out('src/assets/logo-light.png'));
  await (await place(cream, 192, 192, 0.72, BG)).toFile(out('public/app-icon-192.png'));
  await (await place(cream, 512, 512, 0.72, BG)).toFile(out('public/app-icon-512.png'));
  await (await place(cream, 512, 512, 0.6, BG)).toFile(out('public/app-icon-maskable-512.png'));
  await (await place(cream, 180, 180, 0.72, BG)).toFile(out('public/apple-touch-icon.png'));
  await (await place(cream, 64, 64, 0.8, BG, { round: 14 })).toFile(out('public/favicon.png'));
  await (await place(mono, 96, 96, 0.9)).toFile(out('public/notification-badge.png'));

  // Play Store
  await (await place(cream, 512, 512, 0.72, BG)).toFile(out('store/icon-512.png'));
  await featureGraphic(cream);

  // Capacitor asset sources (used by @capacitor/assets for iOS)
  await (await place(cream, 1024, 1024, 0.72, BG)).toFile(out('assets/icon.png'));
  await sharp(cream).resize({ height: 1024, fit: 'inside' }).png().toFile(out('assets/logo.png'));
  await (await place(cream, 2732, 2732, 0.22, BG)).toFile(out('assets/splash.png'));

  // Android launcher icons
  for (const [d, s] of Object.entries(DENSITIES)) {
    const legacy = Math.round(48 * s);
    const adaptive = Math.round(108 * s);
    const notif = Math.round(24 * s);
    const dir = `android/app/src/main/res/mipmap-${d}`;
    await (await place(cream, legacy, legacy, 0.68, BG, { round: Math.round(legacy * 0.18) })).toFile(out(`${dir}/ic_launcher.png`));
    await (await place(cream, legacy, legacy, 0.6, BG, { circle: true })).toFile(out(`${dir}/ic_launcher_round.png`));
    await (await place(cream, adaptive, adaptive, 0.54)).toFile(out(`${dir}/ic_launcher_foreground.png`));
    await (await place(mono, adaptive, adaptive, 0.54)).toFile(out(`${dir}/ic_launcher_monochrome.png`));
    await (await place(mono, notif, notif, 0.92)).toFile(out(`${dir}/ic_notification.png`));
    if (d !== 'ldpi') await (await place(mono, notif, notif, 0.92)).toFile(out(`android/app/src/main/res/drawable-${d}/ic_notification.png`));
  }
  await (await place(mono, 96, 96, 0.92)).toFile(out('android/app/src/main/res/drawable/ic_notification.png'));

  // Android splash screens: keep each existing file's size.
  const splashDirs = fs.readdirSync(RES).filter((n) => n.startsWith('drawable') && fs.existsSync(path.join(RES, n, 'splash.png')));
  for (const dir of splashDirs) {
    const file = path.join(RES, dir, 'splash.png');
    const { width, height } = await sharp(file).metadata();
    const buf = await (await place(cream, width, height, 0.36, BG)).toBuffer();
    fs.writeFileSync(file, buf);
  }

  console.log(`Icons generated from ${path.relative(ROOT, SRC)} (${splashDirs.length} splash sizes).`);
}

async function featureGraphic(cream) {
  const brand = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand.config.json'), 'utf8'));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const W = 1024, H = 500;
  const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="g" cx="30%" cy="45%" r="80%"><stop offset="0" stop-color="#6b3418"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <text x="440" y="250" font-family="Segoe UI, Arial, sans-serif" font-size="96" font-weight="700" letter-spacing="14" fill="#FDE6C2">${esc((brand.wordmark || brand.name).toUpperCase())}</text>
    <text x="444" y="310" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#F3CFA3">${esc(brand.tagline)}</text>
  </svg>`);
  const mark = await sharp(cream).resize({ height: 360, fit: 'inside' }).png().toBuffer();
  const meta = await sharp(mark).metadata();
  await sharp(bg).composite([{ input: mark, left: Math.round(230 - meta.width / 2), top: Math.round((H - meta.height) / 2) }])
    .png().toFile(out('store/feature-graphic.png'));
}

main().catch((e) => { console.error(e); process.exit(1); });
