import type { Plan } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { personalCalisthenicsPlan } from '@/data/calisthenics-personal-plan';
import { tmsCalisthenicsPlan } from '@/data/calisthenics-tms-plan';

function ex(name: string, sets: string, tempo: string, rest: string, cues: string[], yt?: string) {
  const query = yt || name;
  const ytUrl = query.startsWith('http') ? query : `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' form tutorial')}`;
  return { name, sets, tempo, rest, cues, yt: ytUrl };
}

const now = Timestamp.now();

// 1. 6-Day Calisthenics Protocol
export const calisthenicsStarterPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Calisthenics Workout',
  description: 'The original APPARATUS 6-day split focusing on strength, skill (handstands/levers), and mobility.',
  type: 'sample',
  tags: ['calisthenics', 'bodyweight', 'advanced'],
  daysPerWeek: 6,
  estimatedDuration: '60-75 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Push (Chest Priority)',
      skill: 'Handstand',
      time: '~68 min',
      type: 'strength',
      order: 1,
      warmup: [],
      skillWork: [
        ex("Wall handstand hold (chest to wall)", "5 x 25 sec", "", "", ["Kick up facing the wall...", "Squeeze glutes...", "Push through the shoulders..."]),
        ex("Wall handstand hold (back to wall)", "3 x 20 sec", "", "", ["Walk your feet up...", "Point toes...", "This variant trains balance..."]),
        ex("Freestanding kick-up attempts", "1 x 6 attempts", "", "", ["Place hands shoulder width...", "Aim to find the balance point...", "Have a wall..."])
      ],
      strength: [
        ex("Parallel bar dips", "4 x 10", "2-1-2", "90s", ["Lean forward slightly...", "Lower until shoulders...", "Keep shoulders down...", "Add a weighted backpack..."]),
        ex("Deep push-ups on blocks/parallettes", "4 x 12", "3-1-1", "90s", ["Hands on parallettes...", "Full range of motion...", "Keep a straight line..."]),
        ex("Pseudo planche push-ups", "4 x 9", "2-1-2", "90s", ["Hands turned slightly in...", "Lean your shoulders forward...", "Keep the whole body rigid..."]),
        ex("Typewriter push-ups (unilateral)", "3 x 7", "2-1-2", "75s", ["Wide hand placement...", "Slide side to side...", "Push back to center..."]),
        ex("Diamond push-ups", "3 x 13", "2-1-2", "60s", ["Hands together...", "Elbows track backward...", "Full lockout..."])
      ],
      cooldown: [],
    },
    {
      dayNumber: 2,
      title: 'Pull (Back Thickness)',
      skill: 'Front Lever',
      time: '~65 min',
      type: 'strength',
      order: 2,
      warmup: [],
      skillWork: [
        ex("Tuck front lever hold", "5 x 15 sec", "", "", ["Hang from the bar...", "Keep arms straight...", "The tighter the tuck..."]),
        ex("Advanced tuck front lever", "3 x 10 sec", "", "", ["Same setup as the tuck...", "Keep your lower back rounded...", "Progress here only once a clean 20 sec..."]),
        ex("Dead hang", "3 x 35 sec", "", "", ["Full hang from the bar...", "Great for grip endurance...", "Breathe normally..."])
      ],
      strength: [
        ex("Weighted-feel pull-ups (slow negative)", "4 x 7", "4-1-1", "2 min", ["Jump or step up...", "Lower yourself for a full 4-second...", "Reset from a dead hang..."]),
        ex("Wide-grip pull-ups", "3 x max", "2-0-2", "90s", ["Hands just outside...", "Pull your chest toward the bar...", "Full extension at the bottom..."]),
        ex("Typewriter pull-ups (unilateral)", "3 x 5", "2-1-2", "90s", ["Pull up to the top...", "Keep your core tight...", "Lower under control..."]),
        ex("Australian/inverted rows (feet elevated)", "4 x 13", "2-1-2", "90s", ["Bar or rings at waist height...", "Pull your chest to the bar...", "The more horizontal..."]),
        ex("Bodyweight bar curls", "3 x 11", "2-1-2", "60s", ["Underhand grip...", "Curl your body up...", "Lower with control..."])
      ],
      cooldown: []
    },
    {
      dayNumber: 3,
      title: 'Legs (Lower Body Strength)',
      skill: 'Pistol Squat',
      time: '~60 min',
      type: 'strength',
      order: 3,
      warmup: [],
      skillWork: [
        ex("Assisted pistol squats", "3 x 8 each", "", "", ["Hold a pole or band for balance.", "Squat low on one leg.", "Keep your heel down."])
      ],
      strength: [
        ex("Bodyweight squats (slow tempo)", "4 x 15", "3-1-1", "60s", ["Squat deep.", "Keep spine neutral."]),
        ex("Nordic hamstring curls (assisted)", "3 x 6", "", "90s", ["Lower with control.", "Use hands to push back up."]),
        ex("Single-leg calf raises", "4 x 15 each", "2-1-2", "45s", ["Use a step for full stretch."])
      ],
      cooldown: []
    },
    {
      dayNumber: 4,
      title: 'Push (Shoulder Focus)',
      skill: 'Handstand OHP',
      time: '~60 min',
      type: 'strength',
      order: 4,
      warmup: [],
      skillWork: [
        ex("Pike push-ups", "4 x 8", "", "90s", ["Hips high, look at toes.", "Lower head forward of hands."])
      ],
      strength: [
        ex("Decline push-ups", "4 x 12", "2-1-2", "60s", ["Elevate feet on bench."]),
        ex("Planche lean hold", "3 x 15 sec", "", "60s", ["Lean forward in plank.", "Protract and depress scapula."])
      ],
      cooldown: []
    },
    {
      dayNumber: 5,
      title: 'Pull (Back Width & Biceps)',
      skill: 'Human Flag',
      time: '~60 min',
      type: 'strength',
      order: 5,
      warmup: [],
      skillWork: [
        ex("Human flag support holds", "4 x 10 sec", "", "90s", ["Grip pole, kick up legs.", "Keep arms locked."])
      ],
      strength: [
        ex("Chin-ups", "4 x 8", "2-0-2", "90s", ["Underhand grip.", "Pull chest to bar."]),
        ex("Commando pull-ups", "3 x 8", "", "75s", ["Neutral grip, alternating sides."])
      ],
      cooldown: []
    },
    {
      dayNumber: 6,
      title: 'Core & Conditioning',
      skill: 'L-Sit',
      time: '~45 min',
      type: 'strength',
      order: 6,
      warmup: [],
      skillWork: [
        ex("L-sit hold (parallettes)", "4 x 15 sec", "", "60s", ["Keep arms straight.", "Depress shoulders, lift hips."])
      ],
      strength: [
        ex("Hanging knee raises", "3 x 12", "", "60s", ["Avoid swinging.", "Compress abs."]),
        ex("Plank hold", "3 x 60 sec", "", "45s", ["Straight body line."])
      ],
      cooldown: []
    }
  ]
};

// 2. Push Pull Legs
export const pushPullLegsPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Push Pull Legs',
  description: 'Classic 3-day hypertrophy split. Push muscles one day, pull the next, legs to finish. Run it once or twice a week for serious gains.',
  type: 'sample',
  tags: ['gym', 'barbell', 'hypertrophy'],
  daysPerWeek: 3,
  estimatedDuration: '60-70 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Push (Chest, Shoulders & Triceps)',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 1,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to raise heart rate.", "Swing arms naturally."]),
        ex("Arm Circles", "2 x 20", "", "", ["Small circles forward, then backward.", "Loosen up the shoulder joints."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Hold band at shoulder width.", "Squeeze shoulder blades together."]),
        ex("Light Push-Ups", "1 x 10", "", "", ["Slow and controlled.", "Focus on warming up chest and triceps."]),
        ex("Band Shoulder Dislocations", "2 x 12", "", "", ["Hold band wide.", "Rotate arms over and behind head in a smooth arc."]),
      ],
      skillWork: [],
      strength: [
        ex("Flat Barbell Bench Press", "4 x 8", "2-0-2", "2 min", ["Retract and squeeze shoulder blades on the bench.", "Lower bar to mid-chest, elbows at about 45 degrees.", "Press up in a slight arc, locking out at the top."]),
        ex("Incline Dumbbell Press", "3 x 10", "2-0-2", "90s", ["Set bench to 30 degrees.", "Press dumbbells up and slightly inward.", "Lower with control, feel the stretch in upper chest."]),
        ex("Standing Overhead Press", "3 x 8", "2-0-2", "90s", ["Grip bar just outside shoulder width.", "Press straight overhead, push head through at the top.", "Brace your core and squeeze glutes for stability."]),
        ex("Dumbbell Lateral Raise", "3 x 15", "2-0-1", "60s", ["Slight bend in elbows, raise to shoulder height.", "Lead with your elbows, not your hands.", "Control the lowering — don't swing the weight."]),
        ex("Cable Fly", "3 x 15", "2-1-2", "60s", ["Set pulleys to mid height.", "Bring handles together in a hugging motion.", "Squeeze chest hard at the peak."]),
        ex("Rope Tricep Pushdown", "3 x 12", "2-0-2", "60s", ["Keep elbows pinned to your sides.", "Push the rope down and spread it at the bottom.", "Squeeze triceps at full extension."]),
        ex("Overhead Dumbbell Tricep Extension", "3 x 12", "2-0-2", "60s", ["Hold one dumbbell with both hands behind your head.", "Extend arms overhead without flaring elbows.", "Lower slowly to feel the stretch in the long head."]),
      ],
      cooldown: [
        ex("Chest Doorway Stretch", "30s each side", "", "", ["Place forearm on door frame at shoulder height.", "Lean forward until you feel the stretch across your chest."]),
        ex("Overhead Shoulder Stretch", "30s each side", "", "", ["Reach one arm overhead and bend elbow behind head.", "Use the other hand to gently push elbow back."]),
        ex("Tricep Stretch", "30s each side", "", "", ["Reach arm overhead, bend elbow behind your head.", "Pull elbow gently with the opposite hand."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale for 4 seconds, hold for 4, exhale for 4.", "Focus on slowing your heart rate."]),
      ]
    },
    {
      dayNumber: 2,
      title: 'Pull (Back & Biceps)',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 2,
      warmup: [
        ex("Rowing Machine", "5 min", "", "", ["Light pace to warm up back and arms.", "Focus on pulling with your back, not just arms."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Pull band apart at chest height.", "Squeeze shoulder blades at the end of each rep."]),
        ex("Cat-Cow Stretch", "1 x 10", "", "", ["On hands and knees, arch and round your back.", "Breathe in on cow (arch), out on cat (round)."]),
        ex("Bodyweight Good Mornings", "1 x 10", "", "", ["Hands behind head, hinge forward at hips.", "Feel the stretch in your hamstrings."]),
        ex("Dead Hang", "2 x 15 sec", "", "", ["Hang from the pull-up bar with straight arms.", "Relax shoulders and decompress your spine."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Deadlift", "3 x 5", "2-0-2", "2 min", ["Feet hip-width apart, grip just outside knees.", "Keep bar close to your body the entire lift.", "Drive through heels, lock hips at the top."]),
        ex("Pull-Up", "4 x 8", "2-0-2", "90s", ["Full dead hang at the bottom.", "Pull until chin clears the bar.", "If you can't do 8, use an assisted pull-up machine."]),
        ex("Barbell Bent Over Row", "4 x 8", "2-0-2", "90s", ["Hinge at hips to about 45 degrees.", "Pull bar to your lower ribcage.", "Keep your back flat — no rounding."]),
        ex("Seated Cable Row", "3 x 10", "2-1-2", "75s", ["Sit tall with a slight knee bend.", "Pull handle to your belly button.", "Squeeze shoulder blades together, then release slowly."]),
        ex("Cable Face Pull", "3 x 15", "2-1-2", "60s", ["Set cable to face height with rope attachment.", "Pull toward your face, elbows high and wide.", "Great for shoulder health and rear delts."]),
        ex("EZ Bar Curl", "3 x 10", "2-0-2", "60s", ["Grip the EZ bar on the angled part.", "Curl up without swinging your body.", "Lower with control — don't drop the weight."]),
        ex("Dumbbell Hammer Curl", "3 x 12", "2-0-2", "60s", ["Hold dumbbells with palms facing each other.", "Curl up without rotating your wrists.", "Works the brachialis for thicker arms."]),
      ],
      cooldown: [
        ex("Lat Stretch", "30s each side", "", "", ["Grab a pole or door frame with one hand overhead.", "Lean away to stretch the lat."]),
        ex("Bicep Wall Stretch", "30s each side", "", "", ["Place palm flat on wall behind you, arm straight.", "Turn body away to stretch the bicep."]),
        ex("Lower Back Stretch", "30s", "", "", ["Lie on your back, pull both knees to your chest.", "Gently rock side to side."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale 4 seconds, exhale 6 seconds.", "Relax your whole body."]),
      ]
    },
    {
      dayNumber: 3,
      title: 'Legs (Quads, Hamstrings & Calves)',
      skill: '',
      time: '70 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("Stationary Bike", "5 min", "", "", ["Light resistance, steady pace.", "Warm up knees and hip joints."]),
        ex("Leg Swings (Front to Back)", "15 each leg", "", "", ["Hold onto something for balance.", "Swing leg forward and back with control."]),
        ex("Leg Swings (Side to Side)", "15 each leg", "", "", ["Swing leg across body and out to the side.", "Loosens up hip adductors and abductors."]),
        ex("Bodyweight Squats", "1 x 15", "", "", ["Full depth squats, slow tempo.", "Focus on keeping heels on the ground."]),
        ex("Glute Bridges", "1 x 15", "", "", ["Lie on back, feet flat, push hips up.", "Squeeze glutes hard at the top."]),
        ex("Hip Circles", "10 each direction", "", "", ["Stand on one leg, circle the other knee.", "Opens up the hip joint."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Back Squat", "4 x 8", "2-1-2", "2 min", ["Bar on upper traps, feet shoulder-width apart.", "Squat to at least parallel or deeper if you can.", "Drive through your whole foot, keep chest up."]),
        ex("Barbell Romanian Deadlift", "4 x 8", "2-0-2", "90s", ["Hold bar at hip level, slight knee bend.", "Hinge at hips, push butt back, lower bar along shins.", "Feel the stretch in hamstrings, then squeeze glutes to stand."]),
        ex("Leg Press Machine", "3 x 12", "2-0-2", "90s", ["Feet shoulder-width on the platform.", "Lower the sled until knees are at 90 degrees.", "Press up without fully locking knees at the top."]),
        ex("Lying Leg Curl Machine", "3 x 12", "2-1-2", "75s", ["Lie face down, pad behind your ankles.", "Curl heels toward your glutes.", "Squeeze hamstrings at the top, lower slowly."]),
        ex("Leg Extension Machine", "3 x 15", "2-1-2", "60s", ["Sit with back against the pad.", "Extend legs fully, squeeze quads at the top.", "Lower slowly — don't let the weight stack slam."]),
        ex("Standing Calf Raise Machine", "5 x 15", "2-1-2", "45s", ["Stand on the edge of the platform.", "Rise up on your toes as high as possible.", "Lower slowly for a full stretch at the bottom."]),
        ex("Ab Wheel Rollout", "3 x 12", "2-0-2", "60s", ["Kneel on a mat, grip the ab wheel.", "Roll forward keeping your core tight.", "Roll back using your abs — don't use your hips."]),
      ],
      cooldown: [
        ex("Standing Quad Stretch", "30s each leg", "", "", ["Stand on one leg, pull the other heel to your glutes.", "Keep knees together."]),
        ex("Seated Hamstring Stretch", "30s each leg", "", "", ["Sit with one leg extended, reach for your toes.", "Keep your back straight."]),
        ex("Kneeling Hip Flexor Stretch", "30s each side", "", "", ["Kneel on one knee, push hips forward.", "Feel a deep stretch in the front of your hip."]),
        ex("Standing Calf Stretch", "30s each leg", "", "", ["Step one foot back, press heel into the ground.", "Lean forward slightly into a wall."]),
      ]
    }
  ]
};

// 3. Upper Lower Split
export const upperLowerPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Upper Lower Split',
  description: '4-day powerbuilding split. Two upper and two lower days with alternating strength and volume focus. Great balance of size and strength.',
  type: 'sample',
  tags: ['gym', 'powerbuilding', '4-day'],
  daysPerWeek: 4,
  estimatedDuration: '60-70 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Upper Body A (Strength)',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 1,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to raise heart rate.", "Swing arms naturally."]),
        ex("Band Shoulder Dislocations", "2 x 15", "", "", ["Hold band wide overhead.", "Rotate arms over and behind in a smooth arc."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Hold band at chest height.", "Squeeze shoulder blades together."]),
        ex("Light Push-Ups", "1 x 10", "", "", ["Slow and controlled.", "Prime the chest and triceps."]),
        ex("Arm Circles", "1 x 20 each direction", "", "", ["Small to big circles.", "Loosen up the shoulder joints."]),
      ],
      skillWork: [],
      strength: [
        ex("Flat Barbell Bench Press", "4 x 6", "2-0-2", "2 min", ["Retract and squeeze shoulder blades on the bench.", "Lower bar to mid-chest, elbows at about 45 degrees.", "Press up in a slight arc, lock out at the top."]),
        ex("Barbell Bent Over Row", "4 x 8", "2-0-2", "90s", ["Hinge at hips to about 45 degrees, flat back.", "Pull bar to your lower ribcage.", "Squeeze shoulder blades together at the top."]),
        ex("Incline Dumbbell Press", "3 x 10", "2-0-2", "90s", ["Set bench to 30 degrees.", "Press dumbbells up and slightly inward.", "Feel the stretch in upper chest on the way down."]),
        ex("Pull-Up", "3 x max", "2-0-2", "90s", ["Full dead hang at the bottom.", "Pull until chin clears the bar.", "Use assisted pull-up machine if needed."]),
        ex("Dumbbell Lateral Raise", "3 x 15", "2-0-1", "60s", ["Slight bend in elbows, raise to shoulder height.", "Lead with your elbows, not your hands.", "Control the lowering — no swinging."]),
        ex("Dumbbell Bicep Curl", "3 x 12", "2-0-2", "60s", ["Keep elbows pinned to your sides.", "Curl up and squeeze the bicep at the top.", "Lower with control — no dropping."]),
        ex("Rope Tricep Pushdown", "3 x 12", "2-0-2", "60s", ["Keep elbows pinned to your sides.", "Push the rope down and spread it at the bottom.", "Squeeze triceps at full extension."]),
      ],
      cooldown: [
        ex("Chest Doorway Stretch", "30s each side", "", "", ["Place forearm on door frame at shoulder height.", "Lean forward until you feel the stretch."]),
        ex("Lat Stretch", "30s each side", "", "", ["Grab a pole overhead with one hand.", "Lean away to stretch the lat."]),
        ex("Cross-Body Shoulder Stretch", "30s each side", "", "", ["Pull one arm across your chest with the other hand.", "Hold until you feel the stretch in your shoulder."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4 seconds, hold 4, exhale 4.", "Focus on slowing your heart rate."]),
      ]
    },
    {
      dayNumber: 2,
      title: 'Lower Body A (Squat Focus)',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 2,
      warmup: [
        ex("Stationary Bike", "5 min", "", "", ["Light resistance, steady pace.", "Warm up knees and hip joints."]),
        ex("Leg Swings (Front to Back)", "15 each leg", "", "", ["Hold onto something for balance.", "Swing leg forward and back with control."]),
        ex("Bodyweight Squats", "1 x 15", "", "", ["Full depth, slow tempo.", "Focus on keeping heels down."]),
        ex("Hip Circles", "10 each direction", "", "", ["Stand on one leg, circle the other knee.", "Opens up the hip joint."]),
        ex("Glute Bridges", "1 x 15", "", "", ["Lie on back, feet flat, push hips up.", "Squeeze glutes at the top."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Back Squat", "4 x 6", "3-1-1", "2 min", ["Bar on upper traps, feet shoulder-width.", "Squat below parallel if mobility allows.", "Drive through your whole foot, keep chest up."]),
        ex("Barbell Romanian Deadlift", "3 x 8", "2-0-2", "90s", ["Hold bar at hip level, slight knee bend.", "Hinge at hips, push butt back, lower bar along shins.", "Feel the hamstring stretch, squeeze glutes to stand."]),
        ex("Leg Press Machine", "3 x 12", "2-0-2", "90s", ["Feet shoulder-width on the platform.", "Lower until knees hit 90 degrees.", "Press up without fully locking out."]),
        ex("Lying Leg Curl Machine", "3 x 12", "2-1-2", "75s", ["Lie face down, pad behind ankles.", "Curl heels toward your glutes.", "Squeeze hamstrings at the top."]),
        ex("Standing Calf Raise Machine", "4 x 15", "2-1-2", "45s", ["Stand on the edge of the platform.", "Rise up as high as possible on toes.", "Lower slowly for a full stretch."]),
        ex("Plank Hold", "3 x 60 sec", "", "45s", ["Keep a straight line from head to heels.", "Squeeze your glutes and brace your core.", "Don't let your hips sag or pike up."]),
      ],
      cooldown: [
        ex("Standing Quad Stretch", "30s each leg", "", "", ["Stand on one leg, pull the other heel to your glutes.", "Keep knees together."]),
        ex("Seated Hamstring Stretch", "30s each leg", "", "", ["Sit with one leg out, reach for your toes.", "Keep your back straight."]),
        ex("Kneeling Hip Flexor Stretch", "30s each side", "", "", ["Kneel on one knee, push hips forward.", "Feel the stretch in front of your hip."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale 4 seconds, exhale 6 seconds.", "Relax your whole body."]),
      ]
    },
    {
      dayNumber: 3,
      title: 'Upper Body B (Volume)',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("Rowing Machine", "5 min", "", "", ["Light pace to warm up back and arms.", "Focus on pulling with your back."]),
        ex("Band Shoulder Dislocations", "2 x 15", "", "", ["Hold band wide.", "Rotate arms over and behind your head."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Pull band apart at chest height.", "Squeeze shoulder blades together."]),
        ex("Shoulder Rotations", "1 x 15 each direction", "", "", ["Small circles with arms out to the side.", "Warms up the rotator cuff."]),
        ex("Cat-Cow Stretch", "1 x 10", "", "", ["On hands and knees, arch then round your back.", "Breathe in on cow, out on cat."]),
      ],
      skillWork: [],
      strength: [
        ex("Standing Barbell Overhead Press", "4 x 6", "2-0-2", "2 min", ["Grip bar just outside shoulder width.", "Press straight up, push head through at the top.", "Squeeze glutes and brace core for stability."]),
        ex("Lat Pulldown Machine", "3 x 10", "2-1-2", "90s", ["Grip bar wide, lean back very slightly.", "Pull bar to your upper chest.", "Squeeze your lats at the bottom of each rep."]),
        ex("Machine Chest Press", "3 x 10", "2-0-2", "90s", ["Adjust seat so handles are at chest height.", "Press forward and squeeze chest.", "Don't fully lock out your elbows."]),
        ex("Seated Cable Row", "3 x 12", "2-1-2", "75s", ["Sit tall with slight knee bend.", "Pull handle to your belly button.", "Squeeze shoulder blades together."]),
        ex("Rear Delt Fly Machine", "3 x 15", "2-1-2", "60s", ["Sit facing the pad, grip handles.", "Open arms wide squeezing rear delts.", "Control the return — don't let weights slam."]),
        ex("Dumbbell Hammer Curl", "3 x 12", "2-0-2", "60s", ["Hold dumbbells with palms facing each other.", "Curl up without rotating wrists.", "Targets the brachialis for arm thickness."]),
        ex("EZ Bar Skull Crusher", "3 x 12", "2-0-2", "60s", ["Lie on bench, hold EZ bar above your chest.", "Lower bar toward your forehead by bending elbows.", "Press back up, squeezing triceps."]),
      ],
      cooldown: [
        ex("Overhead Shoulder Stretch", "30s each side", "", "", ["Reach arm overhead, bend elbow behind head.", "Pull elbow gently with the opposite hand."]),
        ex("Lat Stretch", "30s each side", "", "", ["Grab a pole overhead with one hand.", "Lean away to feel the lat stretch."]),
        ex("Tricep Stretch", "30s each side", "", "", ["Reach arm overhead, bend elbow.", "Use the other hand to gently pull."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4 seconds, hold 4, exhale 4.", "Let your body fully relax."]),
      ]
    },
    {
      dayNumber: 4,
      title: 'Lower Body B (Hinge Focus)',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 4,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to get blood flowing.", "Swing arms naturally."]),
        ex("Leg Swings (Front to Back)", "15 each leg", "", "", ["Hold onto something for balance.", "Swing leg forward and back."]),
        ex("Bodyweight Lunges", "1 x 10 each leg", "", "", ["Step forward into a lunge.", "Keep torso upright."]),
        ex("Hip Circles", "10 each direction", "", "", ["Circle one knee at a time.", "Opens up the hip joint."]),
        ex("Cat-Cow Stretch", "1 x 10", "", "", ["On hands and knees, arch and round.", "Mobilizes the spine."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Deadlift", "3 x 5", "2-0-2", "2 min", ["Feet hip-width, grip just outside knees.", "Keep bar close to your body.", "Drive through heels, lock hips at the top."]),
        ex("Barbell Front Squat", "4 x 8", "2-1-2", "2 min", ["Bar rests on front delts, elbows high.", "Squat deep, keep your chest up.", "Drive through your whole foot."]),
        ex("Dumbbell Bulgarian Split Squat", "3 x 10 each", "2-1-2", "90s", ["Rear foot on a bench behind you.", "Lower until front thigh is parallel.", "Keep most of the weight on your front foot."]),
        ex("Barbell Hip Thrust", "3 x 10", "2-1-2", "90s", ["Upper back on a bench, bar over hips.", "Drive hips up, squeeze glutes at the top.", "Lower with control — don't bounce."]),
        ex("Seated Calf Raise Machine", "4 x 15", "2-1-2", "45s", ["Sit with pad on your knees.", "Rise up on your toes.", "Lower slowly for a full stretch."]),
        ex("Cable Crunch", "3 x 15", "2-0-2", "60s", ["Kneel facing the cable, rope behind your head.", "Crunch down by flexing your abs.", "Don't pull with your arms — use your core."]),
      ],
      cooldown: [
        ex("Seated Hamstring Stretch", "30s each leg", "", "", ["Sit with one leg extended, reach for toes.", "Keep your back straight."]),
        ex("Standing Quad Stretch", "30s each leg", "", "", ["Pull one heel to your glutes.", "Keep knees together."]),
        ex("Pigeon Pose Stretch", "30s each side", "", "", ["Bring one knee forward, extend the other leg back.", "Great for glutes and hip flexibility."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale, long exhale.", "Let your muscles fully relax."]),
      ]
    }
  ]
};

// 4. Bro Split
export const broSplitPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Bro Split',
  description: '5-day bodybuilder split. One muscle group per day for max volume and pump. The classic bodybuilding approach for serious hypertrophy.',
  type: 'sample',
  tags: ['gym', 'hypertrophy', 'isolation'],
  daysPerWeek: 5,
  estimatedDuration: '55-65 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Chest Day',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 1,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to raise heart rate.", "Swing arms naturally."]),
        ex("Arm Circles", "1 x 20 each direction", "", "", ["Small to big circles.", "Loosen up the shoulder joints."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Hold band at chest height.", "Squeeze shoulder blades together."]),
        ex("Light Push-Ups", "1 x 10", "", "", ["Slow and controlled.", "Prime the chest muscles."]),
        ex("Band Chest Fly Motion", "1 x 15", "", "", ["Mimic the fly movement with a band.", "Activate the pecs."]),
      ],
      skillWork: [],
      strength: [
        ex("Flat Barbell Bench Press", "4 x 8", "2-0-2", "2 min", ["Retract and squeeze shoulder blades on the bench.", "Lower bar to mid-chest, elbows at about 45 degrees.", "Press up in a slight arc, lock out at the top."]),
        ex("Incline Dumbbell Press", "4 x 10", "2-0-2", "90s", ["Set bench to 30 degrees.", "Press dumbbells up and slightly inward.", "Lower with control, feel the stretch in upper chest."]),
        ex("Machine Chest Press", "3 x 12", "2-0-2", "75s", ["Adjust seat so handles align with mid-chest.", "Press forward and squeeze your chest.", "Great for isolating chest without stabilizer fatigue."]),
        ex("Cable Fly", "3 x 15", "2-1-2", "60s", ["Set pulleys to mid height.", "Bring handles together in a hugging motion.", "Squeeze chest hard at the peak contraction."]),
        ex("Push-Ups", "2 x failure", "2-0-2", "60s", ["Do as many as you can with good form.", "This finisher burns out any remaining chest fibers.", "Keep your body in a straight line throughout."]),
      ],
      cooldown: [
        ex("Chest Doorway Stretch", "30s each side", "", "", ["Place forearm on door frame at shoulder height.", "Lean forward until you feel the stretch."]),
        ex("Overhead Shoulder Stretch", "30s each side", "", "", ["Reach arm overhead, bend elbow behind head.", "Pull elbow gently with opposite hand."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4 seconds, hold 4, exhale 4.", "Focus on slowing your heart rate."]),
      ]
    },
    {
      dayNumber: 2,
      title: 'Back Day',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 2,
      warmup: [
        ex("Rowing Machine", "5 min", "", "", ["Light pace to warm up back and arms.", "Focus on pulling with your back."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Pull band apart at chest height.", "Squeeze shoulder blades at the end."]),
        ex("Cat-Cow Stretch", "1 x 10", "", "", ["On hands and knees, arch and round your back.", "Mobilizes the spine."]),
        ex("Bodyweight Good Mornings", "1 x 10", "", "", ["Hands behind head, hinge forward at hips.", "Feel the stretch in your hamstrings."]),
        ex("Dead Hang", "2 x 15 sec", "", "", ["Hang from the pull-up bar with straight arms.", "Decompress your spine."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Deadlift", "4 x 5", "2-0-2", "2 min", ["Feet hip-width, grip just outside knees.", "Keep bar close to your body the entire lift.", "Drive through heels, lock hips at the top."]),
        ex("Barbell Bent Over Row", "4 x 8", "2-0-2", "90s", ["Hinge at hips to about 45 degrees.", "Pull bar to your lower ribcage.", "Keep your back flat — no rounding."]),
        ex("Lat Pulldown Machine", "4 x 10", "2-1-2", "75s", ["Grip bar wide, lean back very slightly.", "Pull bar to your upper chest.", "Squeeze lats at the bottom of each rep."]),
        ex("Seated Cable Row", "3 x 12", "2-1-2", "75s", ["Sit tall with slight knee bend.", "Pull handle to your belly button.", "Squeeze shoulder blades together."]),
        ex("Straight Arm Cable Pulldown", "3 x 15", "2-1-2", "60s", ["Stand facing the cable, arms straight.", "Push the bar down in an arc to your thighs.", "Squeeze lats hard at the bottom."]),
      ],
      cooldown: [
        ex("Lat Stretch", "30s each side", "", "", ["Grab a pole overhead with one hand.", "Lean away to stretch the lat."]),
        ex("Lower Back Stretch", "30s", "", "", ["Lie on your back, pull both knees to chest.", "Rock gently side to side."]),
        ex("Child's Pose Stretch", "30s", "", "", ["Sit back on your heels, arms extended forward.", "Great for stretching lats and lower back."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale, long exhale.", "Relax your whole body."]),
      ]
    },
    {
      dayNumber: 3,
      title: 'Shoulders Day',
      skill: '',
      time: '55 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to get blood flowing.", "Swing arms naturally."]),
        ex("Band Shoulder Dislocations", "2 x 15", "", "", ["Hold band wide.", "Rotate arms over and behind head."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Pull band apart at chest height.", "Targets rear delts and upper back."]),
        ex("Arm Circles", "1 x 20 each direction", "", "", ["Start small, get bigger.", "Warms up the shoulder joints."]),
        ex("Light Dumbbell Lateral Raise", "1 x 12", "", "", ["Use very light weight.", "Just to activate the side delts."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Military Press", "4 x 8", "2-0-2", "2 min", ["Grip bar just outside shoulder width.", "Press straight overhead, push head through.", "Brace core and squeeze glutes."]),
        ex("Dumbbell Arnold Press", "3 x 10", "2-0-2", "90s", ["Start with palms facing you at chest level.", "Rotate palms outward as you press up.", "Hits all three delt heads."]),
        ex("Dumbbell Lateral Raise", "4 x 15", "2-0-1", "60s", ["Slight bend in elbows, raise to shoulder height.", "Lead with elbows, not hands.", "Control the lowering — no swinging."]),
        ex("Rear Delt Fly Machine", "4 x 15", "2-1-2", "60s", ["Sit facing the pad, grip handles.", "Open arms wide, squeeze rear delts.", "Control the return — don't let weights slam."]),
        ex("Barbell Shrugs", "4 x 12", "2-1-2", "60s", ["Hold bar at your sides, shoulder-width grip.", "Shrug shoulders straight up toward your ears.", "Hold the squeeze at the top for 1 second."]),
      ],
      cooldown: [
        ex("Cross-Body Shoulder Stretch", "30s each side", "", "", ["Pull one arm across your chest.", "Hold with the other hand."]),
        ex("Overhead Shoulder Stretch", "30s each side", "", "", ["Reach arm overhead, bend elbow behind head.", "Gently pull with the opposite hand."]),
        ex("Neck Side Stretch", "15s each side", "", "", ["Tilt head to one side, ear toward shoulder.", "Hold gently — don't pull."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4 seconds, hold 4, exhale 4.", "Relax your shoulders completely."]),
      ]
    },
    {
      dayNumber: 4,
      title: 'Legs Day',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 4,
      warmup: [
        ex("Stationary Bike", "5 min", "", "", ["Light resistance, steady pace.", "Warm up knees and hip joints."]),
        ex("Leg Swings (Front to Back)", "15 each leg", "", "", ["Hold onto something for balance.", "Swing leg forward and back."]),
        ex("Leg Swings (Side to Side)", "15 each leg", "", "", ["Swing leg across body and out to side.", "Loosens up hip adductors."]),
        ex("Bodyweight Squats", "1 x 15", "", "", ["Full depth, slow tempo.", "Keep heels on the ground."]),
        ex("Glute Bridges", "1 x 15", "", "", ["Lie on back, push hips up.", "Squeeze glutes at the top."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Back Squat", "4 x 8", "2-1-2", "2 min", ["Bar on upper traps, feet shoulder-width.", "Squat to at least parallel.", "Drive through whole foot, keep chest up."]),
        ex("Barbell Romanian Deadlift", "4 x 8", "2-0-2", "90s", ["Hold bar at hip level, slight knee bend.", "Hinge at hips, lower bar along shins.", "Feel hamstring stretch, squeeze glutes to stand."]),
        ex("Leg Press Machine", "3 x 12", "2-0-2", "90s", ["Feet shoulder-width on the platform.", "Lower until knees at 90 degrees.", "Press up without fully locking knees."]),
        ex("Lying Leg Curl Machine", "3 x 12", "2-1-2", "75s", ["Lie face down, pad behind ankles.", "Curl heels toward your glutes.", "Squeeze hamstrings at the top."]),
        ex("Leg Extension Machine", "3 x 15", "2-1-2", "60s", ["Sit with back against the pad.", "Extend legs fully, squeeze quads at top.", "Lower slowly — don't let weight slam."]),
        ex("Standing Calf Raise Machine", "5 x 15", "2-1-2", "45s", ["Stand on edge of platform.", "Rise up on toes as high as possible.", "Lower slowly for full stretch."]),
      ],
      cooldown: [
        ex("Standing Quad Stretch", "30s each leg", "", "", ["Pull one heel to your glutes.", "Keep knees together."]),
        ex("Seated Hamstring Stretch", "30s each leg", "", "", ["Sit with one leg out, reach for toes.", "Keep your back straight."]),
        ex("Kneeling Hip Flexor Stretch", "30s each side", "", "", ["Kneel on one knee, push hips forward.", "Feel stretch in front of hip."]),
        ex("Standing Calf Stretch", "30s each leg", "", "", ["Step one foot back, press heel down.", "Lean forward into a wall."]),
      ]
    },
    {
      dayNumber: 5,
      title: 'Arms Day',
      skill: '',
      time: '55 min',
      type: 'strength',
      order: 5,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to get blood flowing.", "Swing arms naturally."]),
        ex("Wrist Circles", "1 x 20 each direction", "", "", ["Circle wrists slowly in both directions.", "Warms up the wrist joints."]),
        ex("Light EZ Bar Curl", "1 x 12", "", "", ["Use a very light weight.", "Just to activate the biceps."]),
        ex("Light Rope Pushdown", "1 x 12", "", "", ["Use a very light weight.", "Activate the triceps."]),
        ex("Band Pull-Aparts", "1 x 15", "", "", ["Pull band apart at chest height.", "Warms up shoulders and upper back."]),
      ],
      skillWork: [],
      strength: [
        ex("Close Grip Bench Press", "4 x 8", "2-0-2", "90s", ["Hands about shoulder-width on the bar.", "Lower bar to lower chest, elbows close to body.", "Press up focusing on tricep contraction."]),
        ex("EZ Bar Skull Crusher", "3 x 10", "2-0-2", "75s", ["Lie on bench, hold EZ bar above chest.", "Lower bar toward your forehead by bending elbows.", "Press back up squeezing triceps."]),
        ex("Rope Tricep Pushdown", "3 x 15", "2-0-2", "60s", ["Keep elbows pinned to sides.", "Push rope down and spread it at the bottom.", "Squeeze triceps at full extension."]),
        ex("Barbell Bicep Curl", "4 x 8", "2-0-2", "90s", ["Stand with bar at hip level, shoulder-width grip.", "Curl bar up without swinging your body.", "Squeeze biceps at the top, lower slowly."]),
        ex("Incline Dumbbell Curl", "3 x 12", "2-0-2", "60s", ["Sit on incline bench at 45 degrees.", "Let arms hang straight down, curl up.", "The incline gives a deeper stretch on the bicep."]),
        ex("Dumbbell Hammer Curl", "3 x 12", "2-0-2", "60s", ["Hold dumbbells with palms facing each other.", "Curl up without rotating wrists.", "Targets the brachialis for thicker arms."]),
      ],
      cooldown: [
        ex("Bicep Wall Stretch", "30s each side", "", "", ["Place palm flat on wall, arm straight.", "Turn body away to stretch the bicep."]),
        ex("Tricep Overhead Stretch", "30s each side", "", "", ["Reach arm overhead, bend elbow behind head.", "Pull elbow with opposite hand."]),
        ex("Wrist Flexor Stretch", "15s each side", "", "", ["Extend arm forward, palm up.", "Gently pull fingers back with other hand."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4 seconds, hold 4, exhale 4.", "Let your arms relax completely."]),
      ]
    }
  ]
};

// 5. 3-Day Plan (Full Body)
export const threeDayPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: '3 days plan',
  description: 'Efficient 3-day full body program. Hit every muscle group each session with compound lifts. Perfect for beginners or busy schedules.',
  type: 'sample',
  tags: ['gym', 'full-body', 'efficient'],
  daysPerWeek: 3,
  estimatedDuration: '60-70 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Full Body A',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 1,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to raise heart rate.", "Swing arms naturally."]),
        ex("Arm Circles", "1 x 20 each direction", "", "", ["Small to big circles.", "Loosen up the shoulder joints."]),
        ex("Hip Circles", "10 each direction", "", "", ["Stand on one leg, circle the other knee.", "Opens up the hip joint."]),
        ex("Bodyweight Squats", "1 x 15", "", "", ["Full depth, slow tempo.", "Keeps heels on the ground."]),
        ex("Glute Bridges", "1 x 15", "", "", ["Lie on back, push hips up.", "Squeeze glutes at the top."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Hold band at chest height.", "Squeeze shoulder blades together."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Back Squat", "4 x 6-8", "2-1-2", "2 min", ["Bar on upper traps, feet shoulder-width.", "Squat to at least parallel or deeper.", "Drive through your whole foot, keep chest up."]),
        ex("Flat Barbell Bench Press", "4 x 6-8", "2-0-2", "2 min", ["Retract shoulder blades on the bench.", "Lower bar to mid-chest, elbows at 45 degrees.", "Press up, lock out at the top."]),
        ex("Chest Supported Dumbbell Row", "3 x 8-10", "2-1-2", "90s", ["Lie face down on an incline bench.", "Row dumbbells up squeezing shoulder blades.", "Great for isolating back without lower back fatigue."]),
        ex("Barbell Romanian Deadlift", "3 x 8-10", "2-0-2", "2 min", ["Hold bar at hip level, slight knee bend.", "Hinge at hips, push butt back.", "Feel hamstring stretch, squeeze glutes to stand."]),
        ex("Dumbbell Lateral Raise", "3 x 12-15", "2-0-1", "60s", ["Slight bend in elbows, raise to shoulder height.", "Lead with elbows, not hands.", "Control the lowering — no swinging."]),
        ex("Hanging Knee Raise", "3 x 15", "2-0-2", "60s", ["Hang from the bar with straight arms.", "Bring knees up toward your chest.", "Lower with control — no swinging."]),
      ],
      cooldown: [
        ex("Seated Hamstring Stretch", "30s each leg", "", "", ["Sit with one leg out, reach for toes.", "Keep your back straight."]),
        ex("Chest Doorway Stretch", "30s each side", "", "", ["Place forearm on door frame.", "Lean forward to stretch chest."]),
        ex("Kneeling Hip Flexor Stretch", "30s each side", "", "", ["Kneel on one knee, push hips forward.", "Feel stretch in front of hip."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4 seconds, hold 4, exhale 4.", "Slow your heart rate down."]),
      ]
    },
    {
      dayNumber: 2,
      title: 'Full Body B',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 2,
      warmup: [
        ex("Rowing Machine", "5 min", "", "", ["Light pace to warm up back and arms.", "Focus on pulling with your back."]),
        ex("Shoulder Circles", "1 x 20 each direction", "", "", ["Rotate shoulders forward and backward.", "Loosens up the shoulder joint."]),
        ex("Walking Lunges", "1 x 10 each leg", "", "", ["Step forward into a lunge.", "Keep torso upright."]),
        ex("Cat-Cow Stretch", "1 x 10", "", "", ["On hands and knees, arch and round.", "Mobilizes the spine."]),
        ex("Band Shoulder Dislocations", "1 x 15", "", "", ["Hold band wide overhead.", "Rotate arms over and behind."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Deadlift", "3 x 5", "2-0-2", "2 min", ["Feet hip-width, grip just outside knees.", "Keep bar close to your body.", "Drive through heels, lock hips at the top."]),
        ex("Incline Dumbbell Press", "4 x 8", "2-0-2", "90s", ["Set bench to 30 degrees.", "Press dumbbells up and slightly inward.", "Lower with control."]),
        ex("Lat Pulldown Machine", "4 x 8-10", "2-1-2", "90s", ["Grip bar wide, lean back slightly.", "Pull bar to upper chest.", "Squeeze lats at the bottom."]),
        ex("Dumbbell Bulgarian Split Squat", "3 x 10 each", "2-1-2", "90s", ["Rear foot on bench behind you.", "Lower until front thigh is parallel.", "Keep weight on the front foot."]),
        ex("Cable Face Pull", "3 x 15", "2-1-2", "60s", ["Set cable to face height with rope.", "Pull toward your face, elbows high.", "Great for shoulder health."]),
        ex("Cable Crunch", "3 x 15", "2-0-2", "60s", ["Kneel facing cable, rope behind head.", "Crunch down flexing your abs.", "Don't pull with arms — use core."]),
      ],
      cooldown: [
        ex("Lat Stretch", "30s each side", "", "", ["Grab a pole overhead with one hand.", "Lean away to stretch the lat."]),
        ex("Standing Quad Stretch", "30s each leg", "", "", ["Pull one heel to your glutes.", "Keep knees together."]),
        ex("Glute Stretch (Figure 4)", "30s each side", "", "", ["Lie on back, cross ankle over opposite knee.", "Pull the bottom leg toward you."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale, long exhale.", "Relax your body completely."]),
      ]
    },
    {
      dayNumber: 3,
      title: 'Full Body C',
      skill: '',
      time: '70 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("Stationary Bike", "5 min", "", "", ["Light resistance, steady pace.", "Warm up knees and hip joints."]),
        ex("Leg Swings (Front to Back)", "15 each leg", "", "", ["Hold onto something for balance.", "Swing leg forward and back."]),
        ex("Arm Circles", "1 x 20 each direction", "", "", ["Small to big circles.", "Loosen shoulder joints."]),
        ex("Bodyweight Squats", "1 x 15", "", "", ["Full depth, slow tempo.", "Keep heels on the ground."]),
        ex("Band Pull-Aparts", "1 x 15", "", "", ["Hold band at chest height.", "Squeeze shoulder blades together."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Front Squat", "4 x 8", "2-1-2", "2 min", ["Bar rests on front delts, elbows high.", "Squat deep, keep chest up.", "Drive through your whole foot."]),
        ex("Standing Barbell Overhead Press", "4 x 8", "2-0-2", "2 min", ["Grip bar just outside shoulder width.", "Press straight overhead.", "Brace core and squeeze glutes."]),
        ex("Seated Cable Row", "3 x 10", "2-1-2", "90s", ["Sit tall, slight knee bend.", "Pull handle to belly button.", "Squeeze shoulder blades together."]),
        ex("Barbell Hip Thrust", "3 x 10", "2-1-2", "90s", ["Upper back on bench, bar over hips.", "Drive hips up, squeeze glutes.", "Lower with control."]),
        ex("Dumbbell Hammer Curl", "3 x 12", "2-0-2", "60s", ["Hold dumbbells with palms facing each other.", "Curl up without rotating wrists.", "Targets brachialis."]),
        ex("Rope Tricep Pushdown", "3 x 12", "2-0-2", "60s", ["Keep elbows pinned to sides.", "Push rope down and spread at bottom.", "Squeeze triceps at extension."]),
        ex("Plank Hold", "3 x 45 sec", "", "45s", ["Straight line from head to heels.", "Squeeze glutes and brace core.", "Don't let hips sag."]),
      ],
      cooldown: [
        ex("Seated Hamstring Stretch", "30s each leg", "", "", ["Sit with one leg out, reach for toes.", "Keep back straight."]),
        ex("Standing Quad Stretch", "30s each leg", "", "", ["Pull one heel to your glutes.", "Keep knees together."]),
        ex("Kneeling Hip Flexor Stretch", "30s each side", "", "", ["Kneel on one knee, push hips forward.", "Deep stretch in front of hip."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4 seconds, exhale 6 seconds.", "Fully relax."]),
      ]
    }
  ]
};

// 6. 5-Day Plan (Intermediate Strength Split)
export const fiveDayPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: '5 days plan',
  description: 'Intermediate 5-day strength split. Push, pull, legs, upper volume, and lower + core. Balanced strength and hypertrophy for serious lifters.',
  type: 'sample',
  tags: ['gym', 'strength', '5-day'],
  daysPerWeek: 5,
  estimatedDuration: '60-70 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Push Strength',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 1,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to raise heart rate.", "Swing arms naturally."]),
        ex("Shoulder Circles", "1 x 20 each direction", "", "", ["Rotate shoulders forward then backward.", "Loosens up the shoulder joint."]),
        ex("Light Push-Ups", "1 x 10", "", "", ["Slow and controlled.", "Prime the chest and triceps."]),
        ex("Band External Rotations", "2 x 12", "", "", ["Hold band at elbow height.", "Rotate forearm outward keeping elbow pinned."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Pull band apart at chest height.", "Warms up rear delts and upper back."]),
      ],
      skillWork: [],
      strength: [
        ex("Flat Barbell Bench Press", "5 x 5", "2-0-2", "2 min", ["Retract shoulder blades on the bench.", "Lower bar to mid-chest, elbows at 45 degrees.", "Press up, lock out at the top. Heavy weight, low reps."]),
        ex("Incline Dumbbell Press", "4 x 8", "2-0-2", "90s", ["Set bench to 30 degrees.", "Press dumbbells up and slightly inward.", "Lower with control, stretch the upper chest."]),
        ex("Standing Barbell Overhead Press", "4 x 6", "2-0-2", "2 min", ["Grip just outside shoulder width.", "Press straight overhead.", "Brace core and squeeze glutes."]),
        ex("Weighted Dips", "3 x 8", "2-1-2", "90s", ["Use a dip belt or hold dumbbell between feet.", "Lean forward slightly for chest emphasis.", "Lower until shoulders are below elbows."]),
        ex("Dumbbell Lateral Raise", "3 x 15", "2-0-1", "60s", ["Slight bend in elbows, raise to shoulder height.", "Lead with elbows, not hands.", "Control the lowering."]),
        ex("Rope Tricep Pushdown", "3 x 12", "2-0-2", "60s", ["Keep elbows pinned to sides.", "Push rope down and spread at bottom.", "Squeeze triceps at full extension."]),
      ],
      cooldown: [
        ex("Chest Doorway Stretch", "30s each side", "", "", ["Place forearm on door frame.", "Lean forward to stretch chest."]),
        ex("Overhead Shoulder Stretch", "30s each side", "", "", ["Reach arm overhead, bend elbow.", "Pull with opposite hand."]),
        ex("Tricep Stretch", "30s each side", "", "", ["Reach arm overhead, bend elbow behind head.", "Pull gently with opposite hand."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4, hold 4, exhale 4.", "Slow your heart rate."]),
      ]
    },
    {
      dayNumber: 2,
      title: 'Pull Strength',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 2,
      warmup: [
        ex("Rowing Machine", "5 min", "", "", ["Light pace to warm up back.", "Focus on pulling with your back."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Pull band apart at chest height.", "Squeeze shoulder blades."]),
        ex("Cat-Cow Stretch", "1 x 10", "", "", ["On hands and knees, arch and round.", "Mobilizes the spine."]),
        ex("Dead Hang", "2 x 15 sec", "", "", ["Hang from bar with straight arms.", "Decompress the spine."]),
        ex("Light Lat Pulldown", "1 x 12", "", "", ["Use a very light weight.", "Activate the lats."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Deadlift", "4 x 5", "2-0-2", "2 min", ["Feet hip-width, grip outside knees.", "Keep bar close to body.", "Drive through heels, lock hips at top."]),
        ex("Pull-Up", "4 x 6-8", "2-0-2", "2 min", ["Full dead hang at the bottom.", "Pull chin over bar.", "Use assisted machine if needed."]),
        ex("Chest Supported Dumbbell Row", "4 x 8", "2-1-2", "90s", ["Lie face down on incline bench.", "Row dumbbells up squeezing shoulder blades.", "Isolates back without lower back strain."]),
        ex("Cable Face Pull", "3 x 15", "2-1-2", "60s", ["Set cable to face height with rope.", "Pull toward face, elbows high.", "Great for shoulder health."]),
        ex("EZ Bar Curl", "3 x 10", "2-0-2", "60s", ["Grip EZ bar on the angled part.", "Curl up without swinging.", "Lower with control."]),
        ex("Incline Dumbbell Curl", "3 x 12", "2-0-2", "60s", ["Sit on incline bench at 45 degrees.", "Arms hang straight down, curl up.", "Deeper stretch on the bicep."]),
      ],
      cooldown: [
        ex("Lat Stretch", "30s each side", "", "", ["Grab pole overhead with one hand.", "Lean away to stretch."]),
        ex("Bicep Wall Stretch", "30s each side", "", "", ["Palm flat on wall, arm straight.", "Turn body away to stretch bicep."]),
        ex("Lower Back Stretch", "30s", "", "", ["Pull both knees to chest on your back.", "Rock gently side to side."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale, long exhale.", "Relax completely."]),
      ]
    },
    {
      dayNumber: 3,
      title: 'Legs',
      skill: '',
      time: '70 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("Stationary Bike", "5 min", "", "", ["Light resistance, steady pace.", "Warm up knees and hips."]),
        ex("Leg Swings (Front to Back)", "15 each leg", "", "", ["Hold onto something for balance.", "Swing leg forward and back."]),
        ex("Bodyweight Squats", "1 x 15", "", "", ["Full depth, slow tempo.", "Keep heels down."]),
        ex("Walking Lunges", "1 x 10 each leg", "", "", ["Step forward into a lunge.", "Keep torso upright."]),
        ex("Hip Circles", "10 each direction", "", "", ["Circle one knee at a time.", "Opens up the hip joint."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Back Squat", "5 x 5", "2-1-2", "2 min", ["Bar on upper traps, feet shoulder-width.", "Squat to parallel or deeper.", "Drive through whole foot. Heavy weight, low reps."]),
        ex("Barbell Romanian Deadlift", "4 x 8", "2-0-2", "90s", ["Hold bar at hips, slight knee bend.", "Hinge at hips, lower along shins.", "Feel hamstring stretch, squeeze glutes to stand."]),
        ex("Leg Press Machine", "3 x 12", "2-0-2", "90s", ["Feet shoulder-width on platform.", "Lower until 90 degrees.", "Press up without locking knees."]),
        ex("Walking Dumbbell Lunges", "3 x 12 each", "2-0-2", "75s", ["Hold dumbbells at your sides.", "Step forward, lower back knee near floor.", "Push through front foot to stand."]),
        ex("Lying Leg Curl Machine", "3 x 12", "2-1-2", "75s", ["Lie face down, pad behind ankles.", "Curl heels toward glutes.", "Squeeze hamstrings at the top."]),
        ex("Standing Calf Raise Machine", "5 x 15", "2-1-2", "45s", ["Stand on edge of platform.", "Rise up on toes as high as possible.", "Lower slowly for full stretch."]),
      ],
      cooldown: [
        ex("Standing Quad Stretch", "30s each leg", "", "", ["Pull heel to glutes.", "Keep knees together."]),
        ex("Seated Hamstring Stretch", "30s each leg", "", "", ["One leg out, reach for toes.", "Back straight."]),
        ex("Standing Calf Stretch", "30s each leg", "", "", ["Step back, press heel down.", "Lean into a wall."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale, long exhale.", "Relax your legs completely."]),
      ]
    },
    {
      dayNumber: 4,
      title: 'Upper Volume',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 4,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to raise heart rate.", "Get blood flowing."]),
        ex("Band Shoulder Dislocations", "2 x 15", "", "", ["Hold band wide.", "Rotate over and behind head."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Pull apart at chest height.", "Squeeze shoulder blades."]),
        ex("Arm Circles", "1 x 20 each direction", "", "", ["Small to big circles.", "Warms up shoulders."]),
        ex("Light Push-Ups", "1 x 10", "", "", ["Slow and controlled.", "Prime chest and triceps."]),
      ],
      skillWork: [],
      strength: [
        ex("Incline Barbell Bench Press", "4 x 10", "2-0-2", "90s", ["Set bench to about 30 degrees.", "Lower bar to upper chest.", "Press up, squeeze chest at the top."]),
        ex("Lat Pulldown Machine", "4 x 10", "2-1-2", "90s", ["Grip bar wide, lean back slightly.", "Pull bar to upper chest.", "Squeeze lats at the bottom."]),
        ex("Seated Cable Row", "3 x 12", "2-1-2", "75s", ["Sit tall, slight knee bend.", "Pull handle to belly button.", "Squeeze shoulder blades together."]),
        ex("Dumbbell Lateral Raise", "4 x 15", "2-0-1", "60s", ["Slight bend in elbows.", "Raise to shoulder height.", "Control the lowering."]),
        ex("Rear Delt Fly Machine", "3 x 15", "2-1-2", "60s", ["Sit facing the pad.", "Open arms wide, squeeze rear delts.", "Don't let weights slam."]),
        ex("Dumbbell Hammer Curl", "3 x 12", "2-0-2", "60s", ["Palms facing each other.", "Curl up without rotation.", "Targets brachialis."]),
        ex("Rope Tricep Pushdown", "3 x 12", "2-0-2", "60s", ["Elbows pinned to sides.", "Push down and spread rope.", "Squeeze triceps."]),
      ],
      cooldown: [
        ex("Chest Doorway Stretch", "30s each side", "", "", ["Forearm on door frame.", "Lean forward to stretch."]),
        ex("Lat Stretch", "30s each side", "", "", ["Grab pole overhead.", "Lean away."]),
        ex("Cross-Body Shoulder Stretch", "30s each side", "", "", ["Pull arm across chest.", "Hold with other hand."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4, hold 4, exhale 4.", "Let your upper body relax."]),
      ]
    },
    {
      dayNumber: 5,
      title: 'Lower + Core',
      skill: '',
      time: '65 min',
      type: 'strength',
      order: 5,
      warmup: [
        ex("Stationary Bike", "5 min", "", "", ["Light resistance, steady pace.", "Warm up knees and hips."]),
        ex("Leg Swings (Front to Back)", "15 each leg", "", "", ["Hold onto something for balance.", "Swing leg forward and back."]),
        ex("Bodyweight Squats", "1 x 15", "", "", ["Full depth, slow tempo.", "Keep heels on ground."]),
        ex("Glute Bridges", "1 x 15", "", "", ["Push hips up, squeeze glutes.", "Activates the posterior chain."]),
        ex("Hip Circles", "10 each direction", "", "", ["Circle one knee at a time.", "Opens up the hip joint."]),
      ],
      skillWork: [],
      strength: [
        ex("Barbell Front Squat", "4 x 8", "2-1-2", "2 min", ["Bar on front delts, elbows high.", "Squat deep, keep chest up.", "Drive through whole foot."]),
        ex("Barbell Hip Thrust", "4 x 10", "2-1-2", "90s", ["Upper back on bench, bar over hips.", "Drive hips up, squeeze glutes.", "Lower with control."]),
        ex("Dumbbell Bulgarian Split Squat", "3 x 10 each", "2-1-2", "90s", ["Rear foot on bench.", "Lower until front thigh parallel.", "Weight on front foot."]),
        ex("Leg Extension Machine", "3 x 15", "2-1-2", "60s", ["Sit back against the pad.", "Extend legs, squeeze quads.", "Lower slowly."]),
        ex("Hanging Leg Raise", "3 x 15", "2-0-2", "60s", ["Hang from bar, straight arms.", "Bring legs up to 90 degrees.", "Lower with control, no swinging."]),
        ex("Cable Wood Chop", "3 x 12 each side", "2-0-2", "60s", ["Set cable to high position.", "Pull diagonally across your body.", "Rotate through your core, not arms."]),
      ],
      cooldown: [
        ex("Standing Quad Stretch", "30s each leg", "", "", ["Pull heel to glutes.", "Keep knees together."]),
        ex("Seated Hamstring Stretch", "30s each leg", "", "", ["One leg out, reach for toes.", "Back straight."]),
        ex("Kneeling Hip Flexor Stretch", "30s each side", "", "", ["Kneel on one knee, push hips forward.", "Deep stretch in front of hip."]),
        ex("Lower Back Stretch", "30s", "", "", ["Pull both knees to chest.", "Rock gently."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale, long exhale.", "Fully relax."]),
      ]
    }
  ]
};

// 7. Home Workout Plan (No Equipment)
export const homeWorkoutPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'home workout plan',
  description: 'No equipment needed. Full body bodyweight training you can do anywhere. Perfect for beginners building baseline strength and endurance.',
  type: 'sample',
  tags: ['bodyweight', 'home', 'beginner'],
  daysPerWeek: 3,
  estimatedDuration: '35-45 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Full Body A',
      skill: '',
      time: '40 min',
      type: 'strength',
      order: 1,
      warmup: [
        ex("Jumping Jacks", "1 x 30 sec", "", "", ["Jump feet wide and clap hands overhead.", "Land softly on the balls of your feet."]),
        ex("High Knees", "1 x 30 sec", "", "", ["Drive knees up to hip height.", "Pump arms for momentum."]),
        ex("Arm Circles", "1 x 20 each direction", "", "", ["Small to big circles.", "Loosen shoulder joints."]),
        ex("Bodyweight Squats", "1 x 10", "", "", ["Slow and controlled.", "Full depth to warm up legs."]),
        ex("Hip Circles", "10 each direction", "", "", ["Stand on one leg, circle the knee.", "Opens up the hips."]),
      ],
      skillWork: [],
      strength: [
        ex("Push-Up", "3 x 10", "2-0-2", "60s", ["Hands shoulder-width, body in a straight line.", "Lower chest to the floor.", "If too hard, do them on your knees."]),
        ex("Bodyweight Squat", "3 x 15", "2-1-2", "60s", ["Feet shoulder-width, squat below parallel.", "Keep chest up and heels on the ground.", "Drive through your whole foot to stand."]),
        ex("Glute Bridge", "3 x 15", "2-1-2", "45s", ["Lie on back, feet flat, knees bent.", "Push hips up and squeeze glutes at the top.", "Lower slowly — don't just drop."]),
        ex("Plank Hold", "3 x 30 sec", "", "45s", ["Forearms on the ground, body straight.", "Squeeze your glutes and brace core.", "Don't let hips sag or pike up."]),
        ex("Bird Dog", "3 x 12 each side", "2-0-2", "45s", ["On hands and knees.", "Extend opposite arm and leg at the same time.", "Keep core tight and back flat."]),
      ],
      cooldown: [
        ex("Chest Stretch", "20s", "", "", ["Clasp hands behind your back.", "Lift arms and open your chest."]),
        ex("Standing Quad Stretch", "20s each leg", "", "", ["Pull one heel to your glutes.", "Keep knees together."]),
        ex("Seated Hamstring Stretch", "20s each leg", "", "", ["Sit with one leg out, reach for toes.", "Keep back straight."]),
        ex("Deep Breathing", "1 min", "", "", ["Inhale 4 seconds, exhale 6 seconds.", "Let your body relax."]),
      ]
    },
    {
      dayNumber: 2,
      title: 'Upper Body + Core',
      skill: '',
      time: '40 min',
      type: 'strength',
      order: 2,
      warmup: [
        ex("Jumping Jacks", "1 x 30 sec", "", "", ["Jump and clap overhead.", "Land softly."]),
        ex("Arm Circles", "1 x 20 each direction", "", "", ["Small to big circles.", "Warms up shoulders."]),
        ex("Leg Swings", "1 x 10 each leg", "", "", ["Swing leg forward and back.", "Hold something for balance."]),
        ex("Shoulder Taps in Plank", "1 x 10 each side", "", "", ["Hold a plank position.", "Tap opposite shoulder with each hand."]),
        ex("Bodyweight Lunges", "1 x 8 each leg", "", "", ["Step forward into a lunge.", "Torso upright."]),
      ],
      skillWork: [],
      strength: [
        ex("Pike Push-Up", "3 x 8", "2-0-2", "60s", ["Hips high in an inverted V position.", "Lower your head toward the ground.", "Targets shoulders more than regular push-ups."]),
        ex("Chair Dip", "3 x 10", "2-0-2", "60s", ["Hands on a sturdy chair edge behind you.", "Lower body by bending elbows.", "Press back up, squeezing triceps."]),
        ex("Reverse Lunge", "3 x 12 each leg", "2-1-2", "60s", ["Step one foot backward into a lunge.", "Lower back knee toward the ground.", "Push through front foot to return."]),
        ex("Side Plank", "3 x 20 sec each side", "", "45s", ["Lie on your side, elbow under shoulder.", "Lift hips off the ground.", "Keep body in a straight line."]),
        ex("Mountain Climbers", "3 x 30 sec", "", "45s", ["Start in push-up position.", "Drive knees toward chest alternating fast.", "Keep your core tight throughout."]),
      ],
      cooldown: [
        ex("Overhead Shoulder Stretch", "20s each side", "", "", ["Reach arm overhead, bend elbow.", "Pull gently with the other hand."]),
        ex("Tricep Stretch", "20s each side", "", "", ["Arm overhead, elbow behind head.", "Gently pull with opposite hand."]),
        ex("Kneeling Hip Flexor Stretch", "20s each side", "", "", ["Kneel on one knee, push hips forward.", "Feel stretch in front of hip."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale, long exhale.", "Relax completely."]),
      ]
    },
    {
      dayNumber: 3,
      title: 'Full Body B',
      skill: '',
      time: '40 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("High Knees", "1 x 30 sec", "", "", ["Drive knees up fast.", "Pump your arms."]),
        ex("Butt Kicks", "1 x 30 sec", "", "", ["Jog in place, kick heels to glutes.", "Light and fast."]),
        ex("Arm Circles", "1 x 20 each direction", "", "", ["Small to big circles.", "Warms up shoulders."]),
        ex("Bodyweight Squats", "1 x 10", "", "", ["Slow and controlled.", "Full depth."]),
        ex("Cat-Cow Stretch", "1 x 10", "", "", ["On hands and knees, arch and round.", "Mobilizes the spine."]),
      ],
      skillWork: [],
      strength: [
        ex("Diamond Push-Up", "3 x 10", "2-0-2", "60s", ["Hands together forming a diamond shape.", "Lower chest to your hands.", "Focuses on triceps and inner chest."]),
        ex("Bulgarian Split Squat (Using Chair)", "3 x 10 each leg", "2-1-2", "60s", ["Rear foot on a chair or couch.", "Lower until front thigh is parallel.", "Keep most weight on your front foot."]),
        ex("Single Leg Glute Bridge", "3 x 12 each leg", "2-1-2", "45s", ["Lie on back, one foot planted, other leg straight up.", "Push hips up with the planted foot.", "Squeeze glute at the top."]),
        ex("Superman Hold", "3 x 15", "2-1-2", "45s", ["Lie face down, arms extended overhead.", "Lift arms, chest, and legs off the ground.", "Squeeze lower back and glutes."]),
        ex("Dead Bug", "3 x 10 each side", "2-0-2", "45s", ["Lie on back, arms and legs in the air.", "Extend opposite arm and leg slowly.", "Keep lower back pressed into the floor."]),
      ],
      cooldown: [
        ex("Chest Stretch", "20s", "", "", ["Clasp hands behind back, lift arms.", "Open up your chest."]),
        ex("Standing Quad Stretch", "20s each leg", "", "", ["Pull heel to glutes.", "Keep knees together."]),
        ex("Lower Back Stretch", "20s", "", "", ["Pull both knees to chest on your back.", "Rock gently side to side."]),
        ex("Full Body Stretch", "30s", "", "", ["Stand up, reach arms overhead.", "Stretch your whole body tall."]),
        ex("Deep Breathing", "1 min", "", "", ["Slow inhale 4 seconds, exhale 6.", "Let everything relax."]),
      ]
    }
  ]
};

export const hyroxPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'HYROX Performance Program',
  description: 'Intermediate–Advanced HYROX race prep. Improve race performance, strength, endurance, VO2 Max, and work capacity.',
  type: 'sample',
  tags: ['hyrox', 'endurance', 'hybrid', 'advanced'],
  daysPerWeek: 6,
  estimatedDuration: '60-90 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Lower Body Strength + Zone 2',
      skill: '',
      time: '90 min',
      type: 'hybrid',
      order: 1,
      warmup: [
        ex("Bike", "5 min", "", "", ["Easy pace.", "Warm up legs."]),
        ex("Hip mobility", "2 x 10", "", "", ["Open up hips."]),
        ex("Glute activation", "2 x 15", "", "", ["Banded side steps or glute bridges."]),
        ex("Goblet Squat", "1 x 10", "", "", ["Light kettlebell.", "Focus on depth."]),
        ex("Walking Lunges", "1 x 10", "", "", ["Bodyweight."])
      ],
      skillWork: [],
      strength: [
        ex("Back Squat", "5 x 5", "2-0-2", "2 min", ["RPE 8.", "Drive through whole foot."]),
        ex("Romanian Deadlift", "4 x 8", "2-1-2", "90s", ["Hinge at hips.", "Keep bar close."]),
        ex("Walking Lunges", "3 x 12", "1-0-1", "60s", ["Dumbbells or kettlebells."]),
        ex("Hip Thrust", "3 x 10", "2-1-2", "90s", ["Squeeze glutes at the top."]),
        ex("Standing Calf Raise", "4 x 15", "2-1-2", "45s", ["Full stretch at the bottom."])
      ],
      cooldown: [
        ex("Zone 2 Run", "35 min", "", "", ["Heart Rate 65–75%.", "Conversational pace."]),
        ex("Hamstrings Stretch", "1 min", "", "", ["Reach for toes."]),
        ex("Hip Flexors Stretch", "1 min each", "", "", ["Couch stretch."]),
        ex("Calves Stretch", "1 min each", "", "", ["Wall calf stretch."])
      ]
    },
    {
      dayNumber: 2,
      title: 'HYROX Engine Builder',
      skill: 'Conditioning',
      time: '60 min',
      type: 'cardio',
      order: 2,
      warmup: [
        ex("Easy jog", "8 min", "", "", ["Conversational pace."]),
        ex("Mobility", "5 min", "", "", ["Dynamic drills.", "Leg swings, arm circles."])
      ],
      skillWork: [],
      strength: [
        ex("1000m Run", "4 rounds", "", "0s", ["Pace slightly faster than Zone 2.", "Transition quickly to next exercise."]),
        ex("SkiErg", "500m", "", "0s", ["Long powerful pulls.", "Use core and lats."]),
        ex("Burpee Broad Jumps", "20 reps", "", "0s", ["Efficient chest-to-deck.", "Consistent jump length."]),
        ex("Row", "500m", "", "0s", ["Strong leg drive.", "Consistent stroke rate."]),
        ex("Walking Lunges", "20 reps", "", "0s", ["Unweighted or light sandbag.", "Keep chest up."]),
        ex("Wall Balls", "20 reps", "", "3 min", ["Squat to parallel.", "Hit the target consistently.", "Rest 3 minutes after this exercise to complete 1 round."])
      ],
      cooldown: [
        ex("Farmer Carry Finisher", "3 x 100m", "", "60s", ["Heavy kettlebells.", "Keep core braced.", "Stand tall."]),
        ex("Walking Recovery", "5 min", "", "", ["Let heart rate drop."])
      ]
    },
    {
      dayNumber: 3,
      title: 'Upper Body Strength',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("SkiErg", "5 min", "", "", ["Light pace.", "Warm up lats and triceps."]),
        ex("Band Pull-Aparts", "2 x 15", "", "", ["Squeeze shoulder blades."]),
        ex("Push-Ups", "2 x 10", "", "", ["Controlled tempo."])
      ],
      skillWork: [],
      strength: [
        ex("Bench Press", "5 x 5", "2-0-2", "2 min", ["Plant feet.", "Keep shoulders retracted."]),
        ex("Weighted Pull-ups", "4 x 6", "2-0-2", "90s", ["Full extension at bottom.", "Chin over bar."]),
        ex("Standing Overhead Press", "4 x 8", "2-0-2", "90s", ["Brace core.", "Don't overextend lower back."]),
        ex("Chest Supported Row", "4 x 10", "2-1-2", "90s", ["Squeeze lats.", "Control the eccentric."]),
        ex("Face Pull", "3 x 15", "2-1-2", "60s", ["Pull to eye level.", "Focus on rear delts."]),
        ex("Hammer Curl", "3 x 12", "2-0-2", "60s", ["Keep elbows pinned."]),
        ex("Triceps Rope Pushdown", "3 x 12", "2-0-2", "60s", ["Spread the rope at the bottom."]),
        ex("Hanging Leg Raise", "3 x 15", "2-0-2", "60s", ["Control the swing.", "Use abs, not momentum."]),
        ex("Pallof Press", "3 x 15", "2-1-2", "60s", ["Anti-rotation.", "Keep core braced."])
      ],
      cooldown: [
        ex("Lat Stretch", "1 min each", "", "", ["Use a band or rack."]),
        ex("Chest Stretch", "1 min each", "", "", ["Doorway stretch."])
      ]
    },
    {
      dayNumber: 4,
      title: 'Speed & Running',
      skill: 'Running',
      time: '60 min',
      type: 'cardio',
      order: 4,
      warmup: [
        ex("Dynamic Drills", "5 min", "", "", ["A-skips, B-skips."]),
        ex("High Knees", "2 x 20m", "", "", ["Fast feet."]),
        ex("Butt Kicks", "2 x 20m", "", "", ["Quick turnover."]),
        ex("Leg Swings", "2 x 10 each", "", "", ["Front-to-back and lateral."])
      ],
      skillWork: [],
      strength: [
        ex("400m Run", "8 x 400m", "", "90s", ["90% effort.", "Consistent pacing across all 8 intervals."]),
        ex("100m Sprint", "6 x 100m", "", "Walk", ["Max effort.", "Walk back recovery."])
      ],
      cooldown: [
        ex("Cooldown Jog", "10 min", "", "", ["Very slow pace.", "Flush out legs."]),
        ex("Foam Roll Quads", "2 min", "", "", ["Roll slowly over tight spots."]),
        ex("Foam Roll Calves", "2 min", "", "", ["Cross one leg over the other for more pressure."])
      ]
    },
    {
      dayNumber: 5,
      title: 'HYROX Race Simulation',
      skill: 'Endurance',
      time: '75 min',
      type: 'hybrid',
      order: 5,
      warmup: [
        ex("Easy jog & mobility", "10 min", "", "", ["Prep joints for all movements.", "Light dynamic stretches."])
      ],
      skillWork: [],
      strength: [
        ex("Run", "1 km", "", "0s", ["Find your race pace."]),
        ex("SkiErg", "1000m", "", "0s", ["Steady powerful pulls."]),
        ex("Run", "1 km", "", "0s", ["Active recovery on the run."]),
        ex("Sled Push", "50m", "", "0s", ["Stay low.", "Drive through legs."]),
        ex("Run", "1 km", "", "0s", ["Find your breath."]),
        ex("Sled Pull", "50m", "", "0s", ["Lean back.", "Use bodyweight."]),
        ex("Run", "1 km", "", "0s", ["Keep cadence high."]),
        ex("Burpee Broad Jump", "80m", "", "0s", ["Find a rhythm.", "Don't rush and burn out."]),
        ex("Run", "1 km", "", "0s", ["Push the pace if feeling good."]),
        ex("Row", "1000m", "", "0s", ["Legs, body, arms.", "Keep stroke rate steady."]),
        ex("Run", "1 km", "", "0s", ["Final running stretch."]),
        ex("Farmer Carry", "200m", "", "0s", ["Heavy kettlebells.", "Grip strength challenge."]),
        ex("Run", "1 km", "", "0s", ["Last run.", "Empty the tank."]),
        ex("Sandbag Lunges", "100m", "", "0s", ["Sandbag on shoulders.", "Keep chest up."]),
        ex("Run", "1 km", "", "0s", ["Sprint to the finish line."]),
        ex("Wall Balls", "100 reps", "", "0s", ["Break into manageable sets.", "Breathe at the top."])
      ],
      cooldown: [
        ex("Walking Recovery", "10 min", "", "", ["Do not sit down immediately."]),
        ex("Stretch", "10 min", "", "", ["Full body stretch.", "Focus on hips and legs."])
      ]
    },
    {
      dayNumber: 6,
      title: 'Long Endurance',
      skill: 'Zone 2',
      time: '75-90 min',
      type: 'cardio',
      order: 6,
      warmup: [
        ex("Dynamic Drills", "5 min", "", "", ["Light warmup before the long session."])
      ],
      skillWork: [],
      strength: [
        ex("Endurance Activity", "75-90 min", "", "", ["Choose: 75 min Run, 90 min Cycling, or 60 min Row.", "Keep Heart Rate in Zone 2.", "Strictly aerobic."])
      ],
      cooldown: [
        ex("Mobility", "15 min", "", "", ["Couch Stretch.", "Thoracic Rotation.", "Deep Squat Hold.", "Pigeon Stretch.", "World's Greatest Stretch.", "Shoulder Pass Throughs."]),
        ex("Foam Rolling", "10 min", "", "", ["Foam Roll Quads.", "Foam Roll Glutes.", "Foam Roll Lats."])
      ]
    }
  ]
};

export const fatLossPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Beginner Fat Loss Program',
  description: 'Lose body fat while preserving muscle. Focuses on fat loss, learning movement patterns, and building consistency.',
  type: 'sample',
  tags: ['fat-loss', 'beginner', 'gym', 'cardio'],
  daysPerWeek: 4,
  estimatedDuration: '45-60 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Full Body A',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 1,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", ["Brisk pace to raise heart rate."]),
        ex("Arm circles", "20 reps", "", "", ["Warm up shoulders."]),
        ex("Hip circles", "20 reps", "", "", ["Loosen hips."]),
        ex("Bodyweight squats", "15 reps", "", "", ["Warm up legs."]),
        ex("Glute bridges", "15 reps", "", "", ["Activate glutes."]),
        ex("Bird Dogs", "10 reps", "", "", ["Activate core."])
      ],
      skillWork: [],
      strength: [
        ex("Goblet Squat", "3 x 10", "2-0-2", "90s", ["Keep chest up."]),
        ex("Dumbbell Bench Press", "3 x 10", "2-0-2", "90s", ["Press evenly."]),
        ex("Lat Pulldown", "3 x 12", "2-1-2", "90s", ["Pull to chest."]),
        ex("Romanian Deadlift", "3 x 10", "2-0-2", "90s", ["Hinge at hips."]),
        ex("Walking Lunges", "2 x 12", "2-0-2", "60s", ["Keep torso upright."]),
        ex("Plank", "3 x 30 sec", "", "60s", ["Keep core tight."])
      ],
      cooldown: [
        ex("Incline Walk Finish", "15 min", "", "", ["Steady state cardio."]),
        ex("Hamstring Stretch", "30s", "", "", []),
        ex("Quad Stretch", "30s", "", "", []),
        ex("Chest Stretch", "30s", "", "", []),
        ex("Hip Flexor Stretch", "30s", "", "", []),
        ex("Deep Breathing", "1 min", "", "", [])
      ]
    },
    {
      dayNumber: 2,
      title: 'Cardio + Core',
      skill: 'Core',
      time: '45 min',
      type: 'cardio',
      order: 2,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Brisk Walk", "30 min", "", "0s", ["Keep a steady brisk pace."]),
        ex("Dead Bug", "3 x 12", "", "45s", ["Keep lower back flat against floor."]),
        ex("Side Plank", "3 x 30 sec", "", "45s", ["Keep hips elevated."]),
        ex("Bird Dog", "3 x 10 each", "", "45s", ["Extend opposite arm and leg."]),
        ex("Pallof Press", "3 x 12", "", "45s", ["Resist rotation."])
      ],
      cooldown: [
        ex("Deep Breathing", "1 min", "", "", [])
      ]
    },
    {
      dayNumber: 4,
      title: 'Full Body B',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", []),
        ex("Arm circles", "20 reps", "", "", []),
        ex("Hip circles", "20 reps", "", "", []),
        ex("Bodyweight squats", "15 reps", "", "", []),
        ex("Glute bridges", "15 reps", "", "", []),
        ex("Bird Dogs", "10 reps", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Leg Press", "3 x 10", "2-0-2", "90s", ["Control the descent."]),
        ex("Seated Row", "3 x 12", "2-1-2", "90s", ["Squeeze shoulder blades."]),
        ex("Incline DB Press", "3 x 10", "2-0-2", "90s", ["Upper chest focus."]),
        ex("Hip Thrust", "3 x 12", "2-1-2", "90s", ["Squeeze glutes at top."]),
        ex("Shoulder Press", "3 x 10", "2-0-2", "90s", ["Dumbbells or machine."]),
        ex("Cable Crunch", "3 x 15", "2-0-2", "60s", ["Contract abs fully."])
      ],
      cooldown: [
        ex("Hamstring Stretch", "30s", "", "", []),
        ex("Quad Stretch", "30s", "", "", []),
        ex("Chest Stretch", "30s", "", "", []),
        ex("Hip Flexor Stretch", "30s", "", "", []),
        ex("Deep Breathing", "1 min", "", "", [])
      ]
    },
    {
      dayNumber: 6,
      title: 'Full Body C',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 4,
      warmup: [
        ex("Treadmill Walk", "5 min", "", "", []),
        ex("Arm circles", "20 reps", "", "", []),
        ex("Hip circles", "20 reps", "", "", []),
        ex("Bodyweight squats", "15 reps", "", "", []),
        ex("Glute bridges", "15 reps", "", "", []),
        ex("Bird Dogs", "10 reps", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Split Squat", "3 x 10 each", "2-0-2", "90s", ["Keep chest up."]),
        ex("Chest Press", "3 x 10", "2-0-2", "90s", ["Machine or flat bench."]),
        ex("Cable Row", "3 x 12", "2-1-2", "90s", ["Pull to belly."]),
        ex("Leg Curl", "3 x 12", "2-1-2", "90s", ["Hamstring focus."]),
        ex("Lateral Raise", "3 x 15", "2-0-2", "60s", ["Side delts."]),
        ex("Farmer Carry", "3 x 40m", "", "60s", ["Grip strength."])
      ],
      cooldown: [
        ex("Hamstring Stretch", "30s", "", "", []),
        ex("Quad Stretch", "30s", "", "", []),
        ex("Chest Stretch", "30s", "", "", []),
        ex("Hip Flexor Stretch", "30s", "", "", []),
        ex("Deep Breathing", "1 min", "", "", [])
      ]
    }
  ]
};

export const postureCorePlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Posture & Core Program',
  description: 'Improve posture, reduce stiffness, strengthen the core. Designed for office workers and students.',
  type: 'sample',
  tags: ['posture', 'core', 'mobility', 'beginner'],
  daysPerWeek: 4,
  estimatedDuration: '35-45 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Upper Posture',
      skill: '',
      time: '40 min',
      type: 'strength',
      order: 1,
      warmup: [
        ex("Foam Roll", "5 min", "", "", ["Upper back focus."]),
        ex("Thoracic Rotations", "10 reps each", "", "", []),
        ex("Cat Cow", "15 reps", "", "", []),
        ex("World's Greatest Stretch", "5 each", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Band Pull Apart", "4 x 15", "2-0-2", "60s", ["Squeeze shoulder blades."]),
        ex("Face Pull", "4 x 15", "2-1-2", "60s", ["Pull to forehead."]),
        ex("Wall Slides", "3 x 15", "2-0-2", "60s", ["Keep lower back flat against wall."]),
        ex("Chest Supported Row", "3 x 12", "2-1-2", "60s", ["Avoid shrugging."]),
        ex("Reverse Fly", "3 x 15", "2-0-2", "60s", ["Light weight, focus on rear delts."]),
        ex("YTWL Raises", "3 x 10", "2-1-2", "60s", ["Maintain neutral spine."])
      ],
      cooldown: [
        ex("Deep Breathing", "2 min", "", "", ["Keep ribs stacked over pelvis."])
      ]
    },
    {
      dayNumber: 2,
      title: 'Core Stability',
      skill: '',
      time: '35 min',
      type: 'strength',
      order: 2,
      warmup: [
        ex("Foam Roll", "5 min", "", "", []),
        ex("Thoracic Rotations", "10 reps each", "", "", []),
        ex("Cat Cow", "15 reps", "", "", []),
        ex("World's Greatest Stretch", "5 each", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Dead Bug", "3 x 12", "", "60s", ["Keep lower back flat."]),
        ex("Bird Dog", "3 x 10 each", "", "60s", ["Extend smoothly."]),
        ex("Pallof Press", "3 x 12 each", "", "60s", ["Resist rotation."]),
        ex("Side Plank", "3 x 30 sec", "", "60s", ["Keep body in straight line."]),
        ex("Front Plank", "3 x 45 sec", "", "60s", ["Keep ribs stacked."]),
        ex("Suitcase Carry", "3 x 40m", "", "60s", ["One sided carry. Stay upright."])
      ],
      cooldown: [
        ex("Deep Breathing", "2 min", "", "", [])
      ]
    },
    {
      dayNumber: 4,
      title: 'Lower Body Stability',
      skill: '',
      time: '45 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("Foam Roll", "5 min", "", "", []),
        ex("Thoracic Rotations", "10 reps each", "", "", []),
        ex("Cat Cow", "15 reps", "", "", []),
        ex("World's Greatest Stretch", "5 each", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Goblet Squat", "3 x 10", "2-0-2", "60s", ["Maintain neutral spine."]),
        ex("Split Squat", "3 x 10 each", "2-0-2", "60s", ["Drop back knee straight down."]),
        ex("Glute Bridge", "3 x 15", "2-1-2", "60s", ["Squeeze glutes."]),
        ex("Single Leg RDL", "3 x 8 each", "2-0-2", "60s", ["Balance and hamstring stretch."]),
        ex("Clamshell", "3 x 15 each", "2-0-2", "45s", ["Glute medius activation."]),
        ex("Calf Raise", "3 x 15", "2-1-2", "45s", ["Full range of motion."])
      ],
      cooldown: [
        ex("Deep Breathing", "2 min", "", "", [])
      ]
    },
    {
      dayNumber: 6,
      title: 'Full Mobility',
      skill: 'Mobility',
      time: '35 min',
      type: 'mobility',
      order: 4,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Yoga Flow", "10 min", "", "", ["Gentle movements."]),
        ex("Hip Openers", "5 min", "", "", ["Pigeon pose, 90/90 stretch."]),
        ex("Thoracic Mobility", "5 min", "", "", ["Open up upper back."]),
        ex("Hamstring Stretch", "5 min", "", "", ["Gentle static hold."]),
        ex("Foam Rolling", "5 min", "", "", ["Full body roll out."])
      ],
      cooldown: [
        ex("Breathing", "5 min", "", "", ["Relax and decompress."])
      ]
    }
  ]
};

export const powerliftingPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Powerlifting Strength Program',
  description: 'Increase Squat, Bench, and Deadlift. 12-week peaking block for intermediate to advanced lifters.',
  type: 'sample',
  tags: ['powerlifting', 'strength', 'barbell', 'advanced'],
  daysPerWeek: 4,
  estimatedDuration: '75-90 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Heavy Squat',
      skill: '',
      time: '90 min',
      type: 'strength',
      order: 1,
      warmup: [
        ex("Hip Mobility", "5 min", "", "", ["Open up hips."]),
        ex("Foam Roll", "5 min", "", "", ["Legs and lower back."])
      ],
      skillWork: [],
      strength: [
        ex("Back Squat", "5 x 5", "2-0-X", "3-5 min", ["Heavy main working sets."]),
        ex("Pause Squat", "3 x 3", "2-2-X", "3 min", ["Pause at the bottom."]),
        ex("Romanian Deadlift", "4 x 8", "2-1-2", "2 min", ["Hamstring focus."]),
        ex("Leg Press", "3 x 10", "2-0-2", "90s", ["Volume accessory."]),
        ex("Plank", "3 x 60 sec", "", "60s", ["Core stability."])
      ],
      cooldown: [
        ex("Deep Breathing", "2 min", "", "", [])
      ]
    },
    {
      dayNumber: 2,
      title: 'Heavy Bench',
      skill: '',
      time: '80 min',
      type: 'strength',
      order: 2,
      warmup: [
        ex("Shoulder Mobility", "5 min", "", "", []),
        ex("Band Pull Aparts", "3 x 15", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Bench Press", "5 x 5", "2-1-X", "3-5 min", ["Pause on chest."]),
        ex("Close Grip Bench", "4 x 6", "2-0-X", "3 min", ["Tricep focus."]),
        ex("Incline DB Press", "3 x 10", "2-0-2", "2 min", ["Upper chest."]),
        ex("Barbell Row", "4 x 8", "2-1-2", "2 min", ["Heavy rows."]),
        ex("Face Pull", "3 x 15", "2-1-2", "90s", ["Rear delts."])
      ],
      cooldown: [
        ex("Deep Breathing", "2 min", "", "", [])
      ]
    },
    {
      dayNumber: 4,
      title: 'Heavy Deadlift',
      skill: '',
      time: '90 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("Hip Mobility", "5 min", "", "", []),
        ex("Glute Bridges", "2 x 15", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Deadlift", "5 x 3", "X-0-X", "3-5 min", ["Heavy pulls."]),
        ex("Deficit Deadlift", "3 x 5", "2-0-X", "3 min", ["Stand on a small plate."]),
        ex("Hip Thrust", "3 x 8", "2-1-2", "2 min", ["Heavy glute accessory."]),
        ex("Reverse Hyper", "3 x 12", "2-0-2", "90s", ["Lower back health."]),
        ex("Farmer Carry", "3 x 40m", "", "90s", ["Grip strength."])
      ],
      cooldown: [
        ex("Deep Breathing", "2 min", "", "", [])
      ]
    },
    {
      dayNumber: 6,
      title: 'Volume & Accessories',
      skill: '',
      time: '75 min',
      type: 'strength',
      order: 4,
      warmup: [
        ex("Dynamic Drills", "5 min", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Front Squat", "4 x 6", "2-0-X", "2-3 min", ["Quad and core focus."]),
        ex("Overhead Press", "4 x 6", "2-0-X", "2-3 min", ["Strict press."]),
        ex("Weighted Pull-up", "4 x 6", "2-0-X", "2 min", ["Heavy pull."]),
        ex("Chest Supported Row", "3 x 10", "2-1-2", "90s", ["Upper back."]),
        ex("Bicep Curl", "3 x 12", "2-0-2", "60s", ["Arm accessory."]),
        ex("Tricep Pushdown", "3 x 12", "2-0-2", "60s", ["Arm accessory."]),
        ex("Core Work", "3 x 15", "", "60s", ["Ab wheel or leg raises."])
      ],
      cooldown: [
        ex("Deep Breathing", "2 min", "", "", [])
      ]
    }
  ]
};

export const marathonPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Marathon Training Program',
  description: 'Complete a full marathon (42.2 km). 16-week progression blending easy runs, speed work, tempo runs, and long distance.',
  type: 'sample',
  tags: ['running', 'endurance', 'cardio', 'beginner', 'marathon'],
  daysPerWeek: 5,
  estimatedDuration: '45-120+ min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Recovery Run',
      skill: 'Zone 2',
      time: '35 min',
      type: 'cardio',
      order: 1,
      warmup: [
        ex("Brisk walk", "5 min", "", "", []),
        ex("Leg swings", "10 each", "", "", []),
        ex("Walking lunges", "10 each", "", "", []),
        ex("High knees", "20m", "", "", []),
        ex("Ankle circles", "10 each", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Easy Run", "5 km", "", "", ["Zone 2. Keep it conversational."])
      ],
      cooldown: [
        ex("Easy walk", "5 min", "", "", []),
        ex("Calf stretch", "1 min", "", "", []),
        ex("Hamstring stretch", "1 min", "", "", []),
        ex("Quad stretch", "1 min", "", "", [])
      ]
    },
    {
      dayNumber: 2,
      title: 'Speed Work',
      skill: 'Intervals',
      time: '45 min',
      type: 'cardio',
      order: 2,
      warmup: [
        ex("Easy jog", "2 km", "", "", []),
        ex("Dynamic Drills", "5 min", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("800m Repeats", "6 x 800m", "", "400m jog", ["5K Race Pace."])
      ],
      cooldown: [
        ex("Cooldown jog", "2 km", "", "", []),
        ex("Stretching", "5 min", "", "", [])
      ]
    },
    {
      dayNumber: 3,
      title: 'Strength for Runners',
      skill: '',
      time: '45 min',
      type: 'strength',
      order: 3,
      warmup: [
        ex("Dynamic Drills", "5 min", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Goblet Squat", "3 x 12", "2-0-2", "60s", ["Build leg strength."]),
        ex("Split Squat", "3 x 10 each", "2-0-2", "60s", ["Unilateral stability."]),
        ex("Romanian Deadlift", "3 x 12", "2-1-2", "60s", ["Hamstring injury prevention."]),
        ex("Push-ups", "3 x 15", "2-0-2", "60s", ["Upper body endurance."]),
        ex("Dumbbell Rows", "3 x 12", "2-1-2", "60s", ["Posture maintenance."]),
        ex("Plank", "3 x 60 sec", "", "60s", ["Core stability."])
      ],
      cooldown: [
        ex("Stretching", "5 min", "", "", [])
      ]
    },
    {
      dayNumber: 4,
      title: 'Tempo Run',
      skill: 'Threshold',
      time: '50-60 min',
      type: 'cardio',
      order: 4,
      warmup: [
        ex("Brisk walk", "5 min", "", "", []),
        ex("Leg swings", "10 each", "", "", []),
        ex("Walking lunges", "10 each", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Tempo Run", "5-12 km", "", "", ["Pace slightly slower than 10K pace.", "Progresses from 5km to 12km over the weeks."])
      ],
      cooldown: [
        ex("Easy walk", "5 min", "", "", []),
        ex("Stretching", "5 min", "", "", [])
      ]
    },
    {
      dayNumber: 6,
      title: 'Long Run',
      skill: 'Endurance',
      time: '60-180+ min',
      type: 'cardio',
      order: 5,
      warmup: [
        ex("Brisk walk", "5 min", "", "", []),
        ex("Dynamic stretches", "5 min", "", "", [])
      ],
      skillWork: [],
      strength: [
        ex("Long Run", "10-34 km", "", "", ["Slow, conversational pace.", "Follow the 16-week progression table from 10km up to 34km."])
      ],
      cooldown: [
        ex("Easy walk", "10 min", "", "", ["Crucial for flushing legs."]),
        ex("Full Body Stretch", "10 min", "", "", ["Calves, Hamstrings, Quads, Hips."]),
        ex("Foam Rolling", "10 min", "", "", ["Optional but recommended."])
      ]
    }
  ]
};

export const SAMPLE_PLANS = [
  tmsCalisthenicsPlan,
  personalCalisthenicsPlan,
  pushPullLegsPlan,
  upperLowerPlan,
  broSplitPlan,
  threeDayPlan,
  fiveDayPlan,
  homeWorkoutPlan,
  hyroxPlan,
  fatLossPlan,
  postureCorePlan,
  powerliftingPlan,
  marathonPlan
];
