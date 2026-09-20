import type { MuscleRegion } from './muscle-map';

export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'shoulder_abduction'
  | 'shoulder_flexion'
  | 'shoulder_horizontal_abduction'
  | 'elbow_flexion'
  | 'elbow_extension'
  | 'squat'
  | 'lunge'
  | 'hip_hinge'
  | 'hip_extension'
  | 'knee_extension'
  | 'knee_flexion'
  | 'plantar_flexion'
  | 'spinal_flexion'
  | 'anti_extension'
  | 'anti_rotation'
  | 'rotation'
  | 'hip_flexion'
  | 'carry'
  | 'calisthenics_skill'
  | 'isolation';

export interface MuscleWeight {
  muscle: MuscleRegion;
  weight: number;
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  aliases: string[];
  pattern: MovementPattern;
  muscles: {
    primary: MuscleWeight[];
    secondary: MuscleWeight[];
    stabilizers?: MuscleWeight[];
  };
}

export const MOVEMENT_DEFAULTS: Record<MovementPattern, Partial<Record<MuscleRegion, number>>> = {
  horizontal_push: { chest: 1.0, triceps: 0.65, front_delts: 0.55 },
  vertical_push: { front_delts: 1.0, triceps: 0.7, upper_chest: 0.3 },
  horizontal_pull: { lats: 1.0, traps: 0.7, rhomboids: 0.8, rear_delts: 0.6, biceps: 0.5 },
  vertical_pull: { lats: 1.0, biceps: 0.65, traps: 0.35, forearms: 0.30 },
  shoulder_abduction: { side_delts: 1.0, traps: 0.25 },
  shoulder_flexion: { front_delts: 1.0, upper_chest: 0.2 },
  shoulder_horizontal_abduction: { rear_delts: 1.0, rhomboids: 0.8, traps: 0.6 },
  elbow_flexion: { biceps: 1.0, forearms: 0.30 },
  elbow_extension: { triceps: 1.0 },
  squat: { quads: 1.0, glutes: 0.8, lower_back: 0.4 },
  lunge: { quads: 1.0, glutes: 0.9, hamstrings: 0.4 },
  hip_hinge: { hamstrings: 1.0, glutes: 0.9, lower_back: 0.8 },
  hip_extension: { glutes: 1.0, hamstrings: 0.5 },
  knee_extension: { quads: 1.0 },
  knee_flexion: { hamstrings: 1.0 },
  plantar_flexion: { calves: 1.0 },
  spinal_flexion: { abs: 1.0 },
  anti_extension: { abs: 1.0, obliques: 0.6 },
  anti_rotation: { obliques: 1.0, abs: 0.6 },
  rotation: { obliques: 1.0 },
  hip_flexion: { hip_flexors: 1.0, abs: 0.6 },
  carry: { traps: 1.0, forearms: 1.0, obliques: 0.8, abs: 0.6 },
  calisthenics_skill: {},
  isolation: {},
};

export const EXERCISE_ONTOLOGY: ExerciseDefinition[] = [
  {
    id: "bench_press",
    name: "Bench Press",
    aliases: ["barbell bench press", "flat bench press", "bb bench press"],
    pattern: "horizontal_push",
    muscles: {
      primary: [{ muscle: "chest", weight: 1.0 }],
      secondary: [{ muscle: "triceps", weight: 0.65 }, { muscle: "front_delts", weight: 0.5 }]
    }
  },
  {
    id: "push_up",
    name: "Push Up",
    aliases: ["pushup", "push ups", "pushups", "standard push up", "archer pushup", "archer push up", "diamond pushup", "diamond push up"],
    pattern: "horizontal_push",
    muscles: {
      primary: [{ muscle: "chest", weight: 1.0 }],
      secondary: [{ muscle: "triceps", weight: 0.7 }, { muscle: "front_delts", weight: 0.6 }]
    }
  },
  {
    id: "pull_up",
    name: "Pull Up",
    aliases: ["pullups", "pull ups", "pullup", "strict pull up", "weighted pull up"],
    pattern: "vertical_pull",
    muscles: {
      primary: [{ muscle: "lats", weight: 1.0 }],
      secondary: [{ muscle: "biceps", weight: 0.7 }, { muscle: "traps", weight: 0.4 }, { muscle: "forearms", weight: 0.4 }]
    }
  },
  {
    id: "chin_up",
    name: "Chin Up",
    aliases: ["chinups", "chin ups", "chinup"],
    pattern: "vertical_pull",
    muscles: {
      primary: [{ muscle: "lats", weight: 0.9 }, { muscle: "biceps", weight: 1.0 }],
      secondary: [{ muscle: "traps", weight: 0.3 }]
    }
  },
  {
    id: "face_pull",
    name: "Face Pull",
    aliases: ["face pulls", "cable face pull", "rope face pull", "band face pull", "resistance band face pull"],
    pattern: "horizontal_pull",
    muscles: {
      primary: [{ muscle: "rear_delts", weight: 1.0 }, { muscle: "traps", weight: 0.8 }],
      secondary: [{ muscle: "rhomboids", weight: 0.7 }]
    }
  },
  {
    id: "lateral_raise",
    name: "Lateral Raise",
    aliases: ["db lateral raise", "dumbbell lateral raise", "side raise", "db side raise", "standing db lateral raise", "standing dumbbell side raise", "band lateral raise"],
    pattern: "shoulder_abduction",
    muscles: {
      primary: [{ muscle: "side_delts", weight: 1.0 }],
      secondary: [{ muscle: "traps", weight: 0.3 }]
    }
  },
  {
    id: "squat",
    name: "Squat",
    aliases: ["barbell squat", "back squat", "front squat", "goblet squat", "air squat", "bodyweight squat"],
    pattern: "squat",
    muscles: {
      primary: [{ muscle: "quads", weight: 1.0 }, { muscle: "glutes", weight: 0.8 }],
      secondary: [{ muscle: "lower_back", weight: 0.5 }, { muscle: "hamstrings", weight: 0.4 }]
    }
  },
  {
    id: "deadlift",
    name: "Deadlift",
    aliases: ["barbell deadlift", "conventional deadlift", "sumo deadlift", "rdl", "romanian deadlift"],
    pattern: "hip_hinge",
    muscles: {
      primary: [{ muscle: "hamstrings", weight: 1.0 }, { muscle: "glutes", weight: 1.0 }, { muscle: "lower_back", weight: 0.9 }],
      secondary: [{ muscle: "traps", weight: 0.7 }, { muscle: "lats", weight: 0.4 }, { muscle: "forearms", weight: 0.5 }]
    }
  },
  {
    id: "overhead_press",
    name: "Overhead Press",
    aliases: ["ohp", "military press", "barbell overhead press", "dumbbell shoulder press", "db shoulder press", "shoulder press", "pike push", "pike push up", "handstand push up", "handstand push"],
    pattern: "vertical_push",
    muscles: {
      primary: [{ muscle: "front_delts", weight: 1.0 }, { muscle: "triceps", weight: 0.7 }],
      secondary: [{ muscle: "upper_chest", weight: 0.3 }, { muscle: "side_delts", weight: 0.2 }]
    }
  },
  {
    id: "bicep_curl",
    name: "Bicep Curl",
    aliases: ["dumbbell curl", "db curl", "barbell curl", "bb curl", "cable curl", "hammer curl", "curl", "curls"],
    pattern: "elbow_flexion",
    muscles: {
      primary: [{ muscle: "biceps", weight: 1.0 }],
      secondary: [{ muscle: "forearms", weight: 0.4 }]
    }
  },
  {
    id: "tricep_extension",
    name: "Tricep Extension",
    aliases: ["tricep pushdown", "cable pushdown", "skullcrusher", "overhead tricep extension", "triceps extension", "tricep extension", "triceps pushdown"],
    pattern: "elbow_extension",
    muscles: {
      primary: [{ muscle: "triceps", weight: 1.0 }],
      secondary: []
    }
  },
  {
    id: "leg_curl",
    name: "Leg Curl",
    aliases: ["hamstring curl", "seated leg curl", "lying leg curl", "nordic curl", "nordic hamstring curl", "nordic"],
    pattern: "knee_flexion",
    muscles: {
      primary: [{ muscle: "hamstrings", weight: 1.0 }],
      secondary: [{ muscle: "glutes", weight: 0.2 }]
    }
  },
  {
    id: "leg_extension",
    name: "Leg Extension",
    aliases: ["seated leg extension"],
    pattern: "knee_extension",
    muscles: {
      primary: [{ muscle: "quads", weight: 1.0 }],
      secondary: []
    }
  },
  {
    id: "calf_raise",
    name: "Calf Raise",
    aliases: ["standing calf raise", "seated calf raise", "calf raises", "calf"],
    pattern: "plantar_flexion",
    muscles: {
      primary: [{ muscle: "calves", weight: 1.0 }],
      secondary: []
    }
  },
  {
    id: "plank",
    name: "Plank",
    aliases: ["forearm plank", "high plank", "core"],
    pattern: "anti_extension",
    muscles: {
      primary: [{ muscle: "abs", weight: 1.0 }],
      secondary: [{ muscle: "obliques", weight: 0.5 }, { muscle: "front_delts", weight: 0.3 }]
    }
  },
  {
    id: "crunch",
    name: "Crunch",
    aliases: ["crunches", "reverse crunch", "reverse crunches", "bicycle crunch", "sit up", "sit ups"],
    pattern: "spinal_flexion",
    muscles: {
      primary: [{ muscle: "abs", weight: 1.0 }],
      secondary: [{ muscle: "obliques", weight: 0.3 }]
    }
  },
  {
    id: "leg_raise",
    name: "Leg Raise",
    aliases: ["hanging leg raise", "lying leg raise", "leg raises", "knee raise", "knee raises", "captains chair"],
    pattern: "hip_flexion",
    muscles: {
      primary: [{ muscle: "abs", weight: 1.0 }, { muscle: "hip_flexors", weight: 1.0 }],
      secondary: []
    }
  },
  {
    id: "hollow_hold",
    name: "Hollow Hold",
    aliases: ["hollow body hold", "hollow rocks", "v up", "v ups"],
    pattern: "anti_extension",
    muscles: {
      primary: [{ muscle: "abs", weight: 1.0 }],
      secondary: [{ muscle: "hip_flexors", weight: 0.5 }]
    }
  },
  {
    id: "dip",
    name: "Dip",
    aliases: ["tricep dip", "chest dip", "dips"],
    pattern: "vertical_push",
    muscles: {
      primary: [{ muscle: "triceps", weight: 1.0 }, { muscle: "chest", weight: 0.8 }, { muscle: "front_delts", weight: 0.8 }],
      secondary: []
    }
  }
];

export const MODIFIERS: Record<string, Partial<Record<MuscleRegion, number>>> = {
  incline: { upper_chest: 0.3, front_delts: 0.2, chest: -0.2 },
  decline: { lower_chest: 0.3, front_delts: -0.1, chest: 0.1 },
  close_grip: { triceps: 0.3, chest: -0.2 },
  wide_grip: { chest: 0.2, lats: 0.2, triceps: -0.2, biceps: -0.2 },
  reverse_grip: { biceps: 0.3, lower_chest: 0.2 }
};

// ─── Name-based movement inference ───────────────────────────────
// The curated ontology above only covers a handful of canonical lifts. Every other
// variation ("Australian Row", "Meadows Row", "Pendlay Row", …) is resolved here by
// reading the movement pattern out of the exercise name, so it highlights
// anatomically correct muscles instead of nothing at all.

export type MuscleMap = Partial<Record<MuscleRegion, number>>;

interface InferenceRule {
  match: RegExp;
  muscles: MuscleMap;
}

const D = MOVEMENT_DEFAULTS;

/**
 * Ordered most-specific-first; the first matching rule wins. Ordering matters a lot:
 * "upright row" and "rear delt row" are shoulder movements, not horizontal pulls,
 * so they must be tested before the generic `row` rule.
 */
export const INFERENCE_RULES: InferenceRule[] = [
  // ── Shoulder-dominant movements that contain pull/row/raise words ──
  { match: /\bupright row\b/, muscles: { side_delts: 1.0, traps: 0.9, front_delts: 0.5, biceps: 0.35 } },
  { match: /\b(rear[\s-]?delt|reverse)\s*(row|fly|flye|raise|pull)/, muscles: D.shoulder_horizontal_abduction },
  { match: /\bface pull/, muscles: D.shoulder_horizontal_abduction },
  { match: /\b(lateral|side)\s*(raise|delt)/, muscles: D.shoulder_abduction },
  { match: /\bfront raise\b/, muscles: D.shoulder_flexion },
  { match: /\bshrug/, muscles: { traps: 1.0, forearms: 0.4 } },

  // ── Vertical pulls ──
  { match: /\b(pull[\s-]?up|chin[\s-]?up|pull[\s-]?down|pulldown|lat pull|muscle[\s-]?up)/, muscles: D.vertical_pull },
  { match: /\bpullover/, muscles: { lats: 1.0, chest: 0.5, triceps: 0.4 } },

  // ── Horizontal pulls (rows). Covers australian/inverted/body rows. ──
  { match: /\b(row|rows|rowing)\b/, muscles: D.horizontal_pull },
  { match: /\b(front|back)\s*lever/, muscles: { lats: 1.0, lower_back: 0.7, abs: 0.9, rhomboids: 0.6, traps: 0.5 } },

  // ── Vertical pushes ──
  { match: /\b(overhead|shoulder|military|arnold|pike|handstand|z)\s*(press|push)/, muscles: D.vertical_push },
  { match: /\b(ohp|hspu)\b/, muscles: D.vertical_push },

  // ── Horizontal pushes ──
  { match: /\bdip/, muscles: { lower_chest: 1.0, triceps: 0.9, chest: 0.8, front_delts: 0.5 } },
  { match: /\b(bench|chest|floor)\s*press/, muscles: D.horizontal_push },
  { match: /\b(push[\s-]?up|pushup|press[\s-]?up)/, muscles: D.horizontal_push },
  { match: /\b(fly|flye|flies|crossover|pec deck|svend)/, muscles: { chest: 1.0, front_delts: 0.45 } },
  { match: /\bplanche/, muscles: { front_delts: 1.0, chest: 0.8, abs: 0.9, triceps: 0.6 } },

  // ── Arms ──
  { match: /\b(leg|hamstring|nordic)\s*curl/, muscles: D.knee_flexion },
  { match: /\bwrist\s*(curl|extension)/, muscles: { forearms: 1.0 } },
  { match: /\b(curl|curls)\b/, muscles: D.elbow_flexion },
  { match: /\b(tricep|triceps|skull|skullcrusher|kickback|pushdown|push[\s-]?down|overhead extension)/, muscles: D.elbow_extension },
  { match: /\b(grip|farmer|wrist roller)/, muscles: { forearms: 1.0, traps: 0.6 } },

  // ── Legs ──
  { match: /\bleg\s*press/, muscles: { quads: 1.0, glutes: 0.7, hamstrings: 0.3 } },
  { match: /\bleg\s*extension/, muscles: D.knee_extension },
  { match: /\bcalf\s*(raise|press)/, muscles: D.plantar_flexion },
  { match: /\b(lunge|split squat|step[\s-]?up|bulgarian)/, muscles: D.lunge },
  { match: /\b(squat|pistol|sissy|wall sit)/, muscles: D.squat },
  { match: /\b(deadlift|rdl|romanian|good morning|hinge|clean|snatch|swing)/, muscles: D.hip_hinge },
  { match: /\b(hip thrust|glute bridge|glute kickback|hip extension|reverse hyper)/, muscles: D.hip_extension },
  { match: /\b(abduction|abductor)/, muscles: { glutes: 1.0 } },
  { match: /\b(adduction|adductor)/, muscles: { adductors: 1.0, quads: 0.4 } },
  { match: /\b(back extension|hyperextension)/, muscles: { lower_back: 1.0, glutes: 0.7, hamstrings: 0.6 } },

  // ── Core ──
  { match: /\b(plank|hollow|ab wheel|ab rollout|rollout|l[\s-]?sit|dead bug)/, muscles: D.anti_extension },
  { match: /\b(pallof|anti[\s-]?rotation)/, muscles: D.anti_rotation },
  { match: /\b(russian twist|woodchop|wood chop|bicycle|side bend|windshield)/, muscles: D.rotation },
  { match: /\b(leg raise|knee raise|knee[\s-]?up|toes to bar|hanging raise|dragon flag)/, muscles: D.hip_flexion },
  { match: /\b(crunch|sit[\s-]?up|situp|v[\s-]?up|jackknife)/, muscles: D.spinal_flexion },
  { match: /\b(carry|suitcase|yoke)\b/, muscles: D.carry },
];

/** Coarse fallback when only a library muscle-group label is known. */
export const MUSCLE_GROUP_REGIONS: Record<string, MuscleMap> = {
  chest: { chest: 1.0, upper_chest: 0.45, front_delts: 0.35, triceps: 0.35 },
  back: { lats: 1.0, rhomboids: 0.75, traps: 0.7, rear_delts: 0.45, biceps: 0.4 },
  shoulders: { front_delts: 0.9, side_delts: 1.0, rear_delts: 0.6, traps: 0.35 },
  biceps: { biceps: 1.0, forearms: 0.35 },
  triceps: { triceps: 1.0 },
  forearms: { forearms: 1.0 },
  quads: { quads: 1.0, glutes: 0.55 },
  glutes: { glutes: 1.0, hamstrings: 0.5 },
  hamstrings: { hamstrings: 1.0, glutes: 0.6 },
  calves: { calves: 1.0 },
  core: { abs: 1.0, obliques: 0.6 },
  abs: { abs: 1.0, obliques: 0.6 },
  'full body': { quads: 0.8, glutes: 0.8, lats: 0.7, abs: 0.7, front_delts: 0.6, chest: 0.5 },
  cardio: {},
};

/** Reads the movement pattern out of an exercise name. */
export function inferMusclesFromName(normalizedName: string): MuscleMap | null {
  for (const rule of INFERENCE_RULES) {
    if (rule.match.test(normalizedName)) {
      return rule.muscles;
    }
  }
  return null;
}
