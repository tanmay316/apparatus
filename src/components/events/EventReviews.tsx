import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEventReviews, addEventReview } from '@/services/events';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import { Star } from 'lucide-react';

export function EventReviews({ eventId, status }: { eventId: string, status: string }) {
  const { user, profile } = useAuthStore();
  const { theme, showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['event_reviews', eventId],
    queryFn: () => getEventReviews(eventId)
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile || !reviewText.trim()) return;
      await addEventReview({
        eventId,
        userId: user.uid,
        userName: profile.displayName || profile.username || 'User',
        userPhoto: profile.photoURL || '',
        rating,
        review: reviewText.trim(),
        organizerReply: null
      });
    },
    onSuccess: () => {
      setReviewText('');
      setRating(5);
      queryClient.invalidateQueries({ queryKey: ['event_reviews', eventId] });
      showToast('Review submitted!');
    },
    onError: () => showToast('Failed to post review', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };
  
  const hasReviewed = reviews.some(r => r.userId === user?.uid);
  const canReview = status === 'completed' && user && !hasReviewed;

  return (
    <section className="card p-6">
      <h2 className="font-display text-2xl mb-4">Reviews & Ratings</h2>
      
      {canReview && (
        <form onSubmit={handleSubmit} className="mb-6 bg-ink-2 p-4 rounded-xl border border-line">
          <div className="flex items-center gap-2 mb-3">
            {[1,2,3,4,5].map(star => (
              <button 
                key={star} 
                type="button" 
                onClick={() => setRating(star)} 
                className={`transition-colors ${rating >= star ? 'text-amber' : 'text-bone-dim'}`}
              >
                <Star size={20} fill={rating >= star ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input 
              value={reviewText} 
              onChange={e => setReviewText(e.target.value)} 
              placeholder="Write your review..." 
              className="input-field flex-1"
            />
            <button type="submit" disabled={!reviewText.trim() || mutation.isPending} className="btn-primary py-2 px-4 shrink-0">
              Submit
            </button>
          </div>
        </form>
      )}
      
      {status !== 'completed' && <p className="text-sm text-bone-dim italic mb-4">Reviews will be available once the event is completed.</p>}

      {isLoading ? (
        <div className="text-center text-sm text-bone-dim py-4">Loading reviews...</div>
      ) : reviews.length === 0 ? (
        <div className="text-center text-sm text-bone-dim py-4 italic">No reviews yet.</div>
      ) : (
        <div className="space-y-4">
          {reviews.map(rev => (
            <div key={rev.id} className="flex gap-3">
              <img src={getAvatarUrl(rev.userName, theme)} alt={rev.userName} className="w-10 h-10 rounded-full shrink-0 border border-line" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{rev.userName}</span>
                  <div className="flex text-amber">
                    {[1,2,3,4,5].map(star => (
                      <Star key={star} size={12} fill={rev.rating >= star ? 'currentColor' : 'none'} />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-bone-dim">{rev.review}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
