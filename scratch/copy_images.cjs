const fs = require('fs');
const path = require('path');

const files = [
  'squat-peak.webp', 'front-squat-peak.webp', 'deadlift-peak.webp', 'romanian-deadlift-peak.webp',
  'bench-press-peak.webp', 'incline-bench-press-peak.webp', 'ohp-peak.webp', 'barbell-row-peak.webp',
  'lat-pulldown-peak.webp', 'pull-up-peak.webp', 'push-up-peak.webp', 'dips-peak.webp',
  'lunge-peak.webp', 'bulgarian-split-squat-peak.webp', 'hip-thrust-peak.webp', 'leg-press-peak.webp',
  'leg-extension-peak.webp', 'leg-curl-peak.webp', 'barbell-calf-raise-peak.webp', 'bicep-curl-peak.webp',
  'tricep-pushdown-peak.webp', 'lateral-raise-peak.webp', 'rear-delt-fly-peak.webp', 'db-fly-peak.webp',
  'shrug-peak.webp', 'face-pull-peak.webp', 'plank-main.webp', 'crunches-peak.webp',
  'lying-leg-raise-peak.webp', 'russian-twist-peak.webp', 'kettlebell-farmers-walk-main.webp',
  'kettlebell-swing-peak.webp', 'clean-peak.webp', 'dumbbell-snatch-peak.webp', 'muscle-ups-peak.webp',
  'handstand-push-ups-peak.webp', 'jump-squat-peak.webp', 'air-bike-main.webp', 'burpees-main.webp',
  'bench-childs-pose-main.webp', 'bench-chest-stretch-main.webp', 'bicycle-crunch-peak.webp',
  'glute-bridge-peak.webp'
];

const srcDir = 'C:\\Users\\Tms\\Desktop\\apparatus\\scratch\\exercise-dataset\\images\\flat';
const destDir = 'C:\\Users\\Tms\\Desktop\\apparatus\\src\\assets\\exercises';

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

let copied = 0;
for (const file of files) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    copied++;
  } else {
    console.log(`Missing: ${file}`);
  }
}

console.log(`Copied ${copied} files.`);
