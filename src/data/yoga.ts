import type { Plan } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { BRAND } from '@/lib/brand';

/**
 * Yoga: poses (asanas), pranayama and meditation, plus ready-made plans.
 * Adult plans follow the Ministry of AYUSH Common Yoga Protocol (International Day of Yoga) and the
 * classic 7-pranayama sequence; kids plans follow common paediatric yoga guidance (short holds,
 * play, no forceful breathing or breath retention, no inversions on the head or neck).
 */

export interface YogaLibraryEntry {
  name: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  equipment: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  instructions: string[];
  youtubeSearch: string;
  tags: string[];
}

const pose = (
  name: string, muscleGroup: string, secondaryMuscles: string[], difficulty: YogaLibraryEntry['difficulty'],
  instructions: string[], tags: string[], youtubeSearch = `${name} yoga how to`,
): YogaLibraryEntry => ({ name, muscleGroup, secondaryMuscles, equipment: 'Yoga Mat', difficulty, instructions, youtubeSearch, tags: ['yoga', ...tags] });

const BREATH_WARNING = 'Skip if pregnant, on your period, or with high blood pressure, heart disease, hernia, epilepsy or recent abdominal surgery.';

export const YOGA_LIBRARY: YogaLibraryEntry[] = [
  // ─── Loosening (Sukshma Vyayama / Chalana) ──────────────────
  pose('Neck Movements (Griva Sanchalana)', 'Neck', ['Shoulders'], 'beginner', [
    'Sit or stand tall. Slowly bend the head forward and back, then side to side, then turn left and right.',
    'Move with the breath: exhale going down, inhale coming up.',
    'Keep it slow and pain-free; skip full circles if you have neck problems.',
  ], ['loosening', 'warm-up', 'neck', 'kids-friendly']),
  pose('Shoulder Circles (Skandha Chakra)', 'Shoulders', ['Upper Back'], 'beginner', [
    'Place fingertips on the shoulders.',
    'Draw big circles with the elbows, 5 forward and 5 backward.',
    'Inhale as elbows rise, exhale as they come down.',
  ], ['loosening', 'warm-up', 'shoulders', 'kids-friendly']),
  pose('Trunk Twisting (Kati Sanchalana)', 'Core', ['Lower Back', 'Obliques'], 'beginner', [
    'Stand with feet hip-width apart, arms at shoulder height.',
    'Exhale and twist to the right, letting the arms swing; inhale back to centre. Repeat to the left.',
    'Keep hips facing forward and the movement easy.',
  ], ['loosening', 'warm-up', 'spine']),
  pose('Knee Movements (Janu Sanchalana)', 'Legs', ['Quads', 'Hips'], 'beginner', [
    'Stand with arms stretched forward at shoulder height.',
    'Exhale and bend the knees into a half squat; inhale and stand up.',
    'Keep the heels down and knees in line with the toes.',
  ], ['loosening', 'warm-up', 'legs']),

  // ─── Standing poses ─────────────────────────────────────────
  pose('Tadasana (Mountain Pose)', 'Full Body', ['Calves', 'Core'], 'beginner', [
    'Stand with feet together, arms by the sides.',
    'Inhale, raise the arms overhead, interlock fingers and rise onto the toes.',
    'Stretch the whole body up, hold with steady breathing, then exhale down.',
  ], ['asana', 'standing', 'posture', 'kids-friendly']),
  pose('Vrikshasana (Tree Pose)', 'Legs', ['Core', 'Ankles'], 'beginner', [
    'Stand on the left leg and place the right sole on the inner thigh or calf (never on the knee).',
    'Join palms at the chest or overhead and fix your gaze on one point.',
    'Hold with steady breathing, then switch legs.',
  ], ['asana', 'standing', 'balance', 'kids-friendly']),
  pose('Pada Hastasana (Standing Forward Bend)', 'Hamstrings', ['Lower Back', 'Calves'], 'beginner', [
    'Stand tall and raise the arms overhead on an inhale.',
    'Exhale and fold forward from the hips, hands to the floor or shins.',
    'Bend the knees as needed. Avoid with slipped disc or severe back pain.',
  ], ['asana', 'standing', 'forward bend', 'flexibility']),
  pose('Ardha Chakrasana (Half Wheel Pose)', 'Back', ['Hip Flexors', 'Chest'], 'beginner', [
    'Stand with hands supporting the lower back, fingers pointing down.',
    'Inhale and gently bend backwards from the waist, head following.',
    'Hold briefly and come up on an exhale. Avoid with vertigo or high blood pressure.',
  ], ['asana', 'standing', 'backbend']),
  pose('Trikonasana (Triangle Pose)', 'Legs', ['Obliques', 'Hamstrings'], 'beginner', [
    'Step the feet wide apart, right foot turned out, arms at shoulder height.',
    'Exhale and bend to the right, right hand to the shin or floor, left arm reaching up.',
    'Look up at the top hand, hold, then switch sides.',
  ], ['asana', 'standing', 'side bend', 'kids-friendly']),
  pose('Virabhadrasana I (Warrior I)', 'Legs', ['Glutes', 'Hip Flexors', 'Shoulders'], 'beginner', [
    'Step the left foot back into a long lunge, back heel down and turned slightly out.',
    'Bend the front knee over the ankle and raise the arms overhead.',
    'Hold with hips facing forward, then switch sides.',
  ], ['asana', 'standing', 'strength']),
  pose('Virabhadrasana II (Warrior II)', 'Legs', ['Glutes', 'Shoulders'], 'beginner', [
    'Stand wide, right foot turned out, arms stretched out at shoulder height.',
    'Bend the right knee over the ankle and look over the right hand.',
    'Hold with the torso upright, then switch sides.',
  ], ['asana', 'standing', 'strength', 'kids-friendly']),
  pose('Utkatasana (Chair Pose)', 'Legs', ['Glutes', 'Core', 'Shoulders'], 'beginner', [
    'Stand with feet together and raise the arms overhead.',
    'Bend the knees and sit the hips back as if into a chair.',
    'Keep the chest lifted and weight in the heels.',
  ], ['asana', 'standing', 'strength', 'kids-friendly']),

  // ─── Sitting poses ──────────────────────────────────────────
  pose('Vajrasana (Thunderbolt Pose)', 'Legs', ['Ankles', 'Back'], 'beginner', [
    'Kneel and sit back on the heels, big toes touching, heels apart.',
    'Hands on the thighs, spine straight, breathe slowly.',
    'The one pose that can be done right after meals; it helps digestion.',
  ], ['asana', 'sitting', 'digestion', 'kids-friendly']),
  pose('Bhadrasana (Butterfly Pose)', 'Hips', ['Adductors', 'Lower Back'], 'beginner', [
    'Sit with the soles of the feet together and knees out to the sides.',
    'Hold the feet and sit tall; let the knees relax down.',
    'Gently flap the knees like butterfly wings, then hold still.',
  ], ['asana', 'sitting', 'hips', 'kids-friendly']),
  pose('Ushtrasana (Camel Pose)', 'Back', ['Chest', 'Hip Flexors', 'Shoulders'], 'intermediate', [
    'Kneel with knees hip-width apart, hands on the lower back.',
    'Push the hips forward and bend back; beginners keep hands on the back (Ardha Ushtrasana).',
    'Advanced: reach for the heels. Avoid with back injury, vertigo or high blood pressure.',
  ], ['asana', 'sitting', 'backbend']),
  pose('Shashankasana (Hare Pose)', 'Back', ['Shoulders', 'Hips'], 'beginner', [
    'Sit in Vajrasana and raise the arms on an inhale.',
    'Exhale and fold forward until the forehead and palms rest on the floor.',
    'Relax and breathe slowly; come up on an inhale.',
  ], ['asana', 'sitting', 'relaxation', 'kids-friendly']),
  pose("Balasana (Child's Pose)", 'Back', ['Hips', 'Shoulders'], 'beginner', [
    'Kneel, sit back on the heels and fold forward, forehead to the floor.',
    'Rest the arms by your sides or stretched forward.',
    'Breathe into the back of the ribs and relax.',
  ], ['asana', 'restorative', 'relaxation', 'kids-friendly']),
  pose('Uttana Mandukasana (Stretched Frog Pose)', 'Shoulders', ['Hips', 'Triceps'], 'beginner', [
    'Sit in Vajrasana with knees wide apart and big toes touching.',
    'Raise the right arm, fold it behind the head and hold the left shoulder; do the same with the left arm.',
    'Sit tall, hold, then release slowly.',
  ], ['asana', 'sitting', 'shoulders']),
  pose('Vakrasana (Seated Twist Pose)', 'Back', ['Obliques', 'Hips'], 'beginner', [
    'Sit with legs straight. Bend the right knee and place the foot beside the left knee.',
    'Twist to the right, right hand behind you, left arm around the right knee.',
    'Lengthen on the inhale, twist a little more on the exhale, then switch sides.',
  ], ['asana', 'sitting', 'twist', 'spine']),
  pose('Ardha Matsyendrasana (Half Spinal Twist Pose)', 'Back', ['Obliques', 'Hips', 'Glutes'], 'intermediate', [
    'Sit, bend the left leg under you and cross the right foot over the left knee.',
    'Twist to the right, left elbow outside the right knee, right hand behind.',
    'Keep the spine tall, hold, then switch sides. Avoid with slipped disc.',
  ], ['asana', 'sitting', 'twist', 'spine']),
  pose('Paschimottanasana (Seated Forward Bend Pose)', 'Hamstrings', ['Lower Back', 'Calves'], 'beginner', [
    'Sit with legs straight and raise the arms on an inhale.',
    'Exhale and fold forward from the hips, holding the shins, ankles or toes.',
    'Keep the back long rather than rounding hard. Avoid with slipped disc.',
  ], ['asana', 'sitting', 'forward bend', 'flexibility', 'kids-friendly']),
  pose('Gomukhasana (Cow Face Pose)', 'Shoulders', ['Hips', 'Triceps', 'Chest'], 'intermediate', [
    'Sit and stack the right knee over the left.',
    'Reach the right arm up and the left arm behind the back; clasp fingers or hold a strap.',
    'Sit tall, hold, then switch sides.',
  ], ['asana', 'sitting', 'shoulders', 'hips']),
  pose('Marjariasana (Cat-Cow Pose)', 'Back', ['Core', 'Neck'], 'beginner', [
    'Come onto hands and knees, wrists under shoulders, knees under hips.',
    'Inhale: drop the belly and lift the head (cow). Exhale: round the back and tuck the chin (cat).',
    'Flow slowly with the breath.',
  ], ['asana', 'kneeling', 'spine', 'back pain', 'kids-friendly']),
  pose('Naukasana (Boat Pose)', 'Core', ['Hip Flexors', 'Quads'], 'intermediate', [
    'Sit with knees bent, lean back and lift the feet off the floor.',
    'Straighten the legs if you can and reach the arms forward, balancing on the sitting bones.',
    'Keep the chest open and breathe. Avoid with lower-back pain.',
  ], ['asana', 'sitting', 'core', 'kids-friendly']),
  pose('Simhasana (Lion Pose)', 'Face', ['Neck', 'Throat'], 'beginner', [
    'Sit in Vajrasana with hands on the knees, fingers spread.',
    'Inhale through the nose, then open the mouth wide, stick out the tongue and exhale with a "haaa" roar.',
    'Great fun for children and a good way to release tension.',
  ], ['asana', 'sitting', 'breathing', 'kids-friendly']),

  // ─── Prone poses (lying on the stomach) ─────────────────────
  pose('Makarasana (Crocodile Pose)', 'Back', ['Shoulders'], 'beginner', [
    'Lie on the stomach, stack the forearms and rest the forehead or chin on them.',
    'Keep the legs relaxed and apart.',
    'Breathe slowly into the belly; a resting pose between back bends.',
  ], ['asana', 'prone', 'relaxation', 'back pain']),
  pose('Bhujangasana (Cobra Pose)', 'Back', ['Chest', 'Shoulders', 'Glutes'], 'beginner', [
    'Lie on the stomach with palms under the shoulders, elbows close.',
    'Inhale and lift the head and chest using the back muscles, navel stays on the floor.',
    'Keep shoulders away from the ears. Avoid with hernia, pregnancy or recent abdominal surgery.',
  ], ['asana', 'prone', 'backbend', 'back pain', 'kids-friendly']),
  pose('Shalabhasana (Locust Pose)', 'Back', ['Glutes', 'Hamstrings'], 'beginner', [
    'Lie on the stomach with hands under the thighs, chin on the floor.',
    'Inhale and lift both legs (beginners: one leg at a time) keeping them straight.',
    'Hold briefly and lower on an exhale. Avoid with severe back pain.',
  ], ['asana', 'prone', 'back', 'strength']),
  pose('Dhanurasana (Bow Pose)', 'Back', ['Chest', 'Quads', 'Shoulders'], 'intermediate', [
    'Lie on the stomach, bend the knees and hold the ankles.',
    'Inhale, lift the chest and thighs by kicking the feet back into the hands.',
    'Hold, breathe, then release slowly. Avoid with hernia, high blood pressure or back injury.',
  ], ['asana', 'prone', 'backbend']),
  pose('Adho Mukha Svanasana (Downward Dog Pose)', 'Full Body', ['Hamstrings', 'Shoulders', 'Calves'], 'beginner', [
    'From hands and knees, tuck the toes and lift the hips up and back.',
    'Press the floor away, lengthen the spine; bend the knees if the back rounds.',
    'Let the head hang between the arms and breathe.',
  ], ['asana', 'inversion', 'flexibility', 'kids-friendly']),
  pose('Phalakasana (Plank Pose)', 'Core', ['Shoulders', 'Glutes'], 'beginner', [
    'From hands and knees, step the feet back into a straight line from head to heels.',
    'Hands under the shoulders, belly drawn in, hips level.',
    'Breathe steadily; drop to the knees to make it easier.',
  ], ['asana', 'core', 'strength']),

  // ─── Supine poses (lying on the back) ───────────────────────
  pose('Setu Bandhasana (Bridge Pose)', 'Glutes', ['Hamstrings', 'Lower Back'], 'beginner', [
    'Lie on the back, knees bent, feet hip-width apart near the hips.',
    'Inhale and lift the hips, rolling the spine up; hold the ankles or keep palms down.',
    'Hold, then roll down on an exhale.',
  ], ['asana', 'supine', 'backbend', 'kids-friendly']),
  pose('Uttanapadasana (Raised Legs Pose)', 'Core', ['Hip Flexors'], 'beginner', [
    'Lie on the back with legs straight and palms down.',
    'Inhale and raise both legs to 30° (beginners: one leg at a time).',
    'Hold and lower slowly on an exhale. Avoid with lower-back pain.',
  ], ['asana', 'supine', 'core']),
  pose('Ardha Halasana (Half Plough Pose)', 'Core', ['Hamstrings', 'Lower Back'], 'beginner', [
    'Lie on the back with palms down.',
    'Inhale and raise both legs to 90° without bending the knees.',
    'Hold and lower slowly. Avoid with neck problems or high blood pressure.',
  ], ['asana', 'supine', 'core']),
  pose('Pavanamuktasana (Wind-Relieving Pose)', 'Lower Back', ['Hips', 'Core'], 'beginner', [
    'Lie on the back, hug one knee (then both) into the chest.',
    'Exhale and lift the head towards the knees.',
    'Hold, breathe, release. Helps digestion and eases lower-back tension.',
  ], ['asana', 'supine', 'digestion', 'back pain', 'kids-friendly']),
  pose('Viparita Karani (Legs Up the Wall Pose)', 'Legs', ['Lower Back', 'Hamstrings'], 'beginner', [
    'Lie on the back with the hips close to a wall and the legs resting up the wall.',
    'Arms relaxed, eyes closed, breathe slowly.',
    'Deeply relaxing; avoid during your period, with glaucoma or high blood pressure.',
  ], ['asana', 'supine', 'restorative', 'relaxation']),
  pose('Shavasana (Corpse Pose)', 'Full Body', ['Mind'], 'beginner', [
    'Lie on the back, legs apart, arms away from the body, palms up, eyes closed.',
    'Relax each body part from toes to head and let the breath become natural.',
    'Stay still and aware; end every practice with it.',
  ], ['asana', 'supine', 'relaxation', 'kids-friendly']),

  // ─── Flow ───────────────────────────────────────────────────
  pose('Surya Namaskar (Sun Salutation)', 'Full Body', ['Shoulders', 'Hamstrings', 'Core', 'Back'], 'beginner', [
    '12 steps: Pranamasana, Hasta Uttanasana, Pada Hastasana, Ashwa Sanchalanasana, Dandasana, Ashtanga Namaskara, Bhujangasana, Adho Mukha Svanasana, then back in reverse order.',
    'One round = both sides (right leg back, then left leg back). Move with the breath: inhale opening, exhale folding.',
    'Start with 3–5 slow rounds and build up to 12. Avoid with high blood pressure, hernia or during pregnancy without guidance.',
  ], ['flow', 'warm-up', 'full body', 'kids-friendly'], 'Surya Namaskar 12 steps how to'),

  // ─── Pranayama (breathing) ──────────────────────────────────
  pose('Kapalbhati Pranayama', 'Breathing', ['Core'], 'intermediate', [
    'Sit tall in a cross-legged pose or Vajrasana, hands on the knees.',
    'Exhale forcefully through the nose by snapping the belly in; let the inhale happen on its own. About 1 stroke per second.',
    'Start with 3 rounds of 30–60 strokes, resting between rounds. Do it on an empty stomach.',
    BREATH_WARNING,
  ], ['pranayama', 'kriya', 'breathing'], 'Kapalbhati pranayama correct method'),
  pose('Bhastrika Pranayama', 'Breathing', ['Core'], 'intermediate', [
    'Sit tall with hands on the knees.',
    'Breathe in deeply and out forcefully through the nose with equal force, filling and emptying the lungs (bellows breath). Beginners go slowly.',
    'Do 3 rounds of 10–20 breaths, then breathe normally. Stop if you feel dizzy.',
    BREATH_WARNING,
  ], ['pranayama', 'breathing', 'energising'], 'Bhastrika pranayama correct method'),
  pose('Bahya Pranayama', 'Breathing', ['Core'], 'advanced', [
    'Sit tall. Exhale completely and hold the breath out.',
    'Apply the chin lock (Jalandhara), belly lock (Uddiyana) and root lock (Mula) while holding.',
    'Release the locks and inhale slowly. 3–5 rounds. Learn with a teacher.',
    BREATH_WARNING,
  ], ['pranayama', 'breathing', 'bandha'], 'Bahya pranayama how to'),
  pose('Anulom Vilom Pranayama', 'Breathing', ['Mind'], 'beginner', [
    'Sit tall. Close the right nostril with the thumb and inhale through the left.',
    'Close the left nostril with the ring finger and exhale through the right; inhale right, exhale left. That is one round.',
    'Keep the breath slow and silent, no holding for beginners. Calms the mind and balances the nervous system.',
  ], ['pranayama', 'breathing', 'calming', 'nadi shodhana', 'kids-friendly'], 'Anulom Vilom pranayama how to'),
  pose('Bhramari Pranayama (Bee Breath)', 'Breathing', ['Mind'], 'beginner', [
    'Sit tall, close the ears with the thumbs and rest the fingers over the eyes.',
    'Inhale through the nose, then exhale slowly making a steady humming "mmm" sound like a bee.',
    'Repeat 5–7 times. Very calming; children love it.',
  ], ['pranayama', 'breathing', 'calming', 'sleep', 'kids-friendly'], 'Bhramari pranayama how to'),
  pose('Ujjayi Pranayama', 'Breathing', ['Throat', 'Mind'], 'beginner', [
    'Sit tall and gently narrow the back of the throat.',
    'Breathe slowly in and out through the nose with a soft ocean-like sound.',
    'Keep the breath long and even; it slows the heart rate and focuses the mind.',
  ], ['pranayama', 'breathing', 'calming'], 'Ujjayi pranayama how to'),
  pose('Sheetali Pranayama (Cooling Breath)', 'Breathing', ['Mind'], 'beginner', [
    'Sit tall, roll the tongue into a tube and stick it out slightly.',
    'Inhale slowly through the tongue, close the mouth and exhale through the nose.',
    'Cools the body; good in summer. Avoid with cold, cough or low blood pressure.',
  ], ['pranayama', 'breathing', 'cooling'], 'Sheetali pranayama how to'),
  pose('Udgeeth Pranayama (Om Chanting)', 'Breathing', ['Mind'], 'beginner', [
    'Sit tall with eyes closed.',
    'Inhale deeply, then chant a long "Ooo…mmm" as you exhale, the "mmm" about twice as long as the "Ooo".',
    'Repeat 5–7 times and sit quietly afterwards.',
  ], ['pranayama', 'breathing', 'meditation', 'calming'], 'Udgeeth pranayama Om chanting'),
  pose('Balloon Breath (Belly Breathing)', 'Breathing', ['Core'], 'beginner', [
    'Sit or lie down with both hands on the belly.',
    'Breathe in through the nose and fill the belly like a balloon; breathe out slowly and let the balloon empty.',
    'A simple, safe breathing exercise for children.',
  ], ['breathing', 'calming', 'kids', 'kids-friendly'], 'balloon breathing for kids'),

  // ─── Meditation and relaxation ──────────────────────────────
  pose('Dhyana (Meditation)', 'Mind', [], 'beginner', [
    'Sit comfortably with the spine straight and eyes closed.',
    'Rest your attention on the breath or between the eyebrows; when the mind wanders, gently come back.',
    'Start with 5 minutes and build up to 20.',
  ], ['meditation', 'mindfulness', 'calming'], 'Dhyana meditation for beginners'),
  pose('Yoga Nidra (Guided Relaxation)', 'Mind', ['Full Body'], 'beginner', [
    'Lie in Shavasana, eyes closed.',
    'Follow a guided body scan: move awareness through each body part, then the breath, then images.',
    'Stay awake and aware; deeply restful and good for sleep and stress.',
  ], ['meditation', 'relaxation', 'sleep'], 'Yoga Nidra guided 15 minutes'),
];

// ─── Plans ──────────────────────────────────────────────────

function y(name: string, sets: string, rest: string, cues: string[]) {
  const query = YOGA_LIBRARY.find(e => e.name === name)?.youtubeSearch || `${name} yoga how to`;
  return { name, sets, tempo: '', rest, cues, yt: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` };
}

const now = Timestamp.now();
const base = {
  ownerId: 'SYSTEM',
  ownerName: BRAND.name,
  type: 'sample' as const,
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
};

const LOOSENING = [
  y('Neck Movements (Griva Sanchalana)', '1 x 4', '', ['Forward-back, side-side, left-right turns: 4 each.', 'Slow, with the breath.']),
  y('Shoulder Circles (Skandha Chakra)', '2 x 5', '', ['5 forward, 5 backward.']),
  y('Trunk Twisting (Kati Sanchalana)', '1 x 5', '', ['5 each side, relaxed arms.']),
  y('Knee Movements (Janu Sanchalana)', '1 x 5', '', ['Half squat, heels down.']),
];

/** AYUSH Common Yoga Protocol: the 45-minute daily routine taught for International Day of Yoga. */
export const commonYogaProtocolPlan: Plan = {
  ...base,
  title: 'Daily Yoga – Common Yoga Protocol',
  description: 'The 45-minute daily routine from the Ministry of AYUSH (International Day of Yoga): loosening, standing, sitting and lying poses, Kapalbhati, pranayama and meditation. Ideal for beginners and adults of all ages. Practise on an empty stomach (2–3 hours after a meal).',
  tags: ['yoga', 'pranayama', 'beginner', 'daily', 'indian yoga'],
  daysPerWeek: 6,
  estimatedDuration: '45 min',
  days: [
    {
      dayNumber: 1,
      title: 'Common Yoga Protocol',
      skill: 'Flexibility',
      time: '~45 min',
      type: 'mobility',
      order: 1,
      warmup: LOOSENING,
      skillWork: [],
      strength: [
        y('Tadasana (Mountain Pose)', '1 x 20 sec', '10s', ['Rise on the toes, stretch up.']),
        y('Vrikshasana (Tree Pose)', '2 x 20 sec', '10s', ['One set per leg.', 'Gaze at one point.']),
        y('Pada Hastasana (Standing Forward Bend)', '1 x 20 sec', '10s', ['Bend the knees if needed.']),
        y('Ardha Chakrasana (Half Wheel Pose)', '1 x 15 sec', '10s', ['Support the lower back with the hands.']),
        y('Trikonasana (Triangle Pose)', '2 x 20 sec', '10s', ['One set per side.']),
        y('Bhadrasana (Butterfly Pose)', '1 x 30 sec', '10s', ['Sit tall, knees relaxed.']),
        y('Vajrasana (Thunderbolt Pose)', '1 x 30 sec', '10s', ['Spine straight, slow breathing.']),
        y('Ushtrasana (Camel Pose)', '1 x 15 sec', '10s', ['Beginners: hands on the lower back (Ardha Ushtrasana).']),
        y('Shashankasana (Hare Pose)', '1 x 20 sec', '10s', ['Forehead to the floor, relax.']),
        y('Uttana Mandukasana (Stretched Frog Pose)', '1 x 20 sec', '10s', ['Knees wide, elbows up.']),
        y('Vakrasana (Seated Twist Pose)', '2 x 20 sec', '10s', ['One set per side.']),
        y('Makarasana (Crocodile Pose)', '1 x 30 sec', '', ['Belly breathing.']),
        y('Bhujangasana (Cobra Pose)', '2 x 15 sec', '10s', ['Navel stays down, shoulders relaxed.']),
        y('Shalabhasana (Locust Pose)', '2 x 10 sec', '10s', ['Beginners lift one leg at a time.']),
        y('Setu Bandhasana (Bridge Pose)', '2 x 15 sec', '10s', ['Roll the spine up and down.']),
        y('Uttanapadasana (Raised Legs Pose)', '2 x 10 sec', '10s', ['30° lift; one leg at a time if needed.']),
        y('Ardha Halasana (Half Plough Pose)', '2 x 10 sec', '10s', ['Legs to 90°, knees straight.']),
        y('Pavanamuktasana (Wind-Relieving Pose)', '2 x 15 sec', '10s', ['One leg, then both legs.']),
        y('Shavasana (Corpse Pose)', '1 x 2 min', '', ['Relax every part of the body.']),
      ],
      cooldown: [
        y('Kapalbhati Pranayama', '1 x 1 min', '30s', ['40–60 strokes.', BREATH_WARNING]),
        y('Anulom Vilom Pranayama', '1 x 3 min', '', ['Slow, silent breath; about 5 rounds.']),
        y('Sheetali Pranayama (Cooling Breath)', '1 x 1 min', '', ['5 rounds.']),
        y('Bhramari Pranayama (Bee Breath)', '1 x 1 min', '', ['5 rounds of humming.']),
        y('Dhyana (Meditation)', '1 x 5 min', '', ['Sit quietly with the breath.']),
      ],
    },
  ],
};

/** A 5-day weekly plan that rotates focus areas; holds grow from 15–20 s (weeks 1–2) to 30–60 s. */
export const yogaWeeklyPlan: Plan = {
  ...base,
  title: 'Yoga Weekly Plan',
  description: '5 days a week, each with a clear focus: Surya Namaskar & full body, pranayama & meditation, spine & back care, balance & core, and flexibility & deep relaxation. Weeks 1–2: hold poses 15–20 s. Weeks 3–4: 30 s. After that 45–60 s and up to 12 Sun Salutations.',
  tags: ['yoga', 'pranayama', 'flexibility', 'beginner', 'indian yoga'],
  daysPerWeek: 5,
  estimatedDuration: '30-45 min',
  days: [
    {
      dayNumber: 1,
      title: 'Surya Namaskar & Full Body',
      skill: 'Surya Namaskar',
      time: '~45 min',
      type: 'mobility',
      order: 1,
      warmup: LOOSENING,
      skillWork: [
        y('Surya Namaskar (Sun Salutation)', '2 x 3 rounds', '30s', ['Slow, with the breath.', 'Build to 12 rounds over the weeks.']),
      ],
      strength: [
        y('Trikonasana (Triangle Pose)', '2 x 30 sec', '10s', ['One set per side.']),
        y('Virabhadrasana II (Warrior II)', '2 x 30 sec', '10s', ['One set per side.']),
        y('Utkatasana (Chair Pose)', '2 x 20 sec', '15s', ['Weight in the heels.']),
        y('Adho Mukha Svanasana (Downward Dog Pose)', '2 x 30 sec', '10s', ['Bend the knees to keep the back long.']),
        y('Bhujangasana (Cobra Pose)', '2 x 20 sec', '10s', ['Lift with the back, not the arms.']),
        y('Setu Bandhasana (Bridge Pose)', '2 x 20 sec', '10s', []),
        y('Paschimottanasana (Seated Forward Bend Pose)', '1 x 45 sec', '', ['Long spine, relax into it.']),
      ],
      cooldown: [
        y('Shavasana (Corpse Pose)', '1 x 5 min', '', []),
        y('Anulom Vilom Pranayama', '1 x 5 min', '', []),
      ],
    },
    {
      dayNumber: 2,
      title: 'Pranayama & Meditation',
      skill: 'Breathwork',
      time: '~30 min',
      type: 'mobility',
      order: 2,
      warmup: LOOSENING.slice(0, 2),
      skillWork: [
        y('Bhastrika Pranayama', '3 x 1 min', '30s', ['Slow and deep to start.', BREATH_WARNING]),
        y('Kapalbhati Pranayama', '3 x 1 min', '30s', ['Build to 5 min total over the weeks.', BREATH_WARNING]),
        y('Anulom Vilom Pranayama', '1 x 7 min', '', ['No breath holding for beginners.']),
        y('Bhramari Pranayama (Bee Breath)', '1 x 7', '', ['7 rounds of humming.']),
        y('Udgeeth Pranayama (Om Chanting)', '1 x 5', '', ['5 long Om chants.']),
      ],
      strength: [],
      cooldown: [
        y('Dhyana (Meditation)', '1 x 10 min', '', ['Sit still, watch the breath.']),
      ],
    },
    {
      dayNumber: 3,
      title: 'Spine & Back Care',
      skill: 'Back health',
      time: '~40 min',
      type: 'mobility',
      order: 3,
      warmup: LOOSENING,
      skillWork: [],
      strength: [
        y('Marjariasana (Cat-Cow Pose)', '2 x 8', '10s', ['Move with the breath.']),
        y('Makarasana (Crocodile Pose)', '1 x 1 min', '', ['Rest and breathe into the belly.']),
        y('Bhujangasana (Cobra Pose)', '3 x 20 sec', '15s', []),
        y('Shalabhasana (Locust Pose)', '3 x 15 sec', '15s', ['One leg at a time if needed.']),
        y('Dhanurasana (Bow Pose)', '2 x 15 sec', '20s', ['Intermediate: skip if you have back pain.']),
        y("Balasana (Child's Pose)", '1 x 45 sec', '', ['Rest after back bends.']),
        y('Ardha Matsyendrasana (Half Spinal Twist Pose)', '2 x 30 sec', '10s', ['One set per side.']),
        y('Pavanamuktasana (Wind-Relieving Pose)', '2 x 30 sec', '10s', []),
        y('Setu Bandhasana (Bridge Pose)', '2 x 20 sec', '10s', []),
      ],
      cooldown: [
        y('Shavasana (Corpse Pose)', '1 x 5 min', '', []),
        y('Bhramari Pranayama (Bee Breath)', '1 x 5', '', []),
      ],
    },
    {
      dayNumber: 4,
      title: 'Balance & Core',
      skill: 'Balance',
      time: '~40 min',
      type: 'mobility',
      order: 4,
      warmup: [
        ...LOOSENING.slice(0, 2),
        y('Surya Namaskar (Sun Salutation)', '1 x 3 rounds', '30s', ['Warm-up pace.']),
      ],
      skillWork: [
        y('Vrikshasana (Tree Pose)', '2 x 30 sec', '10s', ['One set per leg.', 'Try with eyes closed when steady.']),
        y('Virabhadrasana I (Warrior I)', '2 x 30 sec', '10s', ['One set per side.']),
      ],
      strength: [
        y('Utkatasana (Chair Pose)', '3 x 20 sec', '15s', []),
        y('Phalakasana (Plank Pose)', '3 x 30 sec', '20s', ['Knees down to make it easier.']),
        y('Naukasana (Boat Pose)', '3 x 15 sec', '20s', ['Bend the knees to start.']),
        y('Uttanapadasana (Raised Legs Pose)', '2 x 15 sec', '15s', []),
        y('Ardha Halasana (Half Plough Pose)', '2 x 15 sec', '15s', []),
      ],
      cooldown: [
        y('Shavasana (Corpse Pose)', '1 x 3 min', '', []),
        y('Ujjayi Pranayama', '1 x 3 min', '', []),
      ],
    },
    {
      dayNumber: 5,
      title: 'Flexibility & Deep Relaxation',
      skill: 'Flexibility',
      time: '~45 min',
      type: 'mobility',
      order: 5,
      warmup: LOOSENING,
      skillWork: [],
      strength: [
        y('Pada Hastasana (Standing Forward Bend)', '2 x 30 sec', '10s', []),
        y('Bhadrasana (Butterfly Pose)', '1 x 1 min', '', []),
        y('Paschimottanasana (Seated Forward Bend Pose)', '2 x 30 sec', '10s', []),
        y('Gomukhasana (Cow Face Pose)', '2 x 30 sec', '10s', ['One set per side.']),
        y('Ushtrasana (Camel Pose)', '2 x 15 sec', '20s', ['Ardha (half) version to start.']),
        y('Uttana Mandukasana (Stretched Frog Pose)', '1 x 30 sec', '', []),
        y('Viparita Karani (Legs Up the Wall Pose)', '1 x 3 min', '', []),
      ],
      cooldown: [
        y('Yoga Nidra (Guided Relaxation)', '1 x 15 min', '', ['Use a guided recording.']),
      ],
    },
  ],
};

/** The classic 7-pranayama morning sequence plus a calming evening session. */
export const pranayamaPlan: Plan = {
  ...base,
  title: 'Pranayama & Meditation',
  description: 'Daily breathwork: a morning session with the 7 classic pranayamas (Bhastrika, Kapalbhati, Bahya, Anulom Vilom, Bhramari, Udgeeth, Pranav meditation) and a calming evening session for better sleep. Morning on an empty stomach. Kapalbhati, Bhastrika and Bahya are not for pregnancy, high blood pressure, heart disease, hernia or epilepsy.',
  tags: ['yoga', 'pranayama', 'breathing', 'meditation', 'indian yoga'],
  daysPerWeek: 7,
  estimatedDuration: '20-30 min',
  days: [
    {
      dayNumber: 1,
      title: 'Morning – 7 Pranayamas',
      skill: 'Breathwork',
      time: '~30 min',
      type: 'mobility',
      order: 1,
      warmup: LOOSENING.slice(0, 2),
      skillWork: [
        y('Bhastrika Pranayama', '3 x 1 min', '30s', ['Week 1: slow. Build to 5 min.', BREATH_WARNING]),
        y('Kapalbhati Pranayama', '3 x 2 min', '30s', ['Build gradually to 10–15 min total.', BREATH_WARNING]),
        y('Bahya Pranayama', '1 x 3', '30s', ['3 rounds with the three locks. Learn with a teacher.', BREATH_WARNING]),
        y('Anulom Vilom Pranayama', '1 x 10 min', '', ['Slow, silent, no holding to start.']),
        y('Bhramari Pranayama (Bee Breath)', '1 x 7', '', ['7 rounds.']),
        y('Udgeeth Pranayama (Om Chanting)', '1 x 7', '', ['7 long Om chants.']),
      ],
      strength: [],
      cooldown: [
        y('Dhyana (Meditation)', '1 x 5 min', '', ['Pranav meditation: silent Om with the breath.']),
      ],
    },
    {
      dayNumber: 2,
      title: 'Evening – Calm & Sleep',
      skill: 'Relaxation',
      time: '~25 min',
      type: 'mobility',
      order: 2,
      warmup: [],
      skillWork: [
        y('Anulom Vilom Pranayama', '1 x 5 min', '', []),
        y('Ujjayi Pranayama', '1 x 3 min', '', ['Long, even breaths.']),
        y('Sheetali Pranayama (Cooling Breath)', '1 x 2 min', '', ['Skip in cold weather.']),
        y('Bhramari Pranayama (Bee Breath)', '1 x 5', '', []),
      ],
      strength: [],
      cooldown: [
        y('Yoga Nidra (Guided Relaxation)', '1 x 15 min', '', ['Great before sleep.']),
      ],
    },
  ],
};

/** Kids: short, playful sessions; holds of 10–20 s, no forceful breathing, no breath retention, no headstands. */
export const kidsYogaPlan: Plan = {
  ...base,
  title: 'Kids Yoga (Ages 6–12)',
  description: 'Short, playful 20–25 minute sessions that build balance, flexibility, focus and calm. Animal poses, Sun Salutations and gentle breathing only: no forceful breathing (Kapalbhati/Bhastrika), no breath holding and no head or shoulder stands. Always with an adult nearby; never force a stretch.',
  tags: ['yoga', 'kids', 'beginner', 'family'],
  daysPerWeek: 3,
  estimatedDuration: '20-25 min',
  days: [
    {
      dayNumber: 1,
      title: 'Animal Adventure',
      skill: 'Flexibility',
      time: '~20 min',
      type: 'mobility',
      order: 1,
      warmup: [
        y('Shoulder Circles (Skandha Chakra)', '1 x 5', '', ['Flap your wings like a bird!']),
        y('Balloon Breath (Belly Breathing)', '1 x 1 min', '', ['Blow up the balloon in your belly.']),
      ],
      skillWork: [],
      strength: [
        y('Tadasana (Mountain Pose)', '2 x 15 sec', '', ['Stand tall like a mountain.']),
        y('Vrikshasana (Tree Pose)', '2 x 15 sec', '', ['Grow like a tree; one set per leg. Hold a wall if wobbly.']),
        y('Marjariasana (Cat-Cow Pose)', '1 x 6', '', ['Meow and moo!']),
        y('Adho Mukha Svanasana (Downward Dog Pose)', '2 x 15 sec', '', ['Wag your tail.']),
        y('Bhujangasana (Cobra Pose)', '3 x 10 sec', '', ['Hiss like a snake: "sssss".']),
        y('Bhadrasana (Butterfly Pose)', '1 x 30 sec', '', ['Flap your butterfly wings.']),
        y('Simhasana (Lion Pose)', '1 x 3', '', ['Roar like a lion!']),
      ],
      cooldown: [
        y('Bhramari Pranayama (Bee Breath)', '1 x 5', '', ['Hum like a bee.']),
        y('Shavasana (Corpse Pose)', '1 x 2 min', '', ['Sleeping statue: be very still.']),
      ],
    },
    {
      dayNumber: 2,
      title: 'Sun & Balance',
      skill: 'Balance',
      time: '~25 min',
      type: 'mobility',
      order: 2,
      warmup: [
        y('Neck Movements (Griva Sanchalana)', '1 x 3', '', ['Nod yes, shake no, slowly.']),
        y('Surya Namaskar (Sun Salutation)', '1 x 3 rounds', '30s', ['Say hello to the sun, slowly.']),
      ],
      skillWork: [],
      strength: [
        y('Utkatasana (Chair Pose)', '2 x 15 sec', '10s', ['Sit on an invisible chair.']),
        y('Virabhadrasana II (Warrior II)', '2 x 15 sec', '', ['Brave warrior; one set per side.']),
        y('Trikonasana (Triangle Pose)', '2 x 15 sec', '', ['One set per side.']),
        y('Naukasana (Boat Pose)', '2 x 10 sec', '10s', ['Row your boat; knees bent is fine.']),
        y('Setu Bandhasana (Bridge Pose)', '2 x 15 sec', '10s', ['Make a bridge for a car to drive under.']),
        y("Balasana (Child's Pose)", '1 x 30 sec', '', ['Little mouse resting.']),
      ],
      cooldown: [
        y('Balloon Breath (Belly Breathing)', '1 x 1 min', '', []),
        y('Shavasana (Corpse Pose)', '1 x 2 min', '', []),
      ],
    },
    {
      dayNumber: 3,
      title: 'Calm & Focus',
      skill: 'Focus',
      time: '~20 min',
      type: 'mobility',
      order: 3,
      warmup: [
        y('Shoulder Circles (Skandha Chakra)', '1 x 5', '', []),
        y('Marjariasana (Cat-Cow Pose)', '1 x 6', '', []),
      ],
      skillWork: [],
      strength: [
        y('Vajrasana (Thunderbolt Pose)', '1 x 1 min', '', ['Sit like a diamond.']),
        y('Shashankasana (Hare Pose)', '1 x 20 sec', '', ['Curl up like a rabbit.']),
        y('Paschimottanasana (Seated Forward Bend Pose)', '1 x 20 sec', '', ['Reach for your toes, no forcing.']),
        y('Pavanamuktasana (Wind-Relieving Pose)', '1 x 20 sec', '', ['Hug your knees and rock.']),
      ],
      cooldown: [
        y('Anulom Vilom Pranayama', '1 x 2 min', '', ['Gentle, no holding.']),
        y('Bhramari Pranayama (Bee Breath)', '1 x 5', '', []),
        y('Dhyana (Meditation)', '1 x 2 min', '', ['Count 10 slow breaths.']),
        y('Shavasana (Corpse Pose)', '1 x 2 min', '', []),
      ],
    },
  ],
};

export const YOGA_PLANS = [commonYogaProtocolPlan, yogaWeeklyPlan, pranayamaPlan, kidsYogaPlan];
