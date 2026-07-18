const fs = require('fs');

function parseSwiftFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const slugRegex = /slug:\s*\.([a-zA-Z]+)/g;
  const parts = [];
  
  const blocks = content.split('BodyPartPathData(');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const slugMatch = /slug:\s*\.([a-zA-Z]+)/.exec(block);
    if (!slugMatch) continue;
    const slug = slugMatch[1];
    
    const paths = [];
    const strings = block.match(/"([^"]+)"/g);
    if (strings) {
      for (const s of strings) {
        paths.push(s.replace(/"/g, ''));
      }
    }
    
    parts.push({ slug, paths });
  }
  return parts;
}

const front = parseSwiftFile('C:/Users/Tms/Desktop/apparatus/musclemapswift/Sources/MuscleMap/Data/FemaleFrontPaths.swift');
const back = parseSwiftFile('C:/Users/Tms/Desktop/apparatus/musclemapswift/Sources/MuscleMap/Data/FemaleBackPaths.swift');

fs.writeFileSync('C:/Users/Tms/Desktop/apparatus/female_paths.json', JSON.stringify({ front, back }, null, 2));
console.log("Extracted!");
