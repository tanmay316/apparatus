import {
  Apple, Award, BookOpen, Compass, Dumbbell, Globe, Medal, Ruler, Settings, Store, Target, TrendingUp, Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that should highlight this item. */
  match?: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Train',
    items: [
      { id: 'home', path: '/', label: 'Home', icon: Dumbbell, match: ['/workout'] },
      { id: 'plans', path: '/plans', label: 'Plans', icon: BookOpen },
      { id: 'nutrition', path: '/nutrition', label: 'Nutrition', icon: Apple },
    ],
  },
  {
    title: 'Progress',
    items: [
      { id: 'progress', path: '/progress', label: 'Progress', icon: TrendingUp, match: ['/calendar'] },
      { id: 'skills', path: '/skills', label: 'Skills', icon: Target },
      { id: 'measurements', path: '/measurements', label: 'Body log', icon: Ruler },
      { id: 'achievements', path: '/achievements', label: 'Achievements', icon: Award },
      { id: 'ranks', path: '/ranks', label: 'Athlete ranks', icon: Medal, match: ['/athlete-ranks'] },
    ],
  },
  {
    title: 'Community',
    items: [
      { id: 'feed', path: '/feed', label: 'Activity feed', icon: Users, match: ['/post'] },
      { id: 'community', path: '/community', label: 'Clans & events', icon: Globe, match: ['/clan'] },
      { id: 'marketplace', path: '/marketplace', label: 'Marketplace', icon: Store, match: ['/purchase'] },
      { id: 'explore', path: '/explore', label: 'Explore', icon: Compass },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { id: 'settings', path: '/settings', label: 'Settings', icon: Settings };

export function isNavItemActive(item: NavItem, pathname: string) {
  const prefixes = [item.path, ...(item.match || [])];
  return prefixes.some(p => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`)));
}

/** Top-level destinations: the top bar shows the menu + logo here, and a back button everywhere else. */
export const ROOT_PATHS = ['/', '/plans', '/progress', '/nutrition', '/community', '/explore'];

const TITLES: [RegExp, string][] = [
  [/^\/plans\/[^/]+\/day\//, 'Workout day'],
  [/^\/plans\/[^/]+$/, 'Plan'],
  [/^\/workout\//, 'Workout'],
  [/^\/cardio/, 'Cardio'],
  [/^\/(calendar|progress)/, 'Progress'],
  [/^\/skills/, 'Skills'],
  [/^\/measurements/, 'Body log'],
  [/^\/achievements/, 'Achievements'],
  [/^\/(athlete-)?ranks/, 'Athlete ranks'],
  [/^\/feed/, 'Activity feed'],
  [/^\/post\//, 'Post'],
  [/^\/clan\//, 'Clan'],
  [/^\/community/, 'Community'],
  [/^\/explore/, 'Explore'],
  [/^\/nutrition/, 'Nutrition'],
  [/^\/profile/, 'Profile'],
  [/^\/settings/, 'Settings'],
  [/^\/admin/, 'Admin'],
  [/^\/marketplace/, 'Marketplace'],
  [/^\/purchase\//, 'Payment'],
  [/^\/search/, 'Search'],
];

export function getRouteTitle(pathname: string) {
  return TITLES.find(([re]) => re.test(pathname))?.[1] ?? '';
}

/** Tabs shown in the mobile bottom bar. */
export const BOTTOM_TAB_PATHS = ['/', '/nutrition', '/progress', '/community', '/plans', '/explore'];
