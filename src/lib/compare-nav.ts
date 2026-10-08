import { CAN_UPSELL, requirePro, useHasPro } from '@/stores/subscription-store';
import { BRAND } from '@/lib/brand';

/** Compare is shown where it can be used or bought (hidden in store builds without Pro). */
export const useCanCompare = () => {
  const hasPro = useHasPro();
  return hasPro || CAN_UPSELL;
};

/** Opens the comparison, or the paywall for free users. */
export function openCompare(navigate: (to: string) => void, uid: string, name: string) {
  const first = name.split(' ')[0] || name;
  if (requirePro(`Compare yourself with ${first}: who is improving faster, why, and what to do next. Part of ${BRAND.name} Pro.`)) navigate(`/compare/${uid}`);
}
