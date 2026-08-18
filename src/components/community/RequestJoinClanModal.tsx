import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Send, Loader2, ShieldCheck, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestToJoinClan } from '@/services/community';

interface RequestJoinClanModalProps {
  clanId: string;
  clanName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RequestJoinClanModal({
  clanId,
  clanName,
  isOpen,
  onClose,
}: RequestJoinClanModalProps) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in to join a clan');
      await requestToJoinClan(
        clanId,
        clanName,
        {
          uid: user.uid,
          displayName: user.displayName || 'Athlete',
          photoURL: user.photoURL || '',
        },
        message.trim()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userClanJoinRequest', clanId] });
      queryClient.invalidateQueries({ queryKey: ['isMemberOfClan', clanId] });
      showToast('Join request sent to clan leaders!', 'success');
      setMessage('');
      onClose();
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to send join request', 'error');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestMutation.mutate();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[700] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="bg-ink w-full max-w-md rounded-t-[32px] sm:rounded-[28px] relative z-10 flex flex-col shadow-2xl p-6 border-t sm:border border-line/20"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-line/20 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                  <Lock size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-bone">Request to Join</h3>
                  <p className="text-xs text-bone-dim line-clamp-1">{clanName}</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 bg-ink-2 rounded-full text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Explanation card */}
            <div className="p-3.5 rounded-2xl bg-ink-2 border border-line/20 mb-4 text-xs text-bone/85 leading-relaxed flex items-start gap-2.5">
              <ShieldCheck size={18} className="text-sienna shrink-0 mt-0.5" />
              <span>
                This is a private clan. Your request will be sent directly to the clan leadership with an optional message.
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono uppercase text-bone-dim mb-1.5 tracking-wider flex items-center gap-1.5">
                  <MessageSquare size={13} />
                  <span>Request Note (Optional)</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Introduce yourself or share your fitness goals (e.g. Training for a half marathon and looking for active teammates!)..."
                  rows={3}
                  maxLength={300}
                  className="w-full bg-ink-3 border border-line/25 rounded-2xl p-3.5 text-sm text-bone placeholder:text-bone-dim/40 resize-none focus:outline-none focus:border-sienna transition-colors leading-relaxed shadow-inner"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-bone-dim hover:text-bone transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={requestMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-sienna hover:bg-sienna/90 text-bg text-xs font-bold font-mono flex items-center gap-2 shadow-lg shadow-sienna/25 disabled:opacity-50 transition-all active:scale-95"
                >
                  {requestMutation.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  <span>Send Request</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
