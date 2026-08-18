import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Shield, Users, MapPin, Crown, Star, ArrowRight,
  Search, Lock, Globe, Tag
} from 'lucide-react';
import type { ClanV2, ClanMembership } from '@/types';

interface ClanInfoModalProps {
  clan: ClanV2;
  members: ClanMembership[];
  isOpen: boolean;
  onClose: () => void;
  onViewClanPage: () => void;
}

export function ClanInfoModal({
  clan,
  members,
  isOpen,
  onClose,
  onViewClanPage,
}: ClanInfoModalProps) {
  const [memberSearch, setMemberSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'about' | 'members'>('about');

  if (!isOpen) return null;

  const filteredMembers = members.filter((m) => {
    const term = memberSearch.toLowerCase().trim();
    if (!term) return true;
    return (
      m.userName?.toLowerCase().includes(term) ||
      m.role?.toLowerCase().includes(term)
    );
  });

  // Sort members: Leader first, then Co-Leaders, then Members
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const roleWeight = (role?: string) => {
      if (role === 'leader') return 3;
      if (role === 'co_leader') return 2;
      return 1;
    };
    return roleWeight(b.role) - roleWeight(a.role);
  });

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
          className="relative w-full max-w-lg max-h-[85vh] bg-ink-2 border border-line/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10 text-bone"
        >
          {/* Header Banner */}
          <div className="relative h-32 sm:h-36 bg-ink-3 shrink-0 overflow-hidden">
            {clan.coverUrl ? (
              <img
                src={clan.coverUrl}
                alt={clan.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-bone-dim/40 bg-gradient-to-br from-ink-3 to-ink">
                <Shield size={48} />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-2 via-ink-2/40 to-transparent" />

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/80 text-bone transition-colors backdrop-blur-sm border border-white/10"
              title="Close"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* Category Tag */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase bg-sienna/90 text-bg px-2.5 py-0.5 rounded-full shadow-sm">
                {clan.category}
              </span>
              <span className="text-[10px] font-mono bg-black/60 text-bone-dim px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-1">
                {clan.visibility === 'closed' ? <Lock size={10} className="text-red-400" /> : clan.visibility === 'private' ? <Lock size={10} /> : <Globe size={10} />}
                <span>{clan.visibility === 'closed' ? 'Closed' : clan.visibility === 'private' ? 'Private' : 'Public'}</span>
              </span>
            </div>
          </div>

          {/* Clan Identity Header Info */}
          <div className="px-5 pt-2 pb-3 shrink-0 border-b border-line/20">
            <h2 className="font-display text-2xl sm:text-3xl text-bone leading-tight">
              {clan.name}
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-mono text-bone-dim">
              <span className="flex items-center gap-1 text-sienna font-semibold">
                <Users size={13} /> {clan.memberCount || members.length} Members
              </span>
              {clan.location?.city && (
                <span className="flex items-center gap-1">
                  <MapPin size={13} className="text-bone-dim" /> {clan.location.city}
                </span>
              )}
            </div>

            {/* Navigation Tabs (About / Members) */}
            <div className="flex gap-2 mt-4 bg-ink-3/60 p-1 rounded-2xl border border-line/20">
              <button
                onClick={() => setActiveTab('about')}
                className={`flex-1 py-1.5 rounded-xl font-mono text-xs font-bold transition-all ${
                  activeTab === 'about'
                    ? 'bg-sienna text-bg shadow-sm'
                    : 'text-bone-dim hover:text-bone'
                }`}
              >
                About Clan
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`flex-1 py-1.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'members'
                    ? 'bg-sienna text-bg shadow-sm'
                    : 'text-bone-dim hover:text-bone'
                }`}
              >
                <span>Members</span>
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full ${
                  activeTab === 'members' ? 'bg-bg/20 text-bg' : 'bg-ink-2 text-bone-dim'
                }`}>
                  {members.length}
                </span>
              </button>
            </div>
          </div>

          {/* Body Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 [scrollbar-width:thin]">
            {activeTab === 'about' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Description */}
                <div>
                  <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider text-bone-dim mb-1.5">
                    Description & Mission
                  </h4>
                  <p className="text-sm text-bone leading-relaxed whitespace-pre-wrap bg-ink-3/40 p-3.5 rounded-2xl border border-line/15">
                    {clan.description || 'No description provided for this clan.'}
                  </p>
                </div>

                {/* Tags */}
                {clan.tags && clan.tags.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider text-bone-dim mb-1.5 flex items-center gap-1">
                      <Tag size={12} /> Tags
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {clan.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-1 rounded-lg bg-ink-3 text-bone-dim text-xs font-mono border border-line/20"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'members' && (
              <div className="space-y-3 animate-in fade-in duration-200">
                {/* Member Search Bar */}
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim/60"
                  />
                  <input
                    id="clan-member-search"
                    name="clanMemberSearch"
                    type="text"
                    autoComplete="off"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search clan members..."
                    className="w-full bg-ink-3 border border-line/25 rounded-xl pl-9 pr-3 py-2 text-xs text-bone placeholder:text-bone-dim/50 focus:outline-none focus:border-sienna/70 transition-colors"
                  />
                </div>

                {/* Members List */}
                <div className="space-y-1.5 max-h-[35vh] overflow-y-auto pr-1">
                  {sortedMembers.length === 0 ? (
                    <div className="text-center py-8 text-xs font-mono text-bone-dim">
                      No members match your search.
                    </div>
                  ) : (
                    sortedMembers.map((m) => {
                      const isLeader = m.role === 'leader';
                      const isCoLeader = m.role === 'co_leader';

                      return (
                        <div
                          key={m.id || m.userId}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-ink-3/40 border border-line/10 hover:border-line/30 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-ink border border-line/30 overflow-hidden shrink-0 flex items-center justify-center font-bold text-xs text-sienna">
                              {m.userPhoto ? (
                                <img
                                  src={m.userPhoto}
                                  alt={m.userName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                m.userName?.charAt(0)?.toUpperCase() || 'M'
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-bone truncate">
                                {m.userName}
                              </div>
                            </div>
                          </div>

                          {/* Role Badge */}
                          <div className="shrink-0">
                            {isLeader && (
                              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                <Crown size={10} /> Leader
                              </span>
                            )}
                            {isCoLeader && (
                              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                                <Star size={10} /> Co-Leader
                              </span>
                            )}
                            {!isLeader && !isCoLeader && (
                              <span className="text-[10px] font-mono text-bone-dim bg-ink px-2 py-0.5 rounded-md border border-line/20">
                                Member
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Action Button */}
          <div className="p-4 bg-ink-3/80 border-t border-line/20 shrink-0 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="btn-secondary py-2.5 px-4 text-xs font-mono"
            >
              Back to Chat
            </button>

            <button
              onClick={() => {
                onClose();
                onViewClanPage();
              }}
              className="btn-primary py-2.5 px-5 text-xs font-bold flex items-center gap-1.5 shadow-md"
            >
              <span>View Clan Hub</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
