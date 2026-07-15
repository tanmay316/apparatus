import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

export interface SkillItem {
  id: string;
  name: string;
  phase: 1 | 2 | 3 | 4;
  category: 'push' | 'pull' | 'balance' | 'core';
  description: string;
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
