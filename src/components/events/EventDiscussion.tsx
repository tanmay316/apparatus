import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEventMessages, addEventMessage } from '@/services/events';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';

export function EventDiscussion({ eventId }: { eventId: string }) {
  const { user, profile } = useAuthStore();
  const { theme, showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['event_messages', eventId],
    queryFn: () => getEventMessages(eventId)
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile || !message.trim()) return;
      await addEventMessage({
        eventId,
        userId: user.uid,
        userName: profile.displayName || profile.username || 'User',
        userPhoto: profile.photoURL || '',
        message: message.trim()
      });
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['event_messages', eventId] });
    },
    onError: () => showToast('Failed to post message', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <section className="card p-6">
      <h2 className="font-display text-2xl mb-4">Discussion Board</h2>
      
      {user && (
        <form onSubmit={handleSubmit} className="mb-6 flex gap-3">
          <img src={getAvatarUrl(profile?.displayName || 'U', theme)} alt="User" className="w-10 h-10 rounded-full shrink-0 border border-line" />
          <div className="flex-1 flex gap-2">
            <input 
              value={message} 
              onChange={e => setMessage(e.target.value)} 
              placeholder="Ask a question or make an announcement..." 
              className="input-field flex-1"
            />
            <button type="submit" disabled={!message.trim() || mutation.isPending} className="btn-primary py-2 px-4 shrink-0">
              Post
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-center text-sm text-bone-dim py-4">Loading messages...</div>
      ) : messages.length === 0 ? (
        <div className="text-center text-sm text-bone-dim py-4 italic">No messages yet. Be the first to start the discussion!</div>
      ) : (
        <div className="space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className="flex gap-3">
              <img src={getAvatarUrl(msg.userName, theme)} alt={msg.userName} className="w-10 h-10 rounded-full shrink-0 border border-line" />
              <div className="flex-1 bg-ink-2 p-3 rounded-2xl rounded-tl-none border border-line/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{msg.userName}</span>
                  <span className="text-[10px] font-mono text-bone-dim">{msg.createdAt?.toDate().toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-bone-dim whitespace-pre-wrap">{msg.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
