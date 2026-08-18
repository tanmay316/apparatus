import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, UserPlus, Check, Trash2, Shield, Loader2,
  Clock, MessageSquare, AlertCircle, CheckCircle2
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getClanJoinRequests,
  acceptClanJoinRequest,
  declineClanJoinRequest,
} from '@/services/community';
import type { ClanJoinRequest } from '@/types';

interface ClanJoinRequestsModalProps {
  clanId: string;
  clanName: string;
  isOpen: boolean;
  onClose: () => void;
}

function timeAgo(date: any): string {
  if (!date) return 'just now';
  const millis = typeof date?.toMillis === 'function'
    ? date.toMillis()
    : (date?.seconds ? date.seconds * 1000 : (date instanceof Date ? date.getTime() : 0));

  if (!millis) return 'just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - millis) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(millis).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ClanJoinRequestsModal({
  clanId,
  clanName,
  isOpen,
  onClose,
}: ClanJoinRequestsModalProps) {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['clanJoinRequests', clanId],
    queryFn: () => getClanJoinRequests(clanId),
    enabled: isOpen && !!clanId,
  });

  // Accept Mutation
  const acceptMutation = useMutation({
    mutationFn: async (req: ClanJoinRequest) => {
      if (!req.id) return;
      await acceptClanJoinRequest(req.id, clanId, clanName, {
        userId: req.userId,
        userName: req.userName,
        userPhoto: req.userPhoto || '',
      });
    },
    onSuccess: (_, req) => {
      queryClient.invalidateQueries({ queryKey: ['clanJoinRequests', clanId] });
      queryClient.invalidateQueries({ queryKey: ['clanMembers', clanId] });
      queryClient.invalidateQueries({ queryKey: ['clan', clanId] });
      showToast(`Accepted ${req.userName} into the clan!`, 'success');
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to accept request', 'error');
    }
  });

  // Decline Mutation
  const declineMutation = useMutation({
    mutationFn: async (req: ClanJoinRequest) => {
      if (!req.id) return;
      const ok = await confirm({
        title: 'Decline Request',
        message: `Decline join request from ${req.userName}?`,
        confirmText: 'Decline',
        cancelText: 'Cancel',
        type: 'danger',
        icon: 'trash',
      });
      if (!ok) return;

      await declineClanJoinRequest(req.id, clanId, clanName, req.userId);
      return true;
    },
    onSuccess: (didDecline) => {
      if (didDecline) {
        queryClient.invalidateQueries({ queryKey: ['clanJoinRequests', clanId] });
        showToast('Join request declined', 'info');
      }
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to decline request', 'error');
    }
  });

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
            className="bg-ink w-full max-w-lg rounded-t-[32px] sm:rounded-[28px] relative z-10 flex flex-col shadow-2xl p-5 sm:p-6 border-t sm:border border-line/20 max-h-[90vh] overflow-y-auto"
          >
            {/* Drag Handle */}
            <div className="w-12 h-1.5 bg-line/40 rounded-full mx-auto mb-3 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-line/20 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-bone flex items-center gap-2">
                    <span>Membership Requests</span>
                    {requests.length > 0 && (
                      <span className="text-xs font-mono font-normal bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
                        {requests.length}
                      </span>
                    )}
                  </h3>
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

            {/* List */}
            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-bone-dim text-xs font-mono gap-2">
                <Loader2 size={24} className="animate-spin text-sienna" />
                <span>Loading requests...</span>
              </div>
            ) : requests.length === 0 ? (
              <div className="py-12 px-4 text-center rounded-2xl bg-ink-2/40 border border-line/20 space-y-2.5">
                <div className="w-12 h-12 rounded-full bg-ink-3 mx-auto flex items-center justify-center text-bone-dim/60">
                  <CheckCircle2 size={24} className="text-emerald-400/80" />
                </div>
                <h4 className="text-sm font-bold text-bone">All Caught Up!</h4>
                <p className="text-xs text-bone-dim max-w-xs mx-auto">
                  There are no pending join requests for this clan right now.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl bg-ink-2 border border-line/20 flex flex-col gap-3 shadow-sm hover:border-line/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-ink-3 border border-line/30 flex items-center justify-center text-bone font-bold text-sm shrink-0 overflow-hidden">
                          {req.userPhoto ? (
                            <img src={req.userPhoto} alt={req.userName} className="w-full h-full object-cover" />
                          ) : (
                            req.userName?.charAt(0)?.toUpperCase() || 'A'
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-bone truncate">{req.userName}</h4>
                          <span className="text-[10px] font-mono text-bone-dim flex items-center gap-1">
                            <Clock size={11} /> {timeAgo(req.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => declineMutation.mutate(req)}
                          disabled={declineMutation.isPending || acceptMutation.isPending}
                          className="px-3 py-1.5 rounded-xl bg-ink-3 hover:bg-red-500/15 text-bone-dim hover:text-red-400 text-xs font-mono font-bold transition-all disabled:opacity-50"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => acceptMutation.mutate(req)}
                          disabled={declineMutation.isPending || acceptMutation.isPending}
                          className="px-4 py-1.5 rounded-xl bg-sienna hover:bg-sienna/90 text-bg text-xs font-mono font-bold flex items-center gap-1 shadow-md shadow-sienna/20 transition-all disabled:opacity-50 active:scale-95"
                        >
                          <Check size={14} />
                          <span>Accept</span>
                        </button>
                      </div>
                    </div>

                    {/* Optional Message */}
                    {req.message && (
                      <div className="p-3 rounded-xl bg-ink-3/80 border border-line/15 text-xs text-bone/90 leading-relaxed flex items-start gap-2">
                        <MessageSquare size={13} className="text-sienna shrink-0 mt-0.5" />
                        <span className="italic">"{req.message}"</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
