import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Bot, User, Sparkles, X, Camera, Paperclip, CheckCircle2, Brain, ChevronDown, ChevronUp, History, Plus, Trash2, MessageSquare } from 'lucide-react';
import { sendChatMessage, analyzeFood, logMeal, getChatSessions, getChatSessionMessages, deleteChatSession, type FoodAnalyzeResponse, type ChatSessionItem } from '@/services/nutrition-api';
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
  nutritionData?: FoodAnalyzeResponse;
  logged?: boolean;
  recipeData?: any;
  planData?: any;
}

interface NutritionChatProps {
  isOpen: boolean;
  onClose: () => void;
}

function ReasoningCard({ reasoning }: { reasoning: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-2 rounded-2xl bg-sienna/10 border border-sienna/20 overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-sienna font-medium hover:bg-sienna/10 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Brain size={14} className="animate-pulse" />
          <span>Thought Process (Reasoning)</span>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 text-bone-dim text-[11px] font-mono leading-relaxed whitespace-pre-wrap border-t border-sienna/15 bg-black/20">
          {reasoning}
        </div>
      )}
    </div>
  );
}

export default function NutritionChat({ isOpen, onClose }: NutritionChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hey! 👋 I'm your AI nutrition assistant.\n\nAsk me anything, scan your food by uploading a photo, or tell me to generate a personalized recipe or meal plan!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [previewImage, setPreviewImage] = useState<{ url: string; base64: string; mime: string } | null>(null);
  const [loggingMessageId, setLoggingMessageId] = useState<string | null>(null);
  
  // History Drawer State
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
  };

  const handleNewChat = () => {
    setSessionId(undefined);
    localStorage.removeItem('apparatus_active_session_id');
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hey! 👋 I'm your AI nutrition assistant.\n\nAsk me anything, scan your food by uploading a photo, or tell me to generate a personalized recipe or meal plan!",
        timestamp: new Date(),
      },
    ]);
    setShowHistory(false);
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const mime = file.type || 'image/jpeg';
      setPreviewImage({ url: dataUrl, base64, mime });
    };
    reader.readAsDataURL(file);
  };

  const handleLogMeal = async (msgId: string, nutritionData?: FoodAnalyzeResponse) => {
    if (!nutritionData) return;
    setLoggingMessageId(msgId);
    try {
      await logMeal(nutritionData, 'snack');
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, logged: true } : m));
      window.dispatchEvent(new Event('refresh-nutrition'));
    } catch (err) {
      console.error("Failed to log meal", err);
    } finally {
      setLoggingMessageId(null);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !previewImage) || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim() || 'Scan this food',
      timestamp: new Date(),
      isImage: !!previewImage,
      imageUrl: previewImage?.url,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      if (previewImage) {
        // Image Scan Flow
        const currentPreview = previewImage;
        setPreviewImage(null);
        
        const res = await analyzeFood(currentPreview.base64, currentPreview.mime);
        
        setMessages(prev => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: res.success ? "Here's the analysis of your food:" : "I couldn't analyze that food. Please try again.",
            timestamp: new Date(),
            nutritionData: res.success ? res : undefined,
          },
        ]);
      } else {
        // Text Chat Flow
        const res = await sendChatMessage(userMsg.content, sessionId);
        setSessionId(res.session_id);
        localStorage.setItem('apparatus_active_session_id', String(res.session_id));
        loadSessions();
        
        setMessages(prev => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: res.response,
            reasoning: (res as any).reasoning,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${err.message}. Please check your API keys in Settings.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    "Scan a meal",
    "High-protein breakfast recipe",
    "Generate a daily meal plan",
    "Compare paneer vs chicken",
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed inset-0 h-[100dvh] z-[999] flex flex-col bg-ink sm:inset-auto sm:bottom-24 sm:right-6 sm:w-[420px] sm:h-[600px] sm:max-h-[calc(100vh-120px)] sm:rounded-3xl sm:border sm:border-line sm:shadow-2xl sm:shadow-black/60"
        >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-ink-2/90 backdrop-blur-xl border-b border-line/30 sm:rounded-t-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-sienna/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-sienna to-orange-500 p-[1px]">
            <div className="w-full h-full rounded-2xl bg-ink-2 flex items-center justify-center">
              <Sparkles size={18} className="text-sienna" />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-display font-semibold text-bone">AI Agent</h3>
            <div className="text-[10px] text-bone-dim flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              Ready to help
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 relative z-10">
          <button 
            onClick={handleNewChat} 
            title="New Chat"
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-bone border border-white/10 transition-all flex items-center gap-1 text-xs font-medium"
          >
            <Plus size={15} className="text-sienna" />
            <span>New</span>
          </button>
          <button 
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadSessions(); }} 
            title="Chat History"
            className={`p-2 rounded-xl transition-all border ${showHistory ? 'bg-sienna text-white border-sienna' : 'bg-white/[0.04] text-bone-dim hover:text-bone hover:bg-white/10 border-white/10'}`}
          >
            <History size={16} />
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors ml-1">
            <X size={18} className="text-bone-dim hover:text-bone" />
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
            className="bg-ink-2/95 border-b border-line/30 p-4 max-h-[300px] overflow-y-auto backdrop-blur-md relative z-20 scrollbar-thin shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
              <span className="text-xs font-semibold text-bone flex items-center gap-1.5">
                <History size={14} className="text-sienna" /> Past Conversations
              </span>
              <button
                onClick={handleNewChat}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-sienna text-white hover:bg-sienna/90 transition-all flex items-center gap-1 font-medium shadow-sm"
              >
                <Plus size={12} /> New Chat
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-6 text-center text-xs text-bone-dim flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin text-sienna" /> Loading history...
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-6 text-center text-xs text-bone-dim">
                No past chat history found.
              </div>
            ) : (
              <div className="space-y-1.5">
                {sessions.map(s => (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                      sessionId === s.id
                        ? 'bg-sienna/20 border border-sienna/40 text-white font-medium shadow-sm'
                        : 'bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-bone-dim hover:text-bone'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <MessageSquare size={14} className={sessionId === s.id ? 'text-sienna' : 'text-bone-dim'} />
                      <span className="truncate">{s.title || "Chat session"}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="p-1.5 rounded-lg opacity-80 group-hover:opacity-100 hover:bg-red-500/20 text-bone-dim hover:text-red-400 transition-all shrink-0"
                      title="Delete Chat"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 scrollbar-thin bg-gradient-to-b from-ink to-ink-2">
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i === messages.length - 1 ? 0 : 0 }}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 ${
              msg.role === 'user' ? 'bg-sienna/20 shadow-lg shadow-sienna/10' : 'bg-white/[0.04] border border-white/[0.08]'
            }`}>
              {msg.role === 'user'
                ? <User size={14} className="text-sienna" />
                : <Bot size={14} className="text-bone-dim" />
              }
            </div>
            
            <div className="max-w-[85%] flex flex-col gap-2">
              {/* Image Thumbnail (User) */}
              {msg.isImage && msg.imageUrl && (
                <div className="rounded-2xl overflow-hidden border border-white/10 max-w-xs self-end relative group">
                  <img src={msg.imageUrl} alt="Uploaded food" className="w-full h-auto object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-[10px] text-white/80 font-medium">Scanned Food</span>
                  </div>
                </div>
              )}
              
              {/* Reasoning Block */}
              {msg.role === 'assistant' && msg.reasoning && (
                <ReasoningCard reasoning={msg.reasoning} />
              )}

              {/* Text Content */}
              {msg.content && (
                <div className={`rounded-3xl px-4 py-3 text-[14px] leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-sienna/90 text-white rounded-tr-sm self-end'
                    : 'bg-white/[0.04] border border-white/[0.06] text-bone rounded-tl-sm self-start w-full sm:w-auto'
                }`}>
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className="text-[14px] leading-relaxed [&>p]:mb-3 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:ml-5 [&>ul]:mb-3 [&>ol]:list-decimal [&>ol]:ml-5 [&>ol]:mb-3 [&>li]:mb-1 [&>h1]:font-semibold [&>h1]:text-bone [&>h1]:mb-2 [&>h2]:font-semibold [&>h2]:text-bone [&>h2]:mb-2 [&>h3]:font-semibold [&>h3]:text-bone [&>h3]:mb-2 [&_strong]:text-bone [&_strong]:font-semibold [&>table]:w-full [&>table]:text-left [&>table]:border-collapse [&>table]:mb-3 [&_th]:border-b [&_th]:border-white/10 [&_th]:pb-2 [&_th]:font-semibold [&_td]:py-2 [&_td]:border-b [&_td]:border-white/5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}

              {/* Rich UI Cards (Assistant) */}
              {msg.nutritionData && (
                <div className="w-full mt-2 self-start animate-in slide-in-from-bottom-2 fade-in duration-300">
                  <NutritionResultCard result={msg.nutritionData} onClose={() => {}} />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => handleLogMeal(msg.id, msg.nutritionData)}
                      disabled={msg.logged || loggingMessageId === msg.id}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all shadow-sm ${
                        msg.logged 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                          : 'bg-sienna text-white hover:bg-sienna/90 shadow-[0_0_15px_rgba(200,121,65,0.3)]'
                      }`}
                    >
                      {loggingMessageId === msg.id ? (
                        <><Loader2 size={16} className="animate-spin" /> Tracking...</>
                      ) : msg.logged ? (
                        <><CheckCircle2 size={16} /> Tracked</>
                      ) : (
                        <>Track Meal</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {/* Loading Indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
              <Bot size={14} className="text-bone-dim" />
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-3xl rounded-tl-sm px-5 py-4 self-start">
              <div className="flex items-center gap-1.5">
                <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0 }} className="w-2 h-2 rounded-full bg-sienna" />
                <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0.2 }} className="w-2 h-2 rounded-full bg-sienna" />
                <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0.4 }} className="w-2 h-2 rounded-full bg-sienna" />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {!previewImage && messages.length <= 2 && (
        <div className="px-5 pb-3 flex flex-wrap gap-2 bg-ink-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => { setInput(s); }}
              className="text-[12px] px-3.5 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-bone-dim hover:text-bone hover:bg-white/[0.08] hover:border-white/10 transition-all active:scale-95"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 bg-ink-2 border-t border-line/30 sm:rounded-b-3xl">
        
        {/* Image Preview Area */}
        <AnimatePresence>
          {previewImage && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="relative rounded-2xl overflow-hidden border border-white/10 max-w-[120px]"
            >
              <img src={previewImage.url} alt="Preview" className="w-full h-auto object-cover" />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black"
              >
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={e => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-1 sm:gap-2 bg-white/[0.03] border border-white/[0.06] rounded-[24px] p-1.5 focus-within:border-sienna/50 focus-within:bg-white/[0.05] transition-colors w-full"
        >
          {/* Attachment Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-[16px] text-bone-dim hover:bg-white/10 hover:text-bone transition-colors shrink-0 flex items-center justify-center"
          >
            <Paperclip size={20} />
          </button>
          
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-[16px] text-bone-dim hover:bg-white/10 hover:text-sienna transition-colors shrink-0 flex items-center justify-center"
          >
            <Camera size={20} />
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
            placeholder={previewImage ? "Add a message..." : "Message AI Agent..."}
            disabled={loading}
            className="flex-1 min-w-0 bg-transparent px-2 py-2.5 text-[15px] text-bone placeholder-bone-dim focus:outline-none"
          />
          
          <button
            type="submit"
            disabled={(!input.trim() && !previewImage) || loading}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-[16px] bg-sienna text-white shadow-[0_0_15px_rgba(200,121,65,0.3)] disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed hover:bg-sienna/90 active:scale-95 transition-all shrink-0 flex items-center justify-center mr-0.5"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-1" />}
          </button>
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
