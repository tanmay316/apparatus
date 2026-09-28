import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { isBanActive } from '@/lib/ban';
import { raiseAdminAlert } from '@/services/admin-alerts';
import type { Plan, UserProfile } from '@/types';

// ─── Types ──────────────────────────────────────────────────

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface AdminReport {
  id?: string;
  reporterId: string;
  reportedUserId?: string;
  reportedWorkoutId?: string;
  reason: string;
  details?: string;
  status: ReportStatus;
  createdAt: Timestamp;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface AdminBan {
  uid: string;
  active: boolean;
  reason?: string;
  createdBy?: string;
  createdAt?: Timestamp;
  expiresAt?: Timestamp | null;
  liftedBy?: string;
  liftedAt?: Timestamp;
}

export interface AdminOverview {
  users: number | null;
  newUsers7d: number | null;
  activeUsers30d: number | null;
  workouts: number | null;
  workouts30d: number | null;
  cardio: number | null;
  cardio30d: number | null;
  activities: number | null;
  clans: number | null;
  openReports: number | null;
  bannedUsers: number | null;
  pendingCommunities: number | null;
  pendingEvents: number | null;
  logs24h: number | null;
}

export type AdminUser = UserProfile & { uid: string };

export interface AuditEntry {
  id: string;
  adminUid: string;
  adminName?: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  details?: string;
  createdAt: Timestamp | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => Timestamp.fromMillis(Date.now() - days * DAY_MS);

// ─── Audit trail ────────────────────────────────────────────

/** Records a moderation action. Never throws: auditing must not block the action itself. */
export async function logAdminAction(action: string, targetType: string, targetId: string, extra: { label?: string; details?: string } = {}) {
  const admin = auth.currentUser;
  if (!admin) return;
  try {
    await addDoc(collection(db, 'adminAuditLog'), {
      adminUid: admin.uid,
      adminName: admin.displayName || admin.email || '',
      action,
      targetType,
      targetId,
      targetLabel: extra.label?.slice(0, 200) || '',
      details: extra.details?.slice(0, 1000) || '',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Could not write admin audit entry:', err);
  }
}

export async function getAdminAuditLog(max = 200): Promise<AuditEntry[]> {
  const snap = await getDocs(query(collection(db, 'adminAuditLog'), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditEntry));
}

// ─── Overview ───────────────────────────────────────────────

async function safeCount(q: Query<DocumentData>): Promise<number | null> {
  try {
    return (await getCountFromServer(q)).data().count;
  } catch (err) {
    console.warn('Admin count failed:', err);
    return null;
  }
}

/** One failing aggregate (missing index, rules) no longer blanks the whole dashboard. */
export async function getAdminOverview(): Promise<AdminOverview> {
  const since30 = daysAgo(30);
  const [users, newUsers7d, activeUsers30d, workouts, workouts30d, cardio, cardio30d, activities, clans, openReports, bannedUsers, pendingCommunities, pendingEvents, logs24h] = await Promise.all([
    safeCount(collection(db, 'users')),
    safeCount(query(collection(db, 'users'), where('createdAt', '>=', daysAgo(7)))),
    safeCount(query(collection(db, 'users'), where('updatedAt', '>=', since30))),
    safeCount(collection(db, 'workouts')),
    safeCount(query(collection(db, 'workouts'), where('startedAt', '>=', since30))),
    safeCount(collection(db, 'cardioActivities')),
    safeCount(query(collection(db, 'cardioActivities'), where('startedAt', '>=', since30))),
    safeCount(collection(db, 'activities')),
    safeCount(collection(db, 'clans_v2')),
    safeCount(query(collection(db, 'reports'), where('status', 'in', ['open', 'reviewing']))),
    safeCount(query(collection(db, 'bans'), where('active', '==', true))),
    safeCount(query(collection(db, 'communities'), where('isVerified', '==', false), where('status', '==', 'pending'))),
    safeCount(query(collection(db, 'events'), where('status', '==', 'pending'))),
    safeCount(query(collection(db, 'systemLogs'), where('createdAt', '>=', daysAgo(1)))),
  ]);
  return { users, newUsers7d, activeUsers30d, workouts, workouts30d, cardio, cardio30d, activities, clans, openReports, bannedUsers, pendingCommunities, pendingEvents, logs24h };
}

// ─── Users ──────────────────────────────────────────────────

export interface AdminUsersPage {
  users: AdminUser[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
}

export async function getAdminUsersPage(cursor: QueryDocumentSnapshot<DocumentData> | null, pageSize = 50): Promise<AdminUsersPage> {
  const col = collection(db, 'users');
  const q = cursor
    ? query(col, orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize))
    : query(col, orderBy('createdAt', 'desc'), limit(pageSize));
  const snap = await getDocs(q);
  return {
    users: snap.docs.map(d => ({ ...(d.data() as UserProfile), uid: d.id })),
    cursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
  };
}

/** Server-side lookup by uid, exact handle, or handle/name prefix — reaches beyond the loaded pages. */
export async function searchAdminUsers(term: string): Promise<AdminUser[]> {
  const raw = term.trim();
  if (!raw) return [];
  const lower = raw.replace(/^@/, '').toLowerCase();
  const found = new Map<string, AdminUser>();
  const add = (d: { id: string; data: () => DocumentData | undefined }) => {
    const data = d.data();
    if (data) found.set(d.id, { ...(data as UserProfile), uid: d.id });
  };

  const tasks: Promise<void>[] = [];
  if (/^[A-Za-z0-9]{20,40}$/.test(raw)) {
    tasks.push(getDoc(doc(db, 'users', raw)).then(s => { if (s.exists()) add(s); }).catch(() => {}));
  }
  const prefix = (field: string) => getDocs(query(
    collection(db, 'users'),
    where(field, '>=', lower),
    where(field, '<=', lower + '\uf8ff'),
    limit(20),
  )).then(s => s.docs.forEach(add)).catch(() => {});
  tasks.push(prefix('usernameLower'), prefix('displayNameLower'));
  await Promise.all(tasks);
  return [...found.values()];
}

export interface AdminUserDetail {
  ban: AdminBan | null;
  workouts: number | null;
  cardio: number | null;
  activities: number | null;
  reportsAgainst: number | null;
  reportsFiled: number | null;
}

export async function getAdminUserDetail(uid: string): Promise<AdminUserDetail> {
  const [banSnap, workouts, cardio, activities, reportsAgainst, reportsFiled] = await Promise.all([
    getDoc(doc(db, 'bans', uid)).catch(() => null),
    safeCount(query(collection(db, 'workouts'), where('userId', '==', uid))),
    safeCount(query(collection(db, 'cardioActivities'), where('userId', '==', uid))),
    safeCount(query(collection(db, 'activities'), where('userId', '==', uid))),
    safeCount(query(collection(db, 'reports'), where('reportedUserId', '==', uid))),
    safeCount(query(collection(db, 'reports'), where('reporterId', '==', uid))),
  ]);
  return {
    ban: banSnap?.exists() ? ({ uid, ...banSnap.data() } as AdminBan) : null,
    workouts, cardio, activities, reportsAgainst, reportsFiled,
  };
}

export async function getUsersByIds(uids: string[]): Promise<Record<string, AdminUser>> {
  const unique = [...new Set(uids.filter(Boolean))];
  const out: Record<string, AdminUser> = {};
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
    snap.docs.forEach(d => { out[d.id] = { ...(d.data() as UserProfile), uid: d.id }; });
  }
  return out;
}

// ─── Bans ───────────────────────────────────────────────────

export { isBanActive };

export async function getAdminBans(): Promise<AdminBan[]> {
  const snap = await getDocs(query(collection(db, 'bans'), where('active', '==', true), limit(500)));
  return snap.docs.map(item => ({ ...(item.data() as AdminBan), uid: item.id })).filter(b => isBanActive(b));
}

export interface BanOptions {
  reason: string;
  /** null = permanent */
  durationDays: number | null;
  label?: string;
}

export async function banUser(uid: string, { reason, durationDays, label }: BanOptions) {
  const admin = auth.currentUser;
  if (!admin) throw new Error('Not signed in');
  if (uid === admin.uid) throw new Error('You cannot ban your own account');
  const cleanReason = reason.trim().slice(0, 500) || 'Policy violation';
  await setDoc(doc(db, 'bans', uid), {
    uid,
    active: true,
    reason: cleanReason,
    createdBy: admin.uid,
    createdAt: serverTimestamp(),
    expiresAt: durationDays ? Timestamp.fromMillis(Date.now() + durationDays * DAY_MS) : null,
  });
  await logAdminAction('user.ban', 'user', uid, { label, details: `${durationDays ? `${durationDays}d` : 'permanent'} · ${cleanReason}` });
}

export async function liftBan(uid: string, label?: string) {
  const admin = auth.currentUser;
  if (!admin) throw new Error('Not signed in');
  await setDoc(doc(db, 'bans', uid), {
    uid,
    active: false,
    liftedBy: admin.uid,
    liftedAt: serverTimestamp(),
  }, { merge: true });
  await logAdminAction('user.unban', 'user', uid, { label });
}

// ─── Reports ────────────────────────────────────────────────

export async function getAdminReports(): Promise<AdminReport[]> {
  const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(200)));
  return snap.docs.map(item => ({ id: item.id, ...item.data() } as AdminReport));
}

export async function updateReportStatus(reportId: string, status: ReportStatus, note?: string) {
  const admin = auth.currentUser;
  if (!admin) throw new Error('Not signed in');
  const update: Record<string, unknown> = { status };
  if (status === 'reviewing') {
    update.reviewedBy = admin.uid;
    update.reviewedAt = serverTimestamp();
  } else if (status === 'resolved' || status === 'dismissed') {
    update.resolvedBy = admin.uid;
    update.resolvedAt = serverTimestamp();
    if (note?.trim()) update.resolutionNote = note.trim().slice(0, 1000);
  } else {
    update.resolvedBy = deleteField();
    update.resolvedAt = deleteField();
  }
  await updateDoc(doc(db, 'reports', reportId), update);
  await logAdminAction(`report.${status}`, 'report', reportId, { details: note });
}

export async function deleteReport(reportId: string) {
  await deleteDoc(doc(db, 'reports', reportId));
  await logAdminAction('report.delete', 'report', reportId);
}

export async function createReport(report: Omit<AdminReport, 'id' | 'createdAt' | 'status'>) {
  const ref = await addDoc(collection(db, 'reports'), {
    ...report,
    status: 'open',
    createdAt: serverTimestamp(),
  });
  const who = auth.currentUser?.displayName || 'A user';
  void raiseAdminAlert('report', ref.id, `New report: ${report.reason}`, `${who} filed a report${report.details ? ` — “${report.details.slice(0, 160)}”` : ''}`);
  return ref;
}

// ─── App update popup ───────────────────────────────────────

export interface UpdatePopupDoc {
  latestUpdateId: string;
  title: string;
  content: string;
  timestamp?: string;
  publishedBy?: string;
}

export const UPDATE_LIMITS = { id: 40, title: 120, content: 4000 };

export async function getUpdatePopup(): Promise<UpdatePopupDoc | null> {
  const snap = await getDoc(doc(db, 'admin_settings', 'updates'));
  return snap.exists() ? (snap.data() as UpdatePopupDoc) : null;
}

export async function publishUpdatePopup(input: { id: string; title: string; content: string }) {
  const id = input.id.trim();
  const title = input.title.trim();
  const content = input.content.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(id) || id.length > UPDATE_LIMITS.id) throw new Error('Update ID may only use letters, numbers, dots, dashes and underscores');
  if (!title || title.length > UPDATE_LIMITS.title) throw new Error(`Title is required (max ${UPDATE_LIMITS.title} characters)`);
  if (!content || content.length > UPDATE_LIMITS.content) throw new Error(`Content is required (max ${UPDATE_LIMITS.content} characters)`);
  await setDoc(doc(db, 'admin_settings', 'updates'), {
    latestUpdateId: id,
    title,
    content,
    timestamp: new Date().toISOString(),
    publishedBy: auth.currentUser?.uid || '',
  });
  await logAdminAction('announcement.publish', 'announcement', id, { label: title });
}

export async function retractUpdatePopup(currentId?: string) {
  await deleteDoc(doc(db, 'admin_settings', 'updates'));
  await logAdminAction('announcement.retract', 'announcement', currentId || 'updates');
}

// ─── Plans & catalog ────────────────────────────────────────

export async function getAdminPlans(max = 300): Promise<(Plan & { id: string })[]> {
  const snap = await getDocs(query(collection(db, 'plans'), limit(max)));
  return snap.docs
    .map(d => ({ ...(d.data() as Plan), id: d.id }))
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
}

export async function setPlanPublic(planId: string, isPublic: boolean, label?: string) {
  await updateDoc(doc(db, 'plans', planId), { isPublic, updatedAt: serverTimestamp() });
  await logAdminAction(isPublic ? 'plan.publish' : 'plan.unpublish', 'plan', planId, { label });
}

const samplePlanId = (title: string) => 'sample_' + title.toLowerCase().replace(/[^a-z0-9]/g, '_');

/** Idempotent: stable ids, overwrites the catalog and removes stale sample plans. Commits in <500-op chunks. */
export async function seedSamplePlans(): Promise<{ written: number; removed: number }> {
  const { SAMPLE_PLANS } = await import('@/data/sample-plans');
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
  const expected = new Set(SAMPLE_PLANS.map(p => samplePlanId(p.title)));
  let removed = 0;

  const existing = await getDocs(collection(db, 'samplePlans'));
  for (const stale of existing.docs.filter(d => !expected.has(d.id))) {
    const days = await getDocs(collection(db, `samplePlans/${stale.id}/days`));
    days.docs.forEach(day => ops.push(b => b.delete(day.ref)));
    ops.push(b => b.delete(stale.ref));
    removed++;
  }
  for (const plan of SAMPLE_PLANS) {
    const planId = samplePlanId(plan.title);
    const { days, ...planData } = plan;
    ops.push(b => b.set(doc(db, 'samplePlans', planId), { ...planData, type: 'sample' }));
    days?.forEach(day => ops.push(b => b.set(doc(db, `samplePlans/${planId}/days`, `day_${day.dayNumber}`), day)));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
  await logAdminAction('catalog.seed_sample_plans', 'database', 'samplePlans', { details: `${SAMPLE_PLANS.length} plans, ${removed} stale removed` });
  return { written: SAMPLE_PLANS.length, removed };
}

// ─── Storage cleanup ────────────────────────────────────────

export interface StorageCleanupOptions {
  types: { images: boolean; gps: boolean; text: boolean };
  collections: { feed: boolean; clan_posts: boolean; clan_messages: boolean; workouts: boolean };
  olderThanDays: number;
}

export interface StorageUsageResult {
  totalBytes: number;
  imageBytes: number;
  gpsBytes: number;
  textBytes: number;
  scannedDocs: number;
  affectedDocs: number;
  errors: string[];
}

interface CollectionTarget {
  name: string;
  dateField: string;
  imageFields: string[];
  gpsFields: string[];
  textFields: string[];
}

const LEGACY_IMAGE_PLACEHOLDER = 'Image removed for security purposes';
const TEXT_PLACEHOLDER = '[Removed by admin to free storage]';
const PAGE_SIZE = 300;

function targetsFor(options: StorageCleanupOptions): CollectionTarget[] {
  const out: CollectionTarget[] = [];
  if (options.collections.feed) out.push({ name: 'activities', dateField: 'createdAt', imageFields: [], gpsFields: ['details.route'], textFields: [] });
  if (options.collections.clan_posts) out.push({ name: 'community_posts', dateField: 'createdAt', imageFields: ['imageUrl', 'images'], gpsFields: [], textFields: ['text'] });
  if (options.collections.clan_messages) out.push({ name: 'clan_messages', dateField: 'createdAt', imageFields: ['imageUrl', 'images'], gpsFields: [], textFields: ['text'] });
  if (options.collections.workouts) {
    out.push({ name: 'workouts', dateField: 'startedAt', imageFields: [], gpsFields: [], textFields: ['notes'] });
    out.push({ name: 'cardioActivities', dateField: 'startedAt', imageFields: [], gpsFields: ['route'], textFields: ['notes'] });
  }
  return out;
}

const encoder = new TextEncoder();
function byteSize(value: unknown): number {
  if (value == null) return 0;
  return encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
}

function readPath(data: DocumentData, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), data);
}

/** Only inline (data:) images and legacy placeholders are removed; hosted URLs are tiny and kept. */
const isRemovableImage = (v: unknown) => typeof v === 'string' && (v.startsWith('data:') || v.includes(LEGACY_IMAGE_PLACEHOLDER));

interface DocPlan { bytes: { image: number; gps: number; text: number }; updates: Record<string, unknown> }

function planDoc(data: DocumentData, target: CollectionTarget, options: StorageCleanupOptions): DocPlan | null {
  const bytes = { image: 0, gps: 0, text: 0 };
  const updates: Record<string, unknown> = {};

  if (options.types.images) {
    for (const field of target.imageFields) {
      const value = data[field];
      if (Array.isArray(value)) {
        const removable = value.filter(isRemovableImage);
        if (removable.length) {
          bytes.image += removable.reduce((sum, v) => sum + byteSize(v), 0);
          updates[field] = value.filter(v => !isRemovableImage(v));
        }
      } else if (isRemovableImage(value)) {
        bytes.image += byteSize(value);
        updates[field] = null;
      }
    }
  }
  if (options.types.gps) {
    for (const field of target.gpsFields) {
      const value = readPath(data, field);
      if (Array.isArray(value) ? value.length > 0 : value != null) {
        bytes.gps += byteSize(value);
        updates[field] = deleteField();
      }
    }
  }
  if (options.types.text) {
    for (const field of target.textFields) {
      const value = data[field];
      if (typeof value === 'string' && value.length > 0 && value !== TEXT_PLACEHOLDER) {
        bytes.text += byteSize(value);
        updates[field] = TEXT_PLACEHOLDER;
      }
    }
  }
  return Object.keys(updates).length ? { bytes, updates } : null;
}

/** Streams a collection in pages so large collections don't load into memory at once. */
async function forEachPage(target: CollectionTarget, olderThanDays: number, onPage: (docs: QueryDocumentSnapshot<DocumentData>[]) => Promise<void>) {
  const col = collection(db, target.name);
  const cutoff = daysAgo(olderThanDays);
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  for (;;) {
    // Docs without a timestamp never match the range filter, so age-limited runs skip them.
    const constraints = olderThanDays > 0
      ? [where(target.dateField, '<', cutoff), orderBy(target.dateField)]
      : [orderBy(documentId())];
    const q: Query<DocumentData> = cursor
      ? query(col, ...constraints, startAfter(cursor), limit(PAGE_SIZE))
      : query(col, ...constraints, limit(PAGE_SIZE));
    const snap = await getDocs(q);
    if (snap.empty) return;
    await onPage(snap.docs);
    if (snap.docs.length < PAGE_SIZE) return;
    cursor = snap.docs[snap.docs.length - 1];
  }
}

export async function calculateStorageUsage(options: StorageCleanupOptions): Promise<StorageUsageResult> {
  const result: StorageUsageResult = { totalBytes: 0, imageBytes: 0, gpsBytes: 0, textBytes: 0, scannedDocs: 0, affectedDocs: 0, errors: [] };
  for (const target of targetsFor(options)) {
    try {
      await forEachPage(target, options.olderThanDays, async docs => {
        for (const d of docs) {
          result.scannedDocs++;
          const plan = planDoc(d.data(), target, options);
          if (!plan) continue;
          result.affectedDocs++;
          result.imageBytes += plan.bytes.image;
          result.gpsBytes += plan.bytes.gps;
          result.textBytes += plan.bytes.text;
        }
      });
    } catch (err: any) {
      result.errors.push(`${target.name}: ${err?.message || 'scan failed'}`);
    }
  }
  result.totalBytes = result.imageBytes + result.gpsBytes + result.textBytes;
  return result;
}

export async function cleanupDatabaseStorage(options: StorageCleanupOptions): Promise<{ processed: number; errors: string[] }> {
  let processed = 0;
  const errors: string[] = [];
  for (const target of targetsFor(options)) {
    try {
      await forEachPage(target, options.olderThanDays, async docs => {
        const batch = writeBatch(db);
        let ops = 0;
        for (const d of docs) {
          const plan = planDoc(d.data(), target, options);
          if (!plan) continue;
          batch.update(d.ref, plan.updates);
          ops++;
        }
        if (ops) {
          await batch.commit();
          processed += ops;
        }
      });
    } catch (err: any) {
      errors.push(`${target.name}: ${err?.message || 'cleanup failed'}`);
    }
  }
  const types = Object.entries(options.types).filter(([, on]) => on).map(([k]) => k).join(', ');
  await logAdminAction('storage.cleanup', 'database', targetsFor(options).map(t => t.name).join(','), {
    details: `${processed} docs · ${types} · older than ${options.olderThanDays || 'all'} days`,
  });
  return { processed, errors };
}
