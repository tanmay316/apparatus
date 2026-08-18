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
  deleteField,
  writeBatch
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
}

function getCutoffDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function getByteSize(str: any) {
  if (typeof str === 'string') return str.length; // rough estimate for UTF-16, accurate for base64 (ascii)
  if (str) return JSON.stringify(str).length;
  return 0;
}

export async function calculateStorageUsage(options: StorageCleanupOptions): Promise<StorageUsageResult> {
  let imageBytes = 0;
  let gpsBytes = 0;
  let textBytes = 0;
  let scannedDocs = 0;
  
  const cutoff = getCutoffDate(options.olderThanDays);

  const scanCollection = async (collName: string, dateField: string = 'createdAt') => {
    try {
      let snap;
      if (options.olderThanDays > 0) {
        try {
          const q = query(collection(db, collName), where(dateField, '<', cutoff));
          snap = await getDocs(q);
        } catch {
          // If query fails (e.g. dateField is startedAt or missing index), fetch all and filter in memory
          snap = await getDocs(collection(db, collName));
        }
      } else {
        snap = await getDocs(collection(db, collName));
      }

      snap.forEach(doc => {
        const data = doc.data();
        
        // If in-memory filter needed
        if (options.olderThanDays > 0) {
          const rawDate = data[dateField] || data.createdAt || data.startedAt || data.date;
          if (rawDate) {
            const docMillis = typeof rawDate?.toMillis === 'function' 
              ? rawDate.toMillis() 
              : (rawDate?.seconds ? rawDate.seconds * 1000 : (rawDate instanceof Date ? rawDate.getTime() : new Date(rawDate).getTime()));
            if (docMillis && docMillis >= cutoff.getTime()) {
              return;
            }
          }
        }

        scannedDocs++;
        
        // Images
        if (options.types.images) {
          if (data.imageUrl && typeof data.imageUrl === 'string' && !data.imageUrl.includes('Image removed for security purposes')) {
            imageBytes += getByteSize(data.imageUrl);
          }
          if (Array.isArray(data.images)) {
            data.images.forEach((img: any) => {
              if (typeof img === 'string' && !img.includes('Image removed for security purposes')) {
                imageBytes += getByteSize(img);
              }
            });
          }
        }
        
        // GPS
        if (options.types.gps) {
          if (data.gpsPath) gpsBytes += getByteSize(data.gpsPath);
          if (data.routeCoordinates) gpsBytes += getByteSize(data.routeCoordinates);
          if (data.elevationData) gpsBytes += getByteSize(data.elevationData);
        }
        
        // Text
        if (options.types.text) {
          if (data.text) textBytes += getByteSize(data.text);
          if (data.content) textBytes += getByteSize(data.content);
          if (data.description) textBytes += getByteSize(data.description);
        }
      });
    } catch (err) {
      console.warn(`Could not scan collection ${collName}:`, err);
    }
  };

  if (options.collections.feed) await scanCollection('activities');
  if (options.collections.clan_posts) await scanCollection('community_posts');
  if (options.collections.clan_messages) await scanCollection('clan_messages');
  if (options.collections.workouts) {
    await scanCollection('workouts', 'startedAt');
    await scanCollection('cardioActivities', 'startedAt');
  }

  return {
    totalBytes: imageBytes + gpsBytes + textBytes,
    imageBytes,
    gpsBytes,
    textBytes,
    scannedDocs
  };
}

export async function cleanupDatabaseStorage(options: StorageCleanupOptions): Promise<number> {
  const cutoff = getCutoffDate(options.olderThanDays);
  let batch = writeBatch(db);
  let operationCount = 0;
  let totalProcessed = 0;

  const commitBatch = async () => {
    if (operationCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      operationCount = 0;
    }
  };

  const processCollection = async (collName: string, dateField: string = 'createdAt') => {
    try {
      let snap;
      if (options.olderThanDays > 0) {
        try {
          const q = query(collection(db, collName), where(dateField, '<', cutoff));
          snap = await getDocs(q);
        } catch {
          snap = await getDocs(collection(db, collName));
        }
      } else {
        snap = await getDocs(collection(db, collName));
      }
      
      for (const d of snap.docs) {
        const data = d.data();

        // In-memory date filter check
        if (options.olderThanDays > 0) {
          const rawDate = data[dateField] || data.createdAt || data.startedAt || data.date;
          if (rawDate) {
            const docMillis = typeof rawDate?.toMillis === 'function' 
              ? rawDate.toMillis() 
              : (rawDate?.seconds ? rawDate.seconds * 1000 : (rawDate instanceof Date ? rawDate.getTime() : new Date(rawDate).getTime()));
            if (docMillis && docMillis >= cutoff.getTime()) {
              continue;
            }
          }
        }

        let updates: any = {};
        let needsUpdate = false;
        
        if (options.types.images) {
          if (data.imageUrl && typeof data.imageUrl === 'string' && !data.imageUrl.includes('Image removed for security purposes')) {
            updates.imageUrl = '[Image removed for security purposes]';
            needsUpdate = true;
          }
          if (Array.isArray(data.images) && data.images.length > 0) {
            updates.images = data.images.map(() => '[Image removed for security purposes]');
            needsUpdate = true;
          }
        }
        
        if (options.types.gps) {
          if (data.gpsPath) { updates.gpsPath = deleteField(); needsUpdate = true; }
          if (data.routeCoordinates) { updates.routeCoordinates = deleteField(); needsUpdate = true; }
          if (data.elevationData) { updates.elevationData = deleteField(); needsUpdate = true; }
        }
        
        if (options.types.text) {
          if (data.text) { updates.text = '[Text removed for security purposes]'; needsUpdate = true; }
          if (data.content) { updates.content = '[Text removed for security purposes]'; needsUpdate = true; }
          if (data.description) { updates.description = '[Text removed for security purposes]'; needsUpdate = true; }
        }
        
        if (needsUpdate) {
          batch.update(d.ref, updates);
          operationCount++;
          totalProcessed++;
          
          if (operationCount >= 400) {
            await commitBatch();
          }
        }
      }
    } catch (err) {
      console.warn(`Could not process collection ${collName}:`, err);
    }
  };

  if (options.collections.feed) await processCollection('activities');
  if (options.collections.clan_posts) await processCollection('community_posts');
  if (options.collections.clan_messages) await processCollection('clan_messages');
  if (options.collections.workouts) {
    await processCollection('workouts', 'startedAt');
    await processCollection('cardioActivities', 'startedAt');
  }

  await commitBatch();
  return totalProcessed;
}
