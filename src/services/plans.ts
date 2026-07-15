import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Plan, PlanDay } from '@/types';

export async function getUserPlans(uid: string): Promise<Plan[]> {
  const q = query(
    collection(db, 'plans'),
    where('ownerId', '==', uid)
  );
  
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Plan))
    .filter(p => p.isArchived !== true)
    .sort((a, b) => {
      const valA = a.updatedAt?.seconds || 0;
      const valB = b.updatedAt?.seconds || 0;
      return valB - valA;
    });
}

/** Get a specific plan by ID */
export async function getPlan(planId: string): Promise<Plan | null> {
  const snap = await getDoc(doc(db, 'plans', planId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Plan;
}

/** Get the days for a specific plan */
export async function getPlanDays(planId: string): Promise<PlanDay[]> {
  const q = query(
    collection(db, `plans/${planId}/days`),
    orderBy('order', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PlanDay));
}

/** Create a new custom plan */
export async function createPlan(planData: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'plans'), {
    ...planData,
    isArchived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/** Update an existing plan's metadata */
export async function updatePlan(planId: string, data: Partial<Plan>): Promise<void> {
  await updateDoc(doc(db, 'plans', planId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/** Soft-delete a plan (archive) */
export async function archivePlan(planId: string): Promise<void> {
  await updateDoc(doc(db, 'plans', planId), {
    isArchived: true,
    updatedAt: serverTimestamp(),
  });
}

/** Permanently delete a plan and its day documents. Use only for user-owned plans. */
export async function deletePlan(planId: string): Promise<void> {
  const daysSnap = await getDocs(collection(db, `plans/${planId}/days`));
  const batch = writeBatch(db);
  daysSnap.docs.forEach(day => batch.delete(day.ref));
  batch.delete(doc(db, 'plans', planId));
  await batch.commit();
}

/** Persist a drag-and-drop reorder without rewriting the full day documents. */
export async function reorderPlanDays(planId: string, dayIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  dayIds.forEach((dayId, index) => {
    batch.update(doc(db, `plans/${planId}/days`, dayId), { order: index + 1, dayNumber: index + 1 });
  });
  batch.update(doc(db, 'plans', planId), { daysPerWeek: dayIds.length, updatedAt: serverTimestamp() });
  await batch.commit();
}

// ─── Plan Days ──────────────────────────────────────────────────

/** Add or update a day within a plan */
export async function savePlanDay(planId: string, day: PlanDay): Promise<string> {
  const dayRef = day.id 
    ? doc(db, `plans/${planId}/days`, day.id)
    : doc(collection(db, `plans/${planId}/days`));
    
  await setDoc(dayRef, day);
  
  // Touch the parent plan
  await updateDoc(doc(db, 'plans', planId), { updatedAt: serverTimestamp() });
  
  return dayRef.id;
}

/** Delete a day from a plan */
export async function deletePlanDay(planId: string, dayId: string): Promise<void> {
  await deleteDoc(doc(db, `plans/${planId}/days`, dayId));
  await updateDoc(doc(db, 'plans', planId), { updatedAt: serverTimestamp() });
}

// ─── Sample Plans ───────────────────────────────────────────────

/** Get all sample plans (for exploration) */
export async function getSamplePlans(): Promise<Plan[]> {
  const snap = await getDocs(collection(db, 'samplePlans'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Plan))
    .sort((a, b) => {
      const t1 = a.createdAt?.seconds || 0;
      const t2 = b.createdAt?.seconds || 0;
      return t2 - t1;
    });
}

/** 
 * Clone a sample plan (or another user's public plan) into the current user's account.
 * This deep-copies the plan document and all its subcollection day documents using a batched write.
 */
export async function clonePlan(
  sourcePlanId: string, 
  sourceCollection: 'plans' | 'samplePlans',
  targetUid: string, 
  targetUserName: string
): Promise<string> {
  // 1. Fetch source plan
  const planSnap = await getDoc(doc(db, sourceCollection, sourcePlanId));
  if (!planSnap.exists()) throw new Error('Source plan not found');
  const sourcePlan = planSnap.data() as Plan;
  
  // 2. Fetch source days
  const daysSnap = await getDocs(collection(db, `${sourceCollection}/${sourcePlanId}/days`));
  
  // 3. Setup batch
  const batch = writeBatch(db);
  
  // 4. Create new plan doc
  const newPlanRef = doc(collection(db, 'plans'));
  batch.set(newPlanRef, {
    ...sourcePlan,
    ownerId: targetUid,
    ownerName: targetUserName,
    type: 'custom',
    clonedFrom: sourcePlanId,
    usageCount: 0,
    isArchived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  // 5. Create new day docs
  for (const dayDoc of daysSnap.docs) {
    const newDayRef = doc(collection(db, `plans/${newPlanRef.id}/days`));
    batch.set(newDayRef, dayDoc.data());
  }
  
  // 6. If it was a sample plan, increment its usage count
  if (sourceCollection === 'samplePlans') {
    // Note: We'd normally use increment(), but we'll do it simply here
    batch.update(doc(db, 'samplePlans', sourcePlanId), { usageCount: increment(1) });
  }
  
  await batch.commit();
  return newPlanRef.id;
}
