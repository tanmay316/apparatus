import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '@/stores/subscription-store';

/** openPaywall() anywhere in the app opens the Pro page; leaving the page closes the paywall. */
export function PaywallNavigator() {
  const open = useSubscriptionStore(s => s.paywall.open);
  const close = useSubscriptionStore(s => s.closePaywall);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const shown = useRef(false);

  useEffect(() => {
    if (!open) { shown.current = false; return; }
    if (pathname === '/pro') { shown.current = true; return; }
    if (shown.current) { shown.current = false; close(); return; }
    navigate('/pro');
  }, [open, pathname, close, navigate]);

  return null;
}
