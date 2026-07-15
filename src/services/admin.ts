import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface AdminReport {
  id?: string;
  reporterId: string;
  reportedUserId?: string;
  reportedWorkoutId?: string;
  reason: string;
  details?: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
}

export interface AdminOverview {
  users: number;
  workouts: number;
  activities: number;
  openReports: number;
  bannedUsers: number;
  activeUsers30d: number;
  workouts30d: number;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const since = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [users, workouts, activities, openReports, bannedUsers, activeUsers30d, workouts30d] = await Promise.all([
    getCountFromServer(collection(db, 'users')),
    getCountFromServer(collection(db, 'workouts')),
    getCountFromServer(collection(db, 'activities')),
    getCountFromServer(query(collection(db, 'reports'), where('status', 'in', ['open', 'reviewing']))),
    getCountFromServer(query(collection(db, 'bans'), where('active', '==', true))),
    getCountFromServer(query(collection(db, 'users'), where('updatedAt', '>=', since))),
    getCountFromServer(query(collection(db, 'workouts'), where('startedAt', '>=', since))),
  ]);
  return {
    users: users.data().count,
    workouts: workouts.data().count,
    activities: activities.data().count,
    openReports: openReports.data().count,
    bannedUsers: bannedUsers.data().count,
    activeUsers30d: activeUsers30d.data().count,
    workouts30d: workouts30d.data().count,
  };
}

export async function getAdminUsers() {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200)));
  return snap.docs.map(item => ({ uid: item.id, ...item.data() }));
}

export async function getAdminBans() {
  const snap = await getDocs(query(collection(db, 'bans'), where('active', '==', true), limit(500)));
  return snap.docs.map(item => ({ uid: item.id, ...item.data() }));
}

export async function getAdminReports(): Promise<AdminReport[]> {
  const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(200)));
  return snap.docs.map(item => ({ id: item.id, ...item.data() } as AdminReport));
}

export async function updateReportStatus(reportId: string, status: AdminReport['status'], adminUid: string) {
  await updateDoc(doc(db, 'reports', reportId), {
    status,
    resolvedBy: adminUid,
    resolvedAt: serverTimestamp(),
  });
}

export async function setUserBan(uid: string, adminUid: string, banned: boolean, reason = 'Policy violation') {
  const banRef = doc(db, 'bans', uid);
  if (banned) {
    await setDoc(banRef, {
      uid,
      active: true,
      reason,
      createdBy: adminUid,
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(banRef, {
      uid,
      active: false,
      reason: '',
      liftedBy: adminUid,
      liftedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export async function createReport(report: Omit<AdminReport, 'id' | 'createdAt' | 'status'>) {
  return addDoc(collection(db, 'reports'), {
    ...report,
    status: 'open',
    createdAt: serverTimestamp(),
  });
}
