import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Megaphone, Pin, Plus, Edit2, Trash2, Shield,
  Send, Loader2, Calendar, Check, AlertCircle
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getClanAnnouncements,
  createClanAnnouncement,
  updateClanAnnouncement,
  deleteClanAnnouncement
} from '@/services/community';
import type { CommunityAnnouncement } from '@/types';

interface ClanAnnouncementsModalProps {
  clanId: string;
  clanName: string;
  canManage: boolean; // leader, co-leader, or admin
  userRole?: 'leader' | 'co_leader' | 'member';
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

export function ClanAnnouncementsModal({
  clanId,
  clanName,
  canManage,
  userRole,
  isOpen,
  onClose,
}: ClanAnnouncementsModalProps) {
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();

  const [isComposing, setIsComposing] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<CommunityAnnouncement | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(true);

  // Fetch announcements
  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['clanAnnouncements', clanId],
    queryFn: () => getClanAnnouncements(clanId),
    enabled: isOpen && !!clanId,
  });

  const startCreate = () => {
    setTitle('');
    setContent('');
    setIsPinned(true);
    setEditingAnnouncement(null);
    setIsComposing(true);
  };

  const startEdit = (ann: CommunityAnnouncement) => {
    setEditingAnnouncement(ann);
    setTitle(ann.title || '');
    setContent(ann.content || '');
    setIsPinned(Boolean(ann.isPinned));
    setIsComposing(true);
  };

  const cancelCompose = () => {
    setIsComposing(false);
    setEditingAnnouncement(null);
    setTitle('');
    setContent('');
  };

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in');
      if (!title.trim() && !content.trim()) throw new Error('Announcement cannot be empty');

      let roleLabel = 'member';
      if (isAdmin) roleLabel = 'admin';
      else if (userRole === 'leader') roleLabel = 'leader';
      else if (userRole === 'co_leader') roleLabel = 'co_leader';

      await createClanAnnouncement({
        communityId: clanId,
        clanId,
        authorId: user.uid,
        authorName: user.displayName || 'Leader',
        authorPhoto: user.photoURL || '',
        authorRole: roleLabel,
        title: title.trim(),
        content: content.trim(),
        isPinned,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clanAnnouncements', clanId] });
      showToast('Announcement posted successfully!', 'success');
      cancelCompose();
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to post announcement', 'error');
    }
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingAnnouncement?.id) throw new Error('Announcement ID missing');
      if (!title.trim() && !content.trim()) throw new Error('Announcement cannot be empty');

      await updateClanAnnouncement(editingAnnouncement.id, {
        title: title.trim(),
        content: content.trim(),
        isPinned,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clanAnnouncements', clanId] });
      showToast('Announcement updated!', 'success');
      cancelCompose();
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to update announcement', 'error');
    }
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (announcementId: string) => {
      const ok = await confirm({
        title: 'Delete Announcement',
        message: 'Are you sure you want to delete this announcement? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        type: 'danger',
        icon: 'trash',
      });
      if (!ok) return false;

      await deleteClanAnnouncement(announcementId);
      return true;
    },
    onSuccess: (didDelete) => {
      if (didDelete) {
        queryClient.invalidateQueries({ queryKey: ['clanAnnouncements', clanId] });
        showToast('Announcement deleted', 'info');
      }
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to delete announcement', 'error');
    }
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAnnouncement) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[650] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
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
            className="bg-ink w-full max-w-xl rounded-t-[32px] sm:rounded-[28px] relative z-10 flex flex-col shadow-2xl p-5 sm:p-6 border-t sm:border border-line/20 max-h-[92vh] overflow-y-auto"
          >
            {/* Drag Handle */}
            <div className="w-12 h-1.5 bg-line/40 rounded-full mx-auto mb-3 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-line/20 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sienna/20 border border-sienna/40 flex items-center justify-center text-sienna shadow-sm">
                  <Megaphone size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-bone tracking-wide flex items-center gap-2">
                    <span>Clan Announcements</span>
                    {announcements.length > 0 && (
                      <span className="text-xs font-mono font-normal bg-ink-3 px-2 py-0.5 rounded-full border border-line/20 text-bone-dim">
                        {announcements.length}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-bone-dim line-clamp-1">{clanName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canManage && !isComposing && (
                  <button
                    onClick={startCreate}
                    className="px-3.5 py-1.5 rounded-xl bg-sienna hover:bg-sienna/90 text-bg text-xs font-bold font-mono flex items-center gap-1.5 shadow-md shadow-sienna/20 transition-all active:scale-95"
                  >
                    <Plus size={14} />
                    <span>Announce</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 bg-ink-2 rounded-full text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Compose / Edit Announcement Form */}
            {isComposing && (
              <motion.form
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleSave}
                className="mb-5 bg-ink-2 border border-sienna/30 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3.5"
              >
                <div className="flex items-center justify-between pb-2 border-b border-line/20">
                  <span className="text-xs font-mono uppercase font-bold text-sienna flex items-center gap-1.5">
                    <Megaphone size={14} />
                    {editingAnnouncement ? 'Edit Announcement' : 'New Important Announcement'}
                  </span>
                  <button
                    type="button"
                    onClick={cancelCompose}
                    className="text-xs text-bone-dim hover:text-bone font-mono"
                  >
                    Cancel
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-bone-dim mb-1 tracking-wider">
                    Headline / Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g., Weekly Tournament Starts Today! 🏆"
                    maxLength={100}
                    className="w-full bg-ink-3 border border-line/25 rounded-xl px-4 py-2.5 text-sm text-bone placeholder:text-bone-dim/40 font-semibold focus:outline-none focus:border-sienna transition-colors shadow-inner"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-bone-dim mb-1 tracking-wider">
                    Message Details<span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Write your important update or notice for all clan members..."
                    rows={4}
                    className="w-full bg-ink-3 border border-line/25 rounded-xl p-3.5 text-sm text-bone placeholder:text-bone-dim/40 resize-none focus:outline-none focus:border-sienna transition-colors leading-relaxed shadow-inner"
                  />
                </div>

                {/* Pin to top toggle */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Pin size={14} className={isPinned ? 'text-amber-400' : 'text-bone-dim'} />
                    <span className="text-xs font-mono text-bone">Pin to top of Clan</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPinned}
                      onChange={e => setIsPinned(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5.5 bg-slate-300 dark:bg-ink-3 border border-line/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-line/40 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all after:shadow-sm peer-checked:bg-amber-500 peer-checked:border-amber-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/15">
                  <button
                    type="button"
                    onClick={cancelCompose}
                    className="px-4 py-2 text-xs font-bold text-bone-dim hover:text-bone transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={(!title.trim() && !content.trim()) || isSaving}
                    className="bg-sienna hover:bg-sienna/90 text-bg px-5 py-2 rounded-xl font-bold text-xs font-mono disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-sienna/20 transition-all active:scale-95"
                  >
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={13} />
                    )}
                    <span>{editingAnnouncement ? 'Save Changes' : 'Publish Notice'}</span>
                  </button>
                </div>
              </motion.form>
            )}

            {/* Announcements Feed List */}
            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-bone-dim text-xs font-mono gap-2">
                <Loader2 size={24} className="animate-spin text-sienna" />
                <span>Loading notices...</span>
              </div>
            ) : announcements.length === 0 ? (
              <div className="py-12 px-4 text-center rounded-2xl bg-ink-2/40 border border-line/20 space-y-3">
                <div className="w-12 h-12 rounded-full bg-ink-3 mx-auto flex items-center justify-center text-bone-dim/60">
                  <Megaphone size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-bone">No Announcements Yet</h3>
                  <p className="text-xs text-bone-dim mt-1 max-w-xs mx-auto">
                    {canManage
                      ? 'As a clan leader, click "Announce" above to broadcast important updates to your clan.'
                      : 'Leaders and co-leaders will post important notices and updates here.'}
                  </p>
                </div>
                {canManage && !isComposing && (
                  <button
                    onClick={startCreate}
                    className="mt-2 px-4 py-2 rounded-xl bg-sienna hover:bg-sienna/90 text-bg font-bold text-xs font-mono inline-flex items-center gap-1.5 shadow-md shadow-sienna/20"
                  >
                    <Plus size={14} />
                    <span>Create First Announcement</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3.5">
                {announcements.map((ann) => {
                  const canEditThis = canManage || user?.uid === ann.authorId;
                  const isLeaderAuthor = ann.authorRole === 'leader';
                  const isCoLeaderAuthor = ann.authorRole === 'co_leader';
                  const isAdminAuthor = ann.authorRole === 'admin';

                  return (
                    <motion.div
                      key={ann.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                        ann.isPinned
                          ? 'bg-amber-500/10 border-amber-500/35 shadow-sm'
                          : 'bg-ink-2 border-line/20'
                      }`}
                    >
                      {/* Author row & tags */}
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-ink-3 border border-line/30 flex items-center justify-center text-bone font-bold text-xs shrink-0 overflow-hidden">
                            {ann.authorPhoto ? (
                              <img src={ann.authorPhoto} alt={ann.authorName} className="w-full h-full object-cover" />
                            ) : (
                              ann.authorName?.charAt(0)?.toUpperCase() || 'L'
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-xs text-bone truncate">{ann.authorName}</span>
                              <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded border ${
                                isAdminAuthor
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                  : isLeaderAuthor
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                  : isCoLeaderAuthor
                                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                                  : 'bg-ink-3 text-bone-dim border-line/20'
                              }`}>
                                {isAdminAuthor ? 'Admin' : isLeaderAuthor ? 'Leader' : isCoLeaderAuthor ? 'Co-Leader' : 'Officer'}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-bone-dim">{timeAgo(ann.createdAt)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {ann.isPinned && (
                            <span className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                              <Pin size={10} className="fill-current" />
                              <span>Pinned</span>
                            </span>
                          )}

                          {canEditThis && (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => startEdit(ann)}
                                className="p-1.5 rounded-lg bg-ink-3 hover:bg-ink text-bone-dim hover:text-bone transition-colors text-xs"
                                title="Edit announcement"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => ann.id && deleteMutation.mutate(ann.id)}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors text-xs"
                                title="Delete announcement"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div>
                        {ann.title && (
                          <h3 className="text-sm font-bold text-bone leading-snug mb-1">
                            {ann.title}
                          </h3>
                        )}
                        <p className="text-xs sm:text-sm text-bone/90 whitespace-pre-wrap leading-relaxed">
                          {ann.content}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
