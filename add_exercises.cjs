const fs = require('fs');
let content = fs.readFileSync('src/services/library.ts', 'utf8');

const toAdd = [
  { name: 'Band shoulder dislocations', muscleGroup: 'Shoulders', secondaryMuscles: ['Upper Back', 'Chest'] },
  { name: 'Band pull-aparts', muscleGroup: 'Upper Back', secondaryMuscles: ['Shoulders'] },
  { name: 'Scapular push-ups', muscleGroup: 'Chest', secondaryMuscles: ['Shoulders', 'Upper Back'] },
  { name: 'Scapular pull-ups', muscleGroup: 'Back', secondaryMuscles: ['Forearms', 'Lats'] },
  { name: 'Arm + wrist circles', muscleGroup: 'Shoulders', secondaryMuscles: ['Forearms'] },
  { name: 'Bodyweight squats', muscleGroup: 'Legs', secondaryMuscles: ['Glutes', 'Core'] },
  { name: 'Bhastrika breathing', muscleGroup: 'Core', secondaryMuscles: [] },
  { name: 'Nadi Shodhana', muscleGroup: 'Core', secondaryMuscles: [] },
  { name: 'Breath-awareness meditation', muscleGroup: 'Core', secondaryMuscles: [] },
  { name: 'Wall handstand hold (chest to wall)', muscleGroup: 'Shoulders', secondaryMuscles: ['Core', 'Triceps'] },
  { name: 'Wall handstand hold (back to wall)', muscleGroup: 'Shoulders', secondaryMuscles: ['Core', 'Triceps'] },
  { name: 'Freestanding kick-up attempts', muscleGroup: 'Shoulders', secondaryMuscles: ['Core'] },
  { name: 'Parallel bar dips', muscleGroup: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'] },
  { name: 'Deep push-ups on blocks/parallettes', muscleGroup: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'] },
  { name: 'Pseudo planche push-ups', muscleGroup: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps', 'Core'] },
  { name: 'Typewriter push-ups', muscleGroup: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders', 'Core'] },
  { name: 'Diamond push-ups', muscleGroup: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'] },
  { name: 'Tuck front lever hold', muscleGroup: 'Back', secondaryMuscles: ['Core', 'Lats'] },
  { name: 'Advanced tuck front lever', muscleGroup: 'Back', secondaryMuscles: ['Core', 'Lats'] },
  { name: 'Dead hang', muscleGroup: 'Forearms', secondaryMuscles: ['Back', 'Shoulders'] },
  { name: 'Weighted-feel pull-ups (slow negative)', muscleGroup: 'Back', secondaryMuscles: ['Biceps', 'Forearms'] },
  { name: 'Wide-grip pull-ups', muscleGroup: 'Back', secondaryMuscles: ['Lats', 'Biceps'] },
  { name: 'Typewriter pull-ups', muscleGroup: 'Back', secondaryMuscles: ['Lats', 'Biceps'] },
  { name: 'Australian/inverted rows', muscleGroup: 'Back', secondaryMuscles: ['Biceps', 'Core'] },
  { name: 'Bodyweight bar curls', muscleGroup: 'Biceps', secondaryMuscles: ['Back', 'Forearms'] },
  { name: 'Tuck L-sit hold', muscleGroup: 'Core', secondaryMuscles: ['Hip Flexors', 'Triceps'] },
  { name: 'One-leg-extended L-sit', muscleGroup: 'Core', secondaryMuscles: ['Hip Flexors', 'Triceps'] },
  { name: 'Straddle L-sit attempts', muscleGroup: 'Core', secondaryMuscles: ['Hip Flexors', 'Triceps'] },
  { name: 'Pistol squat progression', muscleGroup: 'Legs', secondaryMuscles: ['Glutes', 'Core'] },
  { name: 'Bulgarian split squats', muscleGroup: 'Legs', secondaryMuscles: ['Glutes', 'Core'] },
  { name: 'Sissy squats', muscleGroup: 'Legs', secondaryMuscles: ['Quads', 'Core'] },
  { name: 'Nordic curl negatives', muscleGroup: 'Legs', secondaryMuscles: ['Hamstrings', 'Glutes'] },
  { name: 'Standing calf raises', muscleGroup: 'Legs', secondaryMuscles: ['Calves'] },
  { name: 'Hanging leg raises', muscleGroup: 'Core', secondaryMuscles: ['Abs', 'Hip Flexors'] },
  { name: 'Planche lean', muscleGroup: 'Shoulders', secondaryMuscles: ['Core', 'Triceps'] },
  { name: 'Tuck planche hold', muscleGroup: 'Shoulders', secondaryMuscles: ['Core', 'Triceps'] },
  { name: 'Frog stand', muscleGroup: 'Shoulders', secondaryMuscles: ['Core', 'Triceps'] },
  { name: 'Handstand push-up negatives', muscleGroup: 'Shoulders', secondaryMuscles: ['Triceps', 'Core'] },
  { name: 'Pike push-ups', muscleGroup: 'Shoulders', secondaryMuscles: ['Triceps', 'Upper Chest'] },
  { name: 'Archer push-ups', muscleGroup: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders', 'Core'] },
  { name: 'Dips (upright torso)', muscleGroup: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'] },
  { name: 'Korean dips', muscleGroup: 'Triceps', secondaryMuscles: ['Shoulders', 'Chest'] },
  { name: 'German hang', muscleGroup: 'Shoulders', secondaryMuscles: ['Chest', 'Biceps'] },
  { name: 'Tuck back lever hold', muscleGroup: 'Back', secondaryMuscles: ['Core', 'Shoulders'] },
  { name: 'Advanced tuck back lever', muscleGroup: 'Back', secondaryMuscles: ['Core', 'Shoulders'] },
  { name: 'Chin-ups', muscleGroup: 'Back', secondaryMuscles: ['Biceps', 'Forearms'] },
  { name: 'L-sit pull-ups', muscleGroup: 'Back', secondaryMuscles: ['Core', 'Biceps'] },
  { name: 'Commando pull-ups', muscleGroup: 'Back', secondaryMuscles: ['Biceps', 'Forearms', 'Core'] },
  { name: 'Bodyweight rows', muscleGroup: 'Back', secondaryMuscles: ['Biceps', 'Core'] },
  { name: 'Elbow lever hold', muscleGroup: 'Core', secondaryMuscles: ['Shoulders', 'Wrists'] },
  { name: 'L-sit progression', muscleGroup: 'Core', secondaryMuscles: ['Hip Flexors', 'Triceps'] },
  { name: 'Freestanding handstand practice', muscleGroup: 'Shoulders', secondaryMuscles: ['Core', 'Triceps'] },
  { name: 'Explosive push-ups', muscleGroup: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'] },
  { name: 'Explosive pull-ups', muscleGroup: 'Back', secondaryMuscles: ['Biceps', 'Lats'] },
  { name: 'Dips', muscleGroup: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'] },
  { name: 'Jump squats', muscleGroup: 'Legs', secondaryMuscles: ['Glutes', 'Calves'] },
  { name: 'Dragon flag progression', muscleGroup: 'Core', secondaryMuscles: ['Abs', 'Lats'] },
  { name: 'Plank hold', muscleGroup: 'Core', secondaryMuscles: ['Abs', 'Shoulders'] },
  { name: 'Sun salutations', muscleGroup: 'Full Body', secondaryMuscles: ['Core', 'Shoulders', 'Legs'] },
  { name: 'Downward dog to cobra flow', muscleGroup: 'Full Body', secondaryMuscles: ['Shoulders', 'Back', 'Core'] },
  { name: 'Pigeon pose', muscleGroup: 'Legs', secondaryMuscles: ['Glutes', 'Hip Flexors'] },
  { name: 'Seated forward fold', muscleGroup: 'Legs', secondaryMuscles: ['Hamstrings', 'Lower Back'] },
  { name: 'Shoulder/chest opener', muscleGroup: 'Chest', secondaryMuscles: ['Shoulders'] },
  { name: 'Spinal twist', muscleGroup: 'Core', secondaryMuscles: ['Lower Back'] },
  { name: 'Bhramari breathing', muscleGroup: 'Core', secondaryMuscles: [] },
  { name: 'Hollow hold', muscleGroup: 'Core', secondaryMuscles: ['Abs', 'Lower Back'] },
  { name: 'Reverse crunch', muscleGroup: 'Core', secondaryMuscles: ['Abs', 'Lower Abs'] },
  { name: 'Handstand Push-Ups', muscleGroup: 'Shoulders', secondaryMuscles: ['Triceps', 'Core'] }
];

let added = 0;
for (const ex of toAdd) {
  if (!content.toLowerCase().includes(ex.name.toLowerCase())) {
    const secMuscles = ex.secondaryMuscles.map(m => `'${m}'`).join(', ');
    const objStr = `  {
    name: '${ex.name}',
    muscleGroup: '${ex.muscleGroup}',
    secondaryMuscles: [${secMuscles}],
    equipment: 'Bodyweight',
    difficulty: 'intermediate',
    tags: []
  },`;
    content = content.replace('];\n\n/** Fetch all library exercises */', objStr + '\n];\n\n/** Fetch all library exercises */');
    added++;
  }
}
fs.writeFileSync('src/services/library.ts', content);
console.log(`Added ${added} missing exercises.`);
