export type SkillFamily = 'push' | 'pull' | 'core' | 'legs' | 'balance' | 'mobility';
export type SkillTier = 0 | 1 | 2 | 3 | 4;
export type StepUnit = 'reps' | 'sec';

export type AssessmentMetric =
  | 'pushups'
  | 'pullups'
  | 'dips'
  | 'squats'
  | 'hollowSec'
  | 'deadHangSec'
  | 'wallHandstandSec'
  | 'lsitSec';

export interface SkillStep {
  id: string;
  name: string;
  unit: StepUnit;
  sets: number;
  /** Reps or seconds each set must reach to pass the step. */
  target: number;
  perSide?: boolean;
  /** Typical time to pass the step when training at the recommended frequency. */
  weeks: [number, number];
  cues: string[];
  /** A user whose assessment result is at least `min` has already passed this step. */
  test?: { metric: AssessmentMetric; min: number };
}

export interface SkillPrerequisite {
  skillId: string;
  /** Step index that must be reached; omitted means the skill must be mastered. */
  step?: number;
}

export interface CalisthenicsSkill {
  id: string;
  name: string;
  family: SkillFamily;
  tier: SkillTier;
  summary: string;
  why: string;
  muscles: string[];
  equipment: string[];
  daysPerWeek: number;
  prerequisites: SkillPrerequisite[];
  mistakes: string[];
  tips: string[];
  steps: SkillStep[];
}

export const TIER_NAMES: Record<SkillTier, string> = {
  0: 'Newbie',
  1: 'Beginner',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Elite',
};

export const FAMILY_LABELS: Record<SkillFamily, string> = {
  push: 'Push',
  pull: 'Pull',
  core: 'Core',
  legs: 'Legs',
  balance: 'Balance',
  mobility: 'Mobility',
};

type StepInput = Omit<SkillStep, 'id'>;
type SkillInput = Omit<CalisthenicsSkill, 'steps'> & { steps: StepInput[] };

const reps = (name: string, sets: number, target: number, weeks: [number, number], cues: string[], extra: Partial<StepInput> = {}): StepInput =>
  ({ name, unit: 'reps', sets, target, weeks, cues, ...extra });
const hold = (name: string, sets: number, target: number, weeks: [number, number], cues: string[], extra: Partial<StepInput> = {}): StepInput =>
  ({ name, unit: 'sec', sets, target, weeks, cues, ...extra });

const SKILL_INPUTS: SkillInput[] = [
  // ─── PUSH ───────────────────────────────────────────────────
  {
    id: 'push_up', name: 'Push-Up', family: 'push', tier: 0,
    summary: 'The foundation of every pushing skill in calisthenics.',
    why: 'Builds chest, shoulders, triceps and the rigid plank position used by planche, handstand push-ups and dips.',
    muscles: ['Chest', 'Front delts', 'Triceps', 'Core'], equipment: ['None'], daysPerWeek: 3, prerequisites: [],
    mistakes: ['Hips sagging or piking', 'Elbows flared straight out to 90°', 'Half reps that stop above the floor'],
    tips: ['Squeeze glutes and brace like a plank for every rep.', 'Keep elbows about 45° from the body.'],
    steps: [
      reps('Wall push-up', 3, 15, [1, 2], ['Hands on a wall at shoulder height', 'Body straight from head to heels', 'Touch the nose to the wall, then press away'], { test: { metric: 'pushups', min: 1 } }),
      reps('Incline push-up', 3, 12, [1, 3], ['Hands on a bench or table', 'Lower the chest to the edge', 'Lower the incline as it gets easy'], { test: { metric: 'pushups', min: 5 } }),
      reps('Knee push-up', 3, 12, [1, 3], ['Knees down, hips in line with shoulders', 'Chest to the floor every rep'], { test: { metric: 'pushups', min: 8 } }),
      reps('Full push-up', 3, 10, [2, 4], ['Hands under shoulders', 'Chest touches the floor', 'Lock the elbows at the top'], { test: { metric: 'pushups', min: 15 } }),
      reps('Push-up endurance', 3, 20, [3, 6], ['Keep a 2 second descent', 'No rest at the top between reps'], { test: { metric: 'pushups', min: 30 } }),
    ],
  },
  {
    id: 'diamond_push_up', name: 'Diamond Push-Up', family: 'push', tier: 1,
    summary: 'Close-grip push-up that loads the triceps.',
    why: 'Triceps strength carries over to dips, handstand push-ups and the lockout of every press.',
    muscles: ['Triceps', 'Chest', 'Front delts'], equipment: ['None'], daysPerWeek: 2, prerequisites: [{ skillId: 'push_up', step: 3 }],
    mistakes: ['Elbows flaring wide', 'Dropping the head instead of the chest'],
    tips: ['Index fingers and thumbs form a diamond under the sternum.'],
    steps: [
      reps('Close push-up', 3, 10, [1, 2], ['Hands shoulder-width, elbows tight to ribs']),
      reps('Diamond push-up', 3, 8, [2, 4], ['Hands under the sternum', 'Elbows track backwards']),
      reps('Diamond push-up volume', 3, 15, [3, 6], ['Controlled 2 second descent']),
    ],
  },
  {
    id: 'dips', name: 'Parallel Bar Dip', family: 'push', tier: 1,
    summary: 'The king of bodyweight pushing strength.',
    why: 'Essential for muscle-ups, ring work and building a strong support position.',
    muscles: ['Triceps', 'Chest', 'Front delts'], equipment: ['Parallel bars or dip station'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'push_up', step: 2 }],
    mistakes: ['Shoulders rolling forward at the bottom', 'Shrugging into the ears', 'Stopping above 90° elbow bend'],
    tips: ['Lean slightly forward and keep the chest proud.', 'Stop the descent if the front of the shoulder hurts.'],
    steps: [
      reps('Bench dip', 3, 12, [1, 2], ['Hands behind you on a bench', 'Bend elbows to 90°, keep shoulders down']),
      hold('Support hold', 3, 30, [1, 2], ['Locked elbows, shoulders pushed down', 'Legs together, body still'], { test: { metric: 'dips', min: 1 } }),
      reps('Negative dip', 3, 5, [1, 3], ['Jump to support', 'Take 5 seconds to lower to 90°'], { test: { metric: 'dips', min: 3 } }),
      reps('Full dip', 3, 8, [2, 4], ['Shoulders go just below elbows', 'Drive back to full lockout'], { test: { metric: 'dips', min: 10 } }),
      reps('Dip volume', 3, 15, [3, 6], ['Keep the same depth on every rep'], { test: { metric: 'dips', min: 20 } }),
    ],
  },
  {
    id: 'pike_push_up', name: 'Pike Push-Up', family: 'push', tier: 1,
    summary: 'Vertical pressing that prepares you for handstand push-ups.',
    why: 'Shifts the load to the shoulders in the same angle as a handstand press.',
    muscles: ['Shoulders', 'Triceps', 'Upper chest'], equipment: ['None', 'Box for elevation'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'push_up', step: 3 }],
    mistakes: ['Head dropping straight down instead of forward', 'Hips too low (turns into a push-up)'],
    tips: ['Make a triangle: head lands in front of the hands.'],
    steps: [
      reps('Pike push-up', 3, 8, [2, 3], ['Hips high, legs straight', 'Head lowers ahead of the hands']),
      reps('Pike push-up volume', 3, 12, [2, 4], ['Full range to the floor']),
      reps('Elevated pike push-up', 3, 8, [2, 4], ['Feet on a box, hips over shoulders', 'Aim for a vertical torso']),
    ],
  },
  {
    id: 'hspu', name: 'Handstand Push-Up (Wall)', family: 'push', tier: 2,
    summary: 'Full bodyweight overhead press against a wall.',
    why: 'Top-tier vertical pushing strength and the gateway to freestanding presses.',
    muscles: ['Shoulders', 'Triceps', 'Traps'], equipment: ['Wall', 'Pad for the head'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'pike_push_up' }, { skillId: 'wall_handstand', step: 1 }],
    mistakes: ['Arching the lower back', 'Elbows flaring to the sides', 'Crashing onto the head'],
    tips: ['Form a tripod: head in front of the hands at the bottom.', 'Use a stack of pads and remove one each week.'],
    steps: [
      reps('Wall handstand negative', 4, 3, [2, 3], ['Kick up to the wall', 'Lower for 5 seconds to a pad']),
      reps('Partial wall HSPU', 4, 5, [2, 4], ['Press from a raised pad', 'Lower the pad height over time']),
      reps('Full wall HSPU', 3, 5, [3, 6], ['Head touches the floor softly', 'Full lockout at the top']),
      reps('Wall HSPU volume', 3, 10, [4, 8], ['Keep hands 20–30 cm from the wall']),
    ],
  },
  {
    id: 'free_hspu', name: 'Freestanding Handstand Push-Up', family: 'push', tier: 4,
    summary: 'Handstand push-up with no wall, combining strength and balance.',
    why: 'A true elite skill that demands pressing power and constant balance corrections.',
    muscles: ['Shoulders', 'Triceps', 'Core', 'Forearms'], equipment: ['Floor or parallettes'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'hspu' }, { skillId: 'free_handstand' }],
    mistakes: ['Losing balance at the bottom', 'Rushing the descent'],
    tips: ['Practise fresh, early in the session, with full rest.'],
    steps: [
      reps('Freestanding negative', 5, 2, [4, 8], ['Hold a freestanding handstand', 'Lower as slowly as possible']),
      reps('Half-range freestanding HSPU', 5, 3, [4, 8], ['Press from halfway down']),
      reps('Freestanding HSPU', 5, 1, [6, 12], ['Full range with balance held']),
      reps('Freestanding HSPU sets', 4, 5, [8, 16], ['Consistent line every rep']),
    ],
  },
  {
    id: 'archer_push_up', name: 'Archer Push-Up', family: 'push', tier: 2,
    summary: 'Uneven push-up that shifts weight to one arm.',
    why: 'Bridges regular push-ups and the one-arm push-up.',
    muscles: ['Chest', 'Triceps', 'Shoulders'], equipment: ['None'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'push_up' }],
    mistakes: ['Bending the straight arm', 'Rotating the hips'],
    tips: ['Keep the assisting arm straight and use it as little as possible.'],
    steps: [
      reps('Wide push-up', 3, 12, [1, 2], ['Hands twice shoulder-width']),
      reps('Partial archer push-up', 3, 5, [2, 3], ['Shift toward one hand, half range'], { perSide: true }),
      reps('Archer push-up', 3, 8, [3, 6], ['Chest to the working hand, other arm straight'], { perSide: true }),
    ],
  },
  {
    id: 'one_arm_push_up', name: 'One-Arm Push-Up', family: 'push', tier: 3,
    summary: 'Push-up on a single arm with feet wide for balance.',
    why: 'Extreme unilateral pushing strength and anti-rotation core control.',
    muscles: ['Chest', 'Triceps', 'Obliques'], equipment: ['None', 'Bench for incline'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'archer_push_up' }],
    mistakes: ['Twisting the torso open', 'Feet too close together'],
    tips: ['Feet wider than shoulders, squeeze the glutes hard.'],
    steps: [
      reps('Incline one-arm push-up', 3, 6, [2, 4], ['Hand on a bench, lower the incline weekly'], { perSide: true }),
      reps('One-arm negative', 3, 3, [2, 4], ['5 second lowering on one arm'], { perSide: true }),
      reps('One-arm push-up', 3, 3, [4, 8], ['Chest to fist height, no rotation'], { perSide: true }),
      reps('One-arm push-up volume', 3, 8, [6, 12], ['Same form on both sides'], { perSide: true }),
    ],
  },
  {
    id: 'pseudo_planche_push_up', name: 'Pseudo Planche Push-Up', family: 'push', tier: 2,
    summary: 'Push-up with hands by the hips and a forward lean.',
    why: 'Trains straight-arm strength and the lean needed for the planche.',
    muscles: ['Front delts', 'Chest', 'Biceps tendons', 'Wrists'], equipment: ['None', 'Parallettes (optional)'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'push_up' }],
    mistakes: ['Losing the lean at the bottom', 'Shoulders shrugging up'],
    tips: ['Fingers turned out and push the floor away (protraction).'],
    steps: [
      hold('Planche lean', 3, 20, [2, 3], ['Shoulders past the hands, arms locked', 'Round the upper back slightly']),
      reps('Pseudo planche push-up', 3, 6, [2, 4], ['Keep the lean through every rep']),
      reps('Deep-lean PPPU', 3, 10, [3, 6], ['Hands by the hips, lean further each week']),
    ],
  },
  {
    id: 'ring_dips', name: 'Ring Dip', family: 'push', tier: 2,
    summary: 'Dips on unstable gymnastic rings.',
    why: 'Stabilising the rings builds joint strength needed for ring muscle-ups and support skills.',
    muscles: ['Triceps', 'Chest', 'Shoulder stabilisers'], equipment: ['Gymnastic rings'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'dips', step: 4 }],
    mistakes: ['Rings drifting wide', 'Skipping the turned-out support'],
    tips: ['Turn the rings out slightly at the top of every rep.'],
    steps: [
      hold('Ring support hold', 3, 30, [1, 3], ['Rings close to the body, arms locked']),
      reps('Ring dip negative', 3, 5, [2, 3], ['5 second descent']),
      reps('Ring dip', 3, 8, [3, 6], ['Full depth and turn-out lockout']),
      reps('Ring dip volume', 3, 12, [4, 8], ['No swinging']),
    ],
  },
  {
    id: 'planche', name: 'Planche', family: 'push', tier: 3,
    summary: 'Body held horizontal above the floor on straight arms.',
    why: 'The most iconic straight-arm pushing skill in calisthenics.',
    muscles: ['Front delts', 'Serratus', 'Core', 'Wrists'], equipment: ['Floor or parallettes'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'pseudo_planche_push_up' }, { skillId: 'crow' }],
    mistakes: ['Bent elbows', 'Hips lower than the shoulders', 'Training through wrist or elbow pain'],
    tips: ['Straight-arm tendons adapt slowly: keep weekly volume steady and add time in small jumps.', 'Warm wrists and elbows thoroughly before every session.'],
    steps: [
      hold('Frog stand', 3, 30, [1, 2], ['Knees on the backs of the elbows']),
      hold('Tuck planche', 5, 10, [4, 8], ['Arms straight, knees to chest, hips level with shoulders']),
      hold('Advanced tuck planche', 5, 10, [6, 12], ['Flat back, knees away from the chest']),
      hold('Straddle planche', 5, 6, [12, 24], ['Legs wide and straight, hips level']),
      hold('Full planche', 5, 5, [16, 40], ['Legs together, body a straight plank']),
    ],
  },
  {
    id: 'planche_push_up', name: 'Planche Push-Up', family: 'push', tier: 4,
    summary: 'Pressing in and out of a planche.',
    why: 'Among the hardest pushing movements performed without equipment.',
    muscles: ['Front delts', 'Chest', 'Triceps', 'Core'], equipment: ['Parallettes'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'planche', step: 3 }],
    mistakes: ['Losing hip height at the bottom'],
    tips: ['Master each progression as a hold before pressing in it.'],
    steps: [
      reps('Tuck planche push-up', 4, 5, [4, 8], ['Hips stay up as you lower']),
      reps('Straddle planche push-up', 4, 3, [8, 16], ['Straight legs, controlled range']),
      reps('Full planche push-up', 4, 3, [12, 30], ['Full lockout into the planche']),
    ],
  },
  {
    id: 'maltese', name: 'Maltese', family: 'push', tier: 4,
    summary: 'A planche with arms spread wide, body near the floor.',
    why: 'An elite straight-arm skill requiring enormous shoulder and bicep tendon strength.',
    muscles: ['Front delts', 'Chest', 'Biceps', 'Core'], equipment: ['Parallettes or rings'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'planche' }],
    mistakes: ['Progressing hand width too fast'],
    tips: ['Widen your hands a few centimetres at a time.'],
    steps: [
      hold('Wide-hand planche lean', 4, 20, [4, 8], ['Hands wider than shoulders, fingers out']),
      hold('Wide straddle planche', 5, 5, [12, 24], ['Hands wide, legs straddled']),
      hold('Maltese', 5, 3, [24, 52], ['Arms wide, body parallel and low']),
    ],
  },

  // ─── PULL ───────────────────────────────────────────────────
  {
    id: 'dead_hang', name: 'Dead Hang & Scap Pulls', family: 'pull', tier: 0,
    summary: 'Grip, shoulder health and the start of every pulling skill.',
    why: 'Most pulling problems come from weak grip and passive shoulders. Fix them here.',
    muscles: ['Forearms', 'Lats', 'Lower traps'], equipment: ['Pull-up bar'], daysPerWeek: 3, prerequisites: [],
    mistakes: ['Kipping or swinging', 'Using bent arms'],
    tips: ['Wrap the thumb around the bar for a secure grip.'],
    steps: [
      hold('Dead hang', 3, 20, [1, 2], ['Arms straight, relax into the stretch'], { test: { metric: 'deadHangSec', min: 20 } }),
      hold('Active hang', 3, 20, [1, 2], ['Pull shoulders down away from the ears'], { test: { metric: 'deadHangSec', min: 30 } }),
      reps('Scapular pull-up', 3, 10, [1, 3], ['Straight arms, lift the body using shoulder blades only'], { test: { metric: 'pullups', min: 1 } }),
      hold('Long dead hang', 3, 60, [2, 4], ['Stay still and breathe'], { test: { metric: 'deadHangSec', min: 60 } }),
    ],
  },
  {
    id: 'rows', name: 'Bodyweight Row', family: 'pull', tier: 0,
    summary: 'Horizontal pulling that builds the back for pull-ups and levers.',
    why: 'The easiest way to learn to pull with your back and a strong base for front lever.',
    muscles: ['Upper back', 'Lats', 'Biceps', 'Rear delts'], equipment: ['Low bar, table edge or rings'], daysPerWeek: 3, prerequisites: [],
    mistakes: ['Hips sagging', 'Leading with the chin'],
    tips: ['Squeeze shoulder blades together at the top of every rep.'],
    steps: [
      reps('Incline row', 3, 12, [1, 2], ['Body angled up, pull chest to the bar'], { test: { metric: 'pullups', min: 1 } }),
      reps('Horizontal row', 3, 10, [2, 3], ['Body nearly parallel to the floor'], { test: { metric: 'pullups', min: 4 } }),
      reps('Feet-elevated row', 3, 10, [2, 4], ['Feet on a box, body straight'], { test: { metric: 'pullups', min: 8 } }),
      reps('Archer row', 3, 6, [3, 6], ['Pull toward one hand, other arm straight'], { perSide: true, test: { metric: 'pullups', min: 12 } }),
    ],
  },
  {
    id: 'pull_up', name: 'Pull-Up', family: 'pull', tier: 1,
    summary: 'The most important upper-body pulling exercise.',
    why: 'Muscle-ups, front lever and one-arm pull-ups all start here.',
    muscles: ['Lats', 'Biceps', 'Upper back', 'Forearms'], equipment: ['Pull-up bar', 'Resistance band (optional)'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'dead_hang', step: 1 }, { skillId: 'rows', step: 1 }],
    mistakes: ['Half reps', 'Kipping', 'Shoulders shrugging at the top'],
    tips: ['Pull elbows down to your back pockets.', 'Chin clears the bar and arms straighten fully at the bottom.'],
    steps: [
      reps('Negative pull-up', 4, 3, [1, 3], ['Jump to the top, lower for 5 seconds']),
      reps('Band-assisted pull-up', 3, 6, [2, 4], ['Use the lightest band that allows full reps'], { test: { metric: 'pullups', min: 1 } }),
      reps('Pull-up', 3, 3, [2, 4], ['Dead hang to chin over bar'], { test: { metric: 'pullups', min: 4 } }),
      reps('Pull-up sets', 3, 6, [3, 6], ['No swinging'], { test: { metric: 'pullups', min: 8 } }),
      reps('Pull-up volume', 3, 10, [4, 8], ['Consistent full range'], { test: { metric: 'pullups', min: 12 } }),
    ],
  },
  {
    id: 'chin_up', name: 'Chin-Up', family: 'pull', tier: 1,
    summary: 'Underhand pull-up with more biceps involvement.',
    why: 'Builds elbow flexor strength useful for the one-arm pull-up and levers.',
    muscles: ['Biceps', 'Lats', 'Upper back'], equipment: ['Pull-up bar'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'dead_hang', step: 1 }],
    mistakes: ['Not straightening the arms at the bottom'],
    tips: ['Hands shoulder-width, palms facing you.'],
    steps: [
      reps('Negative chin-up', 4, 3, [1, 2], ['5 second lowering']),
      reps('Chin-up', 3, 5, [2, 4], ['Chin over the bar'], { test: { metric: 'pullups', min: 5 } }),
      reps('Chin-up volume', 3, 10, [3, 6], ['Full range every rep'], { test: { metric: 'pullups', min: 12 } }),
    ],
  },
  {
    id: 'l_sit_pull_up', name: 'L-Sit Pull-Up', family: 'pull', tier: 2,
    summary: 'Pull-up while holding the legs in an L.',
    why: 'Removes momentum and trains compression under load.',
    muscles: ['Lats', 'Hip flexors', 'Abs', 'Biceps'], equipment: ['Pull-up bar'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'pull_up', step: 3 }, { skillId: 'l_sit', step: 1 }],
    mistakes: ['Legs dropping as you pull'],
    tips: ['Start tucked, extend the legs when strong enough.'],
    steps: [
      reps('Tuck L pull-up', 3, 6, [2, 3], ['Knees held at hip height']),
      reps('L-sit pull-up', 3, 5, [3, 6], ['Straight legs parallel to the floor']),
      reps('L-sit pull-up volume', 3, 10, [4, 8], ['Legs never drop']),
    ],
  },
  {
    id: 'archer_pull_up', name: 'Archer Pull-Up', family: 'pull', tier: 2,
    summary: 'Wide pull-up pulling toward one hand.',
    why: 'The main stepping stone to the one-arm pull-up.',
    muscles: ['Lats', 'Biceps', 'Upper back'], equipment: ['Pull-up bar'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'pull_up' }],
    mistakes: ['Bending the assisting arm too much'],
    tips: ['Keep the assisting arm as straight as possible.'],
    steps: [
      reps('Wide pull-up', 3, 8, [2, 3], ['Hands 1.5× shoulder-width']),
      reps('Typewriter pull-up', 3, 4, [2, 4], ['Pull up, slide side to side at the top'], { perSide: true }),
      reps('Archer pull-up', 3, 5, [3, 6], ['Chin to the working hand'], { perSide: true }),
    ],
  },
  {
    id: 'one_arm_pull_up', name: 'One-Arm Pull-Up', family: 'pull', tier: 4,
    summary: 'A full pull-up on a single arm.',
    why: 'The ultimate pulling strength feat in calisthenics.',
    muscles: ['Lats', 'Biceps', 'Forearms', 'Core'], equipment: ['Pull-up bar', 'Towel or band'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'archer_pull_up' }],
    mistakes: ['Rotating wildly', 'Training too often; elbows need recovery'],
    tips: ['Keep total weekly volume low and quality high.'],
    steps: [
      hold('One-arm flexed hang', 4, 10, [3, 6], ['Chin above the bar on one arm'], { perSide: true }),
      reps('Towel-assisted one-arm pull-up', 4, 3, [4, 8], ['Assisting hand low on a towel'], { perSide: true }),
      reps('One-arm negative', 4, 2, [4, 8], ['5+ second descent'], { perSide: true }),
      reps('One-arm pull-up', 3, 1, [8, 20], ['Dead hang to chin over bar'], { perSide: true }),
      reps('One-arm pull-up sets', 3, 3, [8, 20], ['Clean reps both sides'], { perSide: true }),
    ],
  },
  {
    id: 'muscle_up', name: 'Bar Muscle-Up', family: 'pull', tier: 2,
    summary: 'Pull above the bar and press to support in one motion.',
    why: 'The signature calisthenics skill combining explosive pulling and pushing.',
    muscles: ['Lats', 'Chest', 'Triceps', 'Forearms'], equipment: ['Pull-up bar', 'Band (optional)'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'pull_up', step: 4 }, { skillId: 'dips', step: 3 }],
    mistakes: ['Pulling straight up instead of up and back', 'Chicken-winging one arm over'],
    tips: ['Pull the bar to your lower chest and lean over it fast.'],
    steps: [
      reps('Chest-to-bar pull-up', 4, 5, [2, 4], ['Explosive pull to the lower chest']),
      reps('Straight bar dip', 3, 10, [1, 3], ['Support on top of the bar, dip down and press']),
      reps('Low-bar transition', 4, 5, [2, 3], ['Feet on the floor, practise rolling over the bar']),
      reps('Band-assisted muscle-up', 4, 3, [2, 4], ['Full movement with a band']),
      reps('Muscle-up', 5, 1, [2, 6], ['Controlled rep from a dead hang']),
      reps('Muscle-up sets', 3, 5, [4, 8], ['No kipping']),
    ],
  },
  {
    id: 'ring_muscle_up', name: 'Ring Muscle-Up', family: 'pull', tier: 3,
    summary: 'Muscle-up on rings using a false grip.',
    why: 'Harder than the bar version and a staple of ring strength.',
    muscles: ['Lats', 'Chest', 'Triceps', 'Forearms'], equipment: ['Gymnastic rings'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'muscle_up', step: 4 }, { skillId: 'ring_dips', step: 2 }],
    mistakes: ['Losing the false grip', 'Rings drifting apart during the transition'],
    tips: ['Keep the rings close to the ribs through the transition.'],
    steps: [
      hold('False grip hang', 3, 20, [2, 3], ['Wrist over the ring, palm heel on top']),
      reps('False grip row', 3, 8, [2, 3], ['Keep the false grip throughout']),
      reps('Ring transition drill', 4, 5, [2, 4], ['Low rings, feet on floor']),
      reps('Ring muscle-up', 5, 1, [3, 8], ['Strict, false grip']),
      reps('Ring muscle-up sets', 3, 3, [4, 8], ['Smooth transition']),
    ],
  },
  {
    id: 'front_lever', name: 'Front Lever', family: 'pull', tier: 3,
    summary: 'Body held horizontal under the bar, face up.',
    why: 'The benchmark of straight-arm pulling and core strength.',
    muscles: ['Lats', 'Core', 'Rear delts', 'Forearms'], equipment: ['Pull-up bar or rings'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'pull_up', step: 3 }, { skillId: 'hollow_body', step: 2 }],
    mistakes: ['Bending the arms', 'Hips dropping below the shoulders'],
    tips: ['Push the bar down toward the hips with straight arms.', 'Add front lever rows in the same progression for strength.'],
    steps: [
      hold('Tuck front lever', 5, 10, [3, 6], ['Knees to chest, back flat and horizontal']),
      hold('Advanced tuck front lever', 5, 10, [4, 8], ['Flat back, knees away from chest']),
      hold('One-leg front lever', 5, 8, [4, 8], ['One leg straight, switch each set'], { perSide: true }),
      hold('Straddle front lever', 5, 6, [6, 12], ['Legs wide and straight']),
      hold('Full front lever', 5, 5, [8, 20], ['Legs together, straight line']),
      hold('Front lever mastery', 3, 10, [8, 16], ['Rock-solid horizontal line']),
    ],
  },
  {
    id: 'back_lever', name: 'Back Lever', family: 'pull', tier: 2,
    summary: 'Body held horizontal under the bar, face down.',
    why: 'Builds shoulder extension strength and prepares for the planche and front lever.',
    muscles: ['Shoulders', 'Biceps', 'Chest', 'Core'], equipment: ['Rings or pull-up bar'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'pull_up', step: 2 }],
    mistakes: ['Rushing into German hang depth', 'Bent arms'],
    tips: ['Build shoulder extension range slowly because it is a common injury spot.'],
    steps: [
      hold('German hang', 3, 15, [2, 3], ['Hang with arms behind you, relax the shoulders']),
      reps('Skin the cat', 3, 3, [2, 3], ['Slow and controlled through the full range']),
      hold('Tuck back lever', 5, 10, [2, 4], ['Hips at shoulder height, back horizontal']),
      hold('Advanced tuck back lever', 5, 10, [3, 6], ['Open the hips, flat back']),
      hold('Straddle back lever', 5, 8, [4, 8], ['Legs wide and straight']),
      hold('Full back lever', 5, 8, [4, 10], ['Straight line, legs together']),
    ],
  },

  // ─── CORE ───────────────────────────────────────────────────
  {
    id: 'hollow_body', name: 'Hollow Body Hold', family: 'core', tier: 0,
    summary: 'The gymnastic body position behind almost every skill.',
    why: 'Teaches full-body tension used in handstands, levers and planche.',
    muscles: ['Abs', 'Hip flexors', 'Obliques'], equipment: ['None'], daysPerWeek: 4, prerequisites: [],
    mistakes: ['Lower back lifting off the floor', 'Holding the breath'],
    tips: ['Press the lower back into the floor. If it lifts, bend the knees.'],
    steps: [
      reps('Dead bug', 3, 10, [1, 2], ['Lower back glued to the floor'], { perSide: true }),
      hold('Tuck hollow hold', 3, 20, [1, 2], ['Knees bent, shoulders off the floor'], { test: { metric: 'hollowSec', min: 15 } }),
      hold('Hollow hold', 3, 30, [2, 4], ['Arms overhead, legs straight and low'], { test: { metric: 'hollowSec', min: 30 } }),
      reps('Hollow rocks', 3, 15, [2, 3], ['Keep the shape as you rock']),
      hold('Long hollow hold', 3, 60, [3, 6], ['Breathe calmly'], { test: { metric: 'hollowSec', min: 60 } }),
    ],
  },
  {
    id: 'plank', name: 'Plank & Side Plank', family: 'core', tier: 0,
    summary: 'Anti-extension and anti-rotation core stability.',
    why: 'A stable trunk protects the spine and transfers force in every exercise.',
    muscles: ['Abs', 'Obliques', 'Glutes'], equipment: ['None'], daysPerWeek: 3, prerequisites: [],
    mistakes: ['Hips too high or sagging'],
    tips: ['Squeeze glutes and pull elbows toward toes.'],
    steps: [
      hold('Forearm plank', 3, 30, [1, 2], ['Straight line from head to heels'], { test: { metric: 'hollowSec', min: 20 } }),
      hold('Side plank', 3, 30, [1, 3], ['Hips high, body stacked'], { perSide: true }),
      hold('Long plank', 3, 60, [2, 4], ['No sagging'], { test: { metric: 'hollowSec', min: 45 } }),
    ],
  },
  {
    id: 'leg_raises', name: 'Hanging Leg Raise', family: 'core', tier: 1,
    summary: 'Hanging core work from knee raises to toes-to-bar.',
    why: 'Builds the compression strength needed for L-sits and levers.',
    muscles: ['Abs', 'Hip flexors', 'Grip'], equipment: ['Pull-up bar'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'dead_hang', step: 1 }],
    mistakes: ['Swinging for momentum', 'Only lifting the legs, not curling the pelvis'],
    tips: ['Curl the pelvis up at the top of each rep.'],
    steps: [
      reps('Lying leg raise', 3, 12, [1, 2], ['Lower back pressed down']),
      reps('Hanging knee raise', 3, 10, [1, 3], ['Knees to chest, no swing']),
      reps('Hanging leg raise', 3, 8, [2, 4], ['Straight legs to hip height or higher']),
      reps('Toes-to-bar', 3, 8, [3, 6], ['Touch the bar with the toes, control the descent']),
    ],
  },
  {
    id: 'l_sit', name: 'L-Sit', family: 'core', tier: 1,
    summary: 'Support on the hands with legs straight in front.',
    why: 'Combines shoulder depression, compression and core strength.',
    muscles: ['Abs', 'Hip flexors', 'Triceps', 'Lats'], equipment: ['Floor, parallettes or dip bars'], daysPerWeek: 4,
    prerequisites: [{ skillId: 'hollow_body', step: 1 }],
    mistakes: ['Shoulders shrugging', 'Bent knees in the full L'],
    tips: ['Push the ground away hard and point the toes.'],
    steps: [
      hold('Foot-supported L-sit', 3, 15, [1, 2], ['Heels on the floor, hips lifted']),
      hold('Tuck L-sit', 3, 15, [1, 3], ['Knees to chest, shoulders pushed down'], { test: { metric: 'lsitSec', min: 5 } }),
      hold('One-leg L-sit', 3, 10, [2, 3], ['One leg straight, switch sides'], { perSide: true, test: { metric: 'lsitSec', min: 8 } }),
      hold('L-sit', 3, 10, [2, 4], ['Both legs straight and parallel to the floor'], { test: { metric: 'lsitSec', min: 12 } }),
      hold('Long L-sit', 3, 30, [4, 8], ['Toes pointed, shoulders down'], { test: { metric: 'lsitSec', min: 30 } }),
    ],
  },
  {
    id: 'v_sit', name: 'V-Sit', family: 'core', tier: 3,
    summary: 'An L-sit with the legs lifted high toward the face.',
    why: 'Elite compression strength and the step before the manna.',
    muscles: ['Abs', 'Hip flexors', 'Shoulders', 'Hamstring flexibility'], equipment: ['Floor or parallettes'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'l_sit' }, { skillId: 'pike_compression', step: 1 }],
    mistakes: ['Leaning back instead of lifting the legs'],
    tips: ['Train pike compression every session.'],
    steps: [
      hold('High L-sit', 5, 10, [3, 6], ['Legs lifted above parallel']),
      hold('45° V-sit', 5, 5, [4, 8], ['Legs at 45°, hands pushing down']),
      hold('V-sit', 5, 5, [6, 12], ['Legs near vertical']),
    ],
  },
  {
    id: 'manna', name: 'Manna', family: 'core', tier: 4,
    summary: 'Hips pressed behind the hands, legs lifted in front.',
    why: 'One of the rarest static skills, demanding shoulder extension and compression.',
    muscles: ['Shoulders', 'Triceps', 'Abs', 'Hip flexors'], equipment: ['Parallettes'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'v_sit' }],
    mistakes: ['Neglecting shoulder extension mobility'],
    tips: ['Stretch shoulder extension (German hang) daily.'],
    steps: [
      hold('Deep V-sit', 5, 5, [6, 12], ['Legs past vertical']),
      hold('Manna attempt', 5, 3, [12, 24], ['Hips behind the hands']),
      hold('Manna', 5, 3, [16, 40], ['Legs pointed up and back']),
    ],
  },
  {
    id: 'dragon_flag', name: 'Dragon Flag', family: 'core', tier: 2,
    summary: 'Bruce Lee\'s famous rigid-body core exercise.',
    why: 'Trains full-body tension and eccentric core strength.',
    muscles: ['Abs', 'Obliques', 'Lats'], equipment: ['Bench'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'hollow_body', step: 2 }, { skillId: 'leg_raises', step: 2 }],
    mistakes: ['Bending at the hips', 'Resting weight on the neck'],
    tips: ['Support on the upper back, grip the bench behind your head.'],
    steps: [
      reps('Tuck dragon flag negative', 3, 5, [2, 3], ['Lower slowly with knees tucked']),
      reps('Straddle dragon flag negative', 3, 5, [2, 4], ['Legs wide, body straight']),
      reps('Dragon flag negative', 3, 5, [2, 4], ['Straight body, 5 second descent']),
      reps('Dragon flag', 3, 5, [3, 6], ['Lower and raise with a straight body']),
    ],
  },
  {
    id: 'human_flag', name: 'Human Flag', family: 'core', tier: 3,
    summary: 'Body held horizontally sideways from a vertical pole.',
    why: 'An iconic show of lateral chain and shoulder strength.',
    muscles: ['Obliques', 'Lats', 'Shoulders'], equipment: ['Vertical pole or stall bars'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'pull_up', step: 3 }, { skillId: 'plank', step: 1 }],
    mistakes: ['Bent bottom arm', 'Hips sagging'],
    tips: ['Push hard with the bottom arm, pull with the top arm.'],
    steps: [
      hold('Vertical flag', 3, 10, [1, 3], ['Body vertical, arms locked']),
      hold('Tuck human flag', 5, 5, [3, 6], ['Knees tucked, torso horizontal']),
      hold('Straddle human flag', 5, 5, [4, 8], ['Legs wide and straight']),
      hold('Full human flag', 5, 5, [6, 16], ['Legs together, parallel to the floor']),
    ],
  },
  {
    id: 'ab_wheel', name: 'Ab Wheel Rollout', family: 'core', tier: 1,
    summary: 'Anti-extension rollouts from the knees to standing.',
    why: 'Builds the core strength needed for front lever and handstands.',
    muscles: ['Abs', 'Lats', 'Shoulders'], equipment: ['Ab wheel'], daysPerWeek: 2, prerequisites: [{ skillId: 'plank', step: 0 }],
    mistakes: ['Lower back arching'],
    tips: ['Keep the hips tucked under throughout.'],
    steps: [
      reps('Kneeling partial rollout', 3, 10, [1, 2], ['Roll out only as far as you control']),
      reps('Kneeling full rollout', 3, 10, [2, 4], ['Arms overhead, flat back']),
      reps('Standing rollout negative', 3, 5, [3, 6], ['Roll out from standing, drop to knees to return']),
      reps('Standing rollout', 3, 5, [4, 10], ['Full range from the feet']),
    ],
  },
  {
    id: 'windshield_wipers', name: 'Windshield Wipers', family: 'core', tier: 2,
    summary: 'Rotational leg sweeps while hanging.',
    why: 'Strengthens the obliques in a hanging position for flags and levers.',
    muscles: ['Obliques', 'Abs', 'Grip'], equipment: ['Pull-up bar'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'leg_raises', step: 3 }],
    mistakes: ['Swinging the body'],
    tips: ['Keep the legs at the bar and rotate slowly.'],
    steps: [
      reps('Lying windshield wiper', 3, 8, [1, 2], ['Shoulders flat on the floor'], { perSide: true }),
      reps('Hanging bent-knee wiper', 3, 6, [2, 3], ['Knees to chest, rotate side to side'], { perSide: true }),
      reps('Hanging windshield wiper', 3, 6, [3, 6], ['Straight legs up at the bar'], { perSide: true }),
    ],
  },

  // ─── LEGS ───────────────────────────────────────────────────
  {
    id: 'squat', name: 'Bodyweight Squat', family: 'legs', tier: 0,
    summary: 'The foundation of leg strength and mobility.',
    why: 'Healthy knees and hips support everything else you train.',
    muscles: ['Quads', 'Glutes', 'Hamstrings'], equipment: ['None'], daysPerWeek: 3, prerequisites: [],
    mistakes: ['Knees collapsing inward', 'Heels lifting'],
    tips: ['Sit between your heels, knees follow the toes.'],
    steps: [
      reps('Box squat', 3, 10, [1, 2], ['Sit to a chair and stand up'], { test: { metric: 'squats', min: 10 } }),
      reps('Bodyweight squat', 3, 15, [1, 2], ['Hips below knee level'], { test: { metric: 'squats', min: 20 } }),
      reps('Squat endurance', 3, 25, [2, 4], ['Steady tempo, full depth'], { test: { metric: 'squats', min: 40 } }),
      reps('Jump squat', 3, 12, [2, 4], ['Land softly into the next rep'], { test: { metric: 'squats', min: 60 } }),
    ],
  },
  {
    id: 'lunges', name: 'Lunge & Split Squat', family: 'legs', tier: 0,
    summary: 'Single-leg strength and balance.',
    why: 'Corrects left-right imbalances and prepares for pistol squats.',
    muscles: ['Quads', 'Glutes', 'Adductors'], equipment: ['None', 'Bench'], daysPerWeek: 2, prerequisites: [],
    mistakes: ['Front knee caving in', 'Short strides'],
    tips: ['Keep the torso tall and drop the back knee straight down.'],
    steps: [
      reps('Split squat', 3, 10, [1, 2], ['Back knee lowers toward the floor'], { perSide: true }),
      reps('Walking lunge', 3, 12, [1, 3], ['Long, controlled steps'], { perSide: true }),
      reps('Bulgarian split squat', 3, 10, [2, 4], ['Back foot on a bench'], { perSide: true }),
    ],
  },
  {
    id: 'pistol_squat', name: 'Pistol Squat', family: 'legs', tier: 2,
    summary: 'A full squat on one leg with the other held out straight.',
    why: 'The benchmark of single-leg strength, balance and mobility.',
    muscles: ['Quads', 'Glutes', 'Ankles', 'Core'], equipment: ['Box (optional)'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'squat', step: 2 }, { skillId: 'lunges', step: 2 }],
    mistakes: ['Heel lifting', 'Collapsing at the bottom'],
    tips: ['Hold a small weight in front for balance while learning.'],
    steps: [
      reps('Box pistol', 3, 6, [2, 3], ['Sit to a box on one leg'], { perSide: true }),
      reps('Assisted pistol', 3, 6, [2, 4], ['Hold a pole or door frame lightly'], { perSide: true }),
      reps('Pistol negative', 3, 5, [2, 4], ['Lower for 4 seconds, stand with help'], { perSide: true }),
      reps('Pistol squat', 3, 5, [3, 6], ['Full depth, heel down'], { perSide: true }),
    ],
  },
  {
    id: 'shrimp_squat', name: 'Shrimp Squat', family: 'legs', tier: 2,
    summary: 'Single-leg squat holding the back foot behind you.',
    why: 'Quad-dominant strength that complements the pistol.',
    muscles: ['Quads', 'Glutes'], equipment: ['None'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'lunges', step: 2 }],
    mistakes: ['Slamming the knee down'],
    tips: ['Put a pad under the back knee.'],
    steps: [
      reps('Assisted shrimp squat', 3, 6, [1, 3], ['Hold a support, knee to pad'], { perSide: true }),
      reps('Shrimp squat', 3, 5, [2, 4], ['Hold the back foot, knee kisses the floor'], { perSide: true }),
      reps('Shrimp squat volume', 3, 10, [3, 6], ['Controlled tempo'], { perSide: true }),
    ],
  },
  {
    id: 'nordic_curl', name: 'Nordic Curl', family: 'legs', tier: 3,
    summary: 'Kneeling hamstring curl lowering the body forward.',
    why: 'The best bodyweight hamstring exercise and a proven injury preventer.',
    muscles: ['Hamstrings', 'Glutes', 'Calves'], equipment: ['Anchor for the heels'], daysPerWeek: 2,
    prerequisites: [{ skillId: 'squat', step: 1 }],
    mistakes: ['Bending at the hips'],
    tips: ['Keep hips extended and fall as slowly as possible.'],
    steps: [
      reps('Band-assisted Nordic negative', 3, 5, [2, 4], ['Band around the chest for help']),
      reps('Nordic negative', 3, 5, [3, 6], ['Lower as slowly as possible, catch with hands']),
      reps('Nordic curl', 3, 5, [6, 12], ['Lower and pull back up']),
    ],
  },

  // ─── BALANCE ────────────────────────────────────────────────
  {
    id: 'crow', name: 'Crow Pose', family: 'balance', tier: 1,
    summary: 'Balance on the hands with knees on the arms.',
    why: 'The first hand balance and the entry to planche and handstands.',
    muscles: ['Wrists', 'Shoulders', 'Core'], equipment: ['None'], daysPerWeek: 4,
    prerequisites: [{ skillId: 'wrist_prep', step: 1 }],
    mistakes: ['Looking down at the hands', 'Not leaning far enough'],
    tips: ['Look slightly forward and put a pillow in front of you.'],
    steps: [
      hold('Frog stand', 3, 15, [1, 2], ['Knees on elbows, lean until feet float']),
      hold('Crow pose', 3, 20, [1, 3], ['Knees high on the upper arms, arms straighter']),
      hold('Long crow', 3, 45, [2, 4], ['Calm, steady balance']),
    ],
  },
  {
    id: 'headstand', name: 'Headstand', family: 'balance', tier: 1,
    summary: 'Tripod balance on the head and hands.',
    why: 'Builds comfort being upside down before handstands.',
    muscles: ['Shoulders', 'Core', 'Neck'], equipment: ['Pad or mat'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'crow', step: 0 }],
    mistakes: ['All the weight on the head', 'Kicking up too hard'],
    tips: ['Most of the weight goes through the hands.'],
    steps: [
      hold('Tripod tuck headstand', 3, 20, [1, 2], ['Knees on elbows, head and hands form a triangle']),
      hold('Headstand', 3, 30, [2, 3], ['Legs straight up, core tight']),
      hold('Long headstand', 3, 60, [2, 4], ['Stay relaxed']),
    ],
  },
  {
    id: 'wall_handstand', name: 'Wall Handstand', family: 'balance', tier: 1,
    summary: 'Straight-line handstand supported by a wall.',
    why: 'Builds the shoulder strength and body line needed for every handstand skill.',
    muscles: ['Shoulders', 'Traps', 'Core', 'Wrists'], equipment: ['Wall'], daysPerWeek: 5,
    prerequisites: [{ skillId: 'pike_push_up', step: 0 }, { skillId: 'wrist_prep', step: 1 }],
    mistakes: ['Banana back', 'Bent elbows', 'Shoulders not pushing tall'],
    tips: ['Chest facing the wall teaches the best line.', 'Push the floor away and squeeze the legs together.'],
    steps: [
      hold('Pike hold on a box', 3, 20, [1, 2], ['Hips over the shoulders, arms by ears'], { test: { metric: 'wallHandstandSec', min: 5 } }),
      hold('Chest-to-wall handstand', 3, 20, [1, 3], ['Walk up the wall, hands close to it'], { test: { metric: 'wallHandstandSec', min: 20 } }),
      hold('Long chest-to-wall hold', 3, 45, [2, 4], ['Hollow body, toes pointed'], { test: { metric: 'wallHandstandSec', min: 45 } }),
      reps('Wall shoulder taps', 3, 10, [2, 4], ['Shift weight and tap each shoulder'], { test: { metric: 'wallHandstandSec', min: 60 } }),
    ],
  },
  {
    id: 'free_handstand', name: 'Freestanding Handstand', family: 'balance', tier: 2,
    summary: 'Balance upside down on your hands with no support.',
    why: 'The heart of hand balancing and the base for every advanced balance skill.',
    muscles: ['Shoulders', 'Wrists', 'Core', 'Forearms'], equipment: ['Floor'], daysPerWeek: 5,
    prerequisites: [{ skillId: 'wall_handstand', step: 2 }],
    mistakes: ['Kicking up too hard', 'Balancing with the arms instead of the fingers'],
    tips: ['Correct balance with finger pressure.', 'Practise 10–15 minutes daily when fresh; frequency beats volume.'],
    steps: [
      reps('Heel pulls from the wall', 5, 3, [1, 3], ['Pull heels off the wall and find balance']),
      reps('Kick-up to balance', 5, 5, [2, 4], ['Controlled kick, catch the balance']),
      hold('Freestanding 5 seconds', 5, 5, [2, 6], ['Straight line, fingers working']),
      hold('Freestanding 15 seconds', 5, 15, [3, 8], ['Stay calm and tight']),
      hold('Freestanding 30 seconds', 5, 30, [4, 10], ['Consistent balance']),
      hold('Freestanding 60 seconds', 3, 60, [6, 16], ['Relaxed, locked line']),
    ],
  },
  {
    id: 'handstand_walk', name: 'Handstand Walk', family: 'balance', tier: 3,
    summary: 'Walking on your hands with control.',
    why: 'Dynamic balance that builds shoulder endurance.',
    muscles: ['Shoulders', 'Wrists', 'Core'], equipment: ['Open floor'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'free_handstand', step: 3 }],
    mistakes: ['Falling forward and chasing the balance'],
    tips: ['Take small steps and lead with the shoulders.'],
    steps: [
      reps('Handstand weight shifts', 4, 10, [1, 3], ['Shift from hand to hand']),
      reps('Handstand walk (steps)', 4, 5, [2, 4], ['5 controlled hand steps']),
      reps('Handstand walk (metres)', 4, 10, [3, 6], ['Walk 10 metres']),
    ],
  },
  {
    id: 'press_handstand', name: 'Press to Handstand', family: 'balance', tier: 3,
    summary: 'Lift into a handstand with no kick or jump.',
    why: 'Shows total control of balance, compression and shoulder strength.',
    muscles: ['Shoulders', 'Core', 'Hip flexors', 'Hamstring flexibility'], equipment: ['Floor or blocks'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'free_handstand', step: 3 }, { skillId: 'pike_compression', step: 1 }],
    mistakes: ['Jumping instead of pressing', 'Bent arms'],
    tips: ['Lean the shoulders forward before lifting the hips.'],
    steps: [
      reps('Elevated straddle press', 5, 3, [3, 6], ['Feet on a box, press hips over shoulders']),
      reps('Straddle press negative', 5, 3, [3, 6], ['Lower from handstand slowly']),
      reps('Straddle press', 5, 2, [4, 10], ['Floor to handstand, no jump']),
      reps('Pike press', 5, 2, [6, 16], ['Legs together throughout']),
    ],
  },
  {
    id: 'elbow_lever', name: 'Elbow Lever', family: 'balance', tier: 1,
    summary: 'Horizontal body balanced on the elbows.',
    why: 'An accessible first "planche-like" skill that teaches balance and full-body tension.',
    muscles: ['Wrists', 'Core', 'Shoulders'], equipment: ['Floor or parallettes'], daysPerWeek: 3,
    prerequisites: [{ skillId: 'crow', step: 0 }],
    mistakes: ['Elbows sliding apart', 'Piking the hips'],
    tips: ['Elbows into the hips, fingers pointing back.'],
    steps: [
      hold('Tuck elbow lever', 3, 10, [1, 2], ['Knees tucked, feet off the floor']),
      hold('Elbow lever', 3, 15, [2, 3], ['Body straight and parallel']),
      hold('Long elbow lever', 3, 30, [2, 4], ['Steady balance']),
    ],
  },
  {
    id: 'one_arm_handstand', name: 'One-Arm Handstand', family: 'balance', tier: 4,
    summary: 'A handstand on a single hand.',
    why: 'The pinnacle of hand balancing.',
    muscles: ['Shoulders', 'Wrists', 'Obliques', 'Forearms'], equipment: ['Floor or blocks'], daysPerWeek: 5,
    prerequisites: [{ skillId: 'free_handstand' }],
    mistakes: ['Shifting too fast', 'Hips not stacking over the support hand'],
    tips: ['Spend months on the straddle weight shift before lifting the hand.'],
    steps: [
      hold('Straddle weight shift', 5, 10, [4, 8], ['Straddled legs, shift over one hand'], { perSide: true }),
      hold('Fingertip-assisted one-arm', 5, 10, [6, 12], ['Free hand touches only lightly'], { perSide: true }),
      hold('One-arm handstand', 5, 5, [12, 40], ['Free hand off the floor'], { perSide: true }),
      hold('One-arm handstand mastery', 5, 15, [16, 52], ['Relaxed line both sides'], { perSide: true }),
    ],
  },

  // ─── MOBILITY ───────────────────────────────────────────────
  {
    id: 'wrist_prep', name: 'Wrist Conditioning', family: 'mobility', tier: 0,
    summary: 'Wrist mobility and strength for pain-free hand balancing.',
    why: 'Wrists carry the load in every hand balance and planche. Most beginners get wrist pain without this.',
    muscles: ['Forearms', 'Wrists'], equipment: ['None'], daysPerWeek: 5, prerequisites: [],
    mistakes: ['Skipping it on skill days'],
    tips: ['Do this before every push or balance session.'],
    steps: [
      reps('Wrist circles and rocks', 2, 15, [1, 1], ['Rock forward and back on the palms']),
      hold('Fingertip plank', 3, 20, [1, 3], ['Weight on the fingertips']),
      reps('Wrist push-ups', 3, 10, [2, 4], ['Lift onto the knuckles and back']),
    ],
  },
  {
    id: 'bridge', name: 'Bridge (Wheel)', family: 'mobility', tier: 1,
    summary: 'Back bend supported on hands and feet.',
    why: 'Balances out forward-flexed posture and protects shoulders in overhead work.',
    muscles: ['Spinal erectors', 'Glutes', 'Shoulders'], equipment: ['None'], daysPerWeek: 3, prerequisites: [],
    mistakes: ['Only bending the lower back'],
    tips: ['Push the chest toward the wall behind your hands.'],
    steps: [
      hold('Glute bridge', 3, 30, [1, 2], ['Hips high, squeeze glutes']),
      hold('Table bridge', 3, 20, [1, 2], ['Arms straight, hips up']),
      hold('Full bridge', 3, 20, [2, 6], ['Arms straight, push shoulders over hands']),
      hold('Straight-arm bridge', 3, 30, [4, 10], ['Shoulders stacked over the wrists']),
    ],
  },
  {
    id: 'pike_compression', name: 'Pike Compression', family: 'mobility', tier: 1,
    summary: 'Hamstring flexibility plus the strength to lift legs close to the chest.',
    why: 'Unlocks V-sit, manna and press to handstand.',
    muscles: ['Hip flexors', 'Abs', 'Hamstrings'], equipment: ['None'], daysPerWeek: 4, prerequisites: [],
    mistakes: ['Rounding the lower back instead of hinging at the hips'],
    tips: ['Keep the back flat and hinge from the hips.'],
    steps: [
      hold('Seated pike stretch', 3, 30, [1, 3], ['Reach toward the toes with a flat back']),
      reps('Pike compression lifts', 3, 10, [2, 4], ['Hands by the knees, lift the heels']),
      reps('Pike pulses', 3, 15, [3, 6], ['Chest to knees, small lifts']),
    ],
  },
];

export const SKILLS: CalisthenicsSkill[] = SKILL_INPUTS.map(skill => ({
  ...skill,
  steps: skill.steps.map((step, i) => ({ ...step, id: `${skill.id}_${i}` })),
}));

export const SKILL_BY_ID: Record<string, CalisthenicsSkill> = Object.fromEntries(SKILLS.map(s => [s.id, s]));

export function getSkill(id: string): CalisthenicsSkill | undefined {
  return SKILL_BY_ID[id];
}
