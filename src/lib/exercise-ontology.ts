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
