import { useNavigate } from 'react-router-dom';
import { EyeOff, ShieldCheck, Users } from 'lucide-react';
import { SponsorHub } from '@/components/market/SponsorHub';
import { RequestAccess, useMarketPartner } from '@/components/market/Showcase';
import { usePaymentsEnabled } from '@/lib/payments-mode';

export function PartnerPage() {
  const navigate = useNavigate();
  const partner = useMarketPartner();
  const payments = usePaymentsEnabled();

  return (
    <div className="dx pro-scope w-full min-w-0 max-w-3xl mx-auto pt-1 sm:pt-4 space-y-4 pb-24">
      <header className="min-w-0">
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">Partner with us</h1>
        <p className="text-[13px] dx-muted mt-0.5">For brands, gyms, coaches and community owners who want to reach athletes.</p>
      </header>

      {partner ? (
        <section className="dx-card p-4">
          <div className="text-[15px] font-semibold">You can list on the Marketplace</div>
          <p className="text-[13px] dx-muted mt-0.5">Add your products, plans, events and communities.</p>
          <button type="button" className="dx-btn !h-10 mt-3" onClick={() => navigate('/seller')}>Open My listings</button>
        </section>
      ) : partner === null && <RequestAccess />}

      {payments && <SponsorHub />}

      <section className="dx-card p-4">
        <div className="text-[15px] font-semibold mb-2">Our rules for partners</div>
        <ul className="space-y-2.5 text-[13px]">
          {[
            { icon: ShieldCheck, t: 'Fitness and wellbeing only. No health claims, betting, alcohol or tobacco.' },
            { icon: EyeOff, t: 'No personal data is shared with partners.' },
            { icon: Users, t: 'Listings must be accurate. We remove anything misleading or reported.' },
          ].map(r => (
            <li key={r.t} className="flex items-start gap-2.5"><r.icon size={15} className="shrink-0 mt-0.5 dx-muted" /> {r.t}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
