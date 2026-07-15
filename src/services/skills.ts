import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

export interface SkillItem {
  id: string;
  name: string;
  phase: 1 | 2 | 3 | 4;
  category: 'push' | 'pull' | 'balance' | 'core';
  description: string;
}

export interface SkillRoadmapStep {
  title: string;
  goal: string;
  practice: string;
  checkpoint: string;
}

const SPECIFIC_PROGRESSIONS: Record<string, SkillRoadmapStep[]> = {
  wall_hs: [
    { title: 'Wrist and shoulder preparation', goal: 'Build comfortable overhead range.', practice: '3 rounds: wrist rocks, scapular push-ups, and wall slides for 8–12 reps.', checkpoint: 'No wrist pain and ribs stay down.' },
    { title: 'Chest-to-wall holds', goal: 'Own the straight-line shape.', practice: '4 sets of 20–40 seconds, actively pushing the floor away.', checkpoint: 'Hold 45 seconds without arching or losing shoulder elevation.' },
    { title: 'Heel pulls', goal: 'Learn the balance line.', practice: '5 sets of 3–5 controlled heel pulls away from the wall.', checkpoint: 'Find 5 seconds of balance on 3 separate attempts.' },
  ],
  free_hs: [
    { title: 'Wall line mastery', goal: 'Make the shape automatic.', practice: 'Accumulate 3 minutes of clean chest-to-wall holds.', checkpoint: 'Three 45-second holds with straight elbows.' },
    { title: 'Balance drills', goal: 'Control small corrections.', practice: '10 minutes of kick-ups, heel pulls, and fingertip pressure.', checkpoint: 'At least 5 controlled holds of 5+ seconds.' },
    { title: 'Freestanding consistency', goal: 'Repeat quality attempts.', practice: '4–6 sets of 3–5 attempts, resting fully between sets.', checkpoint: 'A calm 20-second freestanding hold.' },
  ],
  tuck_lsit: [
    { title: 'Support strength', goal: 'Depress the shoulders.', practice: 'Parallette support holds: 5 × 15–25 seconds.', checkpoint: 'Shoulders stay away from ears and elbows locked.' },
    { title: 'Compression', goal: 'Lift the hips with control.', practice: 'Seated leg lifts and tuck knee raises: 3 × 8–12.', checkpoint: 'Clear the floor for 15 seconds without collapsing.' },
    { title: 'Tuck L-sit', goal: 'Build repeatable holds.', practice: '5 attempts of 10–20 seconds with full rest.', checkpoint: 'A clean 30-second hold.' },
  ],
  tuck_fl: [
    { title: 'Scapular and grip base', goal: 'Create a strong active hang.', practice: 'Dead hangs, scapular pulls, and hollow holds: 3–4 sets each.', checkpoint: '30-second active hang with no shrugging.' },
    { title: 'Tuck lever rows', goal: 'Build horizontal pulling strength.', practice: 'Tuck front lever rows: 4 × 5–8 controlled reps.', checkpoint: 'Keep hips level through every rep.' },
    { title: 'Tuck front lever holds', goal: 'Own the static position.', practice: '5 × 10–20 seconds, stopping before form breaks.', checkpoint: 'A controlled 30-second tuck hold.' },
  ],
  hspu_wall: [
    { title: 'Pike pressing', goal: 'Prepare vertical pressing strength.', practice: 'Feet-elevated pike push-ups: 4 × 6–10.', checkpoint: 'Head travels forward and elbows stay controlled.' },
    { title: 'Wall negatives', goal: 'Control the hardest range.', practice: '5 × 2–4 slow negatives with a 3–5 second descent.', checkpoint: 'Touch a target softly every rep.' },
    { title: 'Partial to full reps', goal: 'Build the complete pattern.', practice: 'Use an elevated target, then lower it gradually over weeks.', checkpoint: '5 strict wall handstand push-ups.' },
  ],
  full_fl: [
    { title: 'Advanced tuck', goal: 'Open the hip angle.', practice: 'Advanced tuck holds and rows: 5 × 8–15 seconds.', checkpoint: '20-second advanced tuck with a flat back.' },
    { title: 'One-leg lever', goal: 'Increase the lever length.', practice: 'Alternate legs for 4 × 5–10 seconds each side.', checkpoint: '10 seconds per side without twisting.' },
    { title: 'Full lever', goal: 'Maintain a straight bodyline.', practice: 'Band-assisted holds, negatives, and raises with full rest.', checkpoint: 'A clean 5–10 second full front lever.' },
  ],
  muscle_up: [
    { title: 'Pulling height', goal: 'Pull the bar to the lower chest.', practice: 'High pull-ups and explosive chest-to-bar pulls: 5 × 3–5.', checkpoint: 'Five powerful chest-to-bar reps.' },
    { title: 'Transition', goal: 'Move over the bar smoothly.', practice: 'Low-bar transitions and band-assisted muscle-ups: 4 × 3–5.', checkpoint: 'No elbow pain and no jump-driven transition.' },
    { title: 'Strict muscle-up', goal: 'Link the full movement.', practice: 'Singles with full rest, then small clean sets.', checkpoint: 'One controlled rep from a dead hang.' },
  ],
  tuck_planche: [
    { title: 'Wrist and scapula base', goal: 'Prepare straight-arm loading.', practice: 'Wrist prep, protraction holds, and planche leans: 4 × 15–25 seconds.', checkpoint: 'Pain-free wrists and locked elbows.' },
    { title: 'Tuck planche', goal: 'Elevate the hips with control.', practice: 'Tuck holds and tuck planche push-ups: 5 × 5–12 seconds.', checkpoint: 'A clean 15-second tuck planche.' },
    { title: 'Advanced tuck', goal: 'Lengthen the lever gradually.', practice: 'Open the knees slightly while keeping scapulae active.', checkpoint: '10 seconds with the hips level.' },
  ],
  full_planche: [
    { title: 'Tuck to advanced tuck', goal: 'Build straight-arm capacity.', practice: 'Accumulate 60–90 seconds of high-quality holds per session.', checkpoint: '15-second advanced tuck with no elbow bend.' },
    { title: 'Straddle progression', goal: 'Increase lever length safely.', practice: 'Band-assisted straddle holds and planche leans: 4–6 sets.', checkpoint: '10-second controlled straddle hold.' },
    { title: 'Full planche', goal: 'Own the longest lever.', practice: 'Use assistance and low-volume, high-quality attempts.', checkpoint: 'A controlled 3–5 second full hold.' },
  ],
};

export function getSkillRoadmap(skill: SkillItem): SkillRoadmapStep[] {
  if (SPECIFIC_PROGRESSIONS[skill.id]) return SPECIFIC_PROGRESSIONS[skill.id];
  const focus = skill.category === 'push' ? 'straight-arm pushing strength' : skill.category === 'pull' ? 'scapular control and pulling strength' : skill.category === 'balance' ? 'position awareness and balance' : 'active compression and trunk control';
  return [
    { title: 'Build the base', goal: `Develop ${focus}.`, practice: `Train regressions for ${skill.name} 3 times per week for 3–4 sets, stopping 2 reps or 5 seconds before form breaks.`, checkpoint: 'Every rep is controlled, pain-free, and repeatable.' },
    { title: 'Own the progression', goal: `Increase time, range, or leverage for ${skill.name}.`, practice: `Add 5–10 seconds or 1–2 quality reps only after two consistent sessions.`, checkpoint: 'You can repeat the progression across three sessions.' },
    { title: 'Test the skill', goal: `Practice ${skill.name} without fatigue masking your form.`, practice: 'Use low-volume attempts with full rest, then record the best clean attempt.', checkpoint: `A clean, repeatable ${skill.name} with no compensations.` },
  ];
}

export const SKILL_ROADMAP: SkillItem[] = [
  // Phase 1
  { id: 'wall_hs', name: 'Wall Handstand Hold', phase: 1, category: 'balance', description: 'Core balance foundation. Build straight line form against a wall.' },
  { id: 'crow_pose', name: 'Crow Pose / Frog Stand', phase: 1, category: 'balance', description: 'Straight-arm hand balance foundation. Grip floor and lean forward.' },
  { id: 'tuck_lsit', name: 'Tuck L-Sit', phase: 1, category: 'core', description: 'Active shoulder depression and compression foundation.' },
  { id: 'elbow_lever', name: 'Elbow Lever', phase: 1, category: 'balance', description: 'Balancing body on the elbows with solid core tension.' },
  { id: 'tuck_fl', name: 'Tuck Front Lever', phase: 1, category: 'pull', description: 'Horizontal pulling foundation. Back parallel to the ground, knees tucked.' },

  // Phase 2
  { id: 'free_hs', name: 'Freestanding Handstand', phase: 2, category: 'balance', description: 'Clean handstand balancing without contact on a wall.' },
  { id: 'straddle_lsit', name: 'Straddle L-Sit', phase: 2, category: 'core', description: 'Extension of the L-sit with legs spread out wide.' },
  { id: 'adv_tuck_fl', name: 'Advanced Tuck Front Lever', phase: 2, category: 'pull', description: 'Knees bent at 90 degrees, opening the hip angle.' },
  { id: 'tuck_bl', name: 'Tuck Back Lever', phase: 2, category: 'push', description: 'Horizontal push support. Knees tucked, back flat.' },
  { id: 'hspu_wall', name: 'Handstand Push-Up (Wall)', phase: 2, category: 'push', description: 'Vertical pushing strength. Head touching the floor assisted.' },

  // Phase 3
  { id: 'full_fl', name: 'Full Front Lever', phase: 3, category: 'pull', description: 'Mastery of horizontal pulling. Completely straight bodyline.' },
  { id: 'full_bl', name: 'Full Back Lever', phase: 3, category: 'push', description: 'Straight bodyline back lever. Active scapula protraction.' },
  { id: 'muscle_up', name: 'Bar Muscle-Up', phase: 3, category: 'pull', description: 'Combines pull-up, transition, and straight-bar dip.' },
  { id: 'tuck_planche', name: 'Tuck Planche', phase: 3, category: 'push', description: 'Straight-arm pushing foundation. Hips elevated, knees to chest.' },

  // Phase 4
  { id: 'full_planche', name: 'Full Planche', phase: 4, category: 'push', description: 'Holy grail of calisthenics pushing. Arms straight, legs horizontal.' },
  { id: 'oapu', name: 'One-Arm Pull-Up', phase: 4, category: 'pull', description: 'Elbow flexion and pulling power on a single arm.' },
  { id: 'oapush', name: 'One-Arm Push-Up', phase: 4, category: 'push', description: 'Single-arm horizontal pushing, legs spread for balance.' },
  { id: 'human_flag', name: 'Human Flag', phase: 4, category: 'core', description: 'Lateral chain strength, holding body perpendicular to a pole.' },
];

/** Get all skill IDs mastered by user */
export const getUserSkills = async (userId: string): Promise<string[]> => {
  const ref = collection(db, `users/${userId}/skills`);
  const snap = await getDocs(ref);
  return snap.docs.map(doc => doc.id);
};

/** Toggle mastery of a skill */
export const toggleSkill = async (userId: string, skillId: string, isMastered: boolean): Promise<void> => {
  const ref = doc(db, `users/${userId}/skills`, skillId);
  if (isMastered) {
    await setDoc(ref, { mastered: true, unlockedAt: new Date() });
  } else {
    await deleteDoc(ref);
  }
};
