/**
 * Exercise Visual Taxonomy
 *
 * Maps 1000+ exercises to a growing library of high-quality
 * exercise illustration assets using deterministic matching.
 *
 * Matching priority:
 * 1. Exact exercise override
 * 2. Specific exercise phrase
 * 3. Movement + equipment
 * 4. Movement fallback
 * 5. Muscle-group fallback
 * 6. Default illustration
 */

/**
 * Normalizes an exercise name for deterministic matching.
 * Converts to lowercase, normalizes spaces and separators,
 * and standardizes common abbreviations.
 */
function normalizeExerciseName(name: string): string {
  let normalized = name
    .toLowerCase()
    .replace(/[-–—_/]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Common abbreviations and aliases
  normalized = normalized.replace(/\bdb\b/g, 'dumbbell');
  normalized = normalized.replace(/\bbb\b/g, 'barbell');
  normalized = normalized.replace(/\bkb\b/g, 'kettlebell');
  normalized = normalized.replace(/pull-up/g, 'pull up');
  normalized = normalized.replace(/push-up/g, 'push up');
  normalized = normalized.replace(/warm-up/g, 'warm up');
  
  return normalized;
}

/**
 * Checks if a string contains a specific phrase using word boundaries.
 * Supports basic plurals (s, es).
 */
function hasPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeExerciseName(phrase);
  const paddedText = ` ${text} `;
  return paddedText.includes(` ${normalizedPhrase} `) || 
         paddedText.includes(` ${normalizedPhrase}s `) ||
         paddedText.includes(` ${normalizedPhrase}es `);
}

// ─── EXACT OVERRIDES ───────────────────────────────────────────────
// For specific edge cases or explicitly mapped custom exercises.
const EXERCISE_OVERRIDES: Record<string, string> = {};

// ─── PRIORITY-BASED RULES ──────────────────────────────────────────
type ImageRule = {
  phrases: string[];
  filename: string;
  priority: number; // Higher number = checked first
};

const IMAGE_RULES: ImageRule[] = [
  // Chest: Decline
  {
    phrases: ['decline dumbbell bench press', 'decline dumbbell chest press'],
    filename: 'decline-db-fly-peak.webp', // Ideally decline-db-bench-press-peak, but using available asset
    priority: 100,
  },
  {
    phrases: ['decline bench press', 'decline barbell bench press'],
    filename: 'decline-bench-press-barbell-peak.webp',
    priority: 95,
  },
  {
    phrases: ['decline push up'],
    filename: 'decline-push-up-peak.webp',
    priority: 95,
  },

  // Chest: Incline
  {
    phrases: ['incline dumbbell bench press', 'incline dumbbell chest press', 'incline dumbbell press'],
    filename: 'incline-db-press-peak.webp',
    priority: 90,
  },
  {
    phrases: ['incline bench press', 'incline barbell bench press'],
    filename: 'incline-bench-press-peak.webp',
    priority: 85,
  },
  {
    phrases: ['incline dumbbell fly'],
    filename: 'incline-dumbbell-fly-peak.webp',
    priority: 85,
  },
  {
    phrases: ['incline push up'],
    filename: 'incline-push-ups-peak.webp',
    priority: 85,
  },

  // Chest: Flat & Machines
  {
    phrases: ['dumbbell bench press', 'dumbbell chest press'],
    filename: 'db-bench-press-peak.webp',
    priority: 80,
  },
  {
    phrases: ['barbell bench press', 'flat barbell bench press', 'bench press'],
    filename: 'bench-press-peak.webp',
    priority: 75,
  },
  {
    phrases: ['cable chest press', 'cable press'],
    filename: 'cable-chest-press-peak.webp',
    priority: 70,
  },
  {
    phrases: ['machine chest press', 'chest press machine'],
    filename: 'chest-press-machine-peak.webp',
    priority: 70,
  },
  {
    phrases: ['dumbbell fly'],
    filename: 'db-fly-peak.webp',
    priority: 70,
  },
  {
    phrases: ['cable crossover', 'cable fly'],
    filename: 'cable-fly-peak.webp',
    priority: 70,
  },
  {
    phrases: ['pec deck', 'machine fly'],
    filename: 'machine-chest-fly-peak.webp',
    priority: 70,
  },
  {
    phrases: ['dumbbell pullover'],
    filename: 'db-pullover-peak.webp',
    priority: 70,
  },
  {
    phrases: ['barbell pullover'],
    filename: 'barbell-pullover-peak.webp',
    priority: 70,
  },

  // Push-ups
  {
    phrases: ['clap push up', 'plyo push up'],
    filename: 'clap-push-ups-peak.webp',
    priority: 85,
  },
  {
    phrases: ['diamond push up'],
    filename: 'diamond-push-ups-peak.webp',
    priority: 85,
  },
  {
    phrases: ['archer push up'],
    filename: 'archer-push-ups-peak.webp',
    priority: 85,
  },
  {
    phrases: ['knee push up'],
    filename: 'knee-push-ups-peak.webp',
    priority: 85,
  },
  {
    phrases: ['bodyweight push up', 'push up'],
    filename: 'push-up-peak.webp',
    priority: 50,
  },

  // Back: Pull-ups & Pulldowns
  {
    phrases: ['dead hang'],
    filename: 'pull-up-start.webp',
    priority: 90,
  },
  {
    phrases: ['assisted pull up', 'machine pull up'],
    filename: 'assisted-pull-ups-peak.webp',
    priority: 90,
  },
  {
    phrases: ['pull up', 'chin up'],
    filename: 'pull-up-peak.webp',
    priority: 80,
  },
  {
    phrases: ['straight arm pulldown'],
    filename: 'straight-arm-pulldown-peak.webp',
    priority: 90,
  },
  {
    phrases: ['lat pulldown', 'pulldown'],
    filename: 'lat-pulldown-peak.webp',
    priority: 80,
  },

  // Back: Rows
  {
    phrases: ['chest supported dumbbell row', 'chest supported row'],
    filename: 'chest-supported-db-row-peak.webp',
    priority: 90,
  },
  {
    phrases: ['single arm dumbbell row', 'single arm row', 'one arm row'],
    filename: 'single-arm-db-row-peak.webp',
    priority: 90,
  },
  {
    phrases: ['dumbbell row'],
    filename: 'single-arm-db-row-peak.webp',
    priority: 85,
  },
  {
    phrases: ['t bar row', 't-bar row'],
    filename: 'barbell-row-peak.webp', // specific fallback
    priority: 85,
  },
  {
    phrases: ['barbell row', 'bent over row'],
    filename: 'barbell-row-peak.webp',
    priority: 80,
  },
  {
    phrases: ['seated cable row', 'cable row'],
    filename: 'wide-grip-seated-cable-row-peak.webp',
    priority: 80,
  },
  {
    phrases: ['machine row'],
    filename: 'barbell-row-peak.webp', // Better generic fallback than cable
    priority: 80,
  },
  {
    phrases: ['band row', 'australian row', 'inverted row', 'bodyweight row'],
    filename: 'inverted-row-peak.webp',
    priority: 80,
  },
  
  // Back: Deadlifts
  {
    phrases: ['romanian deadlift', 'stiff leg deadlift', 'rdl'],
    filename: 'romanian-deadlift-peak.webp',
    priority: 90,
  },
  {
    phrases: ['dumbbell deadlift'],
    filename: 'dumbbell-deadlift-peak.webp',
    priority: 90,
  },
  {
    phrases: ['sumo deadlift'],
    filename: 'sumo-deadlift-peak.webp',
    priority: 90,
  },
  {
    phrases: ['trap bar deadlift', 'hex bar deadlift'],
    filename: 'hex-bar-deadlift-peak.webp',
    priority: 90,
  },
  {
    phrases: ['barbell deadlift', 'deadlift'],
    filename: 'deadlift-peak.webp',
    priority: 80,
  },

  {
    phrases: ['back extension', 'hyperextension'],
    filename: 'back-extension-peak.webp',
    priority: 80,
  },

  // Shoulders
  {
    phrases: ['dumbbell shoulder press', 'seated dumbbell press'],
    filename: 'seated-db-press-peak.webp',
    priority: 90,
  },
  {
    phrases: ['arnold press'],
    filename: 'arnold-press-peak.webp',
    priority: 90,
  },
  {
    phrases: ['overhead press', 'barbell shoulder press', 'military press'],
    filename: 'ohp-peak.webp',
    priority: 85,
  },
  {
    phrases: ['push press'],
    filename: 'push-press-peak.webp',
    priority: 85,
  },
  {
    phrases: ['machine shoulder press'],
    filename: 'machine-shoulder-press-peak.webp',
    priority: 85,
  },
  {
    phrases: ['dumbbell lateral raise', 'side raise'],
    filename: 'lateral-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['cable lateral raise'],
    filename: 'cable-lateral-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['lateral raise'],
    filename: 'lateral-raise-peak.webp',
    priority: 80,
  },
  {
    phrases: ['dumbbell front raise'],
    filename: 'dumbbell-front-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['barbell front raise'],
    filename: 'barbell-front-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['cable front raise'],
    filename: 'cable-front-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['front raise'],
    filename: 'dumbbell-front-raise-peak.webp',
    priority: 80,
  },
  {
    phrases: ['rear delt fly', 'reverse fly', 'rear delt raise'],
    filename: 'rear-delt-fly-peak.webp',
    priority: 85,
  },
  {
    phrases: ['cable face pull', 'face pull', 'pull apart', 'external rotation'],
    filename: 'face-pull-peak.webp',
    priority: 85,
  },
  {
    phrases: ['dumbbell shrug'],
    filename: 'db-shrug-peak.webp',
    priority: 90,
  },
  {
    phrases: ['barbell shrug'],
    filename: 'barbell-shrug-peak.webp',
    priority: 90,
  },
  {
    phrases: ['shrug'],
    filename: 'shrug-peak.webp',
    priority: 80,
  },

  // Arms: Biceps
  {
    phrases: ['barbell curl'],
    filename: 'barbell-curl-peak.webp',
    priority: 90,
  },
  {
    phrases: ['dumbbell curl', 'bicep curl'],
    filename: 'bicep-curl-peak.webp',
    priority: 85,
  },
  {
    phrases: ['hammer curl'],
    filename: 'hammer-curl-peak.webp',
    priority: 90,
  },
  {
    phrases: ['preacher curl'],
    filename: 'preacher-curl-peak.webp',
    priority: 90,
  },
  {
    phrases: ['cable curl'],
    filename: 'cable-curl-peak.webp',
    priority: 90,
  },
  {
    phrases: ['concentration curl'],
    filename: 'concentration-curl-peak.webp',
    priority: 90,
  },
  {
    phrases: ['ez bar curl'],
    filename: 'ez-bar-curl-peak.webp',
    priority: 90,
  },
  {
    phrases: ['reverse curl'],
    filename: 'reverse-curl-peak.webp',
    priority: 90,
  },
  {
    phrases: ['curl'],
    filename: 'bicep-curl-peak.webp', // Generic curl fallback
    priority: 60,
  },

  // Arms: Triceps
  {
    phrases: ['cable tricep extension', 'tricep pushdown', 'cable pushdown'],
    filename: 'tricep-pushdown-peak.webp',
    priority: 90,
  },
  {
    phrases: ['lying tricep extension', 'skull crusher', 'skullcrusher'],
    filename: 'skull-crusher-peak.webp',
    priority: 90,
  },
  {
    phrases: ['overhead tricep extension'],
    filename: 'overhead-tricep-extension-peak.webp',
    priority: 90,
  },
  {
    phrases: ['tricep kickback', 'kickback'],
    filename: 'tricep-kickback-peak.webp',
    priority: 90,
  },
  {
    phrases: ['bench dip', 'chair dip'],
    filename: 'bench-dips-peak.webp',
    priority: 90,
  },
  {
    phrases: ['tricep dip', 'chest dip', 'dip'],
    filename: 'dips-peak.webp',
    priority: 80,
  },

  // Legs: Squats
  {
    phrases: ['bodyweight squat', 'air squat', 'free squat'],
    filename: 'bodyweight-squat-peak.webp',
    priority: 100,
  },
  {
    phrases: ['goblet squat'],
    filename: 'goblet-squat-peak.webp',
    priority: 90,
  },
  {
    phrases: ['front squat'],
    filename: 'front-squat-peak.webp',
    priority: 90,
  },
  {
    phrases: ['box squat'],
    filename: 'box-squat-peak.webp',
    priority: 90,
  },
  {
    phrases: ['hack squat'],
    filename: 'hack-squat-peak.webp',
    priority: 90,
  },
  {
    phrases: ['bulgarian split squat', 'bulgarian split'],
    filename: 'bulgarian-split-squat-peak.webp',
    priority: 95,
  },
  {
    phrases: ['split squat'],
    filename: 'lunge-peak.webp', // Generic split squat fallback if no specific split squat image exists
    priority: 90,
  },
  {
    phrases: ['barbell squat', 'back squat', 'squat'],
    filename: 'squat-peak.webp',
    priority: 80,
  },

  // Legs: Lunges & Machines
  {
    phrases: ['machine leg press', 'leg press'],
    filename: 'leg-press-peak.webp',
    priority: 90,
  },
  {
    phrases: ['walking lunge', 'forward lunge', 'lunge'],
    filename: 'lunge-peak.webp',
    priority: 80,
  },
  {
    phrases: ['reverse lunge'],
    filename: 'reverse-lunge-peak.webp',
    priority: 85,
  },
  {
    phrases: ['barbell hip thrust', 'hip thrust'],
    filename: 'hip-thrust-peak.webp',
    priority: 90,
  },
  {
    phrases: ['bodyweight glute bridge', 'glute bridge'],
    filename: 'glute-bridge-peak.webp',
    priority: 90,
  },
  {
    phrases: ['leg extension', 'quad extension'],
    filename: 'leg-extension-peak.webp',
    priority: 90,
  },
  {
    phrases: ['nordic hamstring curl', 'nordic curl'],
    filename: 'nordic-hamstring-curl-peak.webp',
    priority: 95,
  },
  {
    phrases: ['hamstring curl', 'leg curl'],
    filename: 'leg-curl-peak.webp',
    priority: 90,
  },
  
  // Legs: Calves
  {
    phrases: ['barbell calf raise', 'standing calf raise'],
    filename: 'barbell-calf-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['seated calf raise'],
    filename: 'seated-calf-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['donkey calf raise'],
    filename: 'donkey-calf-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['calf raise'],
    filename: 'barbell-calf-raise-peak.webp', // Generic calf raise fallback
    priority: 80,
  },

  // Core
  {
    phrases: ['dragon flag', 'hollow hold', 'hollow body'],
    filename: 'lying-leg-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['side plank'],
    filename: 'side-plank-main.webp',
    priority: 90,
  },
  {
    phrases: ['plank'],
    filename: 'plank-main.webp',
    priority: 80,
  },
  {
    phrases: ['bicycle crunch'],
    filename: 'bicycle-crunch-peak.webp',
    priority: 90,
  },
  {
    phrases: ['crunch'],
    filename: 'crunches-peak.webp',
    priority: 80,
  },
  {
    phrases: ['sit up'],
    filename: 'sit-ups-peak.webp',
    priority: 80,
  },
  {
    phrases: ['russian twist'],
    filename: 'russian-twist-peak.webp',
    priority: 80,
  },
  {
    phrases: ['lying leg raise', 'leg raise'],
    filename: 'lying-leg-raise-peak.webp',
    priority: 80,
  },
  {
    phrases: ['hanging knee raise'],
    filename: 'hanging-knee-raise-peak.webp',
    priority: 90,
  },
  {
    phrases: ['hanging leg raise', 'toes to bar'],
    filename: 'hanging-leg-raise-peak.webp',
    priority: 85,
  },
  {
    phrases: ['ab rollout', 'ab wheel'],
    filename: 'ab-wheel-rollout-peak.webp',
    priority: 90,
  },
  {
    phrases: ['dead bug'],
    filename: 'dead-bug-peak.webp',
    priority: 90,
  },

  // Olympic & Full Body
  {
    phrases: ['walk', 'treadmill', 'run', 'jog'],
    filename: 'air-bike-main.webp', // Best general cardio fallback
    priority: 50,
  },
  {
    phrases: ['clean and jerk'],
    filename: 'clean-and-jerk-peak.webp',
    priority: 100,
  },
  {
    phrases: ['power clean', 'clean'],
    filename: 'clean-peak.webp',
    priority: 90,
  },
  {
    phrases: ['snatch'],
    filename: 'dumbbell-snatch-peak.webp', // using available asset
    priority: 90,
  },
  {
    phrases: ['kettlebell swing'],
    filename: 'kettlebell-swing-peak.webp',
    priority: 90,
  },
  {
    phrases: ['burpee'],
    filename: 'burpees-main.webp',
    priority: 90,
  },
  {
    phrases: ['jumping jack'],
    filename: 'jumping-jacks-peak.webp',
    priority: 90,
  },
  {
    phrases: ['mountain climber'],
    filename: 'mountain-climbers-peak.webp',
    priority: 90,
  },

  // Flexibility & Mobility
  {
    phrases: ['childs pose', 'child pose', 'meditation', 'breathing', 'bhastrika', 'namaskar', 'yoga', 'nadi shodhana', 'pranayama', 'salutation', 'downward dog', 'cobra', 'pigeon', 'fold', 'twist', 'bird dog', 'opener'],
    filename: 'bench-childs-pose-main.webp',
    priority: 90,
  },
  {
    phrases: ['chest stretch'],
    filename: 'bench-chest-stretch-main.webp',
    priority: 90,
  },
  {
    phrases: ['lat stretch'],
    filename: 'bench-lat-stretch-main.webp',
    priority: 90,
  },
  {
    phrases: ['hamstring stretch'],
    filename: 'bench-hamstring-stretch-main.webp',
    priority: 90,
  },
  {
    phrases: ['circle', 'activation', 'prep', 'dislocation', 'swing', 'warm up', 'cooldown', 'stretching', 'stretch', 'mobility', 'foam rolling'],
    filename: 'bench-chest-stretch-main.webp', // Generic mobility fallback
    priority: 50,
  },
  
  // Advanced Calisthenics
  {
    phrases: ['muscle up'],
    filename: 'muscle-ups-peak.webp',
    priority: 90,
  },
  {
    phrases: ['front lever', 'back lever', 'german hang'],
    filename: 'inverted-row-peak.webp', // Closest horizontal hang
    priority: 95,
  },
  {
    phrases: ['elbow lever', 'frog stand'],
    filename: 'planche-main.webp',
    priority: 95,
  },
  {
    phrases: ['kick up', 'handstand push up', 'hspu'],
    filename: 'handstand-push-ups-peak.webp',
    priority: 95,
  },
  {
    phrases: ['handstand'],
    filename: 'handstand-push-ups-peak.webp', // No generic handstand, use HSPU
    priority: 90,
  },
  {
    phrases: ['l sit', 'lsit'],
    filename: 'l-sit-main.webp',
    priority: 90,
  },
  {
    phrases: ['planche'],
    filename: 'planche-main.webp',
    priority: 90,
  },
];

// Sort rules dynamically so higher priority rules are evaluated first
const SORTED_RULES = [...IMAGE_RULES].sort((a, b) => b.priority - a.priority);

/**
 * Resolve an exercise name to its visual filename.
 */
export function getExerciseImageFilename(name: string, muscleGroup?: string): string {
  const normalized = normalizeExerciseName(name);

  // 1. Check explicit overrides first
  if (EXERCISE_OVERRIDES[normalized]) {
    return EXERCISE_OVERRIDES[normalized];
  }

  // 2. Check phrase rules
  for (const rule of SORTED_RULES) {
    for (const phrase of rule.phrases) {
      if (hasPhrase(normalized, phrase)) {
        return rule.filename;
      }
    }
  }

  // 3. Fallback based on muscleGroup from the exercise library
  if (muscleGroup) {
    const mg = muscleGroup.toLowerCase();
    if (mg === 'chest') return 'bench-press-peak.webp';
    if (mg === 'back' || mg === 'lats') return 'barbell-row-peak.webp';
    if (mg === 'shoulders' || mg === 'delts') return 'ohp-peak.webp';
    if (mg === 'quads' || mg === 'legs') return 'squat-peak.webp';
    if (mg === 'hamstrings') return 'deadlift-peak.webp';
    if (mg === 'glutes') return 'hip-thrust-peak.webp';
    if (mg === 'biceps') return 'bicep-curl-peak.webp';
    if (mg === 'triceps') return 'tricep-pushdown-peak.webp';
    if (mg === 'core' || mg === 'abs') return 'crunches-peak.webp';
    if (mg === 'calves') return 'barbell-calf-raise-peak.webp';
    if (mg === 'forearms') return 'bicep-curl-peak.webp';
    if (mg === 'traps') return 'shrug-peak.webp';
  }

  return 'default';
}
