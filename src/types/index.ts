import { Timestamp } from 'firebase/firestore';

// ─── User ────────────────────────────────────────────────────
export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  usernameLower?: string;
  displayNameLower?: string;
  email: string;
  photoURL: string;
  bio: string;
  height: number | null;
  weight: number | null;
  age: number | null;
  gender: string;
  fitnessGoal: string;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  preferredWorkoutType: string;
  isPublic: boolean;
  isAdmin: boolean;
  activePlanId?: string | null;
  bookmarks?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserStats {
  totalWorkouts: number;
  totalCalories: number;
  totalDurationMin: number;
  totalVolume: number;
  currentStreak: number;
  longestStreak: number;
  lastWorkoutDate: string | null;
  xp: number;
  prCount: number;
  bestHold: number;
  badges: string[];
}

// ─── Plans ───────────────────────────────────────────────────
export interface Exercise {
  name: string;
  sets: string;
  tempo: string;
  rest: string;
  cues: string[];
  yt: string;
  equipment?: string;
  caloriesPerRep?: number;
  caloriesPerSecond?: number;
  met?: number;
  muscleGroup?: string;
}

export interface PlanDay {
  id?: string;
  dayNumber: number;
  title: string;
  skill: string;
  time: string;
  type: string;
  order: number;
  warmup: Exercise[];
  skillWork: Exercise[];
  strength: Exercise[];
  cooldown: Exercise[];
}

export interface Plan {
  id?: string;
  ownerId: string;
  ownerName: string;
  title: string;
  description: string;
  type: 'custom' | 'sample';
  tags: string[];
  daysPerWeek: number;
  estimatedDuration: string;
  isPublic: boolean;
  isArchived: boolean;
  clonedFrom: string | null;
  usageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  days?: PlanDay[];
}

// ─── Workouts ────────────────────────────────────────────────
export interface SetData {
  reps?: number;
  weight?: number;
  seconds?: number;
  completed?: boolean;
}

export interface ExerciseLog {
  id?: string;
  name: string;
  mode: 'reps' | 'hold' | 'freeform';
  order: number;
  sets: SetData[];
  rpe: number | null;
  durationSec: number;
  notes: string;
  isPR: boolean;
  muscleGroup?: string;
  section?: 'warmup' | 'skillWork' | 'strength' | 'cooldown';
}

export interface Workout {
  id?: string;
  userId: string;
  userName: string;
  userPhoto: string;
  planId: string;
  planTitle: string;
  dayId: string;
  dayTitle: string;
  date: string;
  startedAt: Timestamp;
  finishedAt: Timestamp | null;
  durationMin: number;
  calories: number;
  volume: number;
  bodyweight?: number;
  visibility: 'public' | 'followers' | 'private';
  notes: string;
  mood: string;
  exercises?: ExerciseLog[];
  likesCount: number;
  commentsCount: number;
  progressiveOverload?: ProgressiveOverloadSummary;
}

export interface ProgressiveOverloadSummary {
  status: 'progressed' | 'maintained' | 'regressed' | 'first_session';
  message: string;
  previousDate?: string;
  previousVolume?: number;
  currentVolume: number;
  volumeChangePercent?: number;
  exercisesProgressed: string[];
  exercisesTracked: number;
}

// ─── Social ──────────────────────────────────────────────────
export interface Activity {
  id?: string;
  userId: string;
  userName: string;
  username?: string; // added for profile routing
  userPhoto: string;
  type: 'workout' | 'achievement' | 'streak' | 'pr' | 'follow' | 'event_join';
  workoutId: string | null;
  summary: string;
  details: Record<string, unknown>;
  visibility: string;
  likesCount: number;
  commentsCount: number;
  createdAt: Timestamp;
}

export interface Comment {
  id?: string;
  userId: string;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: Timestamp;
}

export interface Notification {
  id?: string;
  type: 'follow' | 'unfollow' | 'like' | 'comment' | 'activity' | 'achievement' | 'reminder';
  receiverId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  message: string;
  targetId: string;
  read: boolean;
  createdAt: Timestamp;
}

// ─── Measurements ────────────────────────────────────────────
export interface Measurement {
  id?: string;
  date: string;
  weight?: number;
  chest?: number;
  waist?: number;
  arms?: number;
  shoulders?: number;
  thighs?: number;
  bodyfat?: number;
}

// ─── Exercise Library ────────────────────────────────────────
export interface LibraryExercise {
  id?: string;
  name: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  equipment: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  instructions: string[];
  youtubeSearch: string;
  caloriesPerMinEstimate: number;
  caloriesPerRep?: number;
  caloriesPerSecond?: number;
  met?: number;
  tags: string[];
  isCustom: boolean;
  createdBy: string | null;
}

// ─── Gamification ────────────────────────────────────────────
export interface Badge {
  id: string;
  icon: string;
  name: string;
  desc: string;
  cond: (ctx: BadgeContext) => boolean;
}

export interface BadgeContext {
  totalSessions: number;
  totalVolume: number;
  bestHold: number;
  currentStreak: number;
  longestStreak: number;
  prCount: number;
  daysCompleted: number;
  uniqueDaysCompleted: number;
  yogaCount: number;
  measurementsCount: number;
  weekGoalHit: boolean;
}

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  nextXp: number | null;
  pct: number;
}

export interface SystemLog {
  id?: string;
  userId: string | null;
  userName: string | null;
  message: string;
  stack?: string;
  context?: string;
  url: string;
  userAgent: string;
  createdAt: Timestamp | null;
}

// ─── Communities & Events ─────────────────────────────────────

export interface Community {
  id?: string;
  name: string;
  description: string;
  banner: string;
  ownerId: string;
  membersCount: number;
  isVerified: boolean;
  tags: string[];
  createdAt: Timestamp | null;
}

export type EventPricingType = 'free' | 'paid';
export type EventStatus = 'draft' | 'pending' | 'published' | 'cancelled' | 'completed';
export type EventCategory = 'Gym' | 'Calisthenics' | 'Yoga' | 'Running' | 'Meetup' | 'Workshop' | 'Competition' | 'Other';
export type EventType = 'Competition' | 'Meetup' | 'Workshop' | 'Chill' | 'Class' | 'Other';
export type GenderRestriction = 'Any' | 'Male Only' | 'Female Only';
export type SkillLevel = 'All Levels' | 'Beginner' | 'Intermediate' | 'Advanced';

export interface EventDetails {
  ageRestriction: string;
  language: string;
  dressCode: string;
  prerequisites: string[];
  requiredItems?: string[];
  faq?: { question: string; answer: string }[];
}

export interface AppEvent {
  id?: string;
  title: string;
  description: string;
  banner: string;
  category: EventCategory;
  eventType: EventType;
  genderRestriction: GenderRestriction;
  skillLevel: SkillLevel;
  organizerId: string;
  organizerName: string;
  communityId: string | null;
  communityName?: string;
  dateTime: { start: Timestamp; end: Timestamp };
  timeline?: { time: string; title: string; description?: string }[];
  location: { venueName: string; address: string; mapLink?: string; isOnline?: boolean; onlineLink?: string };
  capacity: number;
  status: EventStatus;
  pricing: { 
    type: EventPricingType; 
    basePrice?: number; 
    currency?: string;
    tiers?: { id: string, name: string, price: number, capacity?: number }[];
  };
  details: EventDetails;
  stats: { registeredCount: number; checkInCount: number; views: number; clickRate?: number };
  createdAt: Timestamp | null;
}

export interface EventRegistration {
  id?: string;
  eventId: string;
  userId: string;
  userName: string;
  userPhoto: string;
  status: 'registered' | 'waitlist' | 'cancelled' | 'checked_in';
  qrCodeData: string;
  purchasedAt: Timestamp | null;
}

export interface EventReview {
  id?: string;
  eventId: string;
  userId: string;
  userName: string;
  userPhoto: string;
  rating: number; // 1-5
  review: string;
  organizerReply: string | null;
  createdAt: Timestamp | null;
}
