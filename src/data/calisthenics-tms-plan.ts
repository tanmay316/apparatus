import type { Plan, Exercise, PlanDay } from '@/types';
import { Timestamp } from 'firebase/firestore';

const ex = (name: string, sets: string, tempo = '', rest = '', cues: string[] = []): Exercise => {
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' form tutorial')}`;
  return { name, sets, tempo, rest, cues, yt: ytUrl };
};

const day = (dayNumber: number, title: string, skill: string, time: string, warmup: Exercise[], skillWork: Exercise[], strength: Exercise[], cooldown: Exercise[]): PlanDay => ({ 
    dayNumber, title, skill, time, type: 'strength', order: dayNumber, warmup, skillWork, strength, cooldown 
});

const now = Timestamp.now();

export const tmsCalisthenicsPlan: Plan = {
  ownerId: 'SYSTEM', 
  ownerName: 'Apparatus', 
  title: 'Tms Calisthenics Hypertrophy + Skills Program',
  description: 'Phase 1 Skills: Handstand and L-sit only. Split: Push • Legs • Pull • Push • Legs+Mobility • Pull • Recovery',
  type: 'sample', 
  tags: ['calisthenics', 'bodyweight', 'skills', 'hypertrophy'], 
  daysPerWeek: 7,
  estimatedDuration: '60-75 min', 
  isPublic: true, 
  isArchived: false, 
  clonedFrom: null, 
  usageCount: 0,
  createdAt: now, 
  updatedAt: now,
  days: [
    day(1, 'Push A (Chest Priority)', 'Handstand', '~60 min', [
      ex('Wrist circles', 'x20'), ex('Shoulder circles', 'x20'), ex('Band shoulder dislocations', '2 x 15'), ex('Band pull-aparts', '2 x 15'), ex('Scapular push-ups', '2 x 10'), ex('Light push-ups', '2 x 10')
    ], [
      ex('Chest-to-wall Handstand Hold', '5 x 20-30 sec'), ex('Freestanding Kick-ups', 'x10')
    ], [
      ex('Deep Parallel Bar Dips', '4 x 8-12'), ex('Deep Push-ups on Parallel Bars', '4 x 10-15'), ex('Pseudo Planche Push-ups', '3 x 8-10'), ex('Archer Push-ups', '3 x 8/side'), ex('Diamond Push-ups', '3 x 12-15'), ex('Band Lateral Raise', '3 x 20'), ex('Band Face Pull', '3 x 20')
    ], [
      ex('Chest stretch', '1 min'), ex('Shoulder stretch', '1 min'), ex('Triceps stretch', '1 min'), ex("Child's Pose", '1 min'), ex('Bhastrika', '2 min'), ex('Alternate Nostril Breathing', '3 min'), ex('Meditation', '5 min')
    ]),
    day(2, 'Legs + Abs', 'L-sit', '~60 min', [
      ex('Hip circles', '1 min'), ex('Leg swings', '1 min'), ex('Ankle mobility', '1 min'), ex('Bodyweight squats', '2 x 10'), ex('Glute bridge', '2 x 10')
    ], [
      ex('Tuck L-sit', '5 x 15 sec'), ex('One-leg L-sit', '3 x 10 sec')
    ], [
      ex('Bulgarian Split Squat', '3 x 10'), ex('Sissy Squat', '3 x 12'), ex('Nordic Curl', '3 x 6'), ex('Standing Calf Raise', '4 x 20'), ex('Hanging Leg Raise', '4 x 12'), ex('Hollow Hold', '3 x 30 sec'), ex('Reverse Crunch', '3 x 15')
    ], [
      ex('Quad stretch', '1 min'), ex('Hamstring stretch', '1 min'), ex('Hip flexor stretch', '1 min'), ex('Calf stretch', '1 min'), ex('Bhastrika', '2 min'), ex('Alternate Nostril Breathing', '3 min'), ex('Meditation', '5 min')
    ]),
    day(3, 'Pull A', 'Handstand', '~60 min', [
      ex('Dead hang', '1 min'), ex('Scapular pull-ups', '2 x 10'), ex('Band rows', '2 x 15'), ex('Shoulder mobility', '1 min')
    ], [
      ex('Handstand Practice', '15 min')
    ], [
      ex('Pull-ups', '4 x 6-10'), ex('Wide Pull-ups', '4 x 8'), ex('Archer Pull-ups', '3 x 5'), ex('Australian Rows', '4 x 12'), ex('Chin-ups', '3 x 8-10'), ex('Bodyweight Bar Curl', '3 x 12'), ex('Band Rear Delt Fly', '3 x 20'), ex('Dragon Flag', '3 x 5-8')
    ], [
      ex('Lat stretch', '1 min'), ex('Forearm stretch', '1 min'), ex('Bhastrika', '2 min'), ex('Alternate Nostril Breathing', '3 min'), ex('Meditation', '5 min')
    ]),
    day(4, 'Push B', 'Handstand', '~60 min', [
      ex('Wrist prep', '1 min'), ex('Shoulder activation', '1 min'), ex('Band external rotation', '2 x 15'), ex('Scapular push-ups', '2 x 10')
    ], [
      ex('Handstand Practice', '15 min')
    ], [
      ex('Pike Push-ups', '4 x 10'), ex('HSPU Negatives', '4 x 5'), ex('Korean Dips', '3 x 8'), ex('Deep Push-ups', '3 x 12'), ex('Pseudo Planche Push-ups', '3 x 8'), ex('Band Lateral Raise', '3 x 20'), ex('Band Face Pull', '3 x 20')
    ], [
      ex('Chest stretch', '1 min'), ex('Shoulder stretch', '1 min'), ex('Triceps stretch', '1 min'), ex('Bhastrika', '2 min'), ex('Alternate Nostril Breathing', '3 min'), ex('Meditation', '5 min')
    ]),
    day(5, 'Legs + Mobility + Abs', 'L-sit', '~60 min', [
      ex('Hip mobility', '1 min'), ex('Leg swings', '1 min'), ex('Ankle mobility', '1 min'), ex('Glute bridge', '2 x 10')
    ], [
      ex('L-sit Practice', '10 min')
    ], [
      ex('Assisted Pistol Squat', '3 x 8'), ex('Bulgarian Split Squat', '3 x 12'), ex('Nordic Curl', '3 x 6'), ex('Standing Calf Raise', '4 x 20'), ex('Dragon Flag', '3 x 5-8'), ex('Hanging Knee Raise', '3 x 15'), ex('Side Plank', '3 x 45 sec')
    ], [
      ex('Hip mobility', '1 min'), ex('Hamstring stretch', '1 min'), ex('Calf stretch', '1 min'), ex('Bhastrika', '2 min'), ex('Alternate Nostril Breathing', '3 min'), ex('Meditation', '5 min')
    ]),
    day(6, 'Pull B', 'Handstand / L-sit', '~60 min', [
      ex('Dead hang', '1 min'), ex('Scapular pull-ups', '2 x 10'), ex('Band rows', '2 x 15'), ex('Wrist prep', '1 min')
    ], [
      ex('Handstand', '10 min'), ex('L-sit', '10 min')
    ], [
      ex('Slow Pull-ups', '4 x 6-8'), ex('Chin-ups', '4 x 8-10'), ex('Commando Pull-ups', '3 x 8'), ex('Australian Rows', '4 x 12'), ex('Bodyweight Bar Curl', '3 x 12'), ex('Band Rear Delt Fly', '3 x 20'), ex('Dead Hang', '3 x 45 sec')
    ], [
      ex('Lat stretch', '1 min'), ex('Forearm stretch', '1 min'), ex('Bhastrika', '2 min'), ex('Alternate Nostril Breathing', '3 min'), ex('Meditation', '5 min')
    ]),
    day(7, 'Recovery', '', '~45 min', [
      ex('Light walk', '10 min'), ex('Joint mobility', '5 min')
    ], [], [
      ex('Surya Namaskar', '10 min'), ex('Full-body mobility', '20 min'), ex('Plank', '3 x 60 sec'), ex('Dead Bug', '3 x 15'), ex('Bird Dog', '3 x 15')
    ], [
      ex('Full body stretch', '5 min'), ex('Bhastrika', '2 min'), ex('Alternate Nostril Breathing', '5 min'), ex('Meditation', '10 min')
    ]),
  ],
};
