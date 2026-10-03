import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { subscribeMarketPartner, type MarketPartner } from '@/services/showcase';

/** Listing permission for the signed-in user (undefined while loading). */
export function useMarketPartner(): MarketPartner | null | undefined {
  const uid = useAuthStore(s => s.user?.uid);
  const [partner, setPartner] = useState<MarketPartner | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) { setPartner(null); return; }
    return subscribeMarketPartner(uid, setPartner);
  }, [uid]);
  return partner;
}
