import type { Plan, Exercise, PlanDay } from '@/types';
import { Timestamp } from 'firebase/firestore';

const ex = (name: string, sets: string, tempo = '', rest = '', cues: string[] = []): Exercise => ({ name, sets, tempo, rest, cues, yt: name });
const warmup = (): Exercise[] => [
  ex('Band shoulder dislocations', '2 x 12'),
  ex('Band pull-aparts', '2 x 12'),
  ex('Scapular push-ups', '2 x 10'),
  ex('Scapular pull-ups', '2 x 10'),
  ex('Arm + wrist circles', '1 x 60 sec'),
  ex('Bodyweight squats', '1 x 10'),
];
const breath = (): Exercise[] => [ex('Bhastrika breathing', '3 x 20 breaths'), ex('Nadi Shodhana', '2 x 60 sec'), ex('Breath-awareness meditation', '1 x 3 min')];
const day = (dayNumber: number, title: string, skill: string, time: string, skillWork: Exercise[], strength: Exercise[], cooldown = breath()): PlanDay => ({ dayNumber, title, skill, time, type: 'strength', order: dayNumber, warmup: [...warmup(), ...breath()], skillWork, strength, cooldown });

export const personalCalisthenicsPlan: Plan = {
  ownerId: 'SYSTEM', ownerName: 'Apparatus', title: '6-Day Calisthenics Protocol v3',
  description: 'Personal 7-day schedule from the v3 PDF: hypertrophy-focused calisthenics, skill practice, yoga, pranayama, and meditation.',
  type: 'sample', tags: ['calisthenics', 'bodyweight', 'skills', 'yoga', 'hypertrophy'], daysPerWeek: 7,
  estimatedDuration: '45-90 min', isPublic: true, isArchived: false, clonedFrom: null, usageCount: 0,
  createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  days: [
    day(1, 'Push (Chest Priority) + Handstand', 'Handstand', '70 min', [ex('Wall handstand hold (chest to wall)', '5 x 20-30 sec'), ex('Wall handstand hold (back to wall)', '3 x 15-30 sec'), ex('Freestanding kick-up attempts', '5-8 attempts')], [ex('Parallel bar dips', '4 x 8-12', '2-1-2', '90s'), ex('Deep push-ups on blocks/parallettes', '4 x 10-15', '3-1-1', '90s'), ex('Pseudo planche push-ups', '4 x 8-10', '2-1-2', '90s'), ex('Typewriter push-ups', '3 x 6-8/side', '2-1-2', '75s'), ex('Diamond push-ups', '3 x 12-15', '2-1-2', '60s')]),
    day(2, 'Pull (Back Thickness) + Front Lever', 'Front Lever', '65 min', [ex('Tuck front lever hold', '5 x 10-20 sec'), ex('Advanced tuck front lever', '3 x 8-15 sec'), ex('Dead hang', '3 x 30-45 sec')], [ex('Weighted-feel pull-ups (slow negative)', '4 x 6-8', '4-1-1', '2 min'), ex('Wide-grip pull-ups', '3 x max', '2-0-2', '90s'), ex('Typewriter pull-ups', '3 x 4-6/side', '2-1-2', '90s'), ex('Australian/inverted rows', '4 x 12-15', '2-1-2', '90s'), ex('Bodyweight bar curls', '3 x 10-12', '2-1-2', '60s')]),
    day(3, 'Legs + Core (Heavy) + L-sit', 'L-sit', '75 min', [ex('Tuck L-sit hold', '5 x 10-20 sec'), ex('One-leg-extended L-sit', '3 x 8-15 sec/side'), ex('Straddle L-sit attempts', '3 x 5-10 sec')], [ex('Pistol squat progression', '4 x 6-8/leg', '3-1-1', '90s'), ex('Bulgarian split squats', '4 x 10-12/leg', '3-1-1', '90s'), ex('Sissy squats', '3 x 10-12', '3-1-1', '75s'), ex('Nordic curl negatives', '3 x 6-8', '4 sec down', '90s'), ex('Standing calf raises', '4 x 20-25', '2-1-2', '45s'), ex('Hanging leg raises', '3 x 12-15', '2-0-2', '60s')]),
    day(4, 'Push (Shoulders/Triceps) + Planche', 'Planche', '70 min', [ex('Planche lean', '5 x 15-20 sec'), ex('Tuck planche hold', '5 x 5-15 sec'), ex('Frog stand', '3 x 20-30 sec')], [ex('Handstand push-up negatives', '4 x 5-8', '4 sec down', '2 min'), ex('Pike push-ups', '4 x 10-12', '3-1-1', '90s'), ex('Archer push-ups', '4 x 8-10/side', '2-1-2', '90s'), ex('Dips (upright torso)', '3 x max', '2-1-2', '90s'), ex('Korean dips', '3 x 6-10', '2-1-2', '75s')]),
    day(5, 'Pull (Back Width + Biceps) + Back Lever', 'Back Lever', '65 min', [ex('German hang', '4 x 20-30 sec'), ex('Tuck back lever hold', '5 x 10-20 sec'), ex('Advanced tuck back lever', '3 x 8-15 sec')], [ex('Wide-grip pull-ups', '4 x max', '2-1-2', '90s'), ex('Chin-ups', '4 x 8-10', '3-1-1', '90s'), ex('L-sit pull-ups', '3 x 5-8', '2-0-2', '90s'), ex('Commando pull-ups', '3 x 6-8', '2-1-2', '90s'), ex('Bodyweight rows', '3 x 12-15', '2-1-2', '60s')]),
    day(6, 'Full Body Power + Skills', 'Elbow Lever', '60 min', [ex('Elbow lever hold', '5 x 10-20 sec'), ex('L-sit progression', '1 x 8-10 min'), ex('Freestanding handstand practice', '8-10 attempts')], [ex('Explosive push-ups', '4 x 8-10', 'Fast', '90s'), ex('Explosive pull-ups', '4 x 5-6', 'Fast', '2 min'), ex('Dips', '3 x max', '', '90s'), ex('Jump squats', '3 x 15', 'Explosive', '60s'), ex('Dragon flag progression', '4 x 5-8', 'Slow control', '60s'), ex('Plank hold', '3 x 45-60 sec', '', '45s')]),
    { ...day(7, 'Yoga + Stretching + Pranayama + Meditation', '', '45-50 min', [], [ex('Sun salutations', '3-5 rounds'), ex('Downward dog to cobra flow', '5 rounds'), ex('Pigeon pose', '1-2 min/side'), ex('Seated forward fold', '1-2 min'), ex('Shoulder/chest opener', '1-2 min/side'), ex('Spinal twist', '1 min/side'), ex("Child's pose", '1-2 min'), ex('Nadi Shodhana', '1 x 5 min'), ex('Bhramari breathing', '1 x 5 min'), ex('Breath-awareness meditation', '1 x 15-20 min')]), type: 'mobility' },
  ],
};
