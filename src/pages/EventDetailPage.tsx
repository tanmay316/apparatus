import { useState, useMemo, useEffect } from 'react';
import { updateDoc, doc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, MapPin, Users, Ticket, CheckCircle2, Link as LinkIcon, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getEvent, registerForEvent, getEventRegistrations, updateEventStatus, cancelRegistration } from '@/services/events';
import { getAvatarUrl } from '@/lib/avatar';
import { EventDiscussion } from '@/components/events/EventDiscussion';
import { EventReviews } from '@/components/events/EventReviews';

function formatGoogleCalendarUrl(event: any) {
  if (!event || !event.dateTime) return '#';
  const start = event.dateTime.start.toDate();
  const end = event.dateTime.end.toDate();
  
  const formatDate = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, '');
  
  const title = encodeURIComponent(event.title);
  const dates = `${formatDate(start)}/${formatDate(end)}`;
  const details = encodeURIComponent(event.description || '');
  const location = encodeURIComponent(event.location?.venueName || '');
  
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
}

export function EventDetailPage() {
  const { eventId } = useParams();
  const { user, profile } = useAuthStore();
  const { showToast, theme } = useUIStore();
  const queryClient = useQueryClient();
  
  const [showQRModal, setShowQRModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

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

  useEffect(() => {
    if (eventId) {
      updateDoc(doc(db, 'events', eventId), {
        'stats.views': increment(1)
      }).catch(() => {});
    }
  }, [eventId]);

  const isOrganizer = user?.uid === event?.organizerId;
  const myRegistration = registrations.find(r => r.userId === user?.uid);
  const isRegistered = !!myRegistration;

  const isWaitlist = event ? event.stats.registeredCount >= event.capacity : false;

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile || !eventId || !event) throw new Error('Cannot register');
      await registerForEvent({
        eventId,
        userId: user.uid,
        userName: profile.displayName || profile.username || 'Athlete',
        userPhoto: profile.photoURL || '',
        status: isWaitlist ? 'waitlist' : 'registered',
        qrCodeData: `ticket_${eventId}_${user.uid}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_registrations', eventId] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      showToast('Successfully registered for the event!');
      setShowPaymentModal(false);
      setShowQRModal(true);
    },
    onError: (err: any) => showToast(err?.message || 'Failed to register', 'error')
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!myRegistration?.id) throw new Error('Not registered');
      await cancelRegistration(myRegistration.id, eventId!, myRegistration.status === 'waitlist');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_registrations', eventId] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      showToast('Registration cancelled');
      setShowQRModal(false);
    },
    onError: (err: any) => showToast(err?.message || 'Failed to cancel', 'error')
  });

  if (eventLoading) return <div className="p-10 text-center text-bone-dim">Loading event...</div>;
  if (!event) return <div className="p-10 text-center text-bone-dim">Event not found.</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1000px] mx-auto w-full space-y-6">
      
      {/* Header Banner */}
      <div className="relative h-64 md:h-80 rounded-[32px] overflow-hidden border border-line bg-ink-2">
        {event.banner && <img src={event.banner} alt={event.title} className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        
        <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="tag-amber uppercase">{event.status}</span>
              <span className="px-2 py-1 bg-sienna text-bone text-[10px] font-mono uppercase rounded-sm">{event.category}</span>
              <span className="px-2 py-1 bg-ink-3 text-bone-dim text-[10px] font-mono uppercase rounded-sm border border-line">{event.eventType}</span>
              <span className="px-2 py-1 bg-ink-3 text-bone-dim text-[10px] font-mono uppercase rounded-sm border border-line">{event.skillLevel}</span>
              {event.genderRestriction !== 'Any' && (
                <span className="px-2 py-1 bg-ink-3 text-bone-dim text-[10px] font-mono uppercase rounded-sm border border-line">{event.genderRestriction}</span>
              )}
            </div>
            <h1 className="font-display text-3xl md:text-5xl text-bone mb-2">{event.title}</h1>
            <p className="text-bone-dim">Organized by <span className="text-sienna">@{event.organizerName}</span> <span className="text-amber text-xs ml-2">★ 4.9 (Pro Host)</span></p>
          </div>
          
          <div className="flex gap-2">
            {!isRegistered && !isOrganizer && (
              <button 
                onClick={() => event.pricing.type === 'paid' ? setShowPaymentModal(true) : registerMutation.mutate()} 
                disabled={registerMutation.isPending}
                className="btn-primary py-3 px-6 shadow-xl"
              >
                {isWaitlist ? 'Join Waitlist' : event.pricing.type === 'paid' ? `Buy Ticket ($${event.pricing?.basePrice || 0})` : 'Register Free'}
              </button>
            )}
            
            {isRegistered && (
              <div className="flex gap-2">
                <button onClick={() => setShowQRModal(true)} className="btn-secondary border-sienna text-sienna hover:bg-sienna hover:text-bone py-3 px-6 inline-flex items-center gap-2">
                  <QrCode size={18} /> {myRegistration.status === 'waitlist' ? 'Waitlist Status' : 'View Ticket'}
                </button>
                <button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} className="btn-secondary py-3 px-4 border-line text-bone-dim hover:text-red-400 hover:border-red-400">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="font-display text-2xl mb-4">About this Event</h2>
            <p className="text-bone-dim whitespace-pre-wrap leading-relaxed">{event.description}</p>
          </section>

          {event.details?.requiredItems && event.details.requiredItems.length > 0 && (
            <section className="card p-6">
              <h2 className="font-display text-2xl mb-4">What to Bring</h2>
              <ul className="list-disc pl-5 text-bone-dim space-y-1">
                {event.details.requiredItems.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </section>
          )}
          
          <section className="card p-6">
            <h2 className="font-display text-2xl mb-4">Attendees ({event.stats.registeredCount} / {event.capacity})</h2>
            {registrations.length === 0 ? (
              <p className="text-sm text-bone-dim italic">No one has registered yet. Be the first!</p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {registrations.map(reg => (
                  <div key={reg.id} className="flex flex-col items-center gap-1 w-16">
                    <img src={getAvatarUrl(reg.userName, theme)} alt={reg.userName} className="w-10 h-10 rounded-full border border-line" />
                    <span className="text-[10px] text-bone-dim truncate w-full text-center" title={reg.userName}>{reg.userName}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <EventDiscussion eventId={eventId!} />
          <EventReviews eventId={eventId!} status={event.status} />
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <section className="card p-6 space-y-5">
            <div className="flex items-start gap-3">
              <CalendarIcon className="text-sienna mt-1" size={20} />
              <div>
                <h3 className="font-mono text-xs text-bone-dim mb-1 uppercase">Date & Time</h3>
                <p className="text-bone font-medium">{event.dateTime?.start?.toDate().toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                <p className="text-sm text-bone-dim">
                  {event.dateTime?.start?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {event.dateTime?.end?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
                <a href={formatGoogleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className="text-xs text-sienna hover:underline mt-2 inline-block">
                  + Add to Google Calendar
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="text-amber mt-1" size={20} />
              <div>
                <h3 className="font-mono text-xs text-bone-dim mb-1 uppercase">Location</h3>
                <p className="text-bone font-medium">{event.location.venueName}</p>
                {event.location.mapLink && (
                  <a href={event.location.mapLink} target="_blank" rel="noopener noreferrer" className="text-xs text-sienna hover:underline mt-1 inline-flex items-center gap-1">
                    <LinkIcon size={12} /> View Map
                  </a>
                )}
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Ticket className="text-bone-dim mt-1" size={20} />
              <div>
                <h3 className="font-mono text-xs text-bone-dim mb-1 uppercase">Admission</h3>
                <p className="text-bone font-medium">{event.pricing.type === 'free' ? 'Free Entry' : `$${event.pricing?.basePrice || 0} USD`}</p>
              </div>
            </div>
          </section>
          
          {isOrganizer && (
             <section className="card p-6 border-sienna/30">
               <h3 className="font-display text-lg mb-3">Organizer Tools</h3>
               <Link to={`/events/${eventId}/dashboard`} className="btn-secondary w-full justify-center">Manage Event Dashboard</Link>
             </section>
          )}
        </div>
      </div>

      {/* Simulated Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-ink rounded-[32px] p-8 max-w-sm w-full border border-line shadow-2xl text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-sienna/20 flex items-center justify-center text-sienna mb-4">
                <Ticket size={24} />
              </div>
              <h2 className="font-display text-2xl text-bone mb-2">Checkout</h2>
              <p className="text-sm text-bone-dim mb-6">Simulated payment for testing purposes. No real money will be charged.</p>
              
              <div className="bg-ink-2 p-4 rounded-lg mb-6 text-left border border-line/50">
                {event.pricing.tiers && event.pricing.tiers.length > 0 ? (
                  <div className="mb-4">
                    <label className="block text-xs font-mono text-bone-dim mb-2 uppercase">Select Ticket Tier</label>
                    <select 
                      className="input-field w-full"
                      value={selectedTier || ''}
                      onChange={e => setSelectedTier(e.target.value)}
                    >
                      <option value="" disabled>Select a tier</option>
                      {event.pricing.tiers.map(t => (
                        <option key={t.id} value={t.id}>{t.name} - ${t.price}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
                
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-bone-dim">Ticket</span>
                  <span className="text-bone font-medium">${(
                    event.pricing.tiers && selectedTier 
                      ? event.pricing.tiers.find(t => t.id === selectedTier)?.price || 0 
                      : event.pricing?.basePrice || 0
                  ).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-line/30 pt-2 font-bold">
                  <span className="text-bone">Total</span>
                  <span className="text-bone">${(
                    event.pricing.tiers && selectedTier 
                      ? event.pricing.tiers.find(t => t.id === selectedTier)?.price || 0 
                      : event.pricing?.basePrice || 0
                  ).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowPaymentModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={() => registerMutation.mutate()} disabled={registerMutation.isPending} className="btn-primary flex-1 bg-green-600 border-green-600 text-white hover:bg-green-700">
                  {registerMutation.isPending ? 'Processing...' : 'Pay Now'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Ticket Modal */}
      <AnimatePresence>
        {showQRModal && myRegistration && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/90 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white rounded-3xl overflow-hidden max-w-sm w-full shadow-2xl">
              <div className="bg-sienna p-6 text-center text-bone">
                <h2 className="font-display text-2xl mb-1 truncate">{event.title}</h2>
                <p className="text-xs opacity-80 uppercase tracking-widest">{event.dateTime?.start?.toDate().toLocaleDateString()}</p>
              </div>
              <div className="p-8 text-center text-ink flex flex-col items-center">
                <p className="text-sm text-ink-3 mb-6 font-mono uppercase">Ticket ID: {(myRegistration.id || '').slice(0, 8)}</p>
                <div className="bg-white p-4 rounded-xl shadow-inner border border-gray-100">
                  <QRCodeSVG value={myRegistration.id || ''} size={200} level="H" includeMargin={true} />
                </div>
                <p className="text-xs text-ink-3 mt-6 mb-8 max-w-[200px]">Show this QR code to the organizer at the venue for check-in. <br/><br/><strong>Tip:</strong> Take a screenshot to save this ticket to your camera roll.</p>
                <button onClick={() => setShowQRModal(false)} className="btn-secondary text-ink border-ink-3 hover:bg-ink-3 py-2 px-8 rounded-full">Close Ticket</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
