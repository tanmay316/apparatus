const fs = require('fs');

const data = JSON.parse(fs.readFileSync('C:/Users/Tms/Desktop/apparatus/female_paths.json', 'utf-8'));

function formatPaths(parts, view) {
  const basePaths = [];
  const muscles = [];

  for (const part of parts) {
    if (['head', 'neck', 'hair', 'feet'].includes(part.slug)) {
      basePaths.push(...part.paths);
    } else {
      let slug = part.slug;
      if (slug === 'frontDeltoid' || slug === 'deltoids') slug = 'delts';
      if (slug === 'outerQuad' || slug === 'innerQuad' || slug === 'quadriceps') slug = 'quads';
      if (slug === 'lowerChest' || slug === 'upperChest') slug = 'chest';
      if (slug === 'upperAbs' || slug === 'lowerAbs') slug = 'abs';
      if (slug === 'upperBack' || slug === 'lowerBack') slug = 'lower_back';
      if (slug === 'hipFlexors') slug = 'obliques';
      if (slug === 'trapezius') slug = 'traps';
      if (slug === 'forearm') slug = 'forearms';
      if (slug === 'gluteal') slug = 'glutes';
      if (slug === 'hamstring') slug = 'hamstrings';
      if (slug === 'knees' || slug === 'tibialis' || slug === 'ankles' || slug === 'serratus' || slug === 'hands' || slug === 'adductors') {
         // skip these inactive minor muscles
         basePaths.push(...part.paths);
         continue;
      }

      // We might have duplicates, so we need to group by slug
      const existing = muscles.find(m => m.id === slug);
      if (existing) {
        existing.paths.push(...part.paths);
      } else {
        muscles.push({
          id: slug,
          view: view,
          paths: [...part.paths]
        });
      }
    }
  }

  // Need to merge some specific muscles like quads, chest, abs, etc.
  return { basePaths, muscles };
}

const femaleFront = formatPaths(data.front, 'front');
const femaleBack = formatPaths(data.back, 'back');

const output = `
export const FEMALE_FRONT_VIEWBOX = '0 0 650 1450';
export const FEMALE_BACK_VIEWBOX = '823 0 650 1450';

export const FEMALE_FRONT_BASE_PATHS: string[] = ${JSON.stringify(femaleFront.basePaths, null, 2)};
export const FEMALE_FRONT_MUSCLES: MusclePath[] = ${JSON.stringify(femaleFront.muscles, null, 2)};

export const FEMALE_BACK_BASE_PATHS: string[] = ${JSON.stringify(femaleBack.basePaths, null, 2)};
export const FEMALE_BACK_MUSCLES: MusclePath[] = ${JSON.stringify(femaleBack.muscles, null, 2)};
`;

fs.writeFileSync('C:/Users/Tms/Desktop/apparatus/female_paths_formatted.ts', output);
console.log('Formatted TS file created!');
