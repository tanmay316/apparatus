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
const EXERCISE_OVERRIDES: Record<string, string> = {
  row: 'rowing-machine-main.webp',
  bike: 'stationary-bike-main.webp',
  'core work': 'plank-main.webp',
};

/** Yoga poses, pranayama and meditation, each with its own illustration (Sanskrit and English names). */
const YOGA_RULES: ImageRule[] = ([
  [['griva sanchalana', 'neck movement', 'neck roll', 'neck rotation', 'neck tilt'], 'yoga-neck-movements'],
  [['skandha chakra', 'shoulder circle', 'shoulder rotation', 'shoulder roll'], 'yoga-shoulder-circles'],
  [['kati sanchalana', 'trunk twist', 'trunk rotation', 'standing twist'], 'yoga-trunk-twist'],
  [['janu sanchalana', 'knee movement'], 'yoga-knee-bends'],
  [['tadasana', 'mountain pose'], 'yoga-mountain-pose'],
  [['vrikshasana', 'vrksasana', 'tree pose'], 'yoga-tree-pose'],
  [['pada hastasana', 'padahastasana', 'standing forward bend', 'standing forward fold', 'uttanasana'], 'yoga-standing-forward-bend'],
  [['ardha chakrasana', 'half wheel'], 'yoga-half-wheel'],
  [['trikonasana', 'triangle pose'], 'yoga-triangle-pose'],
  [['virabhadrasana i', 'warrior i', 'warrior 1'], 'yoga-warrior-1'],
  [['virabhadrasana ii', 'warrior ii', 'warrior 2'], 'yoga-warrior-2'],
  [['utkatasana', 'chair pose'], 'yoga-chair-pose'],
  [['vajrasana', 'thunderbolt pose', 'diamond pose'], 'yoga-thunderbolt'],
  [['bhadrasana', 'butterfly pose', 'butterfly stretch', 'baddha konasana'], 'banded-adductor-stretch-main.webp'],
  [['ushtrasana', 'ustrasana', 'camel pose'], 'yoga-camel'],
  [['shashankasana', 'hare pose'], 'yoga-hare'],
  [['balasana', 'childs pose', 'child pose'], 'yoga-childs-pose'],
  [['uttana mandukasana', 'mandukasana', 'frog pose'], 'yoga-stretched-frog'],
  [['vakrasana', 'seated twist'], 'yoga-seated-twist'],
  [['ardha matsyendrasana', 'matsyendrasana', 'half spinal twist', 'spinal twist'], 'yoga-half-spinal-twist'],
  [['paschimottanasana', 'seated forward bend', 'seated forward fold'], 'yoga-seated-forward-bend'],
  [['gomukhasana', 'cow face'], 'yoga-cow-face'],
  [['marjariasana', 'cat cow', 'cat camel', 'cat stretch'], 'bird-dog-hold-main.webp'],
  [['naukasana', 'navasana', 'boat pose'], 'russian-twist-start.webp'],
  [['simhasana', 'lion pose', 'lions breath'], 'yoga-lion'],
  [['makarasana', 'crocodile pose'], 'yoga-crocodile'],
  [['bhujangasana', 'cobra pose', 'cobra stretch', 'cobra'], 'yoga-cobra'],
  [['shalabhasana', 'salabhasana', 'locust'], 'superman-peak.webp'],
  [['dhanurasana', 'bow pose'], 'superman-peak.webp'],
  [['adho mukha svanasana', 'downward dog', 'downward facing dog', 'down dog'], 'yoga-downward-dog'],
  [['uttanapadasana', 'raised legs pose', 'raised leg pose'], 'yoga-raised-legs'],
  [['ardha halasana', 'halasana', 'half plough', 'plough pose', 'plow pose'], 'yoga-half-plough'],
  [['pavanamuktasana', 'wind relieving', 'knees to chest'], 'yoga-wind-relieving'],
  [['viparita karani', 'legs up the wall'], 'yoga-legs-up-wall'],
  [['shavasana', 'savasana', 'corpse pose', 'yoga nidra', 'body scan'], 'yoga-corpse'],
  [['surya namaskar', 'sun salutation', 'salutation', 'namaskar'], 'yoga-sun-salutation'],
  [['anulom vilom', 'nadi shodhana', 'alternate nostril'], 'yoga-anulom-vilom'],
  [['bhramari', 'bee breath'], 'yoga-bhramari'],
  [['dhyana', 'meditation', 'mindfulness'], 'yoga-meditation'],
  [['pigeon'], 'bench-figure-4-glute-stretch-main.webp'],
  [['crow pose', 'crane pose', 'bakasana', 'frog stand'], 'planche-main.webp'],
  [['yoga flow', 'vinyasa'], 'yoga-sun-salutation'],
  [['hip opener'], 'bench-figure-4-glute-stretch-main.webp'],
  [['chest opener', 'shoulder opener'], 'banded-chest-stretch-main.webp'],
] as [string[], string][]).map(([phrases, slug]): ImageRule => ({
  phrases,
  filename: slug.endsWith('.webp') ? slug : `${slug}-main.webp`,
  priority: 120,
})).concat([
  { phrases: ['phalakasana'], filename: 'high-plank-main.webp', priority: 120 },
  { phrases: ['setu bandhasana', 'bridge pose'], filename: 'glute-bridge-peak.webp', priority: 120 },
  // Breathing exercises without their own picture share the seated pranayama one.
  { phrases: ['pranayama', 'kapalbhati', 'bhastrika', 'ujjayi', 'sheetali', 'sitali', 'udgeeth', 'bahya', 'breathing', 'breath', 'breathwork'], filename: 'yoga-pranayama-main.webp', priority: 115 },
]);

/** Specific matches for exercises that used to fall back to a muscle-group or unrelated picture. */
const EXTRA_RULES: ImageRule[] = [
  { phrases: ['russian twist'], filename: 'russian-twist-peak.webp', priority: 110 },
  { phrases: ['bird dog'], filename: 'bird-dog-hold-main.webp', priority: 110 },
  { phrases: ['farmers walk', 'farmer walk', 'farmers carry', 'farmer carry', 'suitcase carry', 'carry'], filename: 'kettlebell-farmers-walk-main.webp', priority: 110 },
  { phrases: ['dumbbell floor press'], filename: 'dumbbell-floor-press-peak.webp', priority: 106 },
  { phrases: ['floor press'], filename: 'floor-press-peak.webp', priority: 105 },
  { phrases: ['close grip bench', 'jm press'], filename: 'close-grip-bench-press-peak.webp', priority: 100 },
  { phrases: ['tate press'], filename: 'lying-tricep-extension-peak.webp', priority: 100 },
  { phrases: ['dumbbell upright row'], filename: 'dumbbell-upright-row-peak.webp', priority: 101 },
  { phrases: ['upright row'], filename: 'upright-row-peak.webp', priority: 100 },
  { phrases: ['bodyweight good morning'], filename: 'bodyweight-good-morning-peak.webp', priority: 101 },
  { phrases: ['good morning'], filename: 'good-morning-peak.webp', priority: 100 },
  { phrases: ['wall sit'], filename: 'wall-sit-main.webp', priority: 100 },
  { phrases: ['box jump'], filename: 'box-jump-peak.webp', priority: 100 },
  { phrases: ['flutter kick'], filename: 'flutter-kicks-peak.webp', priority: 100 },
  { phrases: ['superman'], filename: 'superman-peak.webp', priority: 100 },
  { phrases: ['clamshell'], filename: 'clamshells-peak.webp', priority: 100 },
  { phrases: ['overhead tricep extension', 'overhead triceps extension', 'overhead dumbbell tricep extension'], filename: 'overhead-tricep-extension-peak.webp', priority: 100 },
  { phrases: ['dead hang', 'bar hang', 'static hang'], filename: 'dead-hang-main.webp', priority: 100 },
  { phrases: ['kettlebell press'], filename: 'double-kettlebell-overhead-press-peak.webp', priority: 95 },
  { phrases: ['glute ham raise', 'ghr'], filename: 'nordic-hamstring-curl-peak.webp', priority: 100 },
  { phrases: ['reverse hyper'], filename: 'back-extension-peak.webp', priority: 100 },
  { phrases: ['rack pull'], filename: 'deadlift-peak.webp', priority: 100 },
  { phrases: ['meadows row', 'yates row'], filename: 'barbell-row-peak.webp', priority: 100 },
  { phrases: ['rope pushdown', 'triceps pushdown', 'pushdown'], filename: 'tricep-pushdown-peak.webp', priority: 70 },
  { phrases: ['band chest fly', 'ring fly'], filename: 'cable-fly-peak.webp', priority: 100 },
  { phrases: ['ring rollout'], filename: 'ab-wheel-rollout-peak.webp', priority: 100 },
  { phrases: ['lu raise'], filename: 'lateral-raise-peak.webp', priority: 100 },
  { phrases: ['hip abduction'], filename: 'hip-abduction-peak.webp', priority: 75 },
  { phrases: ['chest press'], filename: 'chest-press-machine-peak.webp', priority: 75 },
  { phrases: ['shoulder press'], filename: 'dumbbell-shoulder-press-peak.webp', priority: 75 },
  { phrases: ['seated row', 'machine lat row', 'cable row', 'machine row'], filename: 'wide-grip-seated-cable-row-peak.webp', priority: 75 },
  { phrases: ['y raise', 'w raise', 'ytwl', 'ytw', 't raise'], filename: 'lateral-raise-peak.webp', priority: 100 },
  { phrases: ['pallof press', 'pallof'], filename: 'cable-chest-press-peak.webp', priority: 100 },
  { phrases: ['woodchop', 'woodchopper', 'wood chop', 'wood chopper'], filename: 'kettlebell-rotational-lunge-peak.webp', priority: 100 },
  { phrases: ['v sit', 'v up'], filename: 'russian-twist-start.webp', priority: 100 },
  { phrases: ['windshield wiper'], filename: 'hanging-leg-raise-peak.webp', priority: 100 },
  { phrases: ['pull through'], filename: 'kettlebell-swing-start.webp', priority: 100 },
  { phrases: ['step up'], filename: 'step-up-main.webp', priority: 100 },
  { phrases: ['wall ball'], filename: 'wall-balls-main.webp', priority: 100 },
  { phrases: ['high knee'], filename: 'cardio-running-main.webp', priority: 100 },
  { phrases: ['butt kick'], filename: 'cardio-running-main.webp', priority: 100 },
  { phrases: ['jump rope', 'skipping', 'double under'], filename: 'jump-rope-main.webp', priority: 100 },
  { phrases: ['rowing machine', 'rowing', 'rower', 'row erg', 'erg row'], filename: 'rowing-machine-main.webp', priority: 100 },
  { phrases: ['stationary bike', 'exercise bike', 'spin bike', 'cycling', 'spin class'], filename: 'stationary-bike-main.webp', priority: 95 },
  { phrases: ['skierg', 'ski erg'], filename: 'ski-erg-main.webp', priority: 100 },
  { phrases: ['sled push'], filename: 'sled-push-main.webp', priority: 100 },
  { phrases: ['sled pull', 'sled drag'], filename: 'sled-pull-main.webp', priority: 100 },
];

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
    filename: 'shrug-peak.webp',
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
    phrases: ['air bike', 'assault bike', 'echo bike', 'fan bike'],
    filename: 'air-bike-main.webp',
    priority: 100,
  },
  {
    phrases: ['walk', 'walking', 'hike', 'march'],
    filename: 'cardio-walking-main.webp',
    priority: 55,
  },
  {
    phrases: ['run', 'running', 'jog', 'sprint', 'treadmill', 'repeats', 'zone 2', 'endurance', 'tempo run', 'intervals', 'fartlek'],
    filename: 'cardio-running-main.webp',
    priority: 55,
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
  { phrases: ['shoulder stretch', 'cross body stretch', 'dislocation', 'dislocate'], filename: 'banded-shoulder-stretch-main.webp', priority: 90 },
  { phrases: ['triceps stretch', 'tricep stretch'], filename: 'banded-triceps-stretch-main.webp', priority: 90 },
  { phrases: ['rear delt stretch'], filename: 'banded-rear-delt-stretch-main.webp', priority: 90 },
  { phrases: ['calf stretch'], filename: 'bench-calf-stretch-main.webp', priority: 90 },
  { phrases: ['quad stretch', 'couch stretch', 'hip flexor stretch', 'hip flexor'], filename: 'bench-couch-stretch-main.webp', priority: 90 },
  { phrases: ['figure 4', 'figure four', 'glute stretch', 'piriformis'], filename: 'bench-figure-4-glute-stretch-main.webp', priority: 90 },
  { phrases: ['adductor stretch', 'groin stretch', 'frog stretch'], filename: 'bench-adductor-stretch-main.webp', priority: 90 },
  { phrases: ['it band'], filename: 'banded-it-band-stretch-main.webp', priority: 90 },
  { phrases: ['ankle'], filename: 'bench-ankle-stretch-main.webp', priority: 85 },
  { phrases: ['foam roll', 'foam rolling', 'foam roller'], filename: 'foam-roll-main.webp', priority: 95 },
  { phrases: ['thoracic rotation', 'thoracic', 'open book'], filename: 'thoracic-rotation-main.webp', priority: 95 },
  { phrases: ['wall slide'], filename: 'wall-slides-main.webp', priority: 95 },
  { phrases: ['arm circle', 'wrist circle', 'circles', 'circle'], filename: 'arm-circles-main.webp', priority: 60 },
  {
    phrases: ['activation', 'prep', 'swing', 'warm up', 'cooldown', 'cool down', 'stretching', 'stretch', 'mobility', 'dynamic drills', 'drills'],
    filename: 'standing-stretch-main.webp', // Generic mobility fallback
    priority: 50,
  },
  
  // Advanced Calisthenics
  {
    phrases: ['muscle up'],
    filename: 'muscle-ups-peak.webp',
    priority: 90,
  },
  {
    phrases: ['front lever'],
    filename: 'front-lever-main.webp',
    priority: 96,
  },
  {
    phrases: ['back lever', 'german hang'],
    filename: 'inverted-row-peak.webp', // Closest horizontal hang
    priority: 95,
  },
  {
    phrases: ['elbow lever'],
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
    filename: 'handstand-main.webp',
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
  ...YOGA_RULES,
  ...EXTRA_RULES,
];

// Sort rules dynamically so higher priority rules are evaluated first
const SORTED_RULES = [...IMAGE_RULES].sort((a, b) => b.priority - a.priority);

/**
 * Resolve an exercise name to its visual filename.
 */
export function getExerciseImageFilename(name: string, muscleGroup?: string): string {
  return getExerciseImageMatch(name, muscleGroup).file;
}

/** The image for an exercise and how it was found ('rule'/'override' = specific to the exercise). */
export function getExerciseImageMatch(name: string, muscleGroup?: string): { file: string; kind: 'override' | 'rule' | 'muscle' | 'default' } {
  const normalized = normalizeExerciseName(name);

  // 1. Check explicit overrides first
  if (EXERCISE_OVERRIDES[normalized]) {
    return { file: EXERCISE_OVERRIDES[normalized], kind: 'override' };
  }

  // 2. Check phrase rules
  for (const rule of SORTED_RULES) {
    for (const phrase of rule.phrases) {
      if (hasPhrase(normalized, phrase)) {
        return { file: rule.filename, kind: 'rule' };
      }
    }
  }

  // 3. Fallback based on muscleGroup from the exercise library
  const fallback = muscleFallback(muscleGroup);
  return fallback ? { file: fallback, kind: 'muscle' } : { file: 'default', kind: 'default' };
}

function muscleFallback(muscleGroup?: string): string | null {
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

  return null;
}
