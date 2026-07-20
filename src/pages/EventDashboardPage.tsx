import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QrCode, CheckCircle2, XCircle, Users, Activity } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getEvent, getEventRegistrations, checkInUser, registerForEvent } from '@/services/events';
import { getAvatarUrl } from '@/lib/avatar';

export function EventDashboardPage() {
  const { eventId } = useParams();
  const { user, profile } = useAuthStore();
  const { showToast, theme } = useUIStore();
  const queryClient = useQueryClient();
  
  const [scannerInput, setScannerInput] = useState('');
  const [walkInName, setWalkInName] = useState('');

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => getEvent(eventId!),
    enabled: !!eventId
  });

  const { data: registrations = [], isLoading: regLoading } = useQuery({
    queryKey: ['event_registrations', eventId],
    queryFn: () => getEventRegistrations(eventId!),
    enabled: !!eventId
  });

  const checkInMutation = useMutation({
    mutationFn: async (registrationId: string) => {
      await checkInUser(registrationId, eventId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_registrations', eventId] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      showToast('User checked in successfully!');
      setScannerInput('');
    },
    onError: (err: any) => showToast(err?.message || 'Failed to check in user', 'error')
  });

  const walkInMutation = useMutation({
    mutationFn: async () => {
      if (!walkInName.trim()) throw new Error('Name required');
      const mockUid = `walkin_${Date.now()}`;
      const regId = await registerForEvent({
        eventId: eventId!,
        userId: mockUid,
        userName: walkInName.trim() + ' (Walk-in)',
        userPhoto: '',
        status: 'registered',
        qrCodeData: `ticket_${eventId}_${mockUid}`,
      });
      await checkInUser(regId, eventId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_registrations', eventId] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      showToast('Walk-in registered and checked in!');
      setWalkInName('');
    },
    onError: (err: any) => showToast(err?.message || 'Failed to register walk-in', 'error')
  });

  if (eventLoading) return <div className="p-10 text-center text-bone-dim">Loading dashboard...</div>;
  if (!event) return <div className="p-10 text-center text-bone-dim">Event not found.</div>;
  if (user?.uid !== event.organizerId && !profile?.isAdmin) return <Navigate to={`/events/${eventId}`} replace />;

  const checkedInCount = registrations.filter(r => r.status === 'checked_in').length;

  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    const reg = registrations.find(r => r.id === scannerInput.trim());
    if (!reg) {
      showToast('Invalid Ticket ID', 'error');
      return;
    }
    if (reg.status === 'checked_in') {
      showToast('User is already checked in', 'info');
      setScannerInput('');
      return;
    }
    checkInMutation.mutate(reg.id!);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1000px] mx-auto w-full space-y-6">
      
      <div className="pb-5 border-b border-line flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="font-mono text-sienna text-xs tracking-widest mb-1 uppercase">Organizer Dashboard</div>
          <h1 className="font-display text-3xl text-bone">{event.title}</h1>
          <Link to={`/events/${eventId}`} className="text-sm text-sienna hover:underline mt-1 inline-block">← Back to Event Page</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 bg-ink-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-bone-dim uppercase">Total Registered</span>
            <Users size={16} className="text-sienna" />
          </div>
          <div className="font-display text-4xl">{event.stats.registeredCount}</div>
          <div className="text-xs text-bone-dim mt-1">out of {event.capacity} capacity</div>
        </div>
        <div className="card p-5 bg-ink-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-bone-dim uppercase">Checked In</span>
            <CheckCircle2 size={16} className="text-amber" />
          </div>
          <div className="font-display text-4xl">{checkedInCount}</div>
          <div className="text-xs text-bone-dim mt-1">{(checkedInCount / Math.max(event.stats.registeredCount, 1) * 100).toFixed(0)}% attendance</div>
        </div>
        <div className="card p-5 bg-ink-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-bone-dim uppercase">Revenue</span>
            <Activity size={16} className="text-bone-dim" />
          </div>
          <div className="font-display text-4xl">${(event.stats.registeredCount * (event.pricing?.basePrice || 0)).toFixed(0)}</div>
          <div className="text-xs text-bone-dim mt-1">Simulated total volume</div>
        </div>
      </div>

      {/* Mock Analytics Charts */}
      <section className="card p-6">
        <h2 className="font-display text-xl mb-4">Analytics (Mock)</h2>
        <div className="flex items-end gap-2 h-32 mb-2 border-b border-line pb-2">
          {/* Simple bar chart for daily views */}
          {[12, 45, 30, 70, 50, 90, event.stats.views || 25].map((val, i) => (
            <div key={i} className="flex-1 bg-sienna/20 hover:bg-sienna transition-colors rounded-t-sm flex items-end justify-center group relative" style={{ height: `${Math.min(val, 100)}%` }}>
              <span className="absolute -top-6 text-[10px] font-mono opacity-0 group-hover:opacity-100">{val}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] font-mono text-bone-dim uppercase">
          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
        </div>
        <div className="mt-4 flex gap-4 text-sm text-bone-dim">
          <div><strong className="text-bone">{event.stats.views || 0}</strong> Total Views</div>
          <div><strong className="text-bone">{event.stats.clickRate || 14}%</strong> Click Rate</div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="font-display text-xl mb-4">Guest List</h2>
            {regLoading ? (
              <div className="py-4 text-center text-bone-dim">Loading registrations...</div>
            ) : registrations.length === 0 ? (
              <div className="py-4 text-center text-bone-dim">No registrations yet.</div>
            ) : (
              <div className="space-y-3">
                {registrations.map(reg => (
                  <div key={reg.id} className="flex items-center justify-between p-3 border border-line/40 rounded-lg bg-ink-3">
                    <div className="flex items-center gap-3">
                      <img src={getAvatarUrl(reg.userName, theme)} alt={reg.userName} className="w-10 h-10 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">{reg.userName}</div>
                        <div className="font-mono text-[10px] text-bone-dim">ID: {reg.id?.slice(0,8)}...</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {reg.status === 'checked_in' ? (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-amber uppercase bg-amber/10 px-2 py-1 rounded">
                          <CheckCircle2 size={12} /> Checked In
                        </span>
                      ) : (
                        <button 
                          onClick={() => checkInMutation.mutate(reg.id!)} 
                          disabled={checkInMutation.isPending}
                          className="btn-secondary py-1.5 px-3 text-xs"
                        >
                          Manual Check-in
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div>
          <section className="card p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <QrCode className="text-sienna" />
              <h2 className="font-display text-xl">Scanner</h2>
            </div>
            <p className="text-xs text-bone-dim">In a real app, this would open the device camera to scan a QR code. For now, you can manually input a Ticket ID.</p>
            
            <form onSubmit={handleManualScan} className="flex gap-2">
              <input 
                type="text" 
                value={scannerInput} 
                onChange={e => setScannerInput(e.target.value)} 
                placeholder="Ticket ID" 
                className="input-field flex-1 text-sm font-mono" 
              />
              <button type="submit" disabled={!scannerInput.trim() || checkInMutation.isPending} className="btn-primary py-2 px-4 shrink-0">
                Verify
              </button>
            </form>
          </section>

          <section className="card p-6 space-y-4 mt-6">
            <h2 className="font-display text-xl">Walk-in Registration</h2>
            <p className="text-xs text-bone-dim">Manually register a user who arrived at the door.</p>
            <form onSubmit={e => { e.preventDefault(); walkInMutation.mutate(); }} className="flex gap-2">
              <input 
                type="text" 
                value={walkInName} 
                onChange={e => setWalkInName(e.target.value)} 
                placeholder="Guest Name" 
                className="input-field flex-1 text-sm font-mono" 
              />
              <button type="submit" disabled={!walkInName.trim() || walkInMutation.isPending} className="btn-secondary border-sienna text-sienna hover:bg-sienna hover:text-bone py-2 px-4 shrink-0">
                Register
              </button>
            </form>
          </section>
        </div>
      </div>

    </motion.div>
  );
}
