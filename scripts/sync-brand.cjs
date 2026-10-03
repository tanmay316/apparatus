// Checks brand.config.json and copies it to the backend (Render deploys backend/ on its own).
// Runs before every `npm run build`; run by hand with `npm run brand:sync`.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.config.json'), 'utf8'));

const problems = [];
if (!brand.name || typeof brand.name !== 'string') problems.push('"name" is required.');
else if (/['"&<>\\]/.test(brand.name)) problems.push('"name" must not contain quotes, &, <, > or backslashes.');
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(brand.appId || '')) problems.push('"appId" must look like com.company.app (lowercase).');
if (!/^https:\/\/[^\s]+$/.test(brand.webUrl || '')) problems.push('"webUrl" must be an https URL.');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(brand.supportEmail || '')) problems.push('"supportEmail" must be an email address.');
if (!brand.legalOwner || /[<>&"]/.test(brand.legalOwner)) problems.push('"legalOwner" (person or company running the app) is required.');
if (problems.length) {
  console.error(`brand.config.json:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
// The stylised wordmark (e.g. Λ for A) is easy to forget when renaming.
const plain = (s) => String(s || '').toUpperCase().replace(/Λ/g, 'A').replace(/[^A-Z0-9]/g, '');
if (brand.wordmark && plain(brand.wordmark) !== plain(brand.name)) {
  console.warn(`brand.config.json: "wordmark" (${brand.wordmark}) doesn't match "name" (${brand.name}). Update it or remove it.`);
}

const { _readme, ...data } = brand;
fs.writeFileSync(path.join(root, 'backend', 'app', 'brand.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`Brand: ${brand.name} (${brand.appId})`);
