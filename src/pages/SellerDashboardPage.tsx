import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  BadgeIndianRupee, CalendarDays, Lock, Shield, ShieldCheck, Store, Ticket, Trophy, Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatInr, type PayoutAccount } from '@/services/market';
import { useMarketConfig, usePayoutAccount } from '@/components/market/CheckoutButton';
import { PayoutStatusCard, PlanListings, SalesList, useSellerEarnings } from '@/components/market/SellerHub';
import { SellerSignupSheet } from '@/components/market/SellerSignupSheet';
import { HostedEvents } from '@/components/market/HostHub';
import { MyListings, RequestAccess, useMarketPartner } from '@/components/market/Showcase';
import { usePaymentsEnabled } from '@/lib/payments-mode';
import { BRAND } from '@/lib/brand';

type Tab = 'overview' | 'events' | 'plans' | 'payouts';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'events', label: 'Events' },
  { id: 'plans', label: 'Plans & clans' },
  { id: 'payouts', label: 'Payouts' },
];

const mask = (s: string, keep = 4) => (s.length <= keep ? s : '•'.repeat(Math.min(6, s.length - keep)) + s.slice(-keep));
const maskEmail = (e: string) => {
  const [name, domain] = e.split('@');
  return domain ? `${name.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(5, name.length - 2)))}@${domain}` : e;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="dx-card p-4 min-w-0">
      <div className="text-[12px] dx-muted">{label}</div>
      <div className="text-[20px] font-semibold tabular mt-0.5 truncate">{value}</div>
    </div>
  );
}

function SecureNote() {
  return (
    <p className="flex items-start gap-2 text-[12px] dx-muted leading-snug px-1">
      <Lock size={13} className="shrink-0 mt-0.5" />
      Only you can see this dashboard. Buyers' payments go through Razorpay, and your bank and KYC details stay with Razorpay; {BRAND.name} never stores them.
    </p>
  );
}

/** Shown before someone has a payout account: what they can sell and how it works. */
function Onboarding({ onStart }: { onStart: () => void }) {
  const config = useMarketConfig();
  const keepTicket = 100 - config.fees.ticket;
  const keepCoach = 100 - config.fees.coach;
  const offers = [
    { icon: Ticket, title: 'Paid events & challenges', body: `Create them the usual way and add a ticket price. You keep ${keepTicket}%, and you can download the participant list any time.` },
    { icon: CalendarDays, title: 'Training plans', body: `Sell a copy of any plan you built. Buyers get their own copy; you keep ${keepCoach}%.` },
    { icon: Shield, title: 'Paid clans', body: `Charge a joining fee for your clan. You keep ${keepCoach}%.` },
  ];
  return (
    <div className="space-y-4">
      <section className="dx-hero p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="dx-hero-icon"><Store size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75">For coaches, gyms & clubs</div>
            <h2 className="mt-1 text-[21px] font-semibold leading-tight">Sell on {BRAND.name}</h2>
            <p className="mt-1.5 text-[13px] opacity-80 leading-relaxed">
              Earn from your events, plans and clans. No approval for what you sell; we only handle the payment and send your share to your bank.
            </p>
          </div>
        </div>
        <button type="button" onClick={onStart} className="dx-hero-btn w-full mt-4"><BadgeIndianRupee size={16} /> Start selling</button>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {offers.map(o => (
          <div key={o.title} className="dx-card p-4">
            <span className="dx-badge-icon"><o.icon size={18} /></span>
            <div className="text-[15px] font-semibold mt-2">{o.title}</div>
            <p className="text-[12.5px] dx-muted mt-0.5 leading-snug">{o.body}</p>
          </div>
        ))}
      </section>

      <section className="dx-card p-4">
        <div className="text-[15px] font-semibold mb-3">How it works</div>
        <ol className="space-y-3">
          {[
            { t: 'Set up payouts once', b: 'Your name, email and phone. Razorpay then verifies your bank account directly.' },
            { t: 'Add a price', b: 'Create an event or challenge as usual and set a ticket price, or list a plan or clan.' },
            { t: 'People pay in the app', b: 'UPI, cards or netbanking. Every sale shows up in this dashboard.' },
            { t: 'Get paid', b: 'Your share settles to your bank. Ticket money is released after the event ends.' },
          ].map((s, i) => (
            <li key={s.t} className="flex gap-3">
              <span className="w-6 h-6 rounded-full text-[12px] font-semibold flex items-center justify-center shrink-0 tabular" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{s.t}</span>
                <span className="block text-[12.5px] dx-muted leading-snug mt-0.5">{s.b}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="dx-card p-4">
        <div className="text-[15px] font-semibold">What you need</div>
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {[
            'A verified email address',
            'An Indian mobile number (we send a one-time code)',
            `Your ${BRAND.name} account is at least ${config.seller.minAccountDays} days old`,
            'PAN and a bank account in your name (checked by Razorpay)',
          ].map(t => <li key={t} className="flex items-start gap-2"><ShieldCheck size={14} className="shrink-0 mt-0.5 dx-muted" /> {t}</li>)}
        </ul>
        <p className="text-[12px] dx-muted mt-2.5">New sellers can take up to {formatInr(config.seller.newSellerMonthlyLimit)} a month until {config.seller.trustedAfterSales} completed sales.</p>
      </section>

      <SecureNote />
    </div>
  );
}

function PayoutDetails({ account, onEdit }: { account: PayoutAccount; onEdit: () => void }) {
  const config = useMarketConfig();
  const editable = account.status === 'pending' || account.status === 'rejected';
  return (
    <section className="dx-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold">Payout account</div>
        {editable && <button type="button" className="dx-link text-[13px]" onClick={onEdit}>Edit</button>}
      </div>
      <dl className="mt-2 dx-list text-[13px]">
        {[
          ['Name', account.legalName],
          ['Email', maskEmail(account.email)],
          ['Phone', mask(account.phone.replace(/\s/g, ''))],
          ['Selling as', account.businessType === 'business' ? 'Gym / business' : 'Individual coach'],
          ['Fees', `${config.fees.ticket}% on tickets · ${config.fees.coach}% on plans & clans`],
        ].map(([k, v]) => (
          <div key={k} className="py-2.5 flex items-center justify-between gap-3">
            <dt className="dx-muted">{k}</dt>
            <dd className="font-medium text-right truncate min-w-0">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PaymentsDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const config = useMarketConfig();
  const account = usePayoutAccount(user?.uid);
  const earnings = useSellerEarnings();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.some(t => t.id === raw) ? raw : 'overview';
  const go = (t: Tab) => setParams(t === 'overview' ? { view: 'payments' } : { view: 'payments', tab: t }, { replace: true });
  const [payoutOpen, setPayoutOpen] = useState(false);
  const active = account?.status === 'active';

  return (
    <div className="space-y-4">
      {account === undefined ? (
        <div className="space-y-3">
          <div className="dx-card h-32 animate-pulse" />
          <div className="grid grid-cols-2 gap-3"><div className="dx-card h-20 animate-pulse" /><div className="dx-card h-20 animate-pulse" /></div>
        </div>
      ) : !account ? (
        <Onboarding onStart={() => setPayoutOpen(true)} />
      ) : (
        <>
          <div className="dx-segment w-full sm:w-[480px]" role="tablist">
            {TABS.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>{t.label}</button>)}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              {!active && <PayoutStatusCard account={account} onSetup={() => setPayoutOpen(true)} />}
              {active && !account.trusted && !earnings.loading && earnings.sales < config.seller.trustedAfterSales && (
                <section className="dx-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[15px] font-semibold">New seller limit</div>
                    <div className="text-[13px] tabular dx-muted">{formatInr(earnings.monthGross)} / {formatInr(config.seller.newSellerMonthlyLimit)}</div>
                  </div>
                  <div className="h-2 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--dx-border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (earnings.monthGross / config.seller.newSellerMonthlyLimit) * 100)}%`, background: 'var(--dx-accent)' }} />
                  </div>
                  <p className="text-[12.5px] dx-muted mt-2">Sales this month. The limit goes away after {config.seller.trustedAfterSales} completed sales ({earnings.sales} so far).</p>
                </section>
              )}
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Total earned" value={earnings.loading ? '…' : formatInr(earnings.total)} />
                <Stat label="This month" value={earnings.loading ? '…' : formatInr(earnings.month)} />
                <Stat label="Tickets sold" value={earnings.loading ? '…' : String(earnings.tickets)} />
                <Stat label="Plans & clans sold" value={earnings.loading ? '…' : String(earnings.plans + earnings.clans)} />
              </section>
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button type="button" className="dx-btn-secondary" onClick={() => go('events')}><CalendarDays size={15} /> Paid event</button>
                <button type="button" className="dx-btn-secondary" onClick={() => go('events')}><Trophy size={15} /> Paid challenge</button>
                <button type="button" className="dx-btn-secondary" onClick={() => go('plans')}><Store size={15} /> Sell a plan</button>
                <button type="button" className="dx-btn-secondary" onClick={() => go('payouts')}><Wallet size={15} /> Payouts</button>
              </section>
              <SalesList max={5} onMore={() => go('payouts')} />
            </div>
          )}

          {tab === 'events' && <HostedEvents canCharge={active} />}

          {tab === 'plans' && (
            <div className="space-y-4">
              <PlanListings active={active} />
              <section className="dx-card p-4 flex items-start gap-3">
                <span className="dx-badge-icon"><Shield size={18} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold">Paid clans</div>
                  <p className="text-[13px] dx-muted mt-0.5 leading-snug">Open a clan you lead, go to its settings and set a joining fee. New members pay once to join.</p>
                  <button type="button" className="dx-btn-secondary !h-10 mt-3" onClick={() => navigate('/community')}>Go to my clans</button>
                </div>
              </section>
            </div>
          )}

          {tab === 'payouts' && (
            <div className="space-y-4">
              <PayoutStatusCard account={account} onSetup={() => setPayoutOpen(true)} />
              <PayoutDetails account={account} onEdit={() => setPayoutOpen(true)} />
              <SalesList />
            </div>
          )}

          <SecureNote />
        </>
      )}

      <AnimatePresence>
        {payoutOpen && <SellerSignupSheet key="payout" existing={account ?? null} onClose={() => setPayoutOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

export function SellerDashboardPage() {
  const navigate = useNavigate();
  const payments = usePaymentsEnabled();
  const partner = useMarketPartner();
  const [params, setParams] = useSearchParams();
  const view = payments && (params.get('view') === 'payments' || params.has('tab')) ? 'payments' : 'listings';

  return (
    <div className="dx pro-scope w-full min-w-0 max-w-5xl mx-auto pt-1 sm:pt-4 space-y-4 pb-24">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">My listings</h1>
          <p className="text-[13px] dx-muted mt-0.5 flex items-center gap-1.5 truncate">
            <ShieldCheck size={13} className="shrink-0" /> Only you can see this page
          </p>
        </div>
        <button type="button" onClick={() => navigate('/marketplace')} className="dx-btn-secondary !h-9 !px-3 text-[13px] shrink-0"><Store size={15} /> Marketplace</button>
      </header>

      {payments && (
        <div className="dx-segment w-full sm:w-[360px]" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'listings'} onClick={() => setParams({}, { replace: true })}>Listings</button>
          <button type="button" role="tab" aria-selected={view === 'payments'} onClick={() => setParams({ view: 'payments' }, { replace: true })}>Sales & payouts</button>
        </div>
      )}

      {view === 'payments' ? <PaymentsDashboard /> : partner === undefined ? (
        <div className="dx-card h-32 animate-pulse" />
      ) : partner ? <MyListings /> : <RequestAccess />}
    </div>
  );
}
