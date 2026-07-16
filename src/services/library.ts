import { db } from '@/lib/firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import type { LibraryExercise } from '@/types';

interface CompactExercise {
  name: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  equipment: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  instructions?: string[];
  youtubeSearch?: string;
  tags: string[];
}

export const COMPACT_LIBRARY: CompactExercise[] = [
  // ─── CHEST ──────────────────────────────────────────────────
  {
    name: 'Barbell Bench Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Barbell, Bench',
    difficulty: 'beginner',
    instructions: [
      'Lie flat on the bench, grip the barbell slightly wider than shoulder-width.',
      'Unrack the bar, lower it under control to your mid-chest.',
      'Push the bar straight back up to locked-out position.'
    ],
    youtubeSearch: 'Barbell bench press correct form',
    tags: ['chest', 'barbell', 'bench press']
  },
  {
    name: 'Incline Barbell Bench Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Triceps'],
    equipment: 'Barbell, Incline Bench',
    difficulty: 'intermediate',
    tags: ['chest', 'upper chest', 'barbell', 'incline']
  },
  {
    name: 'Decline Barbell Bench Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Barbell, Decline Bench',
    difficulty: 'intermediate',
    tags: ['chest', 'lower chest', 'barbell', 'decline']
  },
  {
    name: 'Dumbbell Bench Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Dumbbells, Bench',
    difficulty: 'beginner',
    instructions: [
      'Lie flat on a bench, holding dumbbells at chest level, palms facing forward.',
      'Press the dumbbells straight up over your chest, locking your arms out.',
      'Lower the weights slowly back to the sides of your chest.'
    ],
    youtubeSearch: 'Dumbbell bench press form',
    tags: ['chest', 'dumbbell', 'bench press']
  },
  {
    name: 'Incline Dumbbell Bench Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Triceps'],
    equipment: 'Dumbbells, Incline Bench',
    difficulty: 'intermediate',
    tags: ['chest', 'upper chest', 'dumbbell', 'incline']
  },
  {
    name: 'Decline Dumbbell Bench Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Dumbbells, Decline Bench',
    difficulty: 'intermediate',
    tags: ['chest', 'lower chest', 'dumbbell', 'decline']
  },
  {
    name: 'Chest Press Machine',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['chest', 'machine', 'chest press']
  },
  {
    name: 'Incline Chest Press Machine',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Triceps'],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['chest', 'upper chest', 'machine', 'incline']
  },
  {
    name: 'Pec Deck Fly',
    muscleGroup: 'Chest',
    secondaryMuscles: [],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['chest', 'machine', 'fly']
  },
  {
    name: 'Dumbbell Fly',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders'],
    equipment: 'Dumbbells, Bench',
    difficulty: 'beginner',
    tags: ['chest', 'dumbbell', 'fly']
  },
  {
    name: 'Incline Dumbbell Fly',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders'],
    equipment: 'Dumbbells, Incline Bench',
    difficulty: 'intermediate',
    tags: ['chest', 'upper chest', 'dumbbell', 'fly']
  },
  {
    name: 'Flat Cable Fly',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders'],
    equipment: 'Cable Machine',
    difficulty: 'intermediate',
    tags: ['chest', 'cable', 'fly']
  },
  {
    name: 'High-to-Low Cable Fly',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Lower Chest', 'Shoulders'],
    equipment: 'Cable Machine',
    difficulty: 'intermediate',
    tags: ['chest', 'lower chest', 'cable', 'fly']
  },
  {
    name: 'Low-to-High Cable Fly',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Upper Chest', 'Shoulders'],
    equipment: 'Cable Machine',
    difficulty: 'intermediate',
    tags: ['chest', 'upper chest', 'cable', 'fly']
  },
  {
    name: 'Push-Up',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders', 'Core'],
    equipment: 'None',
    difficulty: 'beginner',
    instructions: [
      'Start in a high plank position, hands under shoulders, body in a straight line.',
      'Lower your chest to the floor by bending your elbows at a 45-degree angle.',
      'Keep your core tight and push back up to the starting position.'
    ],
    youtubeSearch: 'Push up correct form',
    tags: ['chest', 'push-up', 'bodyweight']
  },
  {
    name: 'Incline Push-Up',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['chest', 'lower chest', 'bodyweight', 'push-up']
  },
  {
    name: 'Decline Push-Up',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Triceps'],
    equipment: 'None',
    difficulty: 'intermediate',
    tags: ['chest', 'upper chest', 'bodyweight', 'push-up']
  },
  {
    name: 'Diamond Push-Up',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'None',
    difficulty: 'intermediate',
    tags: ['chest', 'triceps', 'bodyweight', 'push-up']
  },
  {
    name: 'Archer Push-Up',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Triceps', 'Core'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['chest', 'unilateral', 'bodyweight', 'push-up']
  },
  {
    name: 'Weighted Push-Up',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Weight Plate',
    difficulty: 'intermediate',
    tags: ['chest', 'weighted', 'push-up']
  },
  {
    name: 'Bar Dip',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Parallel Bars',
    difficulty: 'intermediate',
    instructions: [
      'Support yourself on parallel bars, arms locked out, shoulders depressed.',
      'Lower your body by bending at the elbows until your upper arms are parallel to the bars.',
      'Push back up to the starting position, keeping your chest slightly leaned forward.'
    ],
    youtubeSearch: 'Bar dip correct form',
    tags: ['chest', 'triceps', 'dip', 'bodyweight']
  },
  {
    name: 'Ring Dip',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Triceps', 'Stabilizers'],
    equipment: 'Gymnastic Rings',
    difficulty: 'advanced',
    tags: ['chest', 'triceps', 'rings', 'dip']
  },
  {
    name: 'Chest Dip',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Parallel Bars',
    difficulty: 'intermediate',
    tags: ['chest', 'lower chest', 'dip']
  },
  {
    name: 'Dumbbell Floor Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['chest', 'dumbbell', 'floor press']
  },
  {
    name: 'Barbell Floor Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['chest', 'barbell', 'floor press']
  },

  // ─── BACK ───────────────────────────────────────────────────
  {
    name: 'Conventional Deadlift',
    muscleGroup: 'Back',
    secondaryMuscles: ['Hamstrings', 'Glutes', 'Core'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['back', 'posterior chain', 'barbell', 'deadlift']
  },
  {
    name: 'Sumo Deadlift',
    muscleGroup: 'Back',
    secondaryMuscles: ['Quads', 'Glutes', 'Hamstrings'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['back', 'legs', 'barbell', 'deadlift']
  },
  {
    name: 'Barbell Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['back', 'barbell', 'row']
  },
  {
    name: 'Underhand Barbell Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Lats'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['back', 'barbell', 'row']
  },
  {
    name: 'Dumbbell Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders'],
    equipment: 'Dumbbells, Bench',
    difficulty: 'beginner',
    tags: ['back', 'dumbbell', 'row']
  },
  {
    name: 'Chest-Supported Dumbbell Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Delts'],
    equipment: 'Dumbbells, Bench',
    difficulty: 'beginner',
    tags: ['back', 'upper back', 'dumbbell', 'row']
  },
  {
    name: 'Meadows Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Upper Back'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['back', 'unilateral', 'barbell', 'row']
  },
  {
    name: 'T-Bar Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Upper Back'],
    equipment: 'Barbell, T-Bar Attachment',
    difficulty: 'intermediate',
    tags: ['back', 'row', 't-bar']
  },
  {
    name: 'Seated Cable Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['back', 'cable', 'row']
  },
  {
    name: 'One-Arm Seated Cable Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Core'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['back', 'unilateral', 'cable', 'row']
  },
  {
    name: 'Lat Pulldown (Wide Grip)',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['back', 'lats', 'cable', 'pulldown']
  },
  {
    name: 'Lat Pulldown (Close Grip Underhand)',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Lats'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['back', 'lats', 'cable', 'pulldown']
  },
  {
    name: 'Lat Pulldown (V-Bar)',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['back', 'lats', 'cable', 'pulldown']
  },
  {
    name: 'Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders'],
    equipment: 'Pull-up Bar',
    difficulty: 'intermediate',
    instructions: [
      'Hang from the bar with hands slightly wider than shoulder-width, palms facing away.',
      'Pull yourself up by engaging your lats and pulling your elbows down to your ribs.',
      'Clear the bar with your chin, then lower under control back to a dead hang.'
    ],
    youtubeSearch: 'Pull up correct form',
    tags: ['back', 'pull-up', 'bodyweight']
  },
  {
    name: 'Chin-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Chest'],
    equipment: 'Pull-up Bar',
    difficulty: 'beginner',
    tags: ['back', 'biceps', 'pull-up', 'bodyweight']
  },
  {
    name: 'Neutral Grip Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders'],
    equipment: 'Pull-up Bar',
    difficulty: 'intermediate',
    tags: ['back', 'pull-up', 'bodyweight']
  },
  {
    name: 'Weighted Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders'],
    equipment: 'Dip Belt / Weight Plate',
    difficulty: 'advanced',
    tags: ['back', 'weighted', 'pull-up']
  },
  {
    name: 'Commando Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Core'],
    equipment: 'Pull-up Bar',
    difficulty: 'intermediate',
    tags: ['back', 'pull-up', 'bodyweight']
  },
  {
    name: 'Scapular Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Shoulder Girdle'],
    equipment: 'Pull-up Bar',
    difficulty: 'beginner',
    tags: ['back', 'scapula', 'bodyweight']
  },
  {
    name: 'Inverted Row (Bodyweight)',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Core'],
    equipment: 'Pull-up Bar / Low Bar',
    difficulty: 'beginner',
    tags: ['back', 'row', 'bodyweight']
  },
  {
    name: 'Underhand Inverted Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Core'],
    equipment: 'Low Bar',
    difficulty: 'beginner',
    tags: ['back', 'biceps', 'bodyweight', 'row']
  },
  {
    name: 'Rack Pull',
    muscleGroup: 'Back',
    secondaryMuscles: ['Glutes', 'Hamstrings', 'Forearms'],
    equipment: 'Barbell, Power Rack',
    difficulty: 'intermediate',
    tags: ['back', 'barbell', 'partial deadlift']
  },
  {
    name: 'Back Extension (Hyperextension)',
    muscleGroup: 'Back',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Extension Bench',
    difficulty: 'beginner',
    tags: ['back', 'lower back', 'bodyweight']
  },
  {
    name: 'Straight-Arm Cable Pulldown',
    muscleGroup: 'Back',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['back', 'lats', 'cable']
  },
  {
    name: 'Face Pull (Cable)',
    muscleGroup: 'Back',
    secondaryMuscles: ['Rear Delts', 'Rotator Cuff'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['back', 'shoulders', 'cable']
  },
  {
    name: 'Band Pull-Aparts',
    muscleGroup: 'Back',
    secondaryMuscles: ['Rear Delts', 'Rotator Cuff'],
    equipment: 'Resistance Band',
    difficulty: 'beginner',
    tags: ['back', 'shoulders', 'band']
  },
  {
    name: 'Dumbbell Pullover',
    muscleGroup: 'Back',
    secondaryMuscles: ['Chest', 'Triceps'],
    equipment: 'Dumbbell, Bench',
    difficulty: 'intermediate',
    tags: ['back', 'chest', 'dumbbell']
  },
  {
    name: 'Machine Lat Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps'],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['back', 'machine', 'row']
  },
  {
    name: 'Single-Arm Dumbbell Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Core'],
    equipment: 'Dumbbell',
    difficulty: 'beginner',
    tags: ['back', 'unilateral', 'dumbbell']
  },
  {
    name: 'Yates Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Upper Back'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['back', 'barbell', 'row']
  },

  // ─── SHOULDERS ──────────────────────────────────────────────
  {
    name: 'Barbell Overhead Press (OHP)',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps', 'Core'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['shoulders', 'barbell', 'press']
  },
  {
    name: 'Dumbbell Shoulder Press',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps'],
    equipment: 'Dumbbells, Bench',
    difficulty: 'beginner',
    tags: ['shoulders', 'dumbbell', 'press']
  },
  {
    name: 'Arnold Press',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps'],
    equipment: 'Dumbbells',
    difficulty: 'intermediate',
    tags: ['shoulders', 'dumbbell', 'press']
  },
  {
    name: 'Machine Shoulder Press',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps'],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['shoulders', 'machine', 'press']
  },
  {
    name: 'Kettlebell Press',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Core', 'Triceps'],
    equipment: 'Kettlebell',
    difficulty: 'intermediate',
    tags: ['shoulders', 'kettlebell', 'press']
  },
  {
    name: 'Dumbbell Lateral Raise',
    muscleGroup: 'Shoulders',
    secondaryMuscles: [],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['shoulders', 'lateral raise', 'dumbbell']
  },
  {
    name: 'Cable Lateral Raise',
    muscleGroup: 'Shoulders',
    secondaryMuscles: [],
    equipment: 'Cable Machine',
    difficulty: 'intermediate',
    tags: ['shoulders', 'lateral raise', 'cable']
  },
  {
    name: 'Machine Lateral Raise',
    muscleGroup: 'Shoulders',
    secondaryMuscles: [],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['shoulders', 'lateral raise', 'machine']
  },
  {
    name: 'Dumbbell Front Raise',
    muscleGroup: 'Shoulders',
    secondaryMuscles: [],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['shoulders', 'front raise', 'dumbbell']
  },
  {
    name: 'Barbell Front Raise',
    muscleGroup: 'Shoulders',
    secondaryMuscles: [],
    equipment: 'Barbell',
    difficulty: 'beginner',
    tags: ['shoulders', 'front raise', 'barbell']
  },
  {
    name: 'Cable Front Raise',
    muscleGroup: 'Shoulders',
    secondaryMuscles: [],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['shoulders', 'front raise', 'cable']
  },
  {
    name: 'Rear Delt Dumbbell Fly',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Upper Back'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['shoulders', 'rear delt', 'dumbbell']
  },
  {
    name: 'Rear Delt Cable Fly',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Upper Back'],
    equipment: 'Cable Machine',
    difficulty: 'intermediate',
    tags: ['shoulders', 'rear delt', 'cable']
  },
  {
    name: 'Reverse Pec Deck Fly',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Upper Back'],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['shoulders', 'rear delt', 'machine']
  },
  {
    name: 'Banded Face Pull',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Upper Back'],
    equipment: 'Resistance Band',
    difficulty: 'beginner',
    tags: ['shoulders', 'rear delt', 'band']
  },
  {
    name: 'Pike Push-Up',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps', 'Core'],
    equipment: 'None',
    difficulty: 'intermediate',
    tags: ['shoulders', 'bodyweight', 'push-up']
  },
  {
    name: 'Elevated Pike Push-Up',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps', 'Core'],
    equipment: 'Elevated Platform',
    difficulty: 'intermediate',
    tags: ['shoulders', 'bodyweight', 'push-up']
  },
  {
    name: 'Handstand Hold (Wall)',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Core', 'Triceps'],
    equipment: 'Wall',
    difficulty: 'intermediate',
    tags: ['shoulders', 'balance', 'bodyweight']
  },
  {
    name: 'Handstand Push-Up',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps', 'Core'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['shoulders', 'push-up', 'bodyweight']
  },
  {
    name: 'Handstand Hold (Freestanding)',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Core', 'Balance'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['shoulders', 'balance', 'bodyweight']
  },
  {
    name: 'Dumbbell Shrugs',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Traps'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['shoulders', 'traps', 'dumbbell']
  },
  {
    name: 'Barbell Shrugs',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Traps'],
    equipment: 'Barbell',
    difficulty: 'beginner',
    tags: ['shoulders', 'traps', 'barbell']
  },
  {
    name: 'Machine Shrugs',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Traps'],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['shoulders', 'traps', 'machine']
  },
  {
    name: 'Upright Row (Barbell)',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Traps'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['shoulders', 'barbell', 'row']
  },
  {
    name: 'Upright Row (Dumbbell)',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Traps'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['shoulders', 'dumbbell', 'row']
  },
  {
    name: 'Lu Raises',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Traps'],
    equipment: 'Weight Plates',
    difficulty: 'intermediate',
    tags: ['shoulders', 'plates', 'lateral raise']
  },
  {
    name: 'Y-Raise',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Upper Back'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['shoulders', 'upper back', 'dumbbell']
  },
  {
    name: 'Dumbbell W-Raise',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Upper Back'],
    equipment: 'Dumbbells',
    difficulty: 'intermediate',
    tags: ['shoulders', 'rear delt', 'rotator cuff']
  },
  {
    name: 'Rear Delt Row',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Rear Delts', 'Upper Back'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['shoulders', 'barbell', 'row']
  },
  {
    name: 'Incline Lateral Raise',
    muscleGroup: 'Shoulders',
    secondaryMuscles: [],
    equipment: 'Dumbbells, Bench',
    difficulty: 'intermediate',
    tags: ['shoulders', 'dumbbell', 'lateral raise']
  },

  // ─── LEGS (QUADS & GLUTES) ───────────────────────────────
  {
    name: 'Barbell Back Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings', 'Core'],
    equipment: 'Barbell, Squat Rack',
    difficulty: 'intermediate',
    tags: ['legs', 'quads', 'barbell', 'squat']
  },
  {
    name: 'Barbell Front Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Core', 'Upper Back'],
    equipment: 'Barbell, Squat Rack',
    difficulty: 'intermediate',
    tags: ['legs', 'quads', 'barbell', 'squat']
  },
  {
    name: 'Barbell Box Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Barbell, Box',
    difficulty: 'intermediate',
    tags: ['legs', 'barbell', 'squat']
  },
  {
    name: 'Dumbbell Goblet Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Core'],
    equipment: 'Dumbbell',
    difficulty: 'beginner',
    tags: ['legs', 'quads', 'dumbbell', 'squat']
  },
  {
    name: 'Leg Press',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Leg Press Machine',
    difficulty: 'beginner',
    tags: ['legs', 'quads', 'machine', 'leg press']
  },
  {
    name: 'Hack Squat Machine',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Hack Squat Machine',
    difficulty: 'intermediate',
    tags: ['legs', 'quads', 'machine', 'squat']
  },
  {
    name: 'Smith Machine Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Smith Machine',
    difficulty: 'beginner',
    tags: ['legs', 'quads', 'smith machine', 'squat']
  },
  {
    name: 'Leg Extension',
    muscleGroup: 'Quads',
    secondaryMuscles: [],
    equipment: 'Leg Extension Machine',
    difficulty: 'beginner',
    tags: ['legs', 'quads', 'machine']
  },
  {
    name: 'Bulgarian Split Squat (Dumbbell)',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Dumbbells, Bench',
    difficulty: 'intermediate',
    tags: ['legs', 'unilateral', 'dumbbell', 'split squat']
  },
  {
    name: 'Bulgarian Split Squat (Barbell)',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Barbell, Bench',
    difficulty: 'advanced',
    tags: ['legs', 'unilateral', 'barbell', 'split squat']
  },
  {
    name: 'Walking Lunge (Dumbbell)',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['legs', 'quads', 'dumbbell', 'lunge']
  },
  {
    name: 'Reverse Lunge (Dumbbell)',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['legs', 'quads', 'dumbbell', 'lunge']
  },
  {
    name: 'Barbell Lunge',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['legs', 'barbell', 'lunge']
  },
  {
    name: 'Step-Ups (Dumbbell)',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Dumbbells, Box',
    difficulty: 'beginner',
    tags: ['legs', 'quads', 'dumbbell', 'box']
  },
  {
    name: 'Bodyweight Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['legs', 'bodyweight', 'squat']
  },
  {
    name: 'Jump Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Calves'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['legs', 'plyo', 'bodyweight', 'squat']
  },
  {
    name: 'Pistol Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings', 'Calves'],
    equipment: 'None',
    difficulty: 'advanced',
    instructions: [
      'Stand on one leg, extending the other leg straight out in front.',
      'Lower into a deep squat on the standing leg, keeping the extended leg off the floor.',
      'Drive through the heel of your standing foot to return to the top.'
    ],
    youtubeSearch: 'Pistol squat correct form',
    tags: ['legs', 'quads', 'bodyweight', 'pistol squat']
  },
  {
    name: 'Shrimp Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Core'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['legs', 'unilateral', 'bodyweight', 'squat']
  },
  {
    name: 'Sissy Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Core'],
    equipment: 'Sissy Squat Bench / None',
    difficulty: 'intermediate',
    tags: ['legs', 'quads', 'bodyweight', 'squat']
  },
  {
    name: 'Glute Bridge (Bodyweight)',
    muscleGroup: 'Glutes',
    secondaryMuscles: ['Hamstrings', 'Core'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['legs', 'glutes', 'bodyweight']
  },
  {
    name: 'Barbell Hip Thrust',
    muscleGroup: 'Glutes',
    secondaryMuscles: ['Hamstrings'],
    equipment: 'Barbell, Bench',
    difficulty: 'beginner',
    tags: ['legs', 'glutes', 'barbell', 'hip thrust']
  },
  {
    name: 'Single-Leg Hip Thrust',
    muscleGroup: 'Glutes',
    secondaryMuscles: ['Hamstrings', 'Core'],
    equipment: 'Bench',
    difficulty: 'intermediate',
    tags: ['legs', 'glutes', 'unilateral', 'bodyweight']
  },
  {
    name: 'Cable Pull-Through',
    muscleGroup: 'Glutes',
    secondaryMuscles: ['Hamstrings', 'Lower Back'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['legs', 'glutes', 'cable']
  },
  {
    name: 'Machine Hip Abduction',
    muscleGroup: 'Glutes',
    secondaryMuscles: [],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['legs', 'glutes', 'machine']
  },
  {
    name: 'Goblet Lunge',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Dumbbell',
    difficulty: 'beginner',
    tags: ['legs', 'quads', 'dumbbell', 'lunge']
  },
  {
    name: 'Deficit Reverse Lunge',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Dumbbells, Platform',
    difficulty: 'intermediate',
    tags: ['legs', 'lunge', 'dumbbell']
  },
  {
    name: 'Overhead Squat',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Shoulders', 'Core', 'Glutes'],
    equipment: 'Barbell',
    difficulty: 'advanced',
    tags: ['legs', 'barbell', 'squat']
  },
  {
    name: 'Sumo Squat (Dumbbell)',
    muscleGroup: 'Glutes',
    secondaryMuscles: ['Adductors', 'Quads'],
    equipment: 'Dumbbell',
    difficulty: 'beginner',
    tags: ['legs', 'adductors', 'dumbbell', 'squat']
  },
  {
    name: 'Wall Sit',
    muscleGroup: 'Quads',
    secondaryMuscles: [],
    equipment: 'Wall',
    difficulty: 'beginner',
    tags: ['legs', 'isometric', 'bodyweight']
  },
  {
    name: 'Box Jump',
    muscleGroup: 'Quads',
    secondaryMuscles: ['Glutes', 'Calves'],
    equipment: 'Plyo Box',
    difficulty: 'beginner',
    tags: ['legs', 'plyo', 'power']
  },

  // ─── HAMSTRINGS & CALVES ─────────────────────────────────────
  {
    name: 'Romanian Deadlift (Barbell)',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Lower Back'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['legs', 'hamstrings', 'barbell', 'rdl']
  },
  {
    name: 'Romanian Deadlift (Dumbbell)',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Lower Back'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['legs', 'hamstrings', 'dumbbell', 'rdl']
  },
  {
    name: 'Stiff-Legged Deadlift (Barbell)',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Lower Back', 'Glutes'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['legs', 'hamstrings', 'barbell', 'deadlift']
  },
  {
    name: 'Seated Leg Curl Machine',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: [],
    equipment: 'Seated Leg Curl Machine',
    difficulty: 'beginner',
    tags: ['legs', 'hamstrings', 'machine']
  },
  {
    name: 'Lying Leg Curl Machine',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: [],
    equipment: 'Lying Leg Curl Machine',
    difficulty: 'beginner',
    tags: ['legs', 'hamstrings', 'machine']
  },
  {
    name: 'Standing Leg Curl Machine',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: [],
    equipment: 'Standing Leg Curl Machine',
    difficulty: 'beginner',
    tags: ['legs', 'hamstrings', 'machine']
  },
  {
    name: 'Nordic Hamstring Curl',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Core'],
    equipment: 'None / Pad Anchor',
    difficulty: 'advanced',
    tags: ['legs', 'hamstrings', 'bodyweight']
  },
  {
    name: 'Glute-Ham Raise (GHR)',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Lower Back'],
    equipment: 'GHD Bench',
    difficulty: 'advanced',
    tags: ['legs', 'hamstrings', 'machine']
  },
  {
    name: 'Single-Leg Romanian Deadlift',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Core'],
    equipment: 'Dumbbell',
    difficulty: 'intermediate',
    tags: ['legs', 'hamstrings', 'unilateral', 'dumbbell']
  },
  {
    name: 'Good Morning (Barbell)',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Lower Back', 'Glutes'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['legs', 'hamstrings', 'barbell']
  },
  {
    name: 'Standing Calf Raise (Machine)',
    muscleGroup: 'Calves',
    secondaryMuscles: [],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['legs', 'calves', 'machine']
  },
  {
    name: 'Standing Calf Raise (Dumbbell)',
    muscleGroup: 'Calves',
    secondaryMuscles: [],
    equipment: 'Dumbbell, Step',
    difficulty: 'beginner',
    tags: ['legs', 'calves', 'dumbbell']
  },
  {
    name: 'Seated Calf Raise (Machine)',
    muscleGroup: 'Calves',
    secondaryMuscles: [],
    equipment: 'Machine',
    difficulty: 'beginner',
    tags: ['legs', 'calves', 'machine']
  },
  {
    name: 'Donkey Calf Raise',
    muscleGroup: 'Calves',
    secondaryMuscles: [],
    equipment: 'Machine / None',
    difficulty: 'beginner',
    tags: ['legs', 'calves', 'bodyweight']
  },
  {
    name: 'Single-Leg Calf Raise',
    muscleGroup: 'Calves',
    secondaryMuscles: [],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['legs', 'calves', 'bodyweight']
  },
  {
    name: 'Leg Press Calf Raise',
    muscleGroup: 'Calves',
    secondaryMuscles: [],
    equipment: 'Leg Press Machine',
    difficulty: 'beginner',
    tags: ['legs', 'calves', 'machine']
  },
  {
    name: 'Kettlebell Swing',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Lower Back', 'Core'],
    equipment: 'Kettlebell',
    difficulty: 'intermediate',
    tags: ['legs', 'posterior chain', 'kettlebell']
  },
  {
    name: 'Deficit Deadlift',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Back', 'Glutes'],
    equipment: 'Barbell, Platform',
    difficulty: 'advanced',
    tags: ['back', 'hamstrings', 'barbell', 'deadlift']
  },
  {
    name: 'Barbell Zercher Squat',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Quads', 'Core', 'Upper Back'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['legs', 'quads', 'barbell', 'squat']
  },
  {
    name: 'Dumbbell Leg Curl (Bench)',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: [],
    equipment: 'Dumbbell, Bench',
    difficulty: 'intermediate',
    tags: ['legs', 'hamstrings', 'dumbbell']
  },
  {
    name: 'Banded Leg Curl',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: [],
    equipment: 'Resistance Band',
    difficulty: 'beginner',
    tags: ['legs', 'hamstrings', 'band']
  },
  {
    name: 'Slider Hamstring Curl',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Core'],
    equipment: 'Sliders / Towel',
    difficulty: 'beginner',
    tags: ['legs', 'hamstrings', 'bodyweight']
  },
  {
    name: 'Clean Pull',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Traps', 'Glutes'],
    equipment: 'Barbell',
    difficulty: 'advanced',
    tags: ['legs', 'olympic', 'barbell']
  },
  {
    name: 'Snatch Balance',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Shoulders', 'Quads'],
    equipment: 'Barbell',
    difficulty: 'advanced',
    tags: ['legs', 'olympic', 'barbell']
  },
  {
    name: 'Snatch Pull',
    muscleGroup: 'Hamstrings',
    secondaryMuscles: ['Traps', 'Back'],
    equipment: 'Barbell',
    difficulty: 'advanced',
    tags: ['legs', 'olympic', 'barbell']
  },

  // ─── ARMS (BICEPS & FOREARMS) ────────────────────────────────
  {
    name: 'Barbell Bicep Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Barbell',
    difficulty: 'beginner',
    tags: ['arms', 'biceps', 'barbell']
  },
  {
    name: 'EZ-Bar Bicep Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'EZ-Bar',
    difficulty: 'beginner',
    tags: ['arms', 'biceps', 'ez-bar']
  },
  {
    name: 'Dumbbell Bicep Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    instructions: [
      'Stand tall, holding dumbbells at your sides, palms facing forward.',
      'Curl the weights up by flexing at the elbows, keeping upper arms locked to your sides.',
      'Squeeze the biceps at the top, then slowly lower to the starting position.'
    ],
    youtubeSearch: 'Dumbbell bicep curl form',
    tags: ['arms', 'biceps', 'dumbbell']
  },
  {
    name: 'Incline Dumbbell Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Dumbbells, Bench',
    difficulty: 'intermediate',
    tags: ['arms', 'biceps', 'dumbbell']
  },
  {
    name: 'Dumbbell Hammer Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Dumbbells',
    difficulty: 'beginner',
    tags: ['arms', 'biceps', 'brachialis', 'dumbbell']
  },
  {
    name: 'Cable Bicep Curl (Straight Bar)',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['arms', 'biceps', 'cable']
  },
  {
    name: 'Cable Hammer Curl (Rope)',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['arms', 'biceps', 'cable']
  },
  {
    name: 'Concentration Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: [],
    equipment: 'Dumbbell',
    difficulty: 'beginner',
    tags: ['arms', 'biceps', 'dumbbell']
  },
  {
    name: 'Preacher Curl (EZ-Bar)',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Preacher Bench, EZ-Bar',
    difficulty: 'beginner',
    tags: ['arms', 'biceps', 'ez-bar']
  },
  {
    name: 'Preacher Curl (Dumbbell)',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Preacher Bench, Dumbbell',
    difficulty: 'beginner',
    tags: ['arms', 'biceps', 'dumbbell']
  },
  {
    name: 'Spider Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: [],
    equipment: 'EZ-Bar, Bench',
    difficulty: 'intermediate',
    tags: ['arms', 'biceps', 'ez-bar']
  },
  {
    name: 'Chin-Up (Underhand Grip)',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Back', 'Core'],
    equipment: 'Pull-up Bar',
    difficulty: 'beginner',
    tags: ['arms', 'biceps', 'bodyweight', 'pull-up']
  },
  {
    name: 'Reverse Grip Barbell Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['arms', 'brachioradialis', 'barbell']
  },
  {
    name: 'Reverse Grip Cable Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['arms', 'forearms', 'cable']
  },
  {
    name: 'Dumbbell Zottman Curl',
    muscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipment: 'Dumbbells',
    difficulty: 'intermediate',
    tags: ['arms', 'biceps', 'forearms', 'dumbbell']
  },
  {
    name: 'Barbell Wrist Curl (Underhand)',
    muscleGroup: 'Forearms',
    secondaryMuscles: [],
    equipment: 'Barbell',
    difficulty: 'beginner',
    tags: ['arms', 'forearms', 'barbell']
  },
  {
    name: 'Barbell Wrist Curl (Overhand)',
    muscleGroup: 'Forearms',
    secondaryMuscles: [],
    equipment: 'Barbell',
    difficulty: 'beginner',
    tags: ['arms', 'forearms', 'barbell']
  },
  {
    name: 'Dumbbell Wrist Curl',
    muscleGroup: 'Forearms',
    secondaryMuscles: [],
    equipment: 'Dumbbell',
    difficulty: 'beginner',
    tags: ['arms', 'forearms', 'dumbbell']
  },
  {
    name: 'Farmer\'s Walk',
    muscleGroup: 'Forearms',
    secondaryMuscles: ['Core', 'Shoulders', 'Traps'],
    equipment: 'Dumbbells / Kettlebells',
    difficulty: 'beginner',
    tags: ['arms', 'grip', 'dumbbell']
  },
  {
    name: 'Plate Pinch Hold',
    muscleGroup: 'Forearms',
    secondaryMuscles: [],
    equipment: 'Weight Plates',
    difficulty: 'beginner',
    tags: ['arms', 'grip', 'plates']
  },
  {
    name: 'Towel Pull-Up',
    muscleGroup: 'Forearms',
    secondaryMuscles: ['Biceps', 'Back'],
    equipment: 'Pull-up Bar, Towel',
    difficulty: 'advanced',
    tags: ['arms', 'grip', 'bodyweight']
  },
  {
    name: 'Cable Wrist Curl',
    muscleGroup: 'Forearms',
    secondaryMuscles: [],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['arms', 'forearms', 'cable']
  },
  {
    name: 'Behind-the-Back Wrist Curl',
    muscleGroup: 'Forearms',
    secondaryMuscles: [],
    equipment: 'Barbell',
    difficulty: 'beginner',
    tags: ['arms', 'forearms', 'barbell']
  },
  {
    name: 'Static Bar Hang',
    muscleGroup: 'Forearms',
    secondaryMuscles: ['Shoulders', 'Grip'],
    equipment: 'Pull-up Bar',
    difficulty: 'beginner',
    tags: ['arms', 'grip', 'isometric']
  },
  {
    name: 'Forearm Roller',
    muscleGroup: 'Forearms',
    secondaryMuscles: [],
    equipment: 'Forearm Roller Machine / Tool',
    difficulty: 'beginner',
    tags: ['arms', 'forearms']
  },

  // ─── ARMS (TRICEPS) ──────────────────────────────────────────
  {
    name: 'Close-Grip Bench Press',
    muscleGroup: 'Triceps',
    secondaryMuscles: ['Chest', 'Shoulders'],
    equipment: 'Barbell, Bench',
    difficulty: 'intermediate',
    tags: ['arms', 'triceps', 'barbell', 'bench press']
  },
  {
    name: 'EZ-Bar Skull Crusher',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'EZ-Bar, Bench',
    difficulty: 'intermediate',
    tags: ['arms', 'triceps', 'ez-bar']
  },
  {
    name: 'Dumbbell Skull Crusher',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Dumbbells, Bench',
    difficulty: 'beginner',
    tags: ['arms', 'triceps', 'dumbbell']
  },
  {
    name: 'Overhead Dumbbell Tricep Extension',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Dumbbell',
    difficulty: 'beginner',
    tags: ['arms', 'triceps', 'dumbbell']
  },
  {
    name: 'Cable Tricep Pushdown',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    instructions: [
      'Stand facing the cable pulley, grab the rope/bar at chest level.',
      'Keep your elbows tucked into your sides and push the bar straight down.',
      'Lock out your arms at the bottom, squeeze the triceps, and raise slowly.'
    ],
    youtubeSearch: 'Cable tricep pushdown form',
    tags: ['arms', 'triceps', 'machine', 'cable']
  },
  {
    name: 'Cable Tricep Pushdown (Rope)',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['arms', 'triceps', 'cable']
  },
  {
    name: 'Cable Overhead Tricep Extension',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Cable Machine',
    difficulty: 'intermediate',
    tags: ['arms', 'triceps', 'cable']
  },
  {
    name: 'One-Arm Cable Pushdown',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['arms', 'triceps', 'unilateral', 'cable']
  },
  {
    name: 'Bench Dip',
    muscleGroup: 'Triceps',
    secondaryMuscles: ['Chest', 'Shoulders'],
    equipment: 'Bench',
    difficulty: 'beginner',
    tags: ['arms', 'triceps', 'bodyweight']
  },
  {
    name: 'Parallel Bar Dip (Tricep Focus)',
    muscleGroup: 'Triceps',
    secondaryMuscles: ['Chest', 'Shoulders'],
    equipment: 'Parallel Bars',
    difficulty: 'intermediate',
    tags: ['arms', 'triceps', 'bodyweight', 'dip']
  },
  {
    name: 'Diamond Push-Up (Tricep Focus)',
    muscleGroup: 'Triceps',
    secondaryMuscles: ['Chest', 'Shoulders'],
    equipment: 'None',
    difficulty: 'intermediate',
    tags: ['arms', 'triceps', 'bodyweight', 'push-up']
  },
  {
    name: 'Dumbbell Kickback',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Dumbbell',
    difficulty: 'beginner',
    tags: ['arms', 'triceps', 'dumbbell']
  },
  {
    name: 'Cable Kickback',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['arms', 'triceps', 'cable']
  },
  {
    name: 'Bodyweight Tricep Extension (Ledge)',
    muscleGroup: 'Triceps',
    secondaryMuscles: ['Core'],
    equipment: 'Ledge / Low Bar',
    difficulty: 'intermediate',
    tags: ['arms', 'triceps', 'bodyweight']
  },
  {
    name: 'Ring Tricep Extension',
    muscleGroup: 'Triceps',
    secondaryMuscles: ['Core'],
    equipment: 'Gymnastic Rings',
    difficulty: 'advanced',
    tags: ['arms', 'triceps', 'rings']
  },
  {
    name: 'JM Press',
    muscleGroup: 'Triceps',
    secondaryMuscles: ['Chest', 'Shoulders'],
    equipment: 'Barbell',
    difficulty: 'advanced',
    tags: ['arms', 'triceps', 'barbell']
  },
  {
    name: 'Tate Press',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Dumbbells, Bench',
    difficulty: 'intermediate',
    tags: ['arms', 'triceps', 'dumbbell']
  },
  {
    name: 'Floor Press (Close Grip)',
    muscleGroup: 'Triceps',
    secondaryMuscles: ['Chest'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    tags: ['arms', 'triceps', 'barbell']
  },
  {
    name: 'Incline Skull Crusher',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'EZ-Bar, Incline Bench',
    difficulty: 'intermediate',
    tags: ['arms', 'triceps', 'ez-bar']
  },
  {
    name: 'Reverse-Grip Cable Pushdown',
    muscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['arms', 'triceps', 'cable']
  },

  // ─── CORE & ABS ─────────────────────────────────────────────
  {
    name: 'Ab Wheel Rollout',
    muscleGroup: 'Core',
    secondaryMuscles: ['Shoulders', 'Lower Back'],
    equipment: 'Ab Wheel Roller',
    difficulty: 'intermediate',
    tags: ['core', 'abs', 'wheel']
  },
  {
    name: 'Hanging Leg Raise',
    muscleGroup: 'Core',
    secondaryMuscles: ['Hip Flexors', 'Grip'],
    equipment: 'Pull-up Bar',
    difficulty: 'intermediate',
    tags: ['core', 'abs', 'hanging', 'bodyweight']
  },
  {
    name: 'Hanging Knee Raise',
    muscleGroup: 'Core',
    secondaryMuscles: ['Hip Flexors', 'Grip'],
    equipment: 'Pull-up Bar',
    difficulty: 'beginner',
    tags: ['core', 'abs', 'hanging', 'bodyweight']
  },
  {
    name: 'L-Sit Hold',
    muscleGroup: 'Core',
    secondaryMuscles: ['Shoulders', 'Quads', 'Hip Flexors'],
    equipment: 'Low Bars / Parallettes',
    difficulty: 'intermediate',
    tags: ['core', 'abs', 'isometric', 'bodyweight']
  },
  {
    name: 'Plank (Bodyweight)',
    muscleGroup: 'Core',
    secondaryMuscles: ['Shoulders'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'isometric', 'bodyweight']
  },
  {
    name: 'Side Plank',
    muscleGroup: 'Core',
    secondaryMuscles: ['Obliques'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'obliques', 'isometric', 'bodyweight']
  },
  {
    name: 'Russian Twist',
    muscleGroup: 'Core',
    secondaryMuscles: ['Obliques'],
    equipment: 'Weight Plate / None',
    difficulty: 'beginner',
    tags: ['core', 'obliques', 'bodyweight']
  },
  {
    name: 'Cable Woodchopper',
    muscleGroup: 'Core',
    secondaryMuscles: ['Obliques', 'Shoulders'],
    equipment: 'Cable Machine',
    difficulty: 'intermediate',
    tags: ['core', 'obliques', 'cable']
  },
  {
    name: 'Cable Crunch',
    muscleGroup: 'Core',
    secondaryMuscles: ['Abs'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['core', 'abs', 'cable']
  },
  {
    name: 'Decline Sit-Up',
    muscleGroup: 'Core',
    secondaryMuscles: ['Abs', 'Hip Flexors'],
    equipment: 'Decline Bench',
    difficulty: 'beginner',
    tags: ['core', 'abs']
  },
  {
    name: 'Decline Bench Leg Raise',
    muscleGroup: 'Core',
    secondaryMuscles: ['Lower Abs', 'Hip Flexors'],
    equipment: 'Decline Bench',
    difficulty: 'intermediate',
    tags: ['core', 'abs']
  },
  {
    name: 'Bicycle Crunch',
    muscleGroup: 'Core',
    secondaryMuscles: ['Obliques', 'Abs'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'abs', 'bodyweight']
  },
  {
    name: 'Dead Bug',
    muscleGroup: 'Core',
    secondaryMuscles: [],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'coordination', 'bodyweight']
  },
  {
    name: 'Bird Dog',
    muscleGroup: 'Core',
    secondaryMuscles: ['Lower Back', 'Glutes'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'lower back', 'bodyweight']
  },
  {
    name: 'Hollow Body Hold',
    muscleGroup: 'Core',
    secondaryMuscles: [],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'isometric', 'bodyweight']
  },
  {
    name: 'Hollow Body Rock',
    muscleGroup: 'Core',
    secondaryMuscles: [],
    equipment: 'None',
    difficulty: 'intermediate',
    tags: ['core', 'abs', 'bodyweight']
  },
  {
    name: 'Toes-to-Bar',
    muscleGroup: 'Core',
    secondaryMuscles: ['Hip Flexors', 'Grip', 'Back'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['core', 'hanging', 'bodyweight']
  },
  {
    name: 'Dragon Flag',
    muscleGroup: 'Core',
    secondaryMuscles: ['Lower Back', 'Glutes', 'Shoulders'],
    equipment: 'Bench / Bar Post',
    difficulty: 'advanced',
    tags: ['core', 'abs', 'bodyweight', 'dragon flag']
  },
  {
    name: 'Windshield Wipers (Hanging)',
    muscleGroup: 'Core',
    secondaryMuscles: ['Obliques', 'Grip'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['core', 'obliques', 'hanging', 'bodyweight']
  },
  {
    name: 'Pallof Press (Cable)',
    muscleGroup: 'Core',
    secondaryMuscles: ['Obliques', 'Shoulders'],
    equipment: 'Cable Machine',
    difficulty: 'beginner',
    tags: ['core', 'stability', 'cable']
  },
  {
    name: 'Pallof Press (Banded)',
    muscleGroup: 'Core',
    secondaryMuscles: ['Obliques', 'Shoulders'],
    equipment: 'Resistance Band',
    difficulty: 'beginner',
    tags: ['core', 'stability', 'band']
  },
  {
    name: 'Reverse Crunch',
    muscleGroup: 'Core',
    secondaryMuscles: ['Lower Abs'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'abs', 'bodyweight']
  },
  {
    name: 'Flutter Kicks',
    muscleGroup: 'Core',
    secondaryMuscles: ['Hip Flexors', 'Lower Abs'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'bodyweight']
  },
  {
    name: 'Mountain Climbers',
    muscleGroup: 'Core',
    secondaryMuscles: ['Shoulders', 'Cardio'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'cardio', 'bodyweight']
  },
  {
    name: 'Captain\'s Chair Leg Raise',
    muscleGroup: 'Core',
    secondaryMuscles: ['Hip Flexors', 'Abs'],
    equipment: 'Captain Chair Rack',
    difficulty: 'beginner',
    tags: ['core', 'abs', 'machine']
  },
  {
    name: 'Planche Lean',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Core', 'Forearms'],
    equipment: 'None',
    difficulty: 'intermediate',
    tags: ['shoulders', 'bodyweight', 'planche']
  },
  {
    name: 'Tuck Planche',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Core', 'Triceps'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['shoulders', 'bodyweight', 'planche']
  },
  {
    name: 'Advanced Tuck Planche',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Core', 'Triceps'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['shoulders', 'bodyweight', 'planche']
  },
  {
    name: 'Straddle Planche',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Back', 'Glutes', 'Core'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['shoulders', 'bodyweight', 'planche']
  },
  {
    name: 'Full Planche',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Back', 'Glutes', 'Core', 'Triceps'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['shoulders', 'bodyweight', 'planche']
  },
  {
    name: 'Tuck Front Lever',
    muscleGroup: 'Back',
    secondaryMuscles: ['Core', 'Shoulders'],
    equipment: 'Pull-up Bar',
    difficulty: 'intermediate',
    tags: ['back', 'lats', 'bodyweight', 'front lever']
  },
  {
    name: 'Advanced Tuck Front Lever',
    muscleGroup: 'Back',
    secondaryMuscles: ['Core', 'Shoulders'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['back', 'lats', 'bodyweight', 'front lever']
  },
  {
    name: 'Straddle Front Lever',
    muscleGroup: 'Back',
    secondaryMuscles: ['Glutes', 'Core', 'Shoulders'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['back', 'lats', 'bodyweight', 'front lever']
  },
  {
    name: 'Full Front Lever',
    muscleGroup: 'Back',
    secondaryMuscles: ['Glutes', 'Core', 'Shoulders'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['back', 'lats', 'bodyweight', 'front lever']
  },
  {
    name: 'Tuck Back Lever',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Back', 'Core'],
    equipment: 'Pull-up Bar',
    difficulty: 'intermediate',
    tags: ['shoulders', 'back', 'bodyweight', 'back lever']
  },
  {
    name: 'Advanced Tuck Back Lever',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Back', 'Core'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['shoulders', 'back', 'bodyweight', 'back lever']
  },
  {
    name: 'Straddle Back Lever',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Back', 'Glutes', 'Core'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['shoulders', 'back', 'bodyweight', 'back lever']
  },
  {
    name: 'Full Back Lever',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Back', 'Glutes', 'Core'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['shoulders', 'back', 'bodyweight', 'back lever']
  },
  {
    name: 'One-Arm Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Core'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['back', 'biceps', 'unilateral', 'bodyweight']
  },
  {
    name: 'One-Arm Push-Up',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders', 'Core'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['chest', 'unilateral', 'bodyweight']
  },
  {
    name: 'Human Flag',
    muscleGroup: 'Core',
    secondaryMuscles: ['Shoulders', 'Back', 'Obliques'],
    equipment: 'Pole / Stall Bars',
    difficulty: 'advanced',
    tags: ['core', 'shoulders', 'lateral chain', 'bodyweight']
  },
  {
    name: 'Skin the Cat',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Core', 'Back'],
    equipment: 'Pull-up Bar / Rings',
    difficulty: 'beginner',
    tags: ['shoulders', 'mobility', 'bodyweight']
  },
  {
    name: 'German Hang',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Chest', 'Mobility'],
    equipment: 'Pull-up Bar / Rings',
    difficulty: 'intermediate',
    tags: ['shoulders', 'mobility', 'stretch']
  },
  {
    name: 'Bar Muscle-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Triceps', 'Chest', 'Shoulders', 'Biceps'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['back', 'chest', 'explosive', 'bodyweight']
  },
  {
    name: 'Ring Muscle-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Triceps', 'Chest', 'Shoulders', 'Biceps', 'Stabilizers'],
    equipment: 'Gymnastic Rings',
    difficulty: 'advanced',
    tags: ['back', 'rings', 'explosive', 'bodyweight']
  },
  {
    name: 'Ring Archer Push-Up',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Triceps', 'Stabilizers'],
    equipment: 'Gymnastic Rings',
    difficulty: 'advanced',
    tags: ['chest', 'unilateral', 'rings']
  },
  {
    name: 'Ring Archer Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders', 'Stabilizers'],
    equipment: 'Gymnastic Rings',
    difficulty: 'advanced',
    tags: ['back', 'pull-up', 'rings']
  },
  {
    name: 'Ring Fly',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Stabilizers'],
    equipment: 'Gymnastic Rings',
    difficulty: 'advanced',
    tags: ['chest', 'rings', 'fly']
  },
  {
    name: 'Ring Rollout',
    muscleGroup: 'Core',
    secondaryMuscles: ['Shoulders'],
    equipment: 'Gymnastic Rings',
    difficulty: 'intermediate',
    tags: ['core', 'abs', 'rings']
  },
  {
    name: 'L-Sit (Floor)',
    muscleGroup: 'Core',
    secondaryMuscles: ['Hip Flexors', 'Shoulders', 'Quads'],
    equipment: 'None',
    difficulty: 'intermediate',
    tags: ['core', 'abs', 'bodyweight']
  },
  {
    name: 'V-Sit',
    muscleGroup: 'Core',
    secondaryMuscles: ['Hip Flexors', 'Shoulders', 'Quads'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['core', 'abs', 'flexibility']
  },
  {
    name: 'Manna',
    muscleGroup: 'Core',
    secondaryMuscles: ['Shoulders', 'Triceps', 'Hamstrings', 'Flexibility'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['core', 'shoulders', 'flexibility']
  },
  {
    name: 'Crow Pose / Frog Stand',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Wrist Strength', 'Balance'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['shoulders', 'balance', 'handstand']
  },
  {
    name: 'Crane Pose',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Core', 'Balance'],
    equipment: 'None',
    difficulty: 'intermediate',
    tags: ['shoulders', 'balance', 'bodyweight']
  },
  {
    name: 'Elbow Lever',
    muscleGroup: 'Core',
    secondaryMuscles: ['Shoulders', 'Back', 'Balance'],
    equipment: 'None',
    difficulty: 'beginner',
    tags: ['core', 'balance', 'bodyweight']
  },
  {
    name: 'Handstand Walk',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Balance', 'Core', 'Triceps'],
    equipment: 'None',
    difficulty: 'advanced',
    tags: ['shoulders', 'balance', 'bodyweight']
  },
  {
    name: 'Deficit Handstand Push-Up',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps', 'Core'],
    equipment: 'Parallettes / Blocks',
    difficulty: 'advanced',
    tags: ['shoulders', 'push-up', 'bodyweight']
  },
  {
    name: 'Archer Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['back', 'unilateral', 'bodyweight', 'pull-up']
  },
  {
    name: 'Typewriter Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders', 'Core'],
    equipment: 'Pull-up Bar',
    difficulty: 'advanced',
    tags: ['back', 'lats', 'bodyweight', 'pull-up']
  },
  {
    name: 'L-Sit Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Core', 'Biceps', 'Hip Flexors'],
    equipment: 'Pull-up Bar',
    difficulty: 'intermediate',
    tags: ['back', 'core', 'bodyweight', 'pull-up']
  },
  {
    name: 'L-Sit Dips',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Core', 'Shoulders'],
    equipment: 'Parallel Bars',
    difficulty: 'intermediate',
    tags: ['chest', 'triceps', 'core', 'bodyweight', 'dip']
  },
  {
    name: 'Clapping Push-Up',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders', 'Explosive'],
    equipment: 'None',
    difficulty: 'intermediate',
    tags: ['chest', 'explosive', 'plyo']
  },
  {
    name: 'Explosive Pull-Up',
    muscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Shoulders', 'Explosive'],
    equipment: 'Pull-up Bar',
    difficulty: 'intermediate',
    tags: ['back', 'explosive', 'plyo']
  }
];

/** Fetch all library exercises */
export const getLibraryExercises = async (): Promise<LibraryExercise[]> => {
  const ref = collection(db, 'exerciseLibrary');
  const snap = await getDocs(ref);
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as LibraryExercise));
};

function generateSpecificCues(name: string, muscleGroup: string): string[] {
  const n = name.toLowerCase();
  const m = muscleGroup.toLowerCase();

  // 1. Bench Press / Chest Press
  if (n.includes('bench press') || n.includes('chest press') || n.includes('floor press')) {
    return [
      'Retract your shoulder blades and pin them flat against the bench.',
      'Lower the bar/dumbbell slowly to your mid-chest, keeping elbows tucked at 45 degrees.',
      'Drive the weight straight up, exhaling at the top of the contraction.'
    ];
  }
  // 2. Flyes
  if (n.includes('fly')) {
    return [
      'Maintain a slight, fixed bend in your elbows throughout the movement.',
      'Open your arms wide to feel a deep stretch in your chest muscles.',
      'Bring your hands back together in a wide arc, squeezing the chest at the peak.'
    ];
  }
  // 3. Push-Ups
  if (n.includes('push-up') || n.includes('pushup')) {
    return [
      'Keep your body in a perfectly straight line, engaging your glutes and core.',
      'Lower your chest to the floor, keeping your elbows tucked close to your body.',
      'Push back up forcefully to a complete lockout at the top.'
    ];
  }
  // 4. Dips
  if (n.includes('dip')) {
    return [
      'Depress your shoulders and lean your torso slightly forward to target the chest.',
      'Lower yourself under control until your shoulders are slightly below your elbows.',
      'Drive back up to a full lockout, squeezing your triceps at the top.'
    ];
  }
  // 5. Rows
  if (n.includes('row')) {
    return [
      'Hinge at your hips with a flat back, bracing your core.',
      'Drive your elbows back and up to pull the weight toward your lower stomach.',
      'Squeeze your shoulder blades together at the peak of the row.'
    ];
  }
  // 6. Deadlifts
  if (n.includes('deadlift')) {
    return [
      'Position the bar over your mid-foot and hinge at the hips, keeping a flat back.',
      'Brace your core, push the floor away with your legs, and pull the bar close to your shins.',
      'Lock out your hips and squeeze your glutes at the top, avoiding leaning back.'
    ];
  }
  // 7. Pull-Ups / Lat Pulldowns / Muscle-Ups
  if (n.includes('pulldown') || n.includes('pull-up') || n.includes('chin-up') || n.includes('pull up') || n.includes('chin up') || n.includes('muscle-up') || n.includes('muscle up')) {
    return [
      'Start from a dead hang, depress your scapula, and engage your lats.',
      'Drive your elbows down and back to pull your chest up to the bar / pull the bar to your chest.',
      'Control the return (eccentric phase) back to a full stretch.'
    ];
  }
  // 8. Overhead Presses
  if (n.includes('shoulder press') || n.includes('overhead press') || n.includes('ohp') || n.includes('arnold press') || n.includes('press')) {
    return [
      'Brace your core and squeeze your glutes to support your lower back.',
      'Press the weight straight overhead, moving your head slightly forward as the bar clears your face.',
      'Lock out at the top, then lower the weights slowly back to shoulder level.'
    ];
  }
  // 9. Raises (Shoulders)
  if (n.includes('lateral raise') || n.includes('front raise') || n.includes('y-raise') || n.includes('lu raise') || n.includes('raise') && m.includes('shoulders')) {
    return [
      'Stand tall, keeping a very slight bend in your elbows.',
      'Raise the weights to shoulder height, leading the movement with your elbows.',
      'Control the lowering phase to maximize time under tension.'
    ];
  }
  // 10. Squats / Leg Press / Hack Squat
  if (n.includes('squat') || n.includes('leg press') || n.includes('hack squat') || n.includes('split squat')) {
    return [
      'Stand with feet shoulder-width apart, chest up, and core fully braced.',
      'Hinge at your hips and bend your knees to lower down, keeping knees tracking over toes.',
      'Drive through your heels to return to the starting position, squeezing your glutes.'
    ];
  }
  // 11. Lunges / Step-Ups
  if (n.includes('lunge') || n.includes('step-up') || n.includes('step up')) {
    return [
      'Brace your core and take a controlled step forward or backward.',
      'Lower your hips until your back knee is just above the floor and front thigh is parallel.',
      'Push through the heel of your front foot to stand back up.'
    ];
  }
  // 12. Curls (Biceps)
  if (n.includes('curl') && m.includes('biceps')) {
    return [
      'Keep your upper arms locked to your sides and your shoulders down.',
      'Curl the weight up fully, focusing on a strong contraction at the top.',
      'Lower the weight slowly under control, fully extending your elbow.'
    ];
  }
  // 13. Extensions / Skull Crushers / Pushdowns (Triceps)
  if (n.includes('pushdown') || n.includes('extension') || n.includes('skull crusher') || n.includes('kickback') || n.includes('pressdown')) {
    return [
      'Pin your elbows to your sides or lock them overhead, keeping upper arms motionless.',
      'Extend your elbows fully, squeezing your triceps at the peak contraction.',
      'Control the weight slowly as you return to the starting angle.'
    ];
  }
  // 14. Core Leg Raises / Hanging Raises
  if (n.includes('leg raise') || n.includes('knee raise') || n.includes('toes-to-bar') || n.includes('wipers') || n.includes('wipers')) {
    return [
      'Hang from the bar or lie flat, engaging your core and keeping your body stable.',
      'Raise your legs using your abdominal muscles, avoiding any swinging momentum.',
      'Lower your legs slowly with absolute control to maximize core tension.'
    ];
  }
  // 15. Planks / Holds (Core)
  if (n.includes('plank') || n.includes('hold') || n.includes('flag') || n.includes('sit') || n.includes('lean')) {
    return [
      'Brace your abs, squeeze your glutes, and maintain a straight body line.',
      'Actively push away from the floor or bar to engage your shoulder girdle.',
      'Breathe steadily and maintain maximum tension throughout the hold.'
    ];
  }
  // 16. Crunches / Sit-Ups
  if (n.includes('crunch') || n.includes('sit-up') || n.includes('sit up') || n.includes('rollout')) {
    return [
      'Contract your abdominal muscles to curl your torso forward, keeping lower back supported.',
      'Focus on rib-to-hip compression rather than just raising your head.',
      'Slowly release the contraction and return to the starting position.'
    ];
  }
  // 17. Calf Raises
  if (n.includes('calf raise')) {
    return [
      'Lower your heels below the step level to get a complete stretch in the calves.',
      'Drive straight up onto the balls of your feet, squeezing the calves at the top.',
      'Pause for a second at peak contraction before lowering slowly.'
    ];
  }

  // Default Fallbacks
  return [
    'Establish a stable stance, brace your core, and check your alignment.',
    'Move the weight through the full range of motion under complete control.',
    'Focus on the target muscles, squeezing at peak contraction and controlling the return.'
  ];
}

/** Seed the Exercise Library with default items */
export const seedLibraryExercises = async (): Promise<void> => {
  const batch = writeBatch(db);
  
  for (const ex of COMPACT_LIBRARY) {
    // Generate document ID from the name
    const docId = 'lib_' + ex.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const ref = doc(db, 'exerciseLibrary', docId);

    // Expand the instructions procedurally if not defined
    const instructions = ex.instructions || generateSpecificCues(ex.name, ex.muscleGroup);

    // Set youtube search fallback
    const youtubeSearch = ex.youtubeSearch || (ex.name + ' correct form');

    const expandedEx: Omit<LibraryExercise, 'id'> = {
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      secondaryMuscles: ex.secondaryMuscles,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      instructions,
      youtubeSearch,
      caloriesPerMinEstimate: eqEstimate(ex.equipment),
      caloriesPerRep: repEstimate(ex.name),
      caloriesPerSecond: holdEstimate(ex.name),
      met: estimateMet(ex.name, ex.equipment),
      tags: ex.tags,
      isCustom: false,
      createdBy: null
    };

    batch.set(ref, expandedEx);
  }
  
  await batch.commit();
};

function eqEstimate(equipment: string): number {
  const eq = equipment.toLowerCase();
  if (eq.includes('barbell')) return 7;
  if (eq.includes('dumbbell')) return 6;
  if (eq.includes('machine')) return 5;
  if (eq.includes('band')) return 3;
  return 6; // bodyweight/default
}

function estimateMet(name: string, equipment: string): number {
  const n = name.toLowerCase();
  if (/(squat|deadlift|lunge|burpee|muscle|pull-up|chin-up|dip|push-up|row|clean|snatch)/i.test(n)) return 6;
  if (/(run|jump|sprint|climber)/i.test(n)) return 7;
  if (/(stretch|mobility|breath|warm-up|dislocation)/i.test(n)) return 2.8;
  if (/(curl|extension|raise|fly|kickback|hold|plank|crunch)/i.test(n)) return 3.5;
  if (equipment.toLowerCase().includes('barbell')) return 5.5;
  return 4.5;
}

function repEstimate(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('burpee') || n.includes('muscle-up') || n.includes('muscle up')) return 0.65;
  if (n.includes('squat') || n.includes('lunge') || n.includes('deadlift')) return 0.5;
  if (n.includes('pull') || n.includes('dip') || n.includes('push')) return 0.42;
  return 0.35;
}

function holdEstimate(name: string): number {
  const n = name.toLowerCase();
  return n.includes('hold') || n.includes('plank') || n.includes('handstand') || n.includes('lever') ? 0.09 : 0.08;
}
