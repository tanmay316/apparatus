import React from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Pin, ChevronRight } from 'lucide-react';
import type { CommunityAnnouncement } from '@/types';

interface ClanAnnouncementBannerProps {
  announcement: CommunityAnnouncement;
  onClick: () => void;
}

export function ClanAnnouncementBanner({
  announcement,
  onClick,
}: ClanAnnouncementBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="w-full mb-4 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-sienna/15 to-amber-500/10 border border-amber-500/30 hover:border-amber-500/50 shadow-sm cursor-pointer transition-all group flex items-start gap-3 select-none"
    >
      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30 mt-0.5 group-hover:scale-105 transition-transform">
        <Megaphone size={16} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
            <Pin size={10} className="fill-current" /> Important Notice
          </span>
          <span className="text-[10px] font-mono text-bone-dim">by {announcement.authorName}</span>
        </div>

        <h4 className="text-xs sm:text-sm font-bold text-bone truncate group-hover:text-amber-300 transition-colors">
          {announcement.title || announcement.content}
        </h4>

        {announcement.title && announcement.content && (
          <p className="text-[11px] sm:text-xs text-bone-dim line-clamp-1 mt-0.5">
            {announcement.content}
          </p>
        )}
      </div>

      <div className="p-1 rounded-full text-bone-dim group-hover:text-bone group-hover:translate-x-0.5 transition-all self-center">
        <ChevronRight size={18} />
      </div>
    </motion.div>
  );
}
