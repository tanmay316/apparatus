import { collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp, increment, setDoc, writeBatch, Timestamp, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ClanV2, ClanMembership, ChallengeV2, ChallengeParticipant, SimpleEvent, EventParticipant, ChallengeMetric, ChallengeStatus, SimpleEventStatus, CommunityPost, EarnedCommunityBadge } from '@/types';
import { notify } from '@/services/social';

// ─── UTILS ────────────────────────────────────────────────────────
export function formatChallengeGoal(target?: number, unit?: string, metric?: string): string {
  const trimmedUnit = (unit || '').trim();
  const trimmedMetric = (metric || '').trim();
  
  if (metric === 'other' || !target || target === 1) {
    return trimmedUnit || trimmedMetric || (target ? `${target}` : '');
  }

  if (trimmedUnit.startsWith(`${target} `) || trimmedUnit === `${target}`) {
    return trimmedUnit;
  }

  return `${target} ${trimmedUnit}`.trim();
}

// ─── CLANS (V2) ──────────────────────────────────────────────────

export async function createClan(clan: Omit<ClanV2, 'id' | 'memberCount' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'clans_v2'), {
    ...clan,
    memberCount: 1,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  // Add creator as leader
  const memberId = `${docRef.id}_${clan.leaderId}`;
  await setDoc(doc(db, 'clan_memberships', memberId), {
    clanId: docRef.id,
    userId: clan.leaderId,
    userName: clan.leaderName,
    userPhoto: '', // Assuming not passed in create, or can be added to args
    role: 'leader',
    joinedAt: serverTimestamp(),
    status: 'active'
  });
  
  return docRef.id;
}

export async function deleteClan(clanId: string): Promise<void> {
  // We can just delete the clan doc. We could also delete memberships/posts/events/challenges
  // but to keep it simple, we just delete the main doc for now.
  await deleteDoc(doc(db, 'clans_v2', clanId));
}
export async function getClan(id: string): Promise<ClanV2 | null> {
  const snap = await getDoc(doc(db, 'clans_v2', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ClanV2;
}

export async function getPublicClans(limitCount = 20): Promise<ClanV2[]> {
  const q = query(
    collection(db, 'clans_v2'),
    where('visibility', '==', 'public'),
    where('status', '==', 'active'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClanV2));
}

export async function getUserClans(userId: string): Promise<ClanV2[]> {
  const q = query(collection(db, 'clan_memberships'), where('userId', '==', userId), where('status', '==', 'active'));
  const snap = await getDocs(q);
  const clanIds = snap.docs.map(d => d.data().clanId);
  
  if (clanIds.length === 0) return [];
  
  const clanPromises = clanIds.map(id => getDoc(doc(db, 'clans_v2', id)));
  const clanSnaps = await Promise.all(clanPromises);
  
  const results: ClanV2[] = [];
  clanSnaps.forEach(s => {
    if (s.exists()) {
      results.push({ id: s.id, ...s.data() } as ClanV2);
    }
  });
  
  return results;
}

export async function updateClan(id: string, data: Partial<ClanV2>): Promise<void> {
  await updateDoc(doc(db, 'clans_v2', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function disbandClan(id: string, reason?: string): Promise<void> {
  const batch = writeBatch(db);

  // 1. Delete all posts
  const postsSnap = await getDocs(query(collection(db, 'community_posts'), where('communityId', '==', id)));
  postsSnap.docs.forEach(d => batch.delete(d.ref));

  // 2. Delete all events
  const eventsSnap = await getDocs(query(collection(db, 'simple_events'), where('clanId', '==', id)));
  eventsSnap.docs.forEach(d => batch.delete(d.ref));

  // 3. Delete all challenges
  const challengesSnap = await getDocs(query(collection(db, 'challenges_v2'), where('clanId', '==', id)));
  challengesSnap.docs.forEach(d => batch.delete(d.ref));

  // 4. Delete all memberships
  const membershipsSnap = await getDocs(query(collection(db, 'clan_memberships'), where('clanId', '==', id)));
  membershipsSnap.docs.forEach(d => batch.delete(d.ref));

  // 5. Delete clan
  batch.delete(doc(db, 'clans_v2', id));

  await batch.commit();
}

export async function joinClan(userId: string, userName: string, userPhoto: string, clanId: string): Promise<void> {
  const memberId = `${clanId}_${userId}`;
  await setDoc(doc(db, 'clan_memberships', memberId), {
    clanId,
    userId,
    userName,
    userPhoto,
    role: 'member',
    joinedAt: serverTimestamp(),
    status: 'active'
  });
  await updateDoc(doc(db, 'clans_v2', clanId), {
    memberCount: increment(1)
  });
}

export async function leaveClan(userId: string, clanId: string): Promise<void> {
  const memberId = `${clanId}_${userId}`;
  await updateDoc(doc(db, 'clan_memberships', memberId), {
    status: 'left'
  });
  await updateDoc(doc(db, 'clans_v2', clanId), {
    memberCount: increment(-1)
  });
}

export async function getClanMembers(clanId: string): Promise<ClanMembership[]> {
  const q = query(collection(db, 'clan_memberships'), where('clanId', '==', clanId), where('status', '==', 'active'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClanMembership));
}

export async function updateClanMemberRole(clanId: string, userId: string, newRole: 'leader' | 'co_leader' | 'member'): Promise<void> {
  const memberId = `${clanId}_${userId}`;
  await updateDoc(doc(db, 'clan_memberships', memberId), {
    role: newRole
  });
}

export async function transferLeadership(clanId: string, currentLeaderId: string, newLeaderId: string, newLeaderName: string): Promise<void> {
  const batch = writeBatch(db);
  
  // Demote current leader if exists
  if (currentLeaderId && currentLeaderId !== newLeaderId) {
    const currentLeaderRef = doc(db, 'clan_memberships', `${clanId}_${currentLeaderId}`);
    try {
      const snap = await getDoc(currentLeaderRef);
      if (snap.exists()) {
        batch.update(currentLeaderRef, { role: 'co_leader' });
      }
    } catch { /* ignore */ }
  }
  
  // Promote new leader
  batch.update(doc(db, 'clan_memberships', `${clanId}_${newLeaderId}`), { role: 'leader' });
  
  // Update clan doc
  batch.update(doc(db, 'clans_v2', clanId), { leaderId: newLeaderId, leaderName: newLeaderName, updatedAt: serverTimestamp() });
  
  await batch.commit();
}

// ─── CHALLENGES (V2) ─────────────────────────────────────────────

export async function createChallenge(challenge: Omit<ChallengeV2, 'id' | 'participantCount' | 'createdAt'> & { status?: ChallengeStatus }): Promise<string> {
  const docRef = await addDoc(collection(db, 'challenges_v2'), {
    ...challenge,
    status: challenge.status || 'active',
    participantCount: 1,
    createdAt: serverTimestamp(),
  });
  
  // Add creator as participant
  const partId = `${docRef.id}_${challenge.createdBy}`;
  await setDoc(doc(db, 'challenge_participants', partId), {
    challengeId: docRef.id,
    userId: challenge.createdBy,
    userName: challenge.creatorName,
    userPhoto: challenge.creatorPhoto,
    progress: 0,
    rank: 1,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return docRef.id;
}

export async function getPublicChallenges(limitCount = 20): Promise<ChallengeV2[]> {
  const q = query(
    collection(db, 'challenges_v2'),
    where('visibility', '==', 'public'),
    where('status', 'in', ['upcoming', 'active']),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2));
}

export async function getAllCommunityChallenges(limitCount = 50): Promise<ChallengeV2[]> {
  const q = query(
    collection(db, 'challenges_v2'),
    where('status', 'in', ['upcoming', 'active', 'completed']),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  const challenges = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2));
  // Sort with upcoming/active first, then by startDate
  return challenges.sort((a, b) => {
    const aTime = a.startDate?.toMillis ? a.startDate.toMillis() : 0;
    const bTime = b.startDate?.toMillis ? b.startDate.toMillis() : 0;
    return bTime - aTime;
  });
}

export async function getClanChallenges(clanId: string): Promise<ChallengeV2[]> {
  const q = query(
    collection(db, 'challenges_v2'),
    where('clanId', '==', clanId),
    where('status', 'in', ['upcoming', 'active', 'completed'])
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2));
}

export async function updateChallenge(id: string, data: Partial<ChallengeV2>): Promise<void> {
  await updateDoc(doc(db, 'challenges_v2', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteChallenge(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'challenges_v2', id));
  
  const participantsSnap = await getDocs(query(collection(db, 'challenge_participants'), where('challengeId', '==', id)));
  participantsSnap.docs.forEach(d => batch.delete(d.ref));
  
  await batch.commit();
}

export async function updateChallengeParticipantScore(challengeId: string, userId: string, newProgress: number): Promise<void> {
  const partId = `${challengeId}_${userId}`;
  await updateDoc(doc(db, 'challenge_participants', partId), {
    progress: newProgress,
    updatedAt: serverTimestamp()
  });
  
  // Re-fetch and re-rank leaderboard
  const participantsSnap = await getDocs(
    query(
      collection(db, 'challenge_participants'),
      where('challengeId', '==', challengeId),
      orderBy('progress', 'desc')
    )
  );
  
  const batch = writeBatch(db);
  participantsSnap.docs.forEach((d, idx) => {
    batch.update(d.ref, { rank: idx + 1 });
  });
  await batch.commit();
}

export async function awardChallengeTop3Badges(challengeId: string): Promise<{ success: boolean; message: string }> {
  const challengeSnap = await getDoc(doc(db, 'challenges_v2', challengeId));
  if (!challengeSnap.exists()) throw new Error('Challenge not found');
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as ChallengeV2;

  const leaderboardSnap = await getDocs(
    query(
      collection(db, 'challenge_participants'),
      where('challengeId', '==', challengeId),
      orderBy('progress', 'desc'),
      limit(3)
    )
  );

  if (leaderboardSnap.empty) {
    throw new Error('No participants on the leaderboard to award badges');
  }

  const batch = writeBatch(db);
  const now = Timestamp.now();

  const rankTitles = {
    1: { name: 'Gold Champion', style: 'gold' as const, emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver' as const, emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze' as const, emoji: '🥉' },
  };

  for (let i = 0; i < leaderboardSnap.docs.length; i++) {
    const pDoc = leaderboardSnap.docs[i];
    const pData = pDoc.data() as ChallengeParticipant;
    const rank = (i + 1) as 1 | 2 | 3;
    const info = rankTitles[rank];

    const badgeData = {
      id: `${challengeId}_rank_${rank}`,
      title: `${challenge.title}`,
      subtitle: `${info.emoji} ${info.name} (Rank #${rank})`,
      description: challenge.description || `Finished #${rank} with ${pData.progress} ${challenge.unit} in "${challenge.title}"`,
      rank,
      sourceType: 'challenge' as const,
      sourceId: challengeId,
      sourceTitle: challenge.title,
      clanId: challenge.clanId || '',
      clanName: challenge.clanName || '',
      awardedAt: now,
      badgeStyle: info.style
    };

    // Update participant doc
    batch.update(pDoc.ref, { badgeAwarded: rank, rank });

    // Add badge to user doc
    const userRef = doc(db, 'users', pData.userId);
    try {
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existingBadges = userSnap.data().communityBadges || [];
        const filtered = existingBadges.filter((b: any) => b.id !== badgeData.id);
        batch.set(userRef, { 
          communityBadges: [...filtered, badgeData],
          unseenMedalAward: badgeData 
        }, { merge: true });
      }
    } catch { /* ignore user fetch err */ }

    // Create in-app bell notification
    const noteRef = doc(collection(db, 'notifications'));
    batch.set(noteRef, {
      receiverId: pData.userId,
      senderId: challenge.createdBy,
      senderName: challenge.creatorName,
      senderPhoto: challenge.creatorPhoto || '',
      type: 'achievement',
      message: `${info.emoji} Congratulations! You earned the ${info.name} Badge for "${challenge.title}"!`,
      targetId: challengeId,
      read: false,
      createdAt: now
    });
  }

  // Create Celebration Feed Posts for the Winners
  for (let i = 0; i < leaderboardSnap.docs.length; i++) {
    const pData = leaderboardSnap.docs[i].data() as ChallengeParticipant;
    const rank = (i + 1) as 1 | 2 | 3;
    const info = rankTitles[rank];

    if (challenge.clanId) {
      const postRef = doc(collection(db, 'community_posts'));
      batch.set(postRef, {
        communityId: challenge.clanId,
        authorId: pData.userId,
        authorName: pData.userName,
        authorPhoto: pData.userPhoto || '',
        title: `🏆 Challenge Winner!`,
        text: `Congratulations to ${pData.userName} for placing #${rank} and winning the ${info.name} badge in "${challenge.title}"!`,
        likesCount: 0,
        commentsCount: 0,
        likedUserIds: [],
        createdAt: now
      });
    } else {
      const activityRef = doc(collection(db, 'activities'));
      batch.set(activityRef, {
        userId: pData.userId,
        userName: pData.userName,
        userPhoto: pData.userPhoto || '',
        type: 'achievement',
        workoutId: null,
        summary: `Won ${info.name} in ${challenge.title}`,
        details: {
          challengeId,
          challengeTitle: challenge.title,
          clanId: '',
          rank,
          badgeName: info.name,
          badgeEmoji: info.emoji
        },
        visibility: 'public',
        likesCount: 0,
        commentsCount: 0,
        createdAt: now
      });
    }
  }

  // Mark challenge as badges awarded and completed
  batch.update(doc(db, 'challenges_v2', challengeId), {
    badgesAwarded: true,
    status: 'completed',
    updatedAt: now
  });

  await batch.commit();
  return { success: true, message: 'Top 3 badges awarded successfully!' };
}

export async function getUserChallenges(userId: string): Promise<ChallengeV2[]> {
  const q = query(collection(db, 'challenge_participants'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const challengeIds = snap.docs.map(d => d.data().challengeId);
  
  if (challengeIds.length === 0) return [];
  
  const results: ChallengeV2[] = [];
  for (let i = 0; i < challengeIds.length; i += 10) {
    const chunk = challengeIds.slice(i, i + 10);
    const cq = query(collection(db, 'challenges_v2'), where(documentId(), 'in', chunk));
    const cs = await getDocs(cq);
    results.push(...cs.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2)));
  }
  return results;
}

export async function joinChallenge(challengeId: string, userId: string, userName: string, userPhoto: string): Promise<void> {
  const partId = `${challengeId}_${userId}`;
  await setDoc(doc(db, 'challenge_participants', partId), {
    challengeId,
    userId,
    userName,
    userPhoto: userPhoto || '',
    progress: 0,
    rank: 0,
    isRanked: false,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  const q = query(collection(db, 'challenge_participants'), where('challengeId', '==', challengeId));
  const snap = await getDocs(q);
  await updateDoc(doc(db, 'challenges_v2', challengeId), {
    participantCount: snap.size
  });
}

export async function leaveChallenge(challengeId: string, userId: string): Promise<void> {
  const partId = `${challengeId}_${userId}`;
  await deleteDoc(doc(db, 'challenge_participants', partId));

  const q = query(collection(db, 'challenge_participants'), where('challengeId', '==', challengeId));
  const snap = await getDocs(q);
  await updateDoc(doc(db, 'challenges_v2', challengeId), {
    participantCount: snap.size
  });
}

export async function isUserClanMember(clanId: string, userId: string): Promise<boolean> {
  try {
    const membershipSnap = await getDoc(doc(db, 'clan_memberships', `${clanId}_${userId}`));
    if (membershipSnap.exists() && membershipSnap.data().status !== 'left') return true;
    const clanSnap = await getDoc(doc(db, 'clans_v2', clanId));
    if (clanSnap.exists() && clanSnap.data().leaderId === userId) return true;
    return false;
  } catch {
    return false;
  }
}

export async function isUserJoinedChallenge(challengeId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'challenge_participants', `${challengeId}_${userId}`));
  return snap.exists();
}

export async function isUserJoinedEvent(eventId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'simple_event_participants', `${eventId}_${userId}`));
  return snap.exists();
}

export async function getChallengeParticipants(challengeId: string): Promise<ChallengeParticipant[]> {
  const q = query(
    collection(db, 'challenge_participants'),
    where('challengeId', '==', challengeId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeParticipant));
}

export async function getChallengeLeaderboard(challengeId: string): Promise<ChallengeParticipant[]> {
  const q = query(
    collection(db, 'challenge_participants'),
    where('challengeId', '==', challengeId)
  );
  const snap = await getDocs(q);
  
  const list = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as ChallengeParticipant))
    .filter(p => p.isRanked === true && typeof p.rank === 'number' && p.rank > 0 && p.rank < 9999);

  // Sort strictly by published rank
  list.sort((a, b) => (a.rank || 999) - (b.rank || 999));

  // Auto-sync topWinner to challenge if missing
  if (list.length > 0 && list[0].rank === 1) {
    getDoc(doc(db, 'challenges_v2', challengeId)).then((cSnap) => {
      if (cSnap.exists()) {
        const cData = cSnap.data();
        if (!cData.topWinner || cData.topWinner.userId !== list[0].userId) {
          updateDoc(doc(db, 'challenges_v2', challengeId), {
            topWinner: {
              userId: list[0].userId,
              userName: list[0].userName || 'Champion',
              userPhoto: list[0].userPhoto || '',
              customResult: list[0].customResult || '',
              rank: 1
            }
          }).catch(() => {});
        }
      }
    }).catch(() => {});
  }

  return list;
}

export async function updateLeaderboardRanks(
  challengeId: string,
  updatedRanks: { id?: string; userId: string; rank: number; progress?: number; customResult?: string; badgeAwarded?: 1 | 2 | 3 }[]
): Promise<void> {
  const challengeSnap = await getDoc(doc(db, 'challenges_v2', challengeId));
  const challengeData = challengeSnap.exists() ? (challengeSnap.data() as ChallengeV2) : null;
  const challengeTitle = challengeData?.title || 'Community Challenge';

  const now = Timestamp.now();

  const rankTitles = {
    1: { name: 'Gold Champion', style: 'gold' as const, emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver' as const, emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze' as const, emoji: '🥉' },
  };

  // ── STEP 1: Update participant ranks in a dedicated batch (CRITICAL) ──
  const rankBatch = writeBatch(db);
  let topWinner: { userId: string; userName: string; userPhoto: string; customResult: string; rank: number } | null = null;

  for (const item of updatedRanks) {
    const partRef = doc(db, 'challenge_participants', item.id || `${challengeId}_${item.userId}`);
    const badgeAward = item.badgeAwarded !== undefined ? item.badgeAwarded : (item.rank <= 3 && item.rank >= 1 ? (item.rank as 1 | 2 | 3) : undefined);

    rankBatch.set(partRef, {
      rank: item.rank,
      progress: item.progress ?? 0,
      customResult: item.customResult || '',
      isRanked: true,
      badgeAwarded: badgeAward || null,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  // Commit rank updates first – this is the most important write
  await rankBatch.commit();
  console.log('[updateLeaderboardRanks] Rank batch committed successfully for', challengeId);

  // ── STEP 2: Update user badges & topWinner individually (non-critical) ──
  for (const item of updatedRanks) {
    const badgeAward = item.badgeAwarded !== undefined ? item.badgeAwarded : (item.rank <= 3 && item.rank >= 1 ? (item.rank as 1 | 2 | 3) : undefined);
    const userRef = doc(db, 'users', item.userId);

    try {
      const userSnap = await getDoc(userRef);
      const uData = userSnap.exists() ? userSnap.data() : {};
      const existingBadges = uData.communityBadges || [];
      // Completely remove any existing badges for this specific challenge
      const filtered = existingBadges.filter((b: any) => b.sourceId !== challengeId && !b.id.startsWith(challengeId) && !b.id.startsWith(`challenge_${challengeId}`));

      if (badgeAward && rankTitles[badgeAward]) {
        const info = rankTitles[badgeAward];
        const badgeData: EarnedCommunityBadge = {
          id: `${challengeId}_rank_${badgeAward}`,
          title: challengeTitle,
          subtitle: `${info.emoji} ${info.name} (Rank #${item.rank})`,
          description: item.customResult || `Finished #${item.rank} with ${item.progress || 0} in "${challengeTitle}"`,
          rank: badgeAward,
          sourceType: 'challenge',
          sourceId: challengeId,
          sourceTitle: challengeTitle,
          clanId: challengeData?.clanId || '',
          clanName: challengeData?.clanName || '',
          awardedAt: now,
          badgeStyle: info.style
        };

        await setDoc(userRef, {
          communityBadges: [...filtered, badgeData],
          unseenMedalAward: badgeData
        }, { merge: true });
        console.log('[updateLeaderboardRanks] Badge updated for user', item.userId, 'rank', badgeAward);

        if (item.rank === 1 && !topWinner) {
          topWinner = {
            userId: item.userId,
            userName: uData.displayName || 'Champion',
            userPhoto: uData.photoURL || '',
            customResult: item.customResult || '',
            rank: 1
          };
        }

        // Notify the winner (fire-and-forget)
        addDoc(collection(db, 'notifications'), {
          receiverId: item.userId,
          senderId: challengeData?.createdBy || item.userId,
          senderName: challengeData?.creatorName || 'Apparatus Arena',
          senderPhoto: challengeData?.creatorPhoto || '',
          type: 'achievement',
          message: `${info.emoji} Congratulations! You won the ${info.name} Medal in "${challengeTitle}"!`,
          targetId: challengeId,
          read: false,
          createdAt: now
        }).catch(() => {});

      } else {
        // If medal was removed or user is rank > 3, update badges without the stale challenge badge
        if (filtered.length !== existingBadges.length) {
          await setDoc(userRef, {
            communityBadges: filtered
          }, { merge: true });
        }
      }
    } catch (err) {
      console.error('[updateLeaderboardRanks] Failed to update badge for user', item.userId, err);
    }
  }

  // ── STEP 3: Update topWinner on the challenge doc ──
  if (topWinner) {
    await setDoc(doc(db, 'challenges_v2', challengeId), {
      topWinner: topWinner
    }, { merge: true }).catch(() => {});
  }
}

export async function updateEventLeaderboardRanks(
  eventId: string,
  updatedRanks: { id?: string; userId: string; rank: number; customResult?: string; badgeAwarded?: 1 | 2 | 3 }[]
): Promise<void> {
  const eventSnap = await getDoc(doc(db, 'simple_events', eventId));
  const eventData = eventSnap.exists() ? (eventSnap.data() as SimpleEvent) : null;
  const eventTitle = eventData?.title || 'Community Event';

  const now = Timestamp.now();

  const rankTitles = {
    1: { name: 'Gold Champion', style: 'gold' as const, emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver' as const, emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze' as const, emoji: '🥉' },
  };

  // ── STEP 1: Update participant ranks in a dedicated batch (CRITICAL) ──
  const rankBatch = writeBatch(db);
  let topWinner: { userId: string; userName: string; userPhoto: string; customResult: string; rank: number } | null = null;

  for (const item of updatedRanks) {
    const partRef = doc(db, 'simple_event_participants', item.id || `${eventId}_${item.userId}`);
    const badgeAward = item.badgeAwarded !== undefined ? item.badgeAwarded : (item.rank <= 3 && item.rank >= 1 ? (item.rank as 1 | 2 | 3) : undefined);

    rankBatch.set(partRef, {
      rank: item.rank,
      customResult: item.customResult || '',
      isRanked: true,
      badgeAwarded: badgeAward || null,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  // Commit rank updates first – this is the most important write
  await rankBatch.commit();
  console.log('[updateEventLeaderboardRanks] Rank batch committed successfully for', eventId);

  // ── STEP 2: Update user badges & topWinner individually (non-critical) ──
  for (const item of updatedRanks) {
    const badgeAward = item.badgeAwarded !== undefined ? item.badgeAwarded : (item.rank <= 3 && item.rank >= 1 ? (item.rank as 1 | 2 | 3) : undefined);
    const userRef = doc(db, 'users', item.userId);

    try {
      const userSnap = await getDoc(userRef);
      const uData = userSnap.exists() ? userSnap.data() : {};
      const existingBadges = uData.communityBadges || [];
      // Completely remove any existing badges for this specific event
      const filtered = existingBadges.filter((b: any) => b.sourceId !== eventId && !b.id.startsWith(eventId) && !b.id.startsWith(`event_${eventId}`));

      if (badgeAward && rankTitles[badgeAward]) {
        const info = rankTitles[badgeAward];
        const badgeData: EarnedCommunityBadge = {
          id: `${eventId}_rank_${badgeAward}`,
          title: eventTitle,
          subtitle: `${info.emoji} ${info.name} (Rank #${item.rank})`,
          description: item.customResult || `Finished #${item.rank} in "${eventTitle}"`,
          rank: badgeAward,
          sourceType: 'event',
          sourceId: eventId,
          sourceTitle: eventTitle,
          clanId: eventData?.clanId || '',
          clanName: eventData?.clanName || '',
          awardedAt: now,
          badgeStyle: info.style
        };

        await setDoc(userRef, {
          communityBadges: [...filtered, badgeData],
          unseenMedalAward: badgeData
        }, { merge: true });
        console.log('[updateEventLeaderboardRanks] Badge updated for user', item.userId, 'rank', badgeAward);

        if (item.rank === 1 && !topWinner) {
          topWinner = {
            userId: item.userId,
            userName: uData.displayName || 'Champion',
            userPhoto: uData.photoURL || '',
            customResult: item.customResult || '',
            rank: 1
          };
        }

        // Notify winner (fire-and-forget)
        addDoc(collection(db, 'notifications'), {
          receiverId: item.userId,
          senderId: eventData?.createdBy || item.userId,
          senderName: eventData?.creatorName || 'Apparatus Arena',
          senderPhoto: '',
          type: 'achievement',
          message: `${info.emoji} Congratulations! You won the ${info.name} Medal in "${eventTitle}"!`,
          targetId: eventId,
          read: false,
          createdAt: now
        }).catch(() => {});

      } else {
        // If medal was removed or user is rank > 3, update badges without the stale event badge
        if (filtered.length !== existingBadges.length) {
          await setDoc(userRef, {
            communityBadges: filtered
          }, { merge: true });
        }
      }
    } catch (err) {
      console.error('[updateEventLeaderboardRanks] Failed to update badge for user', item.userId, err);
    }
  }

  // ── STEP 3: Update topWinner on the event doc ──
  if (topWinner) {
    await setDoc(doc(db, 'simple_events', eventId), {
      topWinner: topWinner
    }, { merge: true }).catch(() => {});
  }
}

export async function updateUserChallengeProgress(userId: string, updates: { metric: ChallengeMetric, amount: number }[]): Promise<void> {
  // Fetch all active challenges for the user
  const userChallenges = await getUserChallenges(userId);
  if (!userChallenges.length) return;

  const activeChallenges = userChallenges.filter(c => c.status === 'active');
  if (!activeChallenges.length) return;

  const batch = writeBatch(db);
  
  for (const update of updates) {
    const matchingChallenges = activeChallenges.filter(c => c.metric === update.metric);
    for (const challenge of matchingChallenges) {
      if (!challenge.id) continue;
      const partId = `${challenge.id}_${userId}`;
      const partRef = doc(db, 'challenge_participants', partId);
      batch.update(partRef, {
        progress: increment(update.amount),
        updatedAt: serverTimestamp()
      });
    }
  }

  await batch.commit();
}

// ─── EVENTS (V2) ─────────────────────────────────────────────────

export async function createSimpleEvent(event: Omit<SimpleEvent, 'id' | 'participantCount' | 'createdAt'> & { status?: SimpleEventStatus }): Promise<string> {
  const docRef = await addDoc(collection(db, 'simple_events'), {
    ...event,
    status: event.status || 'upcoming',
    participantCount: 1,
    createdAt: serverTimestamp(),
  });
  
  const partId = `${docRef.id}_${event.createdBy}`;
  await setDoc(doc(db, 'simple_event_participants', partId), {
    eventId: docRef.id,
    userId: event.createdBy,
    userName: event.creatorName,
    userPhoto: event.creatorPhoto,
    joinedAt: serverTimestamp()
  });
  
  return docRef.id;
}

export async function getPublicEvents(limitCount = 20): Promise<SimpleEvent[]> {
  const q = query(
    collection(db, 'simple_events'),
    where('visibility', '==', 'public'),
    where('status', 'in', ['upcoming', 'ongoing']),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent));
}

export async function getAllCommunityEvents(limitCount = 50): Promise<SimpleEvent[]> {
  const q = query(
    collection(db, 'simple_events'),
    where('status', 'in', ['upcoming', 'ongoing', 'active', 'completed']),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  const events = snap.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent));
  return events.sort((a, b) => {
    const aTime = a.startTime?.toMillis ? a.startTime.toMillis() : 0;
    const bTime = b.startTime?.toMillis ? b.startTime.toMillis() : 0;
    return bTime - aTime;
  });
}

export async function getClanEvents(clanId: string): Promise<SimpleEvent[]> {
  const q = query(
    collection(db, 'simple_events'),
    where('clanId', '==', clanId),
    where('status', 'in', ['upcoming', 'ongoing', 'completed'])
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent));
}

export async function getEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const q = query(
    collection(db, 'simple_event_participants'),
    where('eventId', '==', eventId),
    orderBy('joinedAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as EventParticipant));
}

export async function getUserEvents(userId: string): Promise<SimpleEvent[]> {
  const q = query(collection(db, 'simple_event_participants'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const eventIds = snap.docs.map(d => d.data().eventId);
  if (eventIds.length === 0) return [];

  const results: SimpleEvent[] = [];
  for (let i = 0; i < eventIds.length; i += 10) {
    const chunk = eventIds.slice(i, i + 10);
    const eq = query(collection(db, 'simple_events'), where(documentId(), 'in', chunk));
    const es = await getDocs(eq);
    results.push(...es.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent)));
  }
  return results;
}

export async function awardEventTop3Badges(
  eventId: string,
  topWinners: { userId: string; userName: string; userPhoto?: string; rank: 1 | 2 | 3 }[]
): Promise<{ success: boolean; message: string }> {
  const eventSnap = await getDoc(doc(db, 'simple_events', eventId));
  if (!eventSnap.exists()) throw new Error('Event not found');
  const event = { id: eventSnap.id, ...eventSnap.data() } as SimpleEvent;

  const batch = writeBatch(db);
  const now = Timestamp.now();

  const rankTitles = {
    1: { name: 'Gold Champion', style: 'gold' as const, emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver' as const, emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze' as const, emoji: '🥉' },
  };

  for (const winner of topWinners) {
    const info = rankTitles[winner.rank];
    const badgeData = {
      id: `${eventId}_rank_${winner.rank}`,
      title: `${event.title}`,
      subtitle: `${info.emoji} ${info.name} (Rank #${winner.rank})`,
      description: event.description || `Awarded for Rank #${winner.rank} in "${event.title}"`,
      rank: winner.rank,
      sourceType: 'event' as const,
      sourceId: eventId,
      sourceTitle: event.title,
      clanId: event.clanId || '',
      clanName: event.clanName || '',
      awardedAt: now,
      badgeStyle: info.style
    };

    // Update participant doc if exists
    const partRef = doc(db, 'simple_event_participants', `${eventId}_${winner.userId}`);
    try {
      const pSnap = await getDoc(partRef);
      if (pSnap.exists()) {
        batch.update(partRef, { badgeAwarded: winner.rank });
      }
    } catch { /* ignore */ }

    // Update user profile
    const userRef = doc(db, 'users', winner.userId);
    try {
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existingBadges = userSnap.data().communityBadges || [];
        const filtered = existingBadges.filter((b: any) => b.id !== badgeData.id);
        batch.set(userRef, { 
          communityBadges: [...filtered, badgeData],
          unseenMedalAward: badgeData 
        }, { merge: true });
      }
    } catch { /* ignore */ }

    // In-app notification
    const noteRef = doc(collection(db, 'notifications'));
    batch.set(noteRef, {
      receiverId: winner.userId,
      senderId: event.createdBy,
      senderName: event.creatorName,
      senderPhoto: event.creatorPhoto || '',
      type: 'achievement',
      message: `${info.emoji} Congratulations! You earned the ${info.name} Badge for "${event.title}"!`,
      targetId: eventId,
      read: false,
      createdAt: now
    });

    // Create a feed record
    if (event.clanId) {
      const postRef = doc(collection(db, 'community_posts'));
      batch.set(postRef, {
        communityId: event.clanId,
        authorId: winner.userId,
        authorName: winner.userName,
        authorPhoto: winner.userPhoto || '',
        title: `🏆 ${info.name} Winner!`,
        text: `Congratulations to ${winner.userName} for placing #${winner.rank} and winning the ${info.name} badge in "${event.title}"!`,
        likesCount: 0,
        commentsCount: 0,
        likedUserIds: [],
        createdAt: now
      });
    } else {
      const activityRef = doc(collection(db, 'activities'));
      batch.set(activityRef, {
        userId: winner.userId,
        userName: winner.userName,
        userPhoto: winner.userPhoto || '',
        type: 'achievement',
        workoutId: null,
        summary: `Won ${info.name} in ${event.title}`,
        details: {
          eventId,
          eventTitle: event.title,
          clanId: '',
          rank: winner.rank,
          badgeName: info.name,
          badgeEmoji: info.emoji
        },
        visibility: 'public',
        likesCount: 0,
        commentsCount: 0,
        createdAt: now
      });
    }
  }

  batch.update(doc(db, 'simple_events', eventId), {
    badgesAwarded: true,
    status: 'completed',
    updatedAt: now
  });

  await batch.commit();
  return { success: true, message: 'Event badges awarded successfully!' };
}

export async function updateSimpleEvent(id: string, data: Partial<SimpleEvent>): Promise<void> {
  await updateDoc(doc(db, 'simple_events', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteSimpleEvent(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'simple_events', id));
  
  const participantsSnap = await getDocs(query(collection(db, 'simple_event_participants'), where('eventId', '==', id)));
  participantsSnap.docs.forEach(d => batch.delete(d.ref));
  
  await batch.commit();
}

export async function joinEvent(eventId: string, userId: string, userName: string, userPhoto: string): Promise<void> {
  const partId = `${eventId}_${userId}`;
  await setDoc(doc(db, 'simple_event_participants', partId), {
    eventId,
    userId,
    userName,
    userPhoto: userPhoto || '',
    rank: 0,
    isRanked: false,
    joinedAt: serverTimestamp()
  });

  const q = query(collection(db, 'simple_event_participants'), where('eventId', '==', eventId));
  const snap = await getDocs(q);
  await updateDoc(doc(db, 'simple_events', eventId), {
    participantCount: snap.size
  });
}

export async function leaveEvent(eventId: string, userId: string): Promise<void> {
  const partId = `${eventId}_${userId}`;
  await deleteDoc(doc(db, 'simple_event_participants', partId));

  const q = query(collection(db, 'simple_event_participants'), where('eventId', '==', eventId));
  const snap = await getDocs(q);
  await updateDoc(doc(db, 'simple_events', eventId), {
    participantCount: snap.size
  });
}

// ─── CLAN POSTS & COMMENTS ───────────────────────────────────────

import { storage } from '@/lib/firebase';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import type { PostComment } from '@/types';
export type { PostComment };

export const createClanPost = async (postData: Omit<CommunityPost, 'id' | 'likesCount' | 'commentsCount' | 'createdAt' | 'likedUserIds'> & { imageUrl?: string; images?: string[] }) => {
  const images = postData.images && postData.images.length > 0
    ? postData.images
    : (postData.imageUrl ? [postData.imageUrl] : []);

  const docRef = await addDoc(collection(db, 'community_posts'), {
    ...postData,
    title: (postData.title || '').trim(),
    text: (postData.text || '').trim(),
    imageUrl: images[0] || null,
    images: images,
    likesCount: 0,
    commentsCount: 0,
    likedUserIds: [],
    createdAt: serverTimestamp()
  });
  return docRef.id;
};

export async function getClanPosts(clanId: string, limitCount = 50): Promise<CommunityPost[]> {
  try {
    const q = query(
      collection(db, 'community_posts'),
      where('communityId', '==', clanId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as CommunityPost))
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : ((a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : ((b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 : 0);
        return timeB - timeA;
      })
      .slice(0, limitCount);
  } catch (err) {
    console.error('Error fetching clan posts:', err);
    return [];
  }
}

export async function likeClanPost(postId: string, isLiking: boolean): Promise<void> {
  const postRef = doc(db, 'community_posts', postId);
  if (isLiking) {
    await updateDoc(postRef, { likesCount: increment(1) });
  } else {
    await updateDoc(postRef, { likesCount: increment(-1) });
  }
}

export async function toggleLikeClanPost(postId: string, userId: string): Promise<boolean> {
  const postRef = doc(db, 'community_posts', postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) return false;
  const data = snap.data() as CommunityPost;
  const likedUserIds = Array.isArray(data.likedUserIds) ? data.likedUserIds : [];
  const isLiked = likedUserIds.includes(userId);
  const updatedLikes = isLiked
    ? likedUserIds.filter(id => id !== userId)
    : [...likedUserIds, userId];
  
  await updateDoc(postRef, {
    likedUserIds: updatedLikes,
    likesCount: updatedLikes.length
  });

  if (!isLiked && data.authorId !== userId) {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const userData = userSnap.exists() ? userSnap.data() : {};
    await notify(data.authorId, {
      type: 'like',
      senderId: userId,
      senderName: userData.displayName || 'An athlete',
      senderPhoto: userData.photoURL || '',
      message: `${userData.displayName || 'An athlete'} liked your post in ${data.clanName}`,
      targetId: postId,
      read: false,
    });
  }

  return !isLiked;
}

export async function createPostComment(comment: Omit<PostComment, 'id' | 'createdAt'>): Promise<string> {
  const images = comment.images && comment.images.length > 0
    ? comment.images
    : (comment.imageUrl ? [comment.imageUrl] : []);

  const docRef = await addDoc(collection(db, 'community_post_comments'), {
    ...comment,
    imageUrl: images[0] || null,
    images: images,
    parentId: comment.parentId || null,
    replyToUserId: comment.replyToUserId || null,
    replyToUserName: comment.replyToUserName || null,
    likesCount: 0,
    likedUserIds: [],
    dislikesCount: 0,
    dislikedUserIds: [],
    createdAt: serverTimestamp(),
  });
  
  await updateDoc(doc(db, 'community_posts', comment.postId), {
    commentsCount: increment(1)
  }).catch(() => {});

  // Send Notification
  try {
    const targetUserId = comment.replyToUserId;
    if (targetUserId && targetUserId !== comment.userId) {
      await notify(targetUserId, {
        type: 'comment',
        senderId: comment.userId,
        senderName: comment.userName,
        senderPhoto: comment.userPhoto || '',
        message: `${comment.userName} replied to your comment`,
        targetId: comment.postId,
        read: false,
      });
    } else if (!targetUserId) {
      const postSnap = await getDoc(doc(db, 'community_posts', comment.postId));
      if (postSnap.exists()) {
        const postData = postSnap.data();
        if (postData.authorId && postData.authorId !== comment.userId) {
          await notify(postData.authorId, {
            type: 'comment',
            senderId: comment.userId,
            senderName: comment.userName,
            senderPhoto: comment.userPhoto || '',
            message: `${comment.userName} commented on your post in ${postData.clanName}`,
            targetId: comment.postId,
            read: false,
          });
        }
      }
    }
  } catch (err) {
    console.error('Error sending comment notification:', err);
  }
  
  return docRef.id;
}

export async function getPostComments(postId: string, limitCount = 100): Promise<PostComment[]> {
  try {
    const q = query(
      collection(db, 'community_post_comments'),
      where('postId', '==', postId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as PostComment))
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : ((a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : ((b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 : 0);
        return timeA - timeB;
      })
      .slice(0, limitCount);
  } catch (err) {
    console.error('Error fetching post comments:', err);
    return [];
  }
}

export async function toggleLikePostComment(commentId: string, userId: string): Promise<void> {
  const commentRef = doc(db, 'community_post_comments', commentId);
  const snap = await getDoc(commentRef);
  if (!snap.exists()) return;
  const data = snap.data() as PostComment;
  const likedUserIds = Array.isArray(data.likedUserIds) ? data.likedUserIds : [];
  const dislikedUserIds = Array.isArray(data.dislikedUserIds) ? data.dislikedUserIds : [];
  
  const isLiked = likedUserIds.includes(userId);
  const newLikes = isLiked ? likedUserIds.filter(id => id !== userId) : [...likedUserIds, userId];
  const newDislikes = dislikedUserIds.filter(id => id !== userId);
  
  await updateDoc(commentRef, {
    likedUserIds: newLikes,
    likesCount: newLikes.length,
    dislikedUserIds: newDislikes,
    dislikesCount: newDislikes.length
  });

  if (!isLiked && data.userId !== userId) {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const userData = userSnap.exists() ? userSnap.data() : {};
    await notify(data.userId, {
      type: 'like',
      senderId: userId,
      senderName: userData.displayName || 'An athlete',
      senderPhoto: userData.photoURL || '',
      message: `${userData.displayName || 'An athlete'} liked your comment`,
      targetId: data.postId,
      read: false,
    });
  }
}

export async function toggleDislikePostComment(commentId: string, userId: string): Promise<void> {
  const commentRef = doc(db, 'community_post_comments', commentId);
  const snap = await getDoc(commentRef);
  if (!snap.exists()) return;
  const data = snap.data() as PostComment;
  const likedUserIds = Array.isArray(data.likedUserIds) ? data.likedUserIds : [];
  const dislikedUserIds = Array.isArray(data.dislikedUserIds) ? data.dislikedUserIds : [];
  
  const isDisliked = dislikedUserIds.includes(userId);
  const newDislikes = isDisliked ? dislikedUserIds.filter(id => id !== userId) : [...dislikedUserIds, userId];
  const newLikes = likedUserIds.filter(id => id !== userId);
  
  await updateDoc(commentRef, {
    dislikedUserIds: newDislikes,
    dislikesCount: newDislikes.length,
    likedUserIds: newLikes,
    likesCount: newLikes.length
  });
}

export async function deletePostComment(commentId: string, postId: string): Promise<void> {
  // 1. Delete the comment
  await deleteDoc(doc(db, 'community_post_comments', commentId));
  
  // 2. Also delete any nested child replies
  const repliesSnap = await getDocs(query(collection(db, 'community_post_comments'), where('parentId', '==', commentId)));
  const batch = writeBatch(db);
  repliesSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit().catch(() => {});
  
  const totalDeleted = 1 + repliesSnap.size;
  
  // 3. Decrement commentsCount on the post
  const postRef = doc(db, 'community_posts', postId);
  await updateDoc(postRef, {
    commentsCount: increment(-totalDeleted)
  }).catch(() => {});
}

export async function deleteClanPost(postId: string): Promise<void> {
  const postRef = doc(db, 'community_posts', postId);
  const snap = await getDoc(postRef);
  const data = snap.exists() ? (snap.data() as CommunityPost) : null;
  
  // 1. Clean up images from Firebase Storage if stored there
  if (data) {
    const imagesToDelete = [
      ...(data.images || []),
      ...(data.imageUrl ? [data.imageUrl] : [])
    ];
    for (const url of imagesToDelete) {
      if (url && typeof url === 'string' && (url.includes('firebasestorage.googleapis.com') || url.includes('appspot.com'))) {
        try {
          const decoded = decodeURIComponent(url.split('?')[0]);
          const pathIndex = decoded.indexOf('/o/');
          if (pathIndex !== -1) {
            const fullPath = decoded.substring(pathIndex + 3);
            await deleteObject(storageRef(storage, fullPath)).catch(() => {});
          }
        } catch (e) {
          console.warn('Could not delete storage image:', e);
        }
      }
    }
  }

  // 2. Delete the post and all comments/replies
  const batch = writeBatch(db);
  batch.delete(postRef);
  const commentsSnap = await getDocs(query(collection(db, 'community_post_comments'), where('postId', '==', postId)));
  commentsSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

export async function getUserCommunityBadges(userId: string): Promise<EarnedCommunityBadge[]> {
  if (!userId) return [];
  const badgeMap = new Map<string, EarnedCommunityBadge>();

  const rankTitles: Record<number, { name: string; style: 'gold' | 'silver' | 'bronze'; emoji: string }> = {
    1: { name: 'Gold Champion', style: 'gold', emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver', emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze', emoji: '🥉' },
  };

  // 1. From User Document (Baseline)
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (userSnap.exists()) {
      const uData = userSnap.data();
      const list = uData.communityBadges || [];
      list.forEach((b: EarnedCommunityBadge) => {
        if (b && (b.sourceId || b.id)) {
          const sourceKey = b.sourceId ? `${b.sourceType || 'challenge'}_${b.sourceId}` : b.id;
          badgeMap.set(sourceKey, b);
        }
      });
    }
  } catch (e) {
    console.error('Failed to fetch badges from user doc', e);
  }

  // 2. From Live Challenge Participants (Authoritative Source of Truth)
  try {
    const q = query(
      collection(db, 'challenge_participants'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      const data = d.data();
      const sourceKey = `challenge_${data.challengeId}`;
      const rawRank = data.badgeAwarded !== undefined ? data.badgeAwarded : (typeof data.rank === 'number' && data.rank <= 3 && data.rank >= 1 ? data.rank : undefined);
      const rank = rawRank as 1 | 2 | 3 | undefined;

      if (rank && rankTitles[rank]) {
        let cTitle = 'Challenge Victory';
        let clanId = '';
        let clanName = '';
        try {
          const cSnap = await getDoc(doc(db, 'challenges_v2', data.challengeId));
          if (cSnap.exists()) {
            const cData = cSnap.data();
            cTitle = cData.title || cTitle;
            clanId = cData.clanId || '';
            clanName = cData.clanName || '';
          }
        } catch {}

        const info = rankTitles[rank];
        const bObj: EarnedCommunityBadge = {
          id: `${data.challengeId}_rank_${rank}`,
          title: cTitle,
          subtitle: `${info.emoji} ${info.name} (Rank #${data.rank || rank})`,
          description: data.customResult || `Rank #${data.rank || rank} in "${cTitle}"`,
          rank,
          sourceType: 'challenge',
          sourceId: data.challengeId,
          sourceTitle: cTitle,
          clanId,
          clanName,
          awardedAt: data.updatedAt || data.joinedAt || Timestamp.now(),
          badgeStyle: info.style
        };
        // Always overwrite with the live participant rank
        badgeMap.set(sourceKey, bObj);
      } else if (data.challengeId) {
        // If participant is no longer ranked top 3 and has no badge, remove stale badge
        badgeMap.delete(sourceKey);
      }
    }
  } catch (e) {
    console.error('Failed to fetch badges from challenge participants', e);
  }

  // 3. From Live Event Participants (Authoritative Source of Truth)
  try {
    const q = query(
      collection(db, 'simple_event_participants'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      const data = d.data();
      const sourceKey = `event_${data.eventId}`;
      const rawRank = data.badgeAwarded !== undefined ? data.badgeAwarded : (typeof data.rank === 'number' && data.rank <= 3 && data.rank >= 1 ? data.rank : undefined);
      const rank = rawRank as 1 | 2 | 3 | undefined;

      if (rank && rankTitles[rank]) {
        let eTitle = 'Event Victory';
        let clanId = '';
        let clanName = '';
        try {
          const eSnap = await getDoc(doc(db, 'simple_events', data.eventId));
          if (eSnap.exists()) {
            const eData = eSnap.data();
            eTitle = eData.title || eTitle;
            clanId = eData.clanId || '';
            clanName = eData.clanName || '';
          }
        } catch {}

        const info = rankTitles[rank];
        const bObj: EarnedCommunityBadge = {
          id: `${data.eventId}_rank_${rank}`,
          title: eTitle,
          subtitle: `${info.emoji} ${info.name} (Rank #${data.rank || rank})`,
          description: data.customResult || `Rank #${data.rank || rank} in "${eTitle}"`,
          rank,
          sourceType: 'event',
          sourceId: data.eventId,
          sourceTitle: eTitle,
          clanId,
          clanName,
          awardedAt: data.updatedAt || Timestamp.now(),
          badgeStyle: info.style
        };
        badgeMap.set(sourceKey, bObj);
      } else if (data.eventId) {
        badgeMap.delete(sourceKey);
      }
    }
  } catch (e) {
    console.error('Failed to fetch badges from event participants', e);
  }

  const allBadges = Array.from(badgeMap.values());
  allBadges.sort((a, b) => (a.rank || 3) - (b.rank || 3));
  return allBadges;
}
