import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatInr, refreshOrder, type OrderView } from '@/services/market';

/** Razorpay sends web buyers back here after paying (/purchase/<order id>). */
export function PurchaseReturnPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const { user } = useAuthStore();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState('');
  const tries = useRef(0);

  useEffect(() => {
    if (!user || !/^mo_[A-Za-z0-9]{16}$/.test(orderId)) return;
    let stop = false;
    const poll = async () => {
      try {
        const o = await refreshOrder(orderId);
        if (stop) return;
        setOrder(o);
        if (o.status === 'created' && tries.current++ < 20) setTimeout(poll, 3000);
      } catch (err: any) {
        if (!stop) setError(err?.message || 'Could not check this payment.');
      }
    };
    poll();
    return () => { stop = true; };
  }, [orderId, user]);

  const done = order?.status === 'fulfilled';
  const failed = !!error || order?.status === 'expired' || order?.status === 'cancelled' || order?.status === 'refund_due';
  const next = order?.kind === 'plan' && order.result?.planId ? `/plans/${order.result.planId}`
    : order?.kind === 'clan' ? `/clan/${order.itemId}` : '/marketplace';

  return (
    <div className="dx pro-scope w-full min-w-0 max-w-md mx-auto pt-10 pb-24">
      <div className="dx-card p-6 text-center">
        {done ? <CheckCircle2 size={48} className="mx-auto" style={{ color: 'var(--dx-success)' }} />
          : failed ? <XCircle size={48} className="mx-auto dx-muted" />
          : <Loader2 size={44} className="mx-auto animate-spin dx-accent" />}
        <h1 className="mt-4 text-[20px] font-semibold">
          {done ? 'Payment confirmed' : failed ? (order?.status === 'refund_due' ? 'Refund on the way' : 'Payment not completed') : 'Confirming your payment…'}
        </h1>
        <p className="mt-1.5 text-[14px] dx-muted">
          {error || (order ? `${order.title} · ${formatInr(order.amount / 100)}` : 'This takes a few seconds.')}
        </p>
        <div className="mt-6 grid gap-2">
          {done && <Link to={next} className="dx-btn">Open</Link>}
          <Link to="/marketplace" className="dx-btn-secondary">Back to marketplace</Link>
        </div>
      </div>
    </div>
  );
}
