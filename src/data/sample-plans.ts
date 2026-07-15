import type { Plan } from '@/types';
import { Timestamp } from 'firebase/firestore';

function ex(name: string, sets: string, tempo: string, rest: string, cues: string[], yt = name) {
  return { name, sets, tempo, rest, cues, yt };
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
  description: 'Classic 3-day hypertrophy split using gym equipment (barbells and dumbbells). Perfect for building muscle.',
  type: 'sample',
  tags: ['gym', 'barbell', 'hypertrophy'],
  daysPerWeek: 3,
  estimatedDuration: '50-60 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Day 1: Push (Chest, Shoulders & Triceps)',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 1,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Bench Press", "4 x 8", "2-0-2", "90s", ["Retract shoulder blades.", "Lower bar to mid-chest."]),
        ex("Dumbbell Shoulder Press", "3 x 10", "2-0-2", "75s", ["Press dumbbells straight up overhead."]),
        ex("Dumbbell Lateral Raise", "3 x 15", "", "60s", ["Raise weights to shoulder level."]),
        ex("Cable Tricep Pushdown", "3 x 12", "2-0-2", "60s", ["Keep elbows pinned to sides."])
      ],
      cooldown: []
    },
    {
      dayNumber: 2,
      title: 'Day 2: Pull (Back & Biceps)',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 2,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Row", "4 x 8", "2-0-2", "90s", ["Flat back, pull to abdomen."]),
        ex("Lat Pulldown (Wide Grip)", "3 x 10", "", "75s", ["Drive elbows down to ribs."]),
        ex("Dumbbell Bicep Curl", "3 x 12", "2-0-2", "60s", ["No swinging, squeeze biceps."])
      ],
      cooldown: []
    },
    {
      dayNumber: 3,
      title: 'Day 3: Legs (Quads, Hamstrings & Calves)',
      skill: '',
      time: '55 min',
      type: 'strength',
      order: 3,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Squat", "4 x 8", "3-1-1", "90s", ["Squat to parallel or lower."]),
        ex("Romanian Deadlift (Barbell)", "3 x 10", "", "90s", ["Hinge at hips, stretch hamstrings."]),
        ex("Standing Calf Raise (Machine)", "4 x 15", "", "45s", ["Get a full stretch and peak squeeze."])
      ],
      cooldown: []
    }
  ]
};

// 3. Upper Lower Split
export const upperLowerPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Upper Lower Split',
  description: '4-day powerbuilding split alternating between upper body push/pull and lower body squat/hinge exercises.',
  type: 'sample',
  tags: ['gym', 'powerbuilding', '4-day'],
  daysPerWeek: 4,
  estimatedDuration: '60 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Day 1: Upper Body A',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 1,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Bench Press", "4 x 6", "2-0-2", "90s", ["Keep shoulder blades pinned."]),
        ex("Barbell Row", "4 x 8", "", "90s", ["Pull to lower ribcage."]),
        ex("Dumbbell Shoulder Press", "3 x 10", "", "75s", ["Press overhead with control."]),
        ex("Pull-Up", "3 x max", "", "90s", ["Full range, chin over bar."])
      ],
      cooldown: []
    },
    {
      dayNumber: 2,
      title: 'Day 2: Lower Body A',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 2,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Squat", "4 x 6", "3-1-1", "2 min", ["Squat below parallel safely."]),
        ex("Romanian Deadlift (Barbell)", "3 x 8", "", "90s", ["Hinge forward, feel hamstrings stretch."]),
        ex("Leg Press", "3 x 12", "", "75s", ["Avoid locking knees."])
      ],
      cooldown: []
    },
    {
      dayNumber: 3,
      title: 'Day 3: Upper Body B',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 3,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Overhead Press (OHP)", "4 x 6", "", "90s", ["Squeeze glutes, push straight overhead."]),
        ex("Lat Pulldown (Wide Grip)", "3 x 10", "", "75s", ["Pull bar to collarbone."]),
        ex("EZ-Bar Bicep Curl", "3 x 12", "", "60s", ["Curl up, keep elbows fixed."]),
        ex("Cable Tricep Pushdown", "3 x 12", "", "60s", ["Extend elbows fully."])
      ],
      cooldown: []
    },
    {
      dayNumber: 4,
      title: 'Day 4: Lower Body B',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 4,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Deadlift", "3 x 5", "", "2 min", ["Flat back, pull in one motion."]),
        ex("Bulgarian Split Squat (Dumbbell)", "3 x 10 each", "", "90s", ["Keep torso slightly forward."]),
        ex("Standing Calf Raise (Machine)", "4 x 15", "", "45s", ["Complete range calf raises."])
      ],
      cooldown: []
    }
  ]
};

// 4. Bro Split
export const broSplitPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'Bro Split',
  description: '5-day bodybuilder split focusing on isolating one muscle group per day. Perfect for max hypertrophy.',
  type: 'sample',
  tags: ['gym', 'hypertrophy', 'isolation'],
  daysPerWeek: 5,
  estimatedDuration: '45-50 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Day 1: Chest',
      skill: '',
      time: '50 min',
      type: 'strength',
      order: 1,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Bench Press", "4 x 8", "", "90s", ["Retract shoulder blades."]),
        ex("Incline Dumbbell Bench Press", "3 x 10", "", "75s", ["Press dumbbells at 30-degree incline."]),
        ex("Pec Deck Fly", "3 x 12", "", "60s", ["Squeeze chest handles together."])
      ],
      cooldown: []
    },
    {
      dayNumber: 2,
      title: 'Day 2: Back',
      skill: '',
      time: '50 min',
      type: 'strength',
      order: 2,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Row", "4 x 8", "", "90s", ["Pull to belly button."]),
        ex("Lat Pulldown (Wide Grip)", "3 x 10", "", "75s", ["Pull bar to chest."]),
        ex("Dumbbell Row", "3 x 10 each", "", "75s", ["Pull elbow past hip line."])
      ],
      cooldown: []
    },
    {
      dayNumber: 3,
      title: 'Day 3: Shoulders',
      skill: '',
      time: '45 min',
      type: 'strength',
      order: 3,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Dumbbell Shoulder Press", "4 x 8", "", "90s", ["Press straight up overhead."]),
        ex("Dumbbell Lateral Raise", "4 x 15", "", "60s", ["Raise weights sideways."]),
        ex("Rear Delt Dumbbell Fly", "3 x 12", "", "60s", ["Squeeze rear delts sideways."])
      ],
      cooldown: []
    },
    {
      dayNumber: 4,
      title: 'Day 4: Legs',
      skill: '',
      time: '55 min',
      type: 'strength',
      order: 4,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Squat", "4 x 8", "", "2 min", ["Squat below parallel."]),
        ex("Romanian Deadlift (Barbell)", "3 x 10", "", "90s", ["Feel stretch in hamstrings."]),
        ex("Leg Extension", "3 x 12", "", "60s", ["Lock legs at the top."])
      ],
      cooldown: []
    },
    {
      dayNumber: 5,
      title: 'Day 5: Arms',
      skill: '',
      time: '45 min',
      type: 'strength',
      order: 5,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Dumbbell Bicep Curl", "3 x 10", "", "60s", ["Lock elbows at sides."]),
        ex("EZ-Bar Skull Crusher", "3 x 10", "", "60s", ["Lower bar to forehead."]),
        ex("Dumbbell Hammer Curl", "3 x 12", "", "60s", ["Neutral grip curls."]),
        ex("Cable Tricep Pushdown", "3 x 12", "", "60s", ["Push down, lock triceps."])
      ],
      cooldown: []
    }
  ]
};

// 5. 3-Day Plan (Full Body)
export const threeDayPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: '3 days plan',
  description: 'Highly efficient 3-day full body training plan using compound exercises. Ideal for busy schedules.',
  type: 'sample',
  tags: ['gym', 'full-body', 'efficient'],
  daysPerWeek: 3,
  estimatedDuration: '60 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Day 1: Full Body A',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 1,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Squat", "4 x 6", "", "90s", ["Squat deep."]),
        ex("Barbell Bench Press", "4 x 8", "", "90s", ["Press straight up."]),
        ex("Barbell Row", "3 x 10", "", "75s", ["Keep back flat."]),
        ex("Plank Hold", "3 x 60 sec", "", "45s", ["Core tight plank."])
      ],
      cooldown: []
    },
    {
      dayNumber: 2,
      title: 'Day 2: Full Body B',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 2,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Deadlift", "3 x 5", "", "2 min", ["Maintain flat back."]),
        ex("Dumbbell Shoulder Press", "3 x 10", "", "75s", ["Press overhead."]),
        ex("Pull-Up", "3 x max", "", "90s", ["Chin over bar."]),
        ex("Bodyweight Squat", "3 x 20", "", "45s", ["High volume squats."])
      ],
      cooldown: []
    },
    {
      dayNumber: 3,
      title: 'Day 3: Full Body C',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 3,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Front Squat", "3 x 8", "", "90s", ["Chest up front squat."]),
        ex("Dumbbell Bench Press", "3 x 10", "", "75s", ["Press dumbbells."]),
        ex("Lat Pulldown (Wide Grip)", "3 x 10", "", "75s", ["Drive elbows down."])
      ],
      cooldown: []
    }
  ]
};

// 6. 5-Day Plan (Split)
export const fiveDayPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: '5 days plan',
  description: 'Intermediate 5-day training split focusing on balanced push/pull volume and core stability.',
  type: 'sample',
  tags: ['gym', 'strength', '5-day'],
  daysPerWeek: 5,
  estimatedDuration: '55 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Day 1: Upper Push',
      skill: '',
      time: '50 min',
      type: 'strength',
      order: 1,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Bench Press", "4 x 8", "", "90s", ["Retract shoulders."]),
        ex("Dumbbell Shoulder Press", "3 x 10", "", "75s", ["Press overhead."]),
        ex("Dumbbell Lateral Raise", "3 x 15", "", "60s", ["Raise sideways."])
      ],
      cooldown: []
    },
    {
      dayNumber: 2,
      title: 'Day 2: Upper Pull',
      skill: '',
      time: '50 min',
      type: 'strength',
      order: 2,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Pull-Up", "4 x max", "", "90s", ["Chin over bar."]),
        ex("Barbell Row", "3 x 8", "", "90s", ["Row to chest."]),
        ex("Dumbbell Bicep Curl", "3 x 12", "", "60s", ["Curl upward."])
      ],
      cooldown: []
    },
    {
      dayNumber: 3,
      title: 'Day 3: Legs (Squat Focus)',
      skill: '',
      time: '60 min',
      type: 'strength',
      order: 3,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Squat", "4 x 8", "", "2 min", ["Squat deep."]),
        ex("Leg Press", "3 x 10", "", "90s", ["Leg press sled."]),
        ex("Leg Extension", "3 x 15", "", "60s", ["Extend quads."])
      ],
      cooldown: []
    },
    {
      dayNumber: 4,
      title: 'Day 4: Shoulders & Arms',
      skill: '',
      time: '45 min',
      type: 'strength',
      order: 4,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Dumbbell Shoulder Press", "3 x 10", "", "75s", ["Press overhead."]),
        ex("Dumbbell Hammer Curl", "3 x 12", "", "60s", ["Hammer curl."]),
        ex("Cable Tricep Pushdown", "3 x 12", "", "60s", ["Push down rope."])
      ],
      cooldown: []
    },
    {
      dayNumber: 5,
      title: 'Day 5: Posterior Chain (Legs/Back)',
      skill: '',
      time: '55 min',
      type: 'strength',
      order: 5,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Barbell Deadlift", "3 x 5", "", "2 min", ["Flat back deadlift."]),
        ex("Romanian Deadlift (Barbell)", "3 x 10", "", "90s", ["Hinge at hips."]),
        ex("Hanging Leg Raise", "3 x 12", "", "60s", ["Core compression."])
      ],
      cooldown: []
    }
  ]
};

// 7. Home Workout Plan (No Equipment)
export const homeWorkoutPlan: Plan = {
  ownerId: 'SYSTEM',
  ownerName: 'Apparatus',
  title: 'home workout plan',
  description: 'Full body routine utilizing bodyweight movements. Train anywhere, build baseline strength and endurance.',
  type: 'sample',
  tags: ['bodyweight', 'home', 'beginner'],
  daysPerWeek: 3,
  estimatedDuration: '40 min',
  isPublic: true,
  isArchived: false,
  clonedFrom: null,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
  days: [
    {
      dayNumber: 1,
      title: 'Day 1: Full Body A',
      skill: '',
      time: '40 min',
      type: 'strength',
      order: 1,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Bodyweight Squat", "4 x 20", "2-0-2", "45s", ["Squat fully down."]),
        ex("Push-Up", "4 x 15", "2-0-2", "60s", ["Chest to floor pushup."]),
        ex("Glute Bridge (Bodyweight)", "3 x 15", "", "45s", ["Lift hips high."]),
        ex("Plank Hold", "3 x 60 sec", "", "45s", ["Hold rigid body line."])
      ],
      cooldown: []
    },
    {
      dayNumber: 2,
      title: 'Day 2: Core & Cardio',
      skill: '',
      time: '35 min',
      type: 'strength',
      order: 2,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Mountain Climbers", "3 x 45 sec", "", "30s", ["Drive knees fast."]),
        ex("Bicycle Crunch", "3 x 20 each", "", "45s", ["Touch elbow to knee."]),
        ex("Bird Dog", "3 x 12 each", "", "30s", ["Extend opposite arm/leg."]),
        ex("Hollow Body Hold", "3 x 20 sec", "", "45s", ["Press lower back down."])
      ],
      cooldown: []
    },
    {
      dayNumber: 3,
      title: 'Day 3: Full Body B',
      skill: '',
      time: '40 min',
      type: 'strength',
      order: 3,
      warmup: [],
      skillWork: [],
      strength: [
        ex("Reverse Lunge (Dumbbell)", "3 x 12 each", "", "60s", ["Lunge backward cleanly."]),
        ex("Decline Push-Up", "3 x 10", "", "60s", ["Feet on elevated surface."]),
        ex("Single-Leg Calf Raise", "4 x 15 each", "", "45s", ["Full extension calf raise."]),
        ex("Plank Hold", "3 x 45 sec", "", "45s", ["Straight line plank."])
      ],
      cooldown: []
    }
  ]
};

export const SAMPLE_PLANS = [
  calisthenicsStarterPlan,
  pushPullLegsPlan,
  upperLowerPlan,
  broSplitPlan,
  threeDayPlan,
  fiveDayPlan,
  homeWorkoutPlan
];
