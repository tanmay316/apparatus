import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Image as ImageIcon, X, Reply, Edit2, Trash2,
  Smile, CornerDownLeft, ChevronDown, Check, CheckCheck,
  Shield, Crown, Star, Lock, AlertCircle, Loader2, Sparkles
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import {
  subscribeClanMessages,
  sendClanMessage,
  editClanMessage,
  deleteClanMessage,
  toggleClanMessageReaction
} from '@/services/community';
import type { ClanMessage, ClanMessageReplyTo } from '@/types';

interface ClanDiscussionTabProps {
  clanId: string;
  clanName: string;
  isMember: boolean;
  userRole?: 'leader' | 'co_leader' | 'member';
  onJoinClan?: () => void;
}

const QUICK_EMOJIS = ['❤️', '👍', '🔥', '😂', '😮', '😢', '🙏', '👏'];

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
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to real-time clan messages
  useEffect(() => {
    if (!isMember || !clanId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeClanMessages(
      clanId,
      (newMsgs) => {
        setMessages(newMsgs);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load clan messages:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clanId, isMember]);

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
    inputRef.current?.focus();
  };

  const startEdit = (msg: ClanMessage) => {
    if (msg.isDeleted || msg.userId !== user?.uid) return;
    setReplyingTo(null);
    setEditingMessage(msg);
    setInputText(msg.text);
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

    const trimmedText = inputText.trim();
    if (!trimmedText && images.length === 0) return;

    // Handle Edit
    if (editingMessage && editingMessage.id) {
      try {
        await editClanMessage(editingMessage.id, trimmedText);
        cancelReplyOrEdit();
      } catch (err: any) {
        showToast(err?.message || 'Failed to update message', 'error');
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

    try {
      await sendClanMessage({
        clanId,
        userId: user.uid,
        userName: user.displayName || profile?.displayName || 'Clan Member',
        userPhoto: user.photoURL || profile?.photoURL || '',
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
      <div className="py-16 px-4 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-3xl bg-sienna/20 border border-sienna/40 flex items-center justify-center text-sienna mx-auto mb-4 shadow-lg shadow-sienna/10">
          <Lock size={30} />
        </div>
        <h3 className="font-display text-2xl text-bone mb-2">Members-Only Discussion</h3>
        <p className="text-sm text-bone-dim mb-6 leading-relaxed">
          The Clan Discussion & Group Chat is private to active members of <span className="font-semibold text-bone">{clanName}</span>. Join now to chat, discuss workouts, share tips, and coordinate with fellow athletes!
        </p>
        <button
          onClick={onJoinClan}
          className="px-8 py-3 rounded-2xl bg-sienna hover:bg-sienna/90 text-bg font-bold text-sm shadow-xl shadow-sienna/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Join {clanName}
        </button>
      </div>
    );
  }

  // Group messages by date
  let lastDateStr = '';

  return (
    <div className="flex flex-col h-[75vh] min-h-[500px] max-h-[850px] bg-ink rounded-[28px] border border-line/20 overflow-hidden shadow-2xl relative">
      {/* ─── CHAT HEADER ─── */}
      <div className="px-4 sm:px-6 py-3.5 bg-ink-2/90 border-b border-line/20 backdrop-blur-md flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sienna/20 border border-sienna/30 flex items-center justify-center text-sienna font-bold font-display shadow-inner">
            {clanName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-bone tracking-wide flex items-center gap-1.5">
              <span>{clanName} Discussion</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </h3>
            <p className="text-[11px] font-mono text-bone-dim">Group Chat & Live Community Forum</p>
          </div>
        </div>
      </div>

      {/* ─── MESSAGES CONTAINER ─── */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3 relative [scrollbar-width:thin]"
      >
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-bone-dim text-xs font-mono gap-2">
            <Loader2 size={24} className="animate-spin text-sienna" />
            <span>Loading discussion...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-bone-dim">
            <div className="w-14 h-14 rounded-full bg-ink-2 flex items-center justify-center text-sienna mb-3 border border-line/20">
              <Sparkles size={24} />
            </div>
            <h4 className="font-bold text-bone text-base mb-1">Welcome to the Clan Discussion!</h4>
            <p className="text-xs max-w-xs text-bone-dim leading-relaxed">
              Be the first to say hi, ask a question, share a victory, or coordinate a workout with your clan mates.
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

            const canManageMsg = isMe || userRole === 'leader' || userRole === 'co_leader' || isAdmin;
            const showReactionPicker = activeReactionMessageId === msg.id;

            return (
              <React.Fragment key={msg.id || idx}>
                {/* Date Separator Pill */}
                {showDateSeparator && (
                  <div className="flex justify-center my-3">
                    <span className="text-[10px] font-mono font-medium px-3 py-1 rounded-full bg-ink-2/90 text-bone-dim border border-line/20 shadow-sm">
                      {messageDateStr}
                    </span>
                  </div>
                )}

                {/* Message Row */}
                <div className={`flex items-end gap-2 group relative ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {/* Sender Avatar for incoming */}
                  {!isMe && (
                    <div className="w-8 h-8 rounded-full bg-ink-3 border border-line/30 flex items-center justify-center text-bone font-bold text-xs shrink-0 overflow-hidden mb-1">
                      {msg.userPhoto ? (
                        <img src={msg.userPhoto} alt={msg.userName} className="w-full h-full object-cover" />
                      ) : (
                        msg.userName?.charAt(0)?.toUpperCase() || 'M'
                      )}
                    </div>
                  )}

                  {/* Message Bubble Container */}
                  <div className={`max-w-[85%] sm:max-w-[70%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* Sender Name & Role on incoming */}
                    {!isMe && (
                      <div className="flex items-center gap-1.5 ml-2 mb-1">
                        <span className="text-xs font-bold text-sienna/90">{msg.userName}</span>
                        {isLeader && (
                          <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                            <Crown size={9} /> Leader
                          </span>
                        )}
                        {isCoLeader && (
                          <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-0.5">
                            <Star size={9} /> Co-Leader
                          </span>
                        )}
                        {isAdminMsg && (
                          <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                            <Shield size={9} /> Admin
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bubble Body */}
                    <div
                      className={`relative rounded-[22px] px-4 py-2.5 shadow-sm text-sm transition-all ${
                        isMe
                          ? 'bg-sienna text-bg rounded-br-sm'
                          : 'bg-ink-2 text-bone rounded-bl-sm border border-line/20'
                      } ${msg.isDeleted ? 'opacity-70 italic' : ''}`}
                    >
                      {/* Quoted Reply Preview (if replyTo exists) */}
                      {msg.replyTo && !msg.isDeleted && (
                        <div
                          className={`mb-2 p-2 rounded-xl text-xs border-l-4 transition-colors ${
                            isMe
                              ? 'bg-black/15 border-bg text-bg/90'
                              : 'bg-ink-3 border-sienna text-bone-dim'
                          }`}
                        >
                          <div className="font-bold flex items-center gap-1">
                            <Reply size={11} className="rotate-180" />
                            <span>{msg.replyTo.userName}</span>
                          </div>
                          <p className="truncate line-clamp-1 opacity-90">{msg.replyTo.text || 'Photo attachment'}</p>
                        </div>
                      )}

                      {/* Attached Images */}
                      {!msg.isDeleted && (msg.images?.length || msg.imageUrl) && (
                        <div className="mb-2 rounded-xl overflow-hidden gap-1 grid grid-cols-1 sm:grid-cols-2 max-w-xs">
                          {(msg.images || (msg.imageUrl ? [msg.imageUrl] : [])).map((img, i) => (
                            <div
                              key={i}
                              onClick={() => setLightboxImage(img)}
                              className="relative aspect-video sm:aspect-square bg-black/20 rounded-lg overflow-hidden cursor-pointer group/img"
                            >
                              <img src={img} alt="attachment" className="w-full h-full object-cover group-hover/img:scale-105 transition-transform" />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Message Text */}
                      <p className="whitespace-pre-wrap leading-relaxed break-words select-text">
                        {msg.text}
                      </p>

                      {/* Footer: Time + Edited badge + Status Checkmarks */}
                      <div
                        className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] font-mono ${
                          isMe ? 'text-bg/80' : 'text-bone-dim'
                        }`}
                      >
                        {msg.isEdited && !msg.isDeleted && <span>(edited)</span>}
                        <span>{formatMessageTime(msg.createdAt)}</span>
                        {isMe && <CheckCheck size={13} className="text-bg/90" />}
                      </div>

                      {/* Reaction Badges Bubble Corner */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="absolute -bottom-3 right-2 flex items-center gap-1 bg-ink-3 border border-line/30 rounded-full px-2 py-0.5 shadow-md">
                          {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleToggleReaction(msg.id!, emoji)}
                              className={`text-xs flex items-center gap-0.5 hover:scale-110 transition-transform ${
                                userIds.includes(user?.uid || '') ? 'font-bold scale-105' : 'opacity-80'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span className="text-[10px] font-mono text-bone-dim">{userIds.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick Hover / Action Bar */}
                    {!msg.isDeleted && (
                      <div
                        className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-1 px-1 ${
                          isMe ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {/* Reaction Trigger Button */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id!)
                            }
                            className="p-1 rounded-full text-bone-dim hover:text-bone hover:bg-ink-2 transition-colors"
                            title="React"
                          >
                            <Smile size={13} />
                          </button>

                          {/* WhatsApp Emoji Reaction Flyout */}
                          <AnimatePresence>
                            {showReactionPicker && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: -40 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="absolute bottom-full left-0 bg-ink-2 border border-line/30 rounded-full p-1.5 shadow-2xl flex items-center gap-1 z-50 backdrop-blur-md"
                              >
                                {QUICK_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => handleToggleReaction(msg.id!, emoji)}
                                    className="hover:scale-130 active:scale-95 transition-transform text-base p-1"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Reply Button */}
                        <button
                          type="button"
                          onClick={() => startReply(msg)}
                          className="p-1 rounded-full text-bone-dim hover:text-bone hover:bg-ink-2 transition-colors"
                          title="Reply"
                        >
                          <Reply size={13} className="rotate-180" />
                        </button>

                        {/* Edit Button (Author only) */}
                        {isMe && (
                          <button
                            type="button"
                            onClick={() => startEdit(msg)}
                            className="p-1 rounded-full text-bone-dim hover:text-bone hover:bg-ink-2 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}

                        {/* Delete Button (Author or Leader/Co-Leader/Admin) */}
                        {canManageMsg && (
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg)}
                            className="p-1 rounded-full text-bone-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
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
            className="absolute bottom-20 right-6 p-2.5 rounded-full bg-ink-2 text-bone border border-line/30 shadow-xl hover:bg-ink-3 transition-colors z-30"
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
            className="px-4 py-2.5 bg-ink-2 border-t border-line/20 flex items-center justify-between z-20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-sienna/20 text-sienna shrink-0">
                {editingMessage ? <Edit2 size={14} /> : <Reply size={14} className="rotate-180" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-sienna">
                  {editingMessage ? 'Editing Message' : `Replying to ${replyingTo?.userName}`}
                </div>
                <p className="text-[11px] text-bone-dim truncate line-clamp-1">
                  {editingMessage ? editingMessage.text : replyingTo?.text || 'Attached photo'}
                </p>
              </div>
            </div>

            <button
              onClick={cancelReplyOrEdit}
              className="p-1 rounded-full text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ATTACHED IMAGE PREVIEWS ─── */}
      {images.length > 0 && (
        <div className="px-4 py-2 bg-ink-2 border-t border-line/20 flex items-center gap-2 overflow-x-auto z-20">
          {images.map((img, idx) => (
            <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden bg-ink-3 border border-line/20 shrink-0">
              <img src={img} alt="attachment" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-white hover:bg-red-500 transition-colors"
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
        className="p-3 sm:p-4 bg-ink-2/95 border-t border-line/20 backdrop-blur-md flex items-end gap-2 z-20"
      >
        {/* Attachment Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={images.length >= 3 || isProcessingImage}
          className="p-2.5 rounded-2xl bg-ink-3 hover:bg-ink text-bone-dim hover:text-sienna border border-line/20 transition-colors disabled:opacity-50 shrink-0"
          title="Attach Image"
        >
          {isProcessingImage ? (
            <Loader2 size={18} className="animate-spin text-sienna" />
          ) : (
            <ImageIcon size={18} />
          )}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageSelect}
          accept="image/*"
          multiple
          className="hidden"
        />

        {/* Text Input */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={editingMessage ? 'Edit your message...' : 'Message the clan...'}
            rows={1}
            maxLength={1000}
            className="w-full bg-ink-3 border border-line/25 rounded-2xl px-4 py-2.5 text-sm text-bone placeholder:text-bone-dim/40 resize-none focus:outline-none focus:border-sienna/80 transition-colors leading-relaxed shadow-inner max-h-28"
          />
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={(!inputText.trim() && images.length === 0) || isProcessingImage}
          className="p-2.5 sm:px-4 sm:py-2.5 rounded-2xl bg-sienna hover:bg-sienna/90 text-bg font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-sienna/25 flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0"
          title="Send"
        >
          <Send size={16} />
          <span className="hidden sm:inline text-xs font-mono">Send</span>
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
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
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
