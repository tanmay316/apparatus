import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Bot, User, Sparkles, X, Camera, Paperclip, CheckCircle2, Brain, ChevronDown, ChevronUp, History, Plus, Trash2, MessageSquare, Square, Flame, ChefHat, CalendarDays, Scale, Copy, Check, RefreshCw, Dumbbell, TrendingUp, Utensils } from 'lucide-react';
import { sendChatMessage, analyzeFood, logMeal, getChatSessions, getChatSessionMessages, deleteChatSession, wakeUpServer, getNutritionImage, hasTrackableNutrition, ApiError, type FoodAnalyzeResponse, type ChatSessionItem } from '@/services/nutrition-api';
import { compressImageFile } from '@/utils/image-compression';
import { useUIStore } from '@/stores/ui-store';
import { useHasPro, useSubscriptionStore } from '@/stores/subscription-store';
import NutritionResultCard from './NutritionResultCard';
import CameraScanner from './CameraScanner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  timestamp: Date;
  isImage?: boolean;
  imageUrl?: string;
  /** Server-side photo, loaded lazily for past conversations. */
  imageId?: number;
  nutritionData?: FoodAnalyzeResponse;
  logged?: boolean;
  recipeData?: any;
  planData?: any;
}

interface NutritionChatProps {
  isOpen: boolean;
  onClose: () => void;
  /** Question from an "Ask AI" button; sent once in a new chat. */
  initialPrompt?: string | null;
  onPromptSent?: () => void;
}

function ReasoningCard({ reasoning }: { reasoning: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl overflow-hidden text-[12px]" style={{ background: 'var(--dx-card-2)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-3 py-2 font-semibold dx-muted"
      >
        <div className="flex items-center gap-1.5">
          <Brain size={14} />
          <span>Thought process</span>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-2 dx-muted text-[11.5px] leading-relaxed whitespace-pre-wrap border-t" style={{ borderColor: 'var(--dx-border)' }}>
          {reasoning}
        </div>
      )}
    </div>
  );
}

function HistoryImage({ imageId }: { imageId: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getNutritionImage(imageId)
      .then(img => { if (!cancelled && img?.base64_data) setSrc(`data:${img.mime_type || 'image/jpeg'};base64,${img.base64_data}`); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [imageId]);
  if (!src) return null;
  return (
    <div className="rounded-2xl overflow-hidden max-w-[220px] self-end" style={{ border: '1px solid var(--dx-border)' }}>
      <img src={src} alt="Uploaded food" className="w-full h-auto object-cover" />
    </div>
  );
}

const WELCOME = "Hey! I'm **Astra**, your nutrition and training coach.\n\nI can scan meals from a photo, estimate macros from a description, build recipes and meal plans, and review your strength, calisthenics and cardio sessions.\n\nFirst time? Tap **Body Metrics** (👤) up top, or just tell me your weight, height, age and goal.\n\n*Tip: add a note with food photos, like \"2 rotis, cooked in ghee\", for a far more accurate estimate.*";

/** Cold starts and gateway hiccups are worth retrying; real server errors are not. */
const isRetryable = (err: any) =>
  err instanceof ApiError ? [502, 503, 504].includes(err.status) : /failed to fetch|network|load failed/i.test(err?.message || '');

/** "2 of 3 free AI requests left today · Go Pro" for free users once billing is live. */
function FreeAllowanceHint({ kind }: { kind: 'ai_call' | 'food_scan' }) {
  const usage = useSubscriptionStore(s => s.usage[kind]);
  const hasPro = useHasPro();
  const openPaywall = useSubscriptionStore(s => s.openPaywall);
  if (hasPro || !usage) return null;
  const left = Math.max(0, usage.limit - usage.used);
  const noun = kind === 'food_scan' ? (left === 1 ? 'scan' : 'scans') : (left === 1 ? 'AI request' : 'AI requests');
  return (
    <div className="mb-1.5 px-2 flex items-center justify-between gap-2 text-[11.5px] dx-muted">
      <span className="tabular">{left} of {usage.limit} free {noun} left{usage.period === 'day' ? ' today' : usage.period === 'month' ? ' this month' : ''}</span>
      <button type="button" onClick={() => openPaywall()} className="font-semibold" style={{ color: 'var(--dx-accent)' }}>Go Pro</button>
    </div>
  );
}

export default function NutritionChat({ isOpen, onClose, initialPrompt, onPromptSent }: NutritionChatProps) {
  const showToast = useUIStore(s => s.showToast);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: WELCOME,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [previewImage, setPreviewImage] = useState<{ url: string; base64: string; mime: string } | null>(null);
  const [loggingMessageId, setLoggingMessageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // History Drawer State
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const askStarted = useRef(false);

  // Helper to safely get/set cache
  const getCachedData = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const setCachedData = (key: string, data: any) => {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
  };

  // Prefetch active session & history in background on mount for zero-delay UX
  useEffect(() => {
    wakeUpServer(); // Proactively wake up free-tier backend
    initChatSession();
  }, []);

  const initChatSession = async () => {
    // 1. INSTANT CACHE RESTORE
    const cachedSessions = getCachedData('apparatus_cached_sessions');
    if (cachedSessions && cachedSessions.length > 0) {
      setSessions(cachedSessions);
    }
    
    let targetSid: number | null = null;
    const savedSessionId = localStorage.getItem('apparatus_active_session_id');
    if (savedSessionId) {
      const sid = parseInt(savedSessionId, 10);
      if (!isNaN(sid)) {
        targetSid = sid;
        const cachedMsgs = getCachedData(`apparatus_cached_messages_${sid}`);
        if (cachedMsgs && cachedMsgs.length > 0) {
          setSessionId(sid);
          // Restore timestamps from string
          setMessages(cachedMsgs.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
        }
      }
    }

    // 2. BACKGROUND NETWORK FETCH
    setLoadingHistory(true);
    try {
      const data = await getChatSessions();
      setSessions(data);
      setCachedData('apparatus_cached_sessions', data);
      if (askStarted.current) return;

      if (!targetSid && data.length > 0) {
        targetSid = data[0].id;
      } else if (targetSid && !data.some(s => s.id === targetSid)) {
        targetSid = data.length > 0 ? data[0].id : null;
      }

      if (targetSid) {
        setSessionId(targetSid);
        localStorage.setItem('apparatus_active_session_id', String(targetSid));
        await loadSessionMessages(targetSid);
      }
    } catch (err) {
      console.error("Failed to fetch fresh chat sessions (might be auth delay)", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadSessions = async () => {
    try {
      const data = await getChatSessions();
      setSessions(data);
      setCachedData('apparatus_cached_sessions', data);
    } catch (err) {
      console.error("Failed to load chat sessions", err);
    }
  };

  const loadSessionMessages = async (sid: number) => {
    setLoading(true);
    try {
      const msgs = await getChatSessionMessages(sid);
      if (msgs && msgs.length > 0) {
        const formatted = msgs.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(),
          reasoning: m.metadata_?.reasoning,
          nutritionData: m.metadata_?.nutrition_data || undefined,
          logged: m.metadata_?.logged,
          isImage: !!m.metadata_?.is_image,
          imageId: typeof m.metadata_?.image_id === 'number' ? m.metadata_.image_id : undefined,
        }));
        setMessages(formatted);
        setCachedData(`apparatus_cached_messages_${sid}`, formatted);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to fetch fresh session messages", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSession = (sid: number) => {
    setSessionId(sid);
    localStorage.setItem('apparatus_active_session_id', String(sid));
    
    // Instant cache restore
    const cachedMsgs = getCachedData(`apparatus_cached_messages_${sid}`);
    if (cachedMsgs && cachedMsgs.length > 0) {
      setMessages(cachedMsgs.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
    } else {
      setMessages([]); // Clear current messages while loading
    }

    loadSessionMessages(sid);
    setShowHistory(false);
    setShowSuggestions(false);
  };

  const handleNewChat = () => {
    setSessionId(undefined);
    localStorage.removeItem('apparatus_active_session_id');
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: WELCOME,
        timestamp: new Date(),
      },
    ]);
    setShowHistory(false);
    setShowSuggestions(false);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sid: number) => {
    e.stopPropagation();
    try {
      await deleteChatSession(sid);
    } catch (err) {
      console.error("Failed to delete session on backend", err);
    } finally {
      setSessions(prev => prev.filter(s => s.id !== sid));
      if (sessionId === sid) {
        handleNewChat();
      }
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sync messages to local cache automatically when they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      setCachedData(`apparatus_cached_messages_${sessionId}`, messages);
    }
  }, [messages, sessionId]);

  useEffect(() => {
    if (isOpen && !previewImage) inputRef.current?.focus();
  }, [isOpen, previewImage]);

  useEffect(() => {
    if (!isOpen || !initialPrompt || loading) return;
    askStarted.current = true;
    handleNewChat();
    handleSend(initialPrompt, { fresh: true });
    onPromptSent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPrompt, loading]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      // Large gallery photos upload slowly and add nothing for recognition.
      const dataUrl = await compressImageFile(file, 1280, 1280, 0.78);
      const [header, base64] = dataUrl.split(',');
      const mime = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      setPreviewImage({ url: dataUrl, base64, mime });
    } catch {
      showToast('Could not read that image', 'error');
    }
  };

  const getMealType = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 16) return 'lunch';
    if (hour >= 16 && hour < 19) return 'snack';
    return 'dinner';
  };

  const handleLogMeal = async (msgId: string, nutritionData?: FoodAnalyzeResponse) => {
    if (!hasTrackableNutrition(nutritionData)) return;
    setLoggingMessageId(msgId);
    try {
      const mealType = getMealType();
      await logMeal(nutritionData, mealType, msgId, nutritionData!.image_id);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, logged: true } : m));
      window.dispatchEvent(new Event('refresh-nutrition'));
      showToast(`Added to ${mealType}`, 'success');
    } catch (err: any) {
      console.error("Failed to log meal", err);
      showToast(err?.message || 'Could not track this meal. Please try again.', 'error');
    } finally {
      setLoggingMessageId(null);
    }
  };

  const handleSend = async (overrideText?: string, opts: { fresh?: boolean } = {}) => {
    const text = (overrideText ?? input).trim();
    if ((!text && !previewImage) || loading) return;
    const activeSessionId = opts.fresh ? undefined : sessionId;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text || 'Scan this food',
      timestamp: new Date(),
      isImage: !!previewImage,
      imageUrl: previewImage?.url,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentPreview = previewImage;
    setPreviewImage(null);
    setShowSuggestions(false);

    const attemptRequest = async (retryCount = 0): Promise<void> => {
      try {
        if (currentPreview) {
          // Image Scan Flow
          const res = await analyzeFood(currentPreview.base64, currentPreview.mime, getMealType(), sessionId, controller.signal, text);
          if (res.status === 'ok') useSubscriptionStore.getState().bumpUsage('food_scan');
          
          if (res.session_id && res.session_id !== sessionId) {
            setSessionId(res.session_id);
            localStorage.setItem('apparatus_active_session_id', String(res.session_id));
            loadSessions();
          }

          const trackable = res.status !== 'not_food' && res.status !== 'failed' && hasTrackableNutrition(res);
          setMessages(prev => {
            const newMessages = [
              ...prev,
              {
                id: res.assistant_message_id || `ai-${Date.now()}`,
                role: 'assistant' as const,
                content: res.message || (trackable ? 'Here is the breakdown of your meal.' : "I couldn't analyze that photo. Please try again or describe the meal."),
                timestamp: new Date(),
                nutritionData: trackable ? res : undefined,
              },
            ];
            const activeSid = res.session_id || sessionId;
            if (activeSid) {
              setCachedData(`apparatus_cached_messages_${activeSid}`, newMessages);
            }
            return newMessages;
          });
        } else {
          // Text Chat Flow
          const res = await sendChatMessage(userMsg.content, activeSessionId, controller.signal);
          useSubscriptionStore.getState().bumpUsage('ai_call');
          if (res.session_id) {
            setSessionId(res.session_id);
            localStorage.setItem('apparatus_active_session_id', String(res.session_id));
          }
          loadSessions();
          if (res.profile_updated) window.dispatchEvent(new Event('refresh-nutrition'));
          
          setMessages(prev => {
            const newMessages = [
              ...prev,
              {
                id: res.message_id || `ai-${Date.now()}`,
                role: 'assistant' as const,
                content: res.response,
                reasoning: res.reasoning || undefined,
                nutritionData: hasTrackableNutrition(res.nutritionData) ? res.nutritionData! : undefined,
                timestamp: new Date(),
              },
            ];
            if (res.session_id) setCachedData(`apparatus_cached_messages_${res.session_id}`, newMessages);
            return newMessages;
          });
        }
        setIsWakingUp(false);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setIsWakingUp(false);
          setMessages(prev => [
            ...prev,
            {
              id: `sys-${Date.now()}`,
              role: 'assistant',
              content: "Request cancelled.",
              timestamp: new Date(),
            },
          ]);
        } else {
          // Only cold starts / gateway errors are retried (~60 s); a 500 means the request itself failed.
          if (isRetryable(err) && retryCount < 12) {
            setIsWakingUp(true);
            await new Promise(resolve => setTimeout(resolve, 5000));
            if (controller.signal.aborted) return;
            return attemptRequest(retryCount + 1);
          }

          setIsWakingUp(false);
          const status = err instanceof ApiError ? err.status : 0;
          const errMsg = (err.message || '').toLowerCase();
          let content = err instanceof ApiError && err.message ? err.message : "Something went wrong. Please try again.";

          if (status === 429) {
            content = err.message || "You're sending messages too quickly. Wait a moment and try again.";
          } else if (status === 401) {
            content = "Your session expired. Please sign in again.";
          } else if (!status && /failed to fetch|network|load failed/.test(errMsg)) {
            content = "Couldn't reach the coach. Check your connection and try again.";
          }

          setMessages(prev => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content,
              timestamp: new Date(),
            },
          ]);
        }
      }
    };

    try {
      await attemptRequest();
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch { /* clipboard unavailable */ }
  };

  /** Drops the last answer and re-asks the preceding question. */
  const handleRegenerate = () => {
    if (loading) return;
    const lastUser = [...messages].reverse().find(m => m.role === 'user' && !m.isImage);
    if (!lastUser) return;
    setMessages(prev => {
      const copy = [...prev];
      while (copy.length && copy[copy.length - 1].role === 'assistant') copy.pop();
      return copy;
    });
    handleSend(lastUser.content);
  };

  // Grouped starters. `send: true` fires immediately; otherwise the text is
  // placed in the input so the user can edit before sending.
  const quickActions = [
    {
      icon: Camera,
      label: 'Scan a meal',
      hint: 'Photo → macros',
      action: 'camera' as const,
    },
    {
      icon: Flame,
      label: "What should I eat next?",
      hint: 'Based on today',
      prompt: "Based on what I've eaten today, what should I eat next to hit my goals?",
      send: true,
    },
    {
      icon: ChefHat,
      label: 'High-protein recipe',
      hint: 'Quick & simple',
      prompt: 'Give me a high-protein recipe I can make in 20 minutes.',
      send: true,
    },
    {
      icon: CalendarDays,
      label: 'Plan my day',
      hint: 'Full meal plan',
      prompt: 'Generate a full day meal plan that hits my calorie and protein goals.',
      send: true,
    },
    {
      icon: Utensils,
      label: 'Log a meal by text',
      hint: 'Describe → macros',
      prompt: 'I just ate 2 rotis, a bowl of dal and some curd. Track it.',
    },
    {
      icon: TrendingUp,
      label: 'Review my training',
      hint: 'Last 2 weeks',
      prompt: 'Review my last 2 weeks of training and tell me what to improve.',
      send: true,
    },
    {
      icon: Dumbbell,
      label: 'Break a plateau',
      hint: 'Strength & skills',
      prompt: 'My bench press has stalled. Check my recent sessions and tell me how to progress.',
    },
    {
      icon: Scale,
      label: 'Compare two foods',
      hint: 'Side by side',
      prompt: 'Compare paneer vs chicken breast for muscle gain.',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          className="dx pro-scope fixed inset-0 h-[100dvh] z-[999] flex flex-col sm:inset-auto sm:bottom-24 sm:right-6 sm:w-[420px] sm:h-[640px] sm:max-h-[calc(100vh-120px)] sm:rounded-3xl overflow-hidden sm:shadow-[0_24px_64px_-24px_rgba(16,24,40,0.45)]"
          style={{ background: 'var(--dx-canvas)', border: '1px solid var(--dx-border)' }}
        >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] sm:pt-3 relative z-10 border-b" style={{ background: 'var(--dx-card)', borderColor: 'var(--dx-border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' }}>
            <Sparkles size={17} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight">Astra AI</h3>
            <div className="text-[11.5px] dx-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--dx-success)' }} />
              Nutrition & training coach
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={handleNewChat} title="New chat" className="dx-chip font-semibold h-9 px-3">
            <Plus size={14} /> New
          </button>
          <button
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadSessions(); }}
            title="Chat history"
            aria-pressed={showHistory}
            className="dx-icon-btn dx-icon-btn--sm"
            style={showHistory ? { background: 'var(--dx-accent)', color: 'var(--dx-on-accent)', borderColor: 'transparent' } : undefined}
          >
            <History size={16} />
          </button>
          <button onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close chat">
            <X size={17} />
          </button>
        </div>
      </div>

      {/* History Drawer Overlay */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b max-h-[320px] overflow-y-auto relative z-20 scrollbar-thin"
            style={{ background: 'var(--dx-card)', borderColor: 'var(--dx-border)' }}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="dx-eyebrow">Past conversations</span>
            </div>

            {loadingHistory ? (
              <div className="py-6 text-center text-[13px] dx-muted flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading history…
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-6 text-center text-[13px] dx-muted">
                No past conversations yet.
              </div>
            ) : (
              <div className="px-2 pb-2 space-y-0.5">
                {sessions.map(s => (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    className="group flex items-center justify-between gap-2 px-2.5 py-2.5 rounded-xl cursor-pointer text-[13px] transition-colors hover:bg-[var(--dx-card-2)]"
                    style={sessionId === s.id ? { background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)', fontWeight: 600 } : undefined}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MessageSquare size={15} className={sessionId === s.id ? '' : 'dx-muted'} />
                      <span className="truncate">{s.title || 'Chat session'}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="p-1.5 rounded-lg dx-muted hover:!text-red-500 transition-colors shrink-0"
                      title="Delete chat"
                      aria-label="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 scrollbar-thin relative z-10">
        {messages.map((msg, idx) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : ''}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' }}>
                <Sparkles size={13} />
              </div>
            )}

            <div className={`flex flex-col gap-2 min-w-0 ${msg.role === 'user' ? 'max-w-[82%] items-end' : 'max-w-[88%] flex-1'}`}>
              {/* Image Thumbnail (User) */}
              {msg.isImage && msg.imageUrl && (
                <div className="rounded-2xl overflow-hidden max-w-[220px] self-end" style={{ border: '1px solid var(--dx-border)' }}>
                  <img src={msg.imageUrl} alt="Uploaded food" className="w-full h-auto object-cover" />
                </div>
              )}
              {msg.isImage && !msg.imageUrl && msg.imageId && <HistoryImage imageId={msg.imageId} />}

              {/* Reasoning Block */}
              {msg.role === 'assistant' && msg.reasoning && (
                <ReasoningCard reasoning={msg.reasoning} />
              )}

              {/* Text Content */}
              {msg.content && (
                <div
                  className={`px-4 py-2.5 text-[14px] leading-relaxed ${msg.role === 'user' ? 'rounded-[20px] rounded-br-md self-end' : 'rounded-[20px] rounded-tl-md self-start'}`}
                  style={msg.role === 'user'
                    ? { background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' }
                    : { background: 'var(--dx-card)', border: '1px solid var(--dx-border)' }}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className="text-[14px] leading-relaxed [&>p]:mb-3 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:ml-5 [&>ul]:mb-3 [&>ol]:list-decimal [&>ol]:ml-5 [&>ol]:mb-3 [&>li]:mb-1 [&>h1]:font-semibold [&>h1]:mb-2 [&>h2]:font-semibold [&>h2]:mb-2 [&>h3]:font-semibold [&>h3]:mb-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:text-[13px] [&_table]:text-left [&_table]:border-collapse [&_table]:mb-3 [&_th]:border-b [&_th]:border-[var(--dx-border-strong)] [&_th]:pb-2 [&_th]:font-semibold [&_th]:min-w-[90px] [&_td]:py-2 [&_td]:border-b [&_td]:border-[var(--dx-border)]">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({node, ...props}) => (
                            <div className="w-full overflow-x-auto scrollbar-none pb-2 mb-3 max-w-full">
                              <table {...props} />
                            </div>
                          )
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}

              {/* Rich UI Cards (Assistant) */}
              {msg.nutritionData && hasTrackableNutrition(msg.nutritionData) && (
                <div className="w-full mt-1 self-start">
                  <NutritionResultCard result={msg.nutritionData} onClose={() => {}} />
                  <div className="mt-2.5 flex justify-end">
                    <button
                      onClick={() => handleLogMeal(msg.id, msg.nutritionData)}
                      disabled={msg.logged || loggingMessageId === msg.id}
                      className="dx-btn h-10 text-[13px]"
                      style={msg.logged ? { background: 'var(--dx-success-soft)', color: 'var(--dx-success)', opacity: 1 } : undefined}
                    >
                      {loggingMessageId === msg.id ? (
                        <><Loader2 size={15} className="animate-spin" /> Tracking…</>
                      ) : msg.logged ? (
                        <><CheckCircle2 size={15} /> Tracked</>
                      ) : (
                        <><Plus size={15} /> Track meal</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Assistant message actions */}
              {msg.role === 'assistant' && msg.id !== 'welcome' && !msg.nutritionData && msg.content && (
                <div className="flex items-center gap-0.5 self-start opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    title="Copy"
                    aria-label="Copy message"
                    className="p-1.5 rounded-lg dx-muted hover:bg-[var(--dx-card-2)] transition-colors"
                  >
                    {copiedId === msg.id ? <Check size={13} style={{ color: 'var(--dx-success)' }} /> : <Copy size={13} />}
                  </button>
                  {idx === messages.length - 1 && (
                    <button
                      onClick={handleRegenerate}
                      disabled={loading}
                      title="Regenerate response"
                      aria-label="Regenerate response"
                      className="p-1.5 rounded-lg dx-muted hover:bg-[var(--dx-card-2)] transition-colors disabled:opacity-40"
                    >
                      <RefreshCw size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {/* Loading Indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5"
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--dx-card-2)' }}>
              {isWakingUp ? <Loader2 size={13} className="animate-spin dx-accent" /> : <Bot size={13} className="dx-muted" />}
            </div>
            <div className={`rounded-[20px] rounded-tl-md px-4 py-3.5 self-start ${isWakingUp ? 'w-64' : ''}`} style={{ background: 'var(--dx-card)', border: '1px solid var(--dx-border)' }}>
              {!isWakingUp ? (
                <div className="flex items-center gap-1.5">
                  {[0, 0.2, 0.4].map(delay => (
                    <motion.div key={delay} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay }} className="w-2 h-2 rounded-full" style={{ background: 'var(--dx-muted)' }} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold">Waking up AI server…</span>
                  <span className="text-[12px] dx-muted leading-relaxed">This can take about 60 seconds on first use.</span>
                  <div className="w-full h-1.5 rounded-full overflow-hidden mt-1 relative" style={{ background: 'var(--dx-card-2)' }}>
                    <motion.div
                      className="absolute left-0 top-0 h-full rounded-full"
                      style={{ background: 'var(--dx-accent)' }}
                      initial={{ width: '0%' }}
                      animate={{ width: '95%' }}
                      transition={{ duration: 60, ease: "linear" }}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions (Collapsible Suggestions) */}
      {!previewImage && messages.length <= 2 && !loading && (
        <div className="px-3 pt-2 relative z-10">
          <button
            type="button"
            onClick={() => setShowSuggestions(prev => !prev)}
            aria-expanded={showSuggestions}
            className="w-full flex items-center justify-between h-9 px-3 rounded-xl text-[12px] font-semibold transition-colors"
            style={{ background: 'var(--dx-card)', border: '1px solid var(--dx-border)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={13} className="dx-accent" /> Try a suggestion
            </span>
            <ChevronDown size={15} className={`dx-muted transition-transform duration-200 ${showSuggestions ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showSuggestions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden pt-2"
              >
                <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-0.5 scrollbar-thin pb-1">
                  {quickActions.map((a, i) => {
                    const Icon = a.icon;
                    const isWide = i === quickActions.length - 1 && quickActions.length % 2 === 1;
                    return (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => {
                          setShowSuggestions(false);
                          if (a.action === 'camera') { setShowCamera(true); return; }
                          if (a.send) { handleSend(a.prompt); } else { setInput(a.prompt || ''); }
                        }}
                        className={`flex items-center gap-2.5 p-2.5 rounded-2xl text-left transition-colors active:scale-[0.98] hover:bg-[var(--dx-card-2)] ${isWide ? 'col-span-2' : ''}`}
                        style={{ background: 'var(--dx-card)', border: '1px solid var(--dx-border)' }}
                      >
                        <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-semibold leading-tight truncate">{a.label}</span>
                          <span className="block text-[11px] dx-muted mt-0.5 truncate">{a.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Input Area */}
      <div className="px-3 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-3 relative z-10">

        {/* Image Preview Area */}
        <AnimatePresence>
          {previewImage && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 10 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="relative rounded-2xl overflow-hidden max-w-[110px]"
              style={{ border: '1px solid var(--dx-border)' }}
            >
              <img src={previewImage.url} alt="Preview" className="w-full h-auto object-cover" />
              <button
                onClick={() => setPreviewImage(null)}
                aria-label="Remove image"
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black"
              >
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <FreeAllowanceHint kind={previewImage ? 'food_scan' : 'ai_call'} />

        <form
          onSubmit={e => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-1 rounded-[22px] p-1.5 transition-shadow w-full focus-within:shadow-[0_0_0_3px_var(--dx-accent-soft)]"
          style={{ background: 'var(--dx-card)', border: '1px solid var(--dx-border)' }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach photo"
            className="w-10 h-10 rounded-2xl dx-muted hover:bg-[var(--dx-card-2)] transition-colors shrink-0 flex items-center justify-center"
          >
            <Paperclip size={19} />
          </button>

          <button
            type="button"
            onClick={() => setShowCamera(true)}
            aria-label="Scan food with camera"
            className="w-10 h-10 rounded-2xl dx-muted hover:bg-[var(--dx-card-2)] transition-colors shrink-0 flex items-center justify-center"
          >
            <Camera size={19} />
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={previewImage ? "Add a note (e.g. 2 rotis)…" : "Message Astra…"}
            disabled={loading}
            className="flex-1 min-w-0 bg-transparent px-1.5 py-2.5 text-[15px] placeholder:text-[var(--dx-muted)] focus:outline-none"
          />

          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              aria-label="Stop generating"
              className="w-10 h-10 rounded-2xl active:scale-95 transition-transform shrink-0 flex items-center justify-center"
              style={{ background: 'var(--dx-card-2)', color: 'var(--dx-text)' }}
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && !previewImage}
              aria-label="Send message"
              className="w-10 h-10 rounded-2xl disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition-all shrink-0 flex items-center justify-center"
              style={{ background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' }}
            >
              <Send size={18} />
            </button>
          )}
        </form>
      </div>

      <AnimatePresence>
        {showCamera && (
          <CameraScanner
            isAnalyzing={false}
            onCapture={(base64, mimeType) => {
              setPreviewImage({ 
                url: `data:${mimeType};base64,${base64}`,
                base64, 
                mime: mimeType 
              });
              setShowCamera(false);
            }}
            onClose={() => setShowCamera(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )}
</AnimatePresence>
  );
}
