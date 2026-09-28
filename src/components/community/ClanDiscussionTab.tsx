import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Image as ImageIcon, X, Reply, Edit2, Trash2,
  Smile, CornerDownLeft, ChevronDown, Check, CheckCheck,
  Shield, Crown, Star, Lock, AlertCircle, Loader2, Sparkles, Plus
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import {
  subscribeClanMessages,
  sendClanMessage,
  editClanMessage,
  deleteClanMessage,
  toggleClanMessageReaction,
  markClanMessageRead
} from '@/services/community';
import type { ClanMessage, ClanMessageReplyTo } from '@/types';
import { LiveUserName, LiveUserAvatar } from '@/components/ui/LiveUser';
import { shareablePhotoURL } from '@/utils/image-compression';

interface ClanDiscussionTabProps {
  clanId: string;
  clanName: string;
  isMember: boolean;
  userRole?: 'leader' | 'co_leader' | 'member';
  onJoinClan?: () => void;
  joinLabel?: string;
  isJoining?: boolean;
  className?: string;
}

const QUICK_EMOJIS = ['❤️', '👍', '🔥', '😂', '😮', '😢', '🙏', '👏'];

const EXTENDED_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😂', '🤣', '🥹', '😊', '😇',
  '😍', '🥰', '😘', '😋', '😜', '🤪', '😎', '🥳', '🤩', '🤯',
  '😱', '🥵', '🥶', '😴', '🤠', '🥸', '🫡', '🤖', '👑', '💎',
  '👍', '👎', '👏', '🙌', '👐', '🤝', '👊', '✌️', '🤞', '🤘',
  '🤙', '🤌', '🙏', '💪', '🦾', '🥊', '🏋️', '🤸', '🏃', '🚴',
  '⚡', '💥', '🔥', '✨', '🌟', '🏆', '🥇', '🥈', '🥉', '🎯',
  '💯', '🚀', '🎉', '🎊', '🍕', '🥗', '☕', '🥤', '❤️', '🧡',
  '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💖', '💗', '💔'
];

// Client-side canvas compression for smartphone photos
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(event.target?.result as string);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.75;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length > 400 * 1024) {
          quality = 0.6;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function formatMessageTime(date: any): string {
  if (!date) return '';
  const millis = typeof date?.toMillis === 'function'
    ? date.toMillis()
    : (date?.seconds ? date.seconds * 1000 : (date instanceof Date ? date.getTime() : 0));
  if (!millis) return '';
  const d = new Date(millis);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatMessageDateSeparator(date: any): string {
  if (!date) return 'Today';
  const millis = typeof date?.toMillis === 'function'
    ? date.toMillis()
    : (date?.seconds ? date.seconds * 1000 : (date instanceof Date ? date.getTime() : 0));
  if (!millis) return 'Today';

  const d = new Date(millis);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function ClanDiscussionTab({
  clanId,
  clanName,
  isMember,
  userRole,
  onJoinClan,
  joinLabel,
  isJoining = false,
  className,
}: ClanDiscussionTabProps) {
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast, confirm } = useUIStore();

  const [messages, setMessages] = useState<ClanMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const [replyingTo, setReplyingTo] = useState<ClanMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ClanMessage | null>(null);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [emojiInputMessageId, setEmojiInputMessageId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isSending, setIsSending] = useState(false);
  // Touch devices have no hover: tapping a bubble reveals its actions.
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 112)}px`; // 112px is max-h-28
    }
  }, [inputText]);

  // Subscribe to real-time clan messages
  useEffect(() => {
    if (!isMember || !clanId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(false);
    const unsubscribe = subscribeClanMessages(
      clanId,
      (newMsgs) => {
        setMessages(newMsgs);
        setLoadError(false);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load clan messages:', err);
        setLoadError(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clanId, isMember, reloadKey]);

  // Mark incoming messages as read when viewed
  useEffect(() => {
    if (!user || messages.length === 0) return;
    
    const unreadMessages = messages.filter(m => 
      !m.isDeleted && 
      m.userId !== user.uid && 
      (!m.readBy || !m.readBy.includes(user.uid))
    );
    
    // Fire and forget read receipts
    unreadMessages.forEach(m => {
      if (m.id) markClanMessageRead(m.id, user.uid);
    });
  }, [messages, user]);

  // Scroll to bottom on initial load or new messages if near bottom
  useEffect(() => {
    if (!showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showScrollBottom]);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowScrollBottom(!isNearBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 3) {
      showToast('You can attach up to 3 images per message.', 'info');
      return;
    }

    setIsProcessingImage(true);
    try {
      const processed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 20 * 1024 * 1024) {
          showToast(`File ${file.name} is too large (>20MB).`, 'error');
          continue;
        }
        const compressed = await compressImage(file);
        processed.push(compressed);
      }
      setImages(prev => [...prev, ...processed].slice(0, 3));
    } catch {
      showToast('Failed to process image', 'error');
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const startReply = (msg: ClanMessage) => {
    if (msg.isDeleted) return;
    setEditingMessage(null);
    setReplyingTo(msg);
    setSelectedMessageId(null);
    inputRef.current?.focus();
  };

  const startEdit = (msg: ClanMessage) => {
    if (msg.isDeleted || msg.userId !== user?.uid) return;
    setReplyingTo(null);
    setEditingMessage(msg);
    setInputText(msg.text);
    setImages([]);
    setSelectedMessageId(null);
    inputRef.current?.focus();
  };

  const cancelReplyOrEdit = () => {
    setReplyingTo(null);
    setEditingMessage(null);
    setInputText('');
    setImages([]);
  };

  const handleDeleteMessage = async (msg: ClanMessage) => {
    const isAuthor = msg.userId === user?.uid;
    const canModerate = isAuthor || userRole === 'leader' || userRole === 'co_leader' || isAdmin;
    if (!canModerate || !msg.id) return;

    const confirmed = await confirm({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    try {
      await deleteClanMessage(msg.id);
      showToast('Message deleted', 'info');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete message', 'error');
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!user) {
      showToast('Please log in to react', 'info');
      return;
    }
    setActiveReactionMessageId(null);
    setEmojiInputMessageId(null);
    try {
      await toggleClanMessageReaction(messageId, emoji, user.uid);
    } catch (err: any) {
      showToast(err?.message || 'Failed to react', 'error');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) {
      showToast('Please log in to chat', 'info');
      return;
    }
    if (isSending) return;

    const trimmedText = inputText.trim();
    if (!trimmedText && images.length === 0) return;

    // Handle Edit
    if (editingMessage && editingMessage.id) {
      if (!trimmedText) {
        showToast('Message cannot be empty', 'info');
        return;
      }
      if (trimmedText === editingMessage.text) {
        cancelReplyOrEdit();
        return;
      }
      setIsSending(true);
      try {
        await editClanMessage(editingMessage.id, trimmedText);
        cancelReplyOrEdit();
      } catch (err: any) {
        showToast(err?.message || 'Failed to update message', 'error');
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Determine author role
    let role: 'leader' | 'co_leader' | 'admin' | 'member' = 'member';
    if (isAdmin) role = 'admin';
    else if (userRole === 'leader') role = 'leader';
    else if (userRole === 'co_leader') role = 'co_leader';

    let replyPayload: ClanMessageReplyTo | null = null;
    if (replyingTo && replyingTo.id) {
      replyPayload = {
        messageId: replyingTo.id,
        userId: replyingTo.userId,
        userName: replyingTo.userName,
        text: replyingTo.text?.slice(0, 100) || '',
        imageUrl: replyingTo.imageUrl || (replyingTo.images && replyingTo.images[0]) || undefined,
      };
    }

    setIsSending(true);
    try {
      await sendClanMessage({
        clanId,
        userId: user.uid,
        userName: user.displayName || profile?.displayName || 'Clan Member',
        userPhoto: shareablePhotoURL(user.photoURL, profile?.photoURL),
        userRole: role,
        text: trimmedText,
        imageUrl: images[0] || undefined,
        images: images.length > 0 ? images : undefined,
        replyTo: replyPayload,
      });

      setInputText('');
      setImages([]);
      setReplyingTo(null);
      setTimeout(() => scrollToBottom(), 50);
    } catch (err: any) {
      showToast(err?.message || 'Failed to send message', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Locked non-member screen
  if (!isMember) {
    return (
      <div className={`cx-chat-canvas flex-1 h-full flex items-center justify-center px-6 py-16 ${className || ''}`}>
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ink-2 text-bone-dim">
            <Lock size={22} />
          </div>
          <h3 className="text-base font-semibold text-bone">Members-only discussion</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-bone-dim">
            The group chat is private to members of <span className="font-medium text-bone">{clanName}</span>. Join to chat, share tips and plan workouts together.
          </p>
          {onJoinClan && (
            <button
              type="button"
              onClick={onJoinClan}
              disabled={isJoining}
              className="cx-btn bg-sienna mt-5 min-w-[140px]"
            >
              {isJoining && <Loader2 size={15} className="animate-spin" />}
              {isJoining ? 'Joining…' : (joinLabel || 'Join clan')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Group messages by date
  let lastDateStr = '';

  const closeOverlays = () => {
    setActiveReactionMessageId(null);
    setEmojiInputMessageId(null);
    setSelectedMessageId(null);
  };

  return (
    <div className={`flex flex-col flex-1 h-full min-h-0 cx-chat-canvas relative overflow-hidden ${className || ''}`}>
      {/* ─── MESSAGES CONTAINER ─── */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        onClick={closeOverlays}
        className="flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4 relative [scrollbar-width:thin] flex flex-col"
      >
        {loading ? (
          <div className="h-full flex items-center justify-center text-bone-dim">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : loadError && messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ink-2 text-bone-dim">
              <AlertCircle size={22} />
            </div>
            <h4 className="text-base font-semibold text-bone">Couldn't load messages</h4>
            <p className="mt-1.5 text-sm text-bone-dim max-w-xs">Check your connection and try again.</p>
            <button type="button" onClick={() => setReloadKey(k => k + 1)} className="cx-btn cx-btn-ghost mt-5">
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ink-2 text-bone-dim">
              <Sparkles size={22} />
            </div>
            <h4 className="text-base font-semibold text-bone">Start the conversation</h4>
            <p className="mt-1.5 text-sm max-w-xs text-bone-dim leading-relaxed">
              Say hi, share a win, or plan the next workout with your clan.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.userId === user?.uid;
            const messageDateStr = formatMessageDateSeparator(msg.createdAt);
            const showDateSeparator = messageDateStr !== lastDateStr;
            lastDateStr = messageDateStr;

            const isLeader = msg.userRole === 'leader';
            const isCoLeader = msg.userRole === 'co_leader';
            const isAdminMsg = msg.userRole === 'admin';

            const nextMsg = messages[idx + 1];
            const isNextSameAuthor = nextMsg && nextMsg.userId === msg.userId && formatMessageDateSeparator(nextMsg.createdAt) === messageDateStr;

            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const isPrevSameAuthor = prevMsg && prevMsg.userId === msg.userId && formatMessageDateSeparator(prevMsg.createdAt) === messageDateStr;

            const canManageMsg = isMe || userRole === 'leader' || userRole === 'co_leader' || isAdmin;
            const showReactionPicker = activeReactionMessageId === msg.id;
            const isSelected = selectedMessageId === msg.id;

            return (
              <React.Fragment key={msg.id || idx}>
                {/* Date Separator Pill */}
                {showDateSeparator && (
                  <div className="flex justify-center my-4">
                    <span className="text-[11px] font-medium px-3 py-1 rounded-full bg-ink-2 text-bone-dim border border-line">
                      {messageDateStr}
                    </span>
                  </div>
                )}

                {/* Message Row */}
                <div className={`flex items-start gap-2 group relative ${isMe ? 'justify-end' : 'justify-start'} ${isNextSameAuthor ? 'mb-0.5' : 'mb-3'}`}>
                  {!isMe && (
                    <div className={`w-7 h-7 shrink-0 ${!isPrevSameAuthor ? 'rounded-full bg-ink-3 border border-line overflow-hidden flex items-center justify-center text-bone font-semibold text-xs mt-0.5' : 'invisible'}`}>
                      {!isPrevSameAuthor && (
                        <LiveUserAvatar userId={msg.userId} fallbackName={msg.userName} fallbackPhoto={msg.userPhoto} className="w-full h-full object-cover rounded-full" />
                      )}
                    </div>
                  )}

                  {/* Message Bubble Container */}
                  <div className={`max-w-[85%] sm:max-w-[70%] flex flex-col relative ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* Floating WhatsApp Reaction Flyout Picker */}
                    <AnimatePresence>
                      {showReactionPicker && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.8, y: 10 }}
                          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                          className={`absolute -top-11 ${
                            isMe ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'
                          } bg-ink border border-line rounded-full px-1.5 py-1 shadow-lg flex items-center gap-0.5 z-50`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                handleToggleReaction(msg.id!, emoji);
                                setActiveReactionMessageId(null);
                                setEmojiInputMessageId(null);
                              }}
                              className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-ink-2 active:scale-95 transition-transform text-lg !shadow-none"
                              aria-label={`React ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                          {/* More Emojis '+' Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEmojiInputMessageId(emojiInputMessageId === msg.id ? null : msg.id!);
                            }}
                            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors !shadow-none ${
                              emojiInputMessageId === msg.id
                                ? 'bg-ink-3 text-bone'
                                : 'hover:bg-ink-2 text-bone-dim hover:text-bone'
                            }`}
                            aria-label="More reactions"
                          >
                            <Plus size={15} />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Extended Emoji Grid Popover Modal */}
                    <AnimatePresence>
                      {emojiInputMessageId === msg.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 10 }}
                          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                          className={`absolute -top-[235px] ${
                            isMe ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'
                          } w-72 max-w-[90vw] bg-ink border border-line rounded-2xl p-3 shadow-xl z-50 flex flex-col gap-2`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-line">
                            <span className="text-xs font-semibold text-bone">Add reaction</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEmojiInputMessageId(null);
                                setActiveReactionMessageId(null);
                              }}
                              className="p-1 rounded-full text-bone-dim hover:text-bone hover:bg-ink-2 transition-colors !shadow-none"
                              aria-label="Close"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          {/* Keyboard text input field to open native Android/iOS keyboard */}
                          <input
                            id={`emoji-reaction-search-${msg.id}`}
                            name={`emojiReactionSearch_${msg.id}`}
                            aria-label="Type or choose emoji"
                            autoComplete="off"
                            autoFocus
                            inputMode="text"
                            className="w-full bg-ink-2 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-sienna/60 text-bone border border-line placeholder:text-bone-dim/70"
                            placeholder="Type or paste an emoji"
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              if (val) {
                                const match = val.match(/\p{Extended_Pictographic}/u);
                                if (match) {
                                  handleToggleReaction(msg.id!, match[0]);
                                  setEmojiInputMessageId(null);
                                  setActiveReactionMessageId(null);
                                }
                              }
                            }}
                          />

                          {/* Scrollable curated emojis */}
                          <div className="grid grid-cols-7 gap-1 max-h-36 overflow-y-auto pr-0.5 custom-scrollbar py-1">
                            {EXTENDED_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  handleToggleReaction(msg.id!, emoji);
                                  setEmojiInputMessageId(null);
                                  setActiveReactionMessageId(null);
                                }}
                                className="w-8 h-8 rounded-lg hover:bg-ink-2 active:scale-95 flex items-center justify-center text-lg transition-transform !shadow-none"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Sender Name & Role on incoming */}
                    {!isMe && !isPrevSameAuthor && (
                      <div className="flex items-center gap-1.5 ml-1 mb-1">
                        <LiveUserName userId={msg.userId} fallbackName={msg.userName} className="text-xs font-semibold text-sienna" />
                        {isLeader && (
                          <span className="inline-flex items-center gap-0.5 h-4 px-1.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600">
                            <Crown size={9} /> Leader
                          </span>
                        )}
                        {isCoLeader && (
                          <span className="inline-flex items-center gap-0.5 h-4 px-1.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-600">
                            <Star size={9} /> Co-Leader
                          </span>
                        )}
                        {isAdminMsg && (
                          <span className="inline-flex items-center gap-0.5 h-4 px-1.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600">
                            <Shield size={9} /> Admin
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bubble Body */}
                    <motion.div
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.1}
                      dragDirectionLock
                      onDragEnd={(e: any, info: any) => {
                         if (info.offset.x > 50 || info.offset.x < -50) startReply(msg);
                      }}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (msg.isDeleted || !msg.id) return;
                        // Don't toggle while the user is selecting text
                        if (window.getSelection()?.toString()) return;
                        setActiveReactionMessageId(null);
                        setEmojiInputMessageId(null);
                        setSelectedMessageId(prev => (prev === msg.id ? null : msg.id!));
                      }}
                      className={`relative px-3 py-2 text-sm cursor-default ${
                        isMe
                          ? `cx-bubble-out ${!isPrevSameAuthor ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl'}`
                          : `cx-bubble-in ${!isPrevSameAuthor ? 'rounded-2xl rounded-tl-md' : 'rounded-2xl'}`
                      } ${isSelected ? 'ring-2 ring-sienna/30' : ''} ${msg.isDeleted ? 'opacity-70 italic' : ''}`}
                    >
                      {/* Quoted Reply Preview (if replyTo exists) */}
                      {msg.replyTo && !msg.isDeleted && (
                        <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg text-xs ${isMe ? 'cx-bubble-quote-out' : 'cx-bubble-quote-in'}`}>
                          <div className={`font-semibold flex items-center gap-1 ${isMe ? '' : 'text-sienna'}`}>
                            <Reply size={11} className="rotate-180" />
                            <span className="truncate">{msg.replyTo.userName}</span>
                          </div>
                          <p className="truncate text-[11px] mt-0.5 opacity-80">
                            {msg.replyTo.text || 'Photo'}
                          </p>
                        </div>
                      )}

                      {/* Attached Images */}
                      {!msg.isDeleted && (msg.images?.length || msg.imageUrl) && (
                        <div className="mb-2 rounded-xl overflow-hidden gap-1 grid grid-cols-1 sm:grid-cols-2 max-w-xs">
                          {(msg.images || (msg.imageUrl ? [msg.imageUrl] : [])).map((img, i) => (
                            <div
                              key={i}
                              onClick={(e) => { e.stopPropagation(); setLightboxImage(img); }}
                              className="relative aspect-video sm:aspect-square bg-black/20 rounded-lg overflow-hidden cursor-pointer"
                            >
                              <img src={img} alt="attachment" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Message Text */}
                      <p className="whitespace-pre-wrap leading-snug break-words select-text">
                        {msg.text}
                      </p>

                      {/* Footer: Time + Edited badge + Status Checkmarks */}
                      <div
                        className={`cx-bubble-meta flex items-center justify-end gap-1.5 mt-0.5 text-[10px] tabular-nums`}
                      >
                        {msg.isEdited && !msg.isDeleted && <span>Edited</span>}
                        <span>{formatMessageTime(msg.createdAt)}</span>
                        {isMe && (
                          msg.readBy && msg.readBy.length > 0
                            ? <CheckCheck size={13} className="text-sky-300" aria-label="Read" />
                            : <Check size={13} aria-label="Sent" />
                        )}
                      </div>
                    </motion.div>

                    {/* Reaction Badges Below Bubble */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={`flex flex-wrap items-center gap-1 mt-1 ${isMe ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
                        {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                          const iReacted = userIds.includes(user?.uid || '');
                          return (
                            <button
                              key={emoji}
                              type="button"
                              aria-pressed={iReacted}
                              onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg.id!, emoji); }}
                              className="cx-reaction active:scale-95 transition-transform"
                            >
                              <span>{emoji}</span>
                              <span className="tabular-nums">{userIds.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Quick Hover / Action Bar */}
                    {!msg.isDeleted && (
                      <div
                        className={`transition-opacity duration-150 flex items-center gap-0.5 mt-1 ${
                          showReactionPicker || isSelected
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-h-0 group-hover:max-h-8 focus-within:max-h-8 overflow-hidden group-hover:overflow-visible'
                        } ${isMe ? 'justify-end' : 'justify-start'}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Reaction Trigger Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id!);
                          }}
                          className={`w-7 h-7 inline-flex items-center justify-center rounded-full transition-colors !shadow-none ${
                            showReactionPicker
                              ? 'text-bone bg-ink-2'
                              : 'text-bone-dim hover:text-bone hover:bg-ink-2'
                          }`}
                          aria-label="React"
                          title="React"
                        >
                          <Smile size={14} />
                        </button>

                        {/* Reply Button */}
                        <button
                          type="button"
                          onClick={() => startReply(msg)}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-full text-bone-dim hover:text-bone hover:bg-ink-2 transition-colors !shadow-none"
                          aria-label="Reply"
                          title="Reply"
                        >
                          <Reply size={14} className="rotate-180" />
                        </button>

                        {/* Edit Button (Author only) */}
                        {isMe && (
                          <button
                            type="button"
                            onClick={() => startEdit(msg)}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-bone-dim hover:text-bone hover:bg-ink-2 transition-colors !shadow-none"
                            aria-label="Edit"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}

                        {/* Delete Button (Author or Leader/Co-Leader/Admin) */}
                        {canManageMsg && (
                          <button
                            type="button"
                            onClick={() => { setSelectedMessageId(null); handleDeleteMessage(msg); }}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-bone-dim hover:text-danger hover:bg-danger/10 transition-colors !shadow-none"
                            aria-label="Delete"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── FLOATING SCROLL TO BOTTOM BUTTON ─── */}
      <AnimatePresence>
        {showScrollBottom && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToBottom}
            aria-label="Scroll to latest"
            className="absolute bottom-24 right-4 w-10 h-10 inline-flex items-center justify-center rounded-full bg-ink text-bone border border-line shadow-lg hover:bg-ink-2 transition-colors z-30"
          >
            <ChevronDown size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── REPLYING TO / EDITING BANNER ─── */}
      <AnimatePresence>
        {(replyingTo || editingMessage) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="cx-composer px-4 py-2.5 flex items-center justify-between gap-3 z-20"
          >
            <div className="min-w-0 flex-1 border-l-[3px] border-sienna pl-3">
              <div className="text-xs font-semibold text-sienna flex items-center gap-1.5">
                {editingMessage ? <Edit2 size={12} /> : <Reply size={12} className="rotate-180" />}
                {editingMessage ? 'Editing message' : `Replying to ${replyingTo?.userName}`}
              </div>
              <p className="text-xs text-bone-dim truncate mt-0.5">
                {editingMessage ? editingMessage.text : replyingTo?.text || 'Photo'}
              </p>
            </div>

            <button
              type="button"
              onClick={cancelReplyOrEdit}
              aria-label="Cancel"
              className="w-8 h-8 inline-flex items-center justify-center rounded-full text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors shrink-0 !shadow-none"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ATTACHED IMAGE PREVIEWS ─── */}
      {images.length > 0 && (
        <div className="cx-composer px-4 py-2.5 flex items-center gap-2 overflow-x-auto z-20">
          {images.map((img, idx) => (
            <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden bg-ink-3 border border-line shrink-0">
              <img src={img} alt="attachment" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                aria-label="Remove image"
                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-white hover:bg-black transition-colors !shadow-none"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── CHAT INPUT BAR ─── */}
      <form
        onSubmit={handleSendMessage}
        className="cx-composer px-2 pt-2 sm:px-3 flex items-end gap-2 z-20 shrink-0"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Attachment Button (images can't be added while editing) */}
        {!editingMessage && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={images.length >= 3 || isProcessingImage || isSending}
            className="w-10 h-10 flex items-center justify-center rounded-full text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors disabled:opacity-40 shrink-0 !shadow-none"
            aria-label="Attach image"
            title="Attach image"
          >
            {isProcessingImage ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ImageIcon size={20} />
            )}
          </button>
        )}
        <input
          id="chat-image-upload"
          name="chat-image-upload"
          aria-label="Upload image"
          type="file"
          ref={fileInputRef}
          onChange={handleImageSelect}
          accept="image/*"
          multiple
          className="hidden"
        />

        {/* Text Input */}
        <div className="cx-composer-field flex-1 min-w-0 flex items-center">
          <label htmlFor="chat-message-input" className="sr-only">Message</label>
          <textarea
            id="chat-message-input"
            name="chat-message"
            aria-label="Message the clan"
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={editingMessage ? 'Edit your message' : 'Message'}
            rows={1}
            maxLength={1000}
            className="w-full bg-transparent px-4 py-2 min-h-[40px] text-sm text-bone placeholder:text-bone-dim/70 resize-none focus:outline-none leading-relaxed max-h-28 select-text [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          />
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={(!inputText.trim() && images.length === 0) || isProcessingImage || isSending}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-sienna disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0 !shadow-none"
          aria-label={editingMessage ? 'Save edit' : 'Send message'}
          title={editingMessage ? 'Save' : 'Send'}
        >
          {isSending ? <Loader2 size={16} className="animate-spin" /> : editingMessage ? <Check size={17} /> : <Send size={16} className="-ml-0.5" />}
        </button>
      </form>

      {/* ─── LIGHTBOX IMAGE MODAL ─── */}
      <AnimatePresence>
        {lightboxImage && (
          <div
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-[700] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Close image"
              className="absolute right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors !shadow-none"
              style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
            >
              <X size={24} />
            </button>
            <img
              src={lightboxImage}
              alt="fullscreen preview"
              className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
