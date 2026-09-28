import { db } from '@/lib/firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { SKILL_BY_ID, type SkillTier } from '@/data/calisthenics-curriculum';
import {
  EMPTY_ASSESSMENT,
  MAX_ACTIVE_SKILLS,
  newProgress,
  type Assessment,
  type ProgressMap,
  type SkillProgress,
  type TutorProfile,
} from '@/lib/skill-tutor';

const TUTOR_DOC = '_tutor';

/** Old checklist ids mapped to the equivalent skill and step in the new curriculum. */
const LEGACY_SKILLS: Record<string, [skillId: string, step: number]> = {
  wall_hs: ['wall_handstand', 99],
  crow_pose: ['crow', 99],
  tuck_lsit: ['l_sit', 2],
  elbow_lever: ['elbow_lever', 99],
  tuck_fl: ['front_lever', 1],
  free_hs: ['free_handstand', 3],
  straddle_lsit: ['l_sit', 99],
  adv_tuck_fl: ['front_lever', 2],
  tuck_bl: ['back_lever', 3],
  hspu_wall: ['hspu', 3],
  full_fl: ['front_lever', 5],
  full_bl: ['back_lever', 99],
  muscle_up: ['muscle_up', 5],
  tuck_planche: ['planche', 2],
  full_planche: ['planche', 99],
  oapu: ['one_arm_pull_up', 4],
  oapush: ['one_arm_push_up', 3],
  human_flag: ['human_flag', 99],
};

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function readProgress(skillId: string, data: Record<string, any>): SkillProgress {
  const total = SKILL_BY_ID[skillId].steps.length;
  const step = Math.max(0, Math.min(total, Math.round(num(data.step))));
  return {
    skillId,
    step,
    mastered: step >= total,
    passes: num(data.passes),
    misses: num(data.misses),
    best: num(data.best),
    sessions: num(data.sessions),
    startedAt: num(data.startedAt, Date.now()),
    lastPracticed: typeof data.lastPracticed === 'number' ? data.lastPracticed : undefined,
    masteredAt: typeof data.masteredAt === 'number' ? data.masteredAt : undefined,
    history: Array.isArray(data.history) ? data.history.slice(-30) : [],
  };
}

function readProfile(data: Record<string, any>): TutorProfile {
  const assessment: Assessment = { ...EMPTY_ASSESSMENT };
  for (const key of Object.keys(EMPTY_ASSESSMENT) as (keyof Assessment)[]) {
    assessment[key] = Math.max(0, num(data.assessment?.[key]));
  }
  return {
    level: Math.max(0, Math.min(4, Math.round(num(data.level)))) as SkillTier,
    assessment,
    assessedAt: num(data.assessedAt, Date.now()),
    daysPerWeek: Math.max(2, Math.min(6, Math.round(num(data.daysPerWeek, 3)))),
    activeSkills: Array.isArray(data.activeSkills)
      ? data.activeSkills.filter((id: unknown): id is string => typeof id === 'string' && !!SKILL_BY_ID[id]).slice(0, MAX_ACTIVE_SKILLS)
      : [],
  };
}

export interface SkillTutorState {
  profile: TutorProfile | null;
  progress: ProgressMap;
}

export async function loadSkillTutor(userId: string): Promise<SkillTutorState> {
  const snap = await getDocs(collection(db, `users/${userId}/skills`));
  let profile: TutorProfile | null = null;
  const progress: ProgressMap = {};
  const legacy: [string, number][] = [];

  snap.docs.forEach(d => {
    const data = d.data();
    if (d.id === TUTOR_DOC) {
      profile = readProfile(data);
    } else if (SKILL_BY_ID[d.id] && typeof data.step === 'number') {
      progress[d.id] = readProgress(d.id, data);
    } else if (data.mastered && LEGACY_SKILLS[d.id]) {
      legacy.push(LEGACY_SKILLS[d.id]);
    }
  });

  for (const [skillId, step] of legacy) {
    const current = progress[skillId];
    if (!current || current.step < step) progress[skillId] = newProgress(skillId, step);
  }

  return { profile, progress };
}

/** Ids of every mastered skill (used by the profile page). */
export const getUserSkills = async (userId: string): Promise<string[]> => {
  const { progress } = await loadSkillTutor(userId);
  return Object.values(progress).filter(p => p.mastered).map(p => p.skillId);
};

// Firestore rejects `undefined`; JSON round-trip drops those keys.
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export async function saveSkillTutor(userId: string, update: { profile?: TutorProfile; progress?: SkillProgress[] }): Promise<void> {
  const batch = writeBatch(db);
  if (update.profile) batch.set(doc(db, `users/${userId}/skills`, TUTOR_DOC), clean(update.profile));
  for (const p of update.progress ?? []) {
    batch.set(doc(db, `users/${userId}/skills`, p.skillId), clean(p));
  }
  await batch.commit();
}
