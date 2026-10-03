import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  RecaptchaVerifier, linkWithPhoneNumber, reload, sendEmailVerification, unlink, type ConfirmationResult,
} from 'firebase/auth';
import { Browser } from '@capacitor/browser';
import { CheckCircle2, Circle, Loader2, Lock } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { PRODUCTION_URL } from '@/lib/share';
import { useUIStore } from '@/stores/ui-store';
import { applyAsSeller, formatInr, type MarketConfig, type PayoutAccount } from '@/services/market';
import { useMarketConfig } from './CheckoutButton';
import { MarketSheet } from './MarketSheet';
import { BRAND } from '@/lib/brand';

// Firebase phone verification needs reCAPTCHA, which only runs on http(s) origins (not the iOS capacitor:// webview).
const PHONE_SUPPORTED = /^https?:$/.test(window.location.protocol);

export function sellerTerms(c: MarketConfig): string[] {
  return [
    'Only sell what you own or have the right to sell. No medical claims, supplements, drugs or unsafe advice.',
    'Deliver what you sell. If you cancel an event or challenge, every buyer gets a full refund and your share is withheld.',
    'Ticket money is released 2 days after the event ends. Refunds and chargebacks are taken from your payouts.',
    `${BRAND.name} keeps ${c.fees.ticket}% of ticket sales and ${c.fees.coach}% of plan and clan sales, including payment processing.`,
    'You are responsible for tax on your income. Where the law requires, we collect or deduct tax at source and report it.',
    'Razorpay verifies your bank account and identity (KYC). False details close your seller account.',
    `New sellers can take up to ${formatInr(c.seller.newSellerMonthlyLimit)} a month until ${c.seller.trustedAfterSales} completed sales.`,
    'We may hide listings or pause payouts while we look into reports of fraud or abuse.',
  ];
}

function authMessage(e: any): string {
  const code = String(e?.code || '');
  if (code.includes('invalid-phone-number')) return 'That phone number doesn\'t look right.';
  if (code.includes('too-many-requests') || code.includes('quota-exceeded')) return 'Too many attempts. Please try again later.';
  if (code.includes('invalid-verification-code')) return 'Wrong code. Check the SMS and try again.';
  if (code.includes('code-expired')) return 'That code expired. Send a new one.';
  if (code.includes('credential-already-in-use') || code.includes('account-exists')) return `This number is already linked to another ${BRAND.name} account.`;
  if (code.includes('operation-not-allowed')) return 'Phone verification isn\'t available yet. Please try again later.';
  if (code.includes('captcha')) return 'Security check failed. Reload the page and try again.';
  return e?.message || 'Something went wrong. Please try again.';
}

function Step({ done, title, children }: { done: boolean; title: string; children?: ReactNode }) {
  return (
    <div className="py-3 flex items-start gap-3">
      {done ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--dx-success)' }} /> : <Circle size={18} className="shrink-0 mt-0.5 dx-muted" />}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** Seller sign-up: verified email + phone, account age, details and terms. The backend re-checks all of it. */
export function SellerSignupSheet({ existing, onClose }: { existing: PayoutAccount | null; onClose: () => void }) {
  const config = useMarketConfig();
  const { showToast } = useUIStore();
  const user = auth.currentUser;
  const [, rerender] = useState(0);
  const [busy, setBusy] = useState<'' | 'email' | 'check' | 'send' | 'verify'>('');
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [legalName, setLegalName] = useState(existing?.legalName || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [businessType, setBusinessType] = useState<PayoutAccount['businessType']>(existing?.businessType || 'individual');
  const [about, setAbout] = useState(existing?.about || '');
  const [agreed, setAgreed] = useState(false);
  const recaptchaBox = useRef<HTMLDivElement>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const linkedHere = useRef(false);

  useEffect(() => {
    if (user) reload(user).then(() => rerender(n => n + 1)).catch(() => undefined);
    return () => {
      verifier.current?.clear();
      // The number is only needed for the sign-up check; unlinking it means nobody can SIM-swap their way into this account.
      if (linkedHere.current && auth.currentUser) unlink(auth.currentUser, 'phone').then(u => u.getIdToken(true)).catch(() => undefined);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const emailVerified = !!user?.emailVerified;
  const phone = user?.phoneNumber || '';
  const readyAt = (Date.parse(user?.metadata.creationTime || '') || Date.now()) + config.seller.minAccountDays * 86_400_000;
  const oldEnough = Date.now() >= readyAt;
  const detailsOk = legalName.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim());
  const ready = emailVerified && !!phone && oldEnough && detailsOk && agreed;

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    setBusy(kind);
    try { await fn(); } catch (e) { showToast(authMessage(e), 'error'); } finally { setBusy(''); }
  };

  const sendEmail = () => run('email', async () => {
    await sendEmailVerification(user!);
    showToast('Check your inbox for the verification link.', 'success');
  });
  const recheckEmail = () => run('check', async () => {
    await reload(user!);
    await user!.getIdToken(true);
    rerender(n => n + 1);
    if (!user!.emailVerified) showToast('Not verified yet. Open the link in the email first.', 'info');
  });
  const sendCode = () => run('send', async () => {
    try {
      verifier.current ??= new RecaptchaVerifier(auth, recaptchaBox.current!, { size: 'invisible' });
      setConfirmation(await linkWithPhoneNumber(user!, `+91${digits}`, verifier.current));
      showToast('Code sent by SMS.', 'success');
    } catch (e) {
      verifier.current?.clear();
      verifier.current = null;
      throw e;
    }
  });
  const verifyCode = () => run('verify', async () => {
    await confirmation!.confirm(code);
    linkedHere.current = true;
    await user!.getIdToken(true);
    setConfirmation(null);
    setCode('');
    rerender(n => n + 1);
  });

  const submit = useMutation({
    mutationFn: () => applyAsSeller({ legalName, email, businessType, about, termsVersion: config.seller.termsVersion }),
    onSuccess: () => {
      showToast('Application sent. We\'ll email you the next steps.', 'success');
      onClose();
    },
    onError: (e: any) => showToast(e?.message || 'Could not send the application', 'error'),
  });

  return (
    <MarketSheet
      title={existing ? 'Update seller details' : 'Become a seller'}
      subtitle={`A few checks keep buyers safe. Razorpay verifies your bank account and identity afterwards; ${BRAND.name} never sees your bank details.`}
      onClose={onClose}
      footer={(
        <button type="button" className="dx-btn w-full" disabled={!ready || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? 'Sending…' : 'Send application'}
        </button>
      )}
    >
      <div className="space-y-5">
        <section>
          <div className="dx-label">Checks</div>
          <div className="dx-inset px-3 dx-list">
            <Step done={emailVerified} title={emailVerified ? 'Email verified' : 'Verify your email'}>
              {!emailVerified && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" className="dx-btn-secondary !h-9 !px-3 text-[13px]" disabled={!!busy} onClick={sendEmail}>{busy === 'email' ? 'Sending…' : 'Send link'}</button>
                  <button type="button" className="dx-btn-secondary !h-9 !px-3 text-[13px]" disabled={!!busy} onClick={recheckEmail}>{busy === 'check' ? 'Checking…' : 'I\'ve verified'}</button>
                </div>
              )}
            </Step>

            <Step done={!!phone} title={phone ? `Phone verified (${phone.slice(0, 3)} •••• ${phone.slice(-4)})` : 'Verify your mobile number'}>
              {!phone && !PHONE_SUPPORTED && (
                <div className="mt-1.5">
                  <p className="text-[12.5px] dx-muted leading-snug">Phone checks don't work inside the iPhone app yet. Sign in on the website with this account and send your application there.</p>
                  <button type="button" className="dx-btn-secondary !h-9 !px-3 text-[13px] mt-2" onClick={() => Browser.open({ url: `${PRODUCTION_URL}/seller` })}>Open website</button>
                </div>
              )}
              {!phone && PHONE_SUPPORTED && !confirmation && (
                <div className="flex gap-2 mt-2">
                  <span className="dx-input !w-auto shrink-0 flex items-center dx-muted text-[14px]" aria-hidden>+91</span>
                  <input
                    aria-label="Mobile number (India)" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={digits}
                    className="dx-input flex-1 min-w-0" placeholder="10-digit mobile"
                    onChange={e => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  />
                  <button type="button" className="dx-btn !h-10 !px-3 text-[13px] shrink-0" disabled={!/^[6-9]\d{9}$/.test(digits) || !!busy} onClick={sendCode}>
                    {busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : 'Send code'}
                  </button>
                </div>
              )}
              {!phone && confirmation && (
                <div className="flex gap-2 mt-2">
                  <input
                    aria-label="SMS code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                    className="dx-input flex-1 min-w-0 tracking-[0.3em]" placeholder="6-digit code"
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <button type="button" className="dx-btn !h-10 !px-3 text-[13px] shrink-0" disabled={code.length !== 6 || !!busy} onClick={verifyCode}>
                    {busy === 'verify' ? <Loader2 size={14} className="animate-spin" /> : 'Verify'}
                  </button>
                </div>
              )}
              {!phone && <p className="text-[12px] dx-muted mt-1.5">Only used to confirm it's you. It isn't shown to buyers or used for sign-in.</p>}
              <div ref={recaptchaBox} />
            </Step>

            <Step done={oldEnough} title={oldEnough ? `Account older than ${config.seller.minAccountDays} days` : 'Account too new'}>
              {!oldEnough && <p className="text-[12.5px] dx-muted mt-0.5">You can apply from {new Date(readyAt).toLocaleDateString()}.</p>}
            </Step>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <label className="dx-label" htmlFor="ss-name">Legal name (as on your bank account)</label>
            <input id="ss-name" className="dx-input w-full" value={legalName} maxLength={100} placeholder="Full name on your bank account" autoComplete="off" onChange={e => setLegalName(e.target.value)} />
          </div>
          <div>
            <label className="dx-label" htmlFor="ss-email">Email for payout updates</label>
            <input id="ss-email" type="email" className="dx-input w-full" value={email} maxLength={120} placeholder="you@example.com" autoComplete="off" onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <span className="dx-label">I'm selling as</span>
            <div className="dx-segment" role="tablist">
              <button type="button" role="tab" aria-selected={businessType === 'individual'} onClick={() => setBusinessType('individual')}>Individual coach</button>
              <button type="button" role="tab" aria-selected={businessType === 'business'} onClick={() => setBusinessType('business')}>Gym / business</button>
            </div>
          </div>
          <div>
            <label className="dx-label" htmlFor="ss-about">What will you sell? (optional)</label>
            <textarea id="ss-about" className="dx-input w-full" rows={2} maxLength={500} value={about} onChange={e => setAbout(e.target.value)} placeholder="e.g. Training plans, a paid running club, monthly events" />
          </div>
        </section>

        <section>
          <div className="dx-label">Seller terms</div>
          <ol className="dx-inset p-3 max-h-48 overflow-y-auto space-y-2 text-[12.5px] leading-snug list-decimal pl-7">
            {sellerTerms(config).map(t => <li key={t}>{t}</li>)}
          </ol>
          <label className="flex items-start gap-2.5 mt-3 text-[13px] cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <span>I agree to the seller terms and confirm my details are correct.</span>
          </label>
        </section>

        <p className="flex items-start gap-2 text-[12px] dx-muted leading-snug">
          <Lock size={13} className="shrink-0 mt-0.5" /> Your details are visible only to you and the {BRAND.name} team.
        </p>
      </div>
    </MarketSheet>
  );
}
