import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, Crown, Trophy, Award, Sparkles, Check, Shield } from 'lucide-react';
import { toCanvas } from 'html-to-image';
import appLogo from '@/assets/logo.png';
import type { EarnedCommunityBadge } from '@/types';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';

interface MedalShareModalProps {
  badge: EarnedCommunityBadge;
  onClose: () => void;
}

export function MedalShareModal({ badge, onClose }: MedalShareModalProps) {
  const { user, profile } = useAuthStore();
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'9/16' | '1/1'>('9/16');
  const [theme, setTheme] = useState<'dark-gold' | 'cyber-noir' | 'peach' | 'light-gold' | 'crimson'>('dark-gold');

  const rawPhoto = profile?.photoURL || user?.photoURL || '';
  const displayName = profile?.displayName || user?.displayName || 'Apparatus Athlete';

  const [avatarSrc, setAvatarSrc] = useState<string | null>(rawPhoto || null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!rawPhoto) {
      setAvatarSrc(null);
      return;
    }
    setAvatarSrc(rawPhoto);
    setImgError(false);

    // Attempt to convert image to Data URL via an offscreen Image element so html-to-image captures it cleanly
    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (!isMounted) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 64;
        canvas.height = img.naturalHeight || 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          setAvatarSrc(dataUrl);
          return;
        }
      } catch {
        // Tainted canvas fallback
      }
      setAvatarSrc(rawPhoto);
    };
    img.onerror = () => {
      if (!isMounted) return;
      // Direct URL fallback with referrerPolicy on the <img> tag
      setAvatarSrc(rawPhoto);
    };
    img.src = rawPhoto;

    return () => {
      isMounted = false;
    };
  }, [rawPhoto]);

  const isLight = theme === 'light-gold' || theme === 'peach';
  const tPrimary = isLight ? 'text-black' : 'text-white';
  const tSecondary = isLight ? 'text-black/70' : 'text-white/60';
  const tTertiary = isLight ? 'text-black/45' : 'text-white/40';
  const borderLight = isLight ? 'border-black/15' : 'border-white/10';

  const bgThemeClass =
    theme === 'dark-gold'
      ? 'bg-gradient-to-b from-[#1c1408] via-[#0d0a04] to-[#050402] border-amber-500/40'
      : theme === 'cyber-noir'
      ? 'bg-gradient-to-b from-[#18181b] via-[#09090b] to-[#000000] border-zinc-700'
      : theme === 'peach'
      ? 'bg-gradient-to-b from-[#ffcfc0] via-[#fca58c] to-[#f87171] border-[#f87171]'
      : theme === 'light-gold'
      ? 'bg-gradient-to-b from-[#fdfbf7] via-[#f7f2e9] to-[#efdfc2] border-amber-300'
      : 'bg-gradient-to-b from-[#2a0808] via-[#140202] to-[#050000] border-rose-500/40';

  const isGold = badge.rank === 1;
  const isSilver = badge.rank === 2;

  const medalConfig = isGold
    ? {
        title: 'GOLD CHAMPION',
        rankLabel: '1ST PLACE',
        icon: Crown,

        // High-gloss metallic gold palette
        outerGradient:
          'radial-gradient(circle at 50% 24%, #ffffff 0%, #fffde0 8%, #fef08a 18%, #facc15 32%, #eab308 50%, #ca8a04 68%, #854d0e 86%, #3a1a02 100%)',
        innerRimGradient:
          'radial-gradient(circle at 50% 26%, #ffffff 0%, #fff9c4 16%, #fde047 38%, #ca8a04 68%, #713f12 100%)',
        faceGradient:
          'radial-gradient(circle at 45% 26%, #282115 0%, #17120a 38%, #0a0704 72%, #020101 100%)',
        rankTextGradient:
          'linear-gradient(180deg, #ffffff 0%, #fffbeb 20%, #fde047 45%, #ca8a04 75%, #fef08a 100%)',

        glowColor: 'rgba(250, 204, 21, 0.60)',
        strongGlow: 'rgba(250, 204, 21, 0.32)',

        textColor: 'text-amber-200',
        accentBg: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
      }
    : isSilver
    ? {
        title: 'SILVER RUNNER-UP',
        rankLabel: '2ND PLACE',
        icon: Trophy,

        // High-gloss metallic silver palette
        outerGradient:
          'radial-gradient(circle at 50% 24%, #ffffff 0%, #f8fafc 12%, #f1f5f9 22%, #e2e8f0 36%, #cbd5e1 52%, #94a3b8 70%, #475569 88%, #0f172a 100%)',
        innerRimGradient:
          'radial-gradient(circle at 50% 26%, #ffffff 0%, #f8fafc 20%, #cbd5e1 45%, #64748b 72%, #1e293b 100%)',
        faceGradient:
          'radial-gradient(circle at 45% 26%, #1c2028 0%, #101319 38%, #07090d 72%, #020203 100%)',
        rankTextGradient:
          'linear-gradient(180deg, #ffffff 0%, #f8fafc 20%, #e2e8f0 45%, #94a3b8 75%, #ffffff 100%)',

        glowColor: 'rgba(226, 232, 240, 0.50)',
        strongGlow: 'rgba(226, 232, 240, 0.24)',

        textColor: 'text-slate-100',
        accentBg: 'bg-slate-300/15 text-slate-200 border-slate-300/40',
      }
    : {
        title: 'BRONZE PODIUM',
        rankLabel: '3RD PLACE',
        icon: Award,

        // High-gloss metallic bronze palette
        outerGradient:
          'radial-gradient(circle at 50% 24%, #ffffff 0%, #ffeedd 8%, #fed7aa 18%, #fb923c 34%, #ea580c 52%, #c2410c 70%, #7c2d12 88%, #2e0b02 100%)',
        innerRimGradient:
          'radial-gradient(circle at 50% 26%, #ffffff 0%, #ffedd5 18%, #f97316 45%, #9a3412 72%, #431407 100%)',
        faceGradient:
          'radial-gradient(circle at 45% 26%, #281912 0%, #170d08 38%, #0a0503 72%, #020101 100%)',
        rankTextGradient:
          'linear-gradient(180deg, #ffffff 0%, #ffedd5 20%, #fb923c 45%, #c2410c 75%, #ffedd5 100%)',

        glowColor: 'rgba(249, 115, 22, 0.60)',
        strongGlow: 'rgba(249, 115, 22, 0.32)',

        textColor: 'text-orange-200',
        accentBg: 'bg-orange-600/15 text-orange-300 border-orange-500/40',
      };

  const Icon = medalConfig.icon;

  const getCanvas = async () => {
    if (!cardRef.current) return null;

    // Get the background color from the card's computed style
    const bgColor = (() => {
      const t = theme;
      if (t === 'dark-gold') return '#0d0a04';
      if (t === 'cyber-noir') return '#09090b';
      if (t === 'peach') return '#fca58c';
      if (t === 'light-gold') return '#f7f2e9';
      if (t === 'crimson') return '#140202';
      return '#0d0a04';
    })();

    const raw = await toCanvas(cardRef.current, {
      pixelRatio: 2.5,
      cacheBust: false,
      backgroundColor: bgColor,
    });

    // Apply clipping to match the card's rounded-[32px] corners
    const radius = 32 * 2.5; // scaled by pixelRatio
    const final = document.createElement('canvas');
    final.width = raw.width;
    final.height = raw.height;
    const ctx = final.getContext('2d')!;

    // Create a rounded-rectangle clipping path
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(final.width - radius, 0);
    ctx.quadraticCurveTo(final.width, 0, final.width, radius);
    ctx.lineTo(final.width, final.height - radius);
    ctx.quadraticCurveTo(final.width, final.height, final.width - radius, final.height);
    ctx.lineTo(radius, final.height);
    ctx.quadraticCurveTo(0, final.height, 0, final.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(raw, 0, 0);
    return final;
  };

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      await new Promise(r => setTimeout(r, 60));
      const canvas = await getCanvas();
      if (!canvas) throw new Error('Failed to generate image canvas');

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Failed to generate image blob');

      const file = new File([blob], `apparatus_medal_${badge.rank}_${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${medalConfig.title} - ${badge.title}`,
          text: `I just won ${medalConfig.title} in "${badge.title}" on Apparatus Arena! 🏆`,
        });
      } else {
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `apparatus_medal_${badge.rank}_${Date.now()}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setDidCopy(true);
        setTimeout(() => setDidCopy(false), 2200);
        useUIStore.getState().showToast('Image downloaded! Share it on your socials.', 'success');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Failed to share card:', e);
        useUIStore.getState().showToast('Failed to share image. Try downloading directly.', 'error');
      }
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      await new Promise(r => setTimeout(r, 60));
      const canvas = await getCanvas();
      if (!canvas) throw new Error('Failed to render canvas');

      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `apparatus_medal_${badge.rank}_${Date.now()}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDidCopy(true);
      setTimeout(() => setDidCopy(false), 2200);
      useUIStore.getState().showToast('Medal card downloaded!', 'success');
    } catch (e) {
      console.error('Failed to download card:', e);
      useUIStore.getState().showToast('Failed to download image. Try again.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[990] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative my-auto flex flex-col items-center gap-3.5"
        >
          {/* Controls bar */}
          <div className="w-full flex items-center justify-between px-1 text-white">
            <div className="flex items-center gap-2.5 sm:gap-3.5">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setAspectRatio('9/16')}
                  className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-colors ${
                    aspectRatio === '9/16'
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  9:16 (Story)
                </button>
                <button
                  onClick={() => setAspectRatio('1/1')}
                  className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-colors ${
                    aspectRatio === '1/1'
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  1:1 (Square)
                </button>
              </div>

              {/* Separator / Gap */}
              <div className="w-[1px] h-4 bg-white/20 shrink-0" />

              {/* Theme color circles */}
              <div className="flex items-center gap-1.5 shrink-0">
                {(['dark-gold', 'cyber-noir', 'peach', 'light-gold', 'crimson'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`w-5 h-5 rounded-full border transition-transform shadow-sm ${
                      t === 'dark-gold'
                        ? 'bg-amber-950 border-amber-400'
                        : t === 'cyber-noir'
                        ? 'bg-zinc-900 border-zinc-400'
                        : t === 'peach'
                        ? 'bg-[#ff9e80] border-[#fca58c]'
                        : t === 'light-gold'
                        ? 'bg-amber-100 border-amber-500'
                        : 'bg-red-950 border-red-500'
                    } ${theme === t ? 'scale-125 ring-1 ring-white' : 'opacity-70 hover:opacity-100 border-white/20'}`}
                    title={t}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors ml-1 shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Shareable Card Canvas */}
          <div
            ref={cardRef}
            className={`overflow-hidden rounded-[32px] relative flex flex-col justify-between ${
              aspectRatio === '1/1' ? 'p-4 sm:p-5' : 'p-6 sm:p-7'
            } ${bgThemeClass} ${borderLight} shadow-2xl transition-all duration-300`}
            style={{
              width: aspectRatio === '9/16' ? '320px' : '400px',
              height: aspectRatio === '9/16' ? '568px' : '400px',
              minWidth: aspectRatio === '9/16' ? '320px' : '400px',
              minHeight: aspectRatio === '9/16' ? '568px' : '400px',
              aspectRatio: aspectRatio === '9/16' ? '9 / 16' : '1 / 1',
            }}
          >
            {/* Subtle background glow */}
            <div
              className="absolute -top-24 -left-24 w-72 h-72 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${medalConfig.glowColor} 0%, transparent 70%)`,
                filter: 'blur(40px)',
              }}
            />
            <div
              className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${medalConfig.glowColor} 0%, transparent 70%)`,
                filter: 'blur(50px)',
              }}
            />

            {/* Card Header */}
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img
                  src={appLogo}
                  alt="Apparatus"
                  className={`${aspectRatio === '1/1' ? 'h-5' : 'h-6'} w-auto object-contain shrink-0 drop-shadow-sm`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/logo.png';
                  }}
                />
                <span
                  className={`font-sans tracking-[0.28em] ${
                    aspectRatio === '1/1' ? 'text-xs' : 'text-[13px] sm:text-sm'
                  } font-light ${tPrimary} uppercase select-none`}
                  style={{ textShadow: '0 0 10px rgba(93,42,26,0.3)' }}
                >
                  ΛPPΛRΛTUS
                </span>
              </div>

              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${tTertiary} ${borderLight}`}
              >
                <Sparkles size={10} className="text-amber-500" />
                <span>{medalConfig.rankLabel}</span>
              </div>
            </div>

            {/* Center Medallion Hero */}
            <div className="relative z-10 flex flex-col items-center text-center my-auto">
              <div className={`relative ${aspectRatio === '1/1' ? 'mb-2' : 'mb-5'}`}>
                {/* Soft outer glow */}
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    inset: aspectRatio === '1/1' ? '-14px' : '-22px',
                    background: `radial-gradient(
                      circle,
                      ${medalConfig.strongGlow} 0%,
                      rgba(0,0,0,0) 70%
                    )`,
                    filter: aspectRatio === '1/1' ? 'blur(10px)' : 'blur(14px)',
                  }}
                />

                {/* =================================
                    THICK METALLIC OUTER MEDAL
                   ================================= */}
                <div
                  className={`
                    ${aspectRatio === '9/16' ? 'w-40 h-40' : 'w-28 h-28'}
                    relative rounded-full
                    flex items-center justify-center
                  `}
                  style={{
                    background: medalConfig.outerGradient,
                    boxShadow: `
                      0 0 16px ${medalConfig.glowColor},
                      0 0 40px ${medalConfig.glowColor},
                      0 14px 28px rgba(0,0,0,0.65),
                      inset 0 3px 6px rgba(255,255,255,0.75),
                      inset 0 -6px 12px rgba(0,0,0,0.65)
                    `,
                  }}
                >
                  {/* =================================
                      ANISOTROPIC METALLIC LIGHT SWEEP
                     ================================= */}
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      background: `
                        conic-gradient(
                          from 215deg at 50% 50%,
                          rgba(255,255,255,0.45) 0deg,
                          rgba(255,255,255,0) 40deg,
                          rgba(0,0,0,0.35) 85deg,
                          rgba(255,255,255,0) 130deg,
                          rgba(255,255,255,0.40) 175deg,
                          rgba(255,255,255,0.20) 220deg,
                          rgba(0,0,0,0.35) 265deg,
                          rgba(255,255,255,0) 310deg,
                          rgba(255,255,255,0.45) 360deg
                        )
                      `,
                      mixBlendMode: 'overlay',
                      opacity: 0.85,
                    }}
                  />

                  {/* =================================
                      BROAD METALLIC TOP HIGHLIGHT
                     ================================= */}
                  <div
                    className="absolute inset-[2px] rounded-full pointer-events-none"
                    style={{
                      background: `
                        radial-gradient(
                          circle at 50% 18%,
                          rgba(255,255,255,0.50) 0%,
                          rgba(255,255,255,0.18) 18%,
                          rgba(255,255,255,0) 44%
                        )
                      `,
                    }}
                  />

                  {/* =================================
                      SECONDARY METALLIC RIM
                     ================================= */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      inset: aspectRatio === '1/1' ? '5px' : '7px',
                      background: medalConfig.innerRimGradient,
                      boxShadow: `
                        inset 0 3px 5px rgba(255,255,255,0.48),
                        inset 0 -4px 8px rgba(0,0,0,0.65)
                      `,
                    }}
                  />

                  {/* =================================
                      DARK RECESSED GROOVE
                     ================================= */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      inset: aspectRatio === '1/1' ? '11px' : '15px',
                      background: `
                        radial-gradient(
                          circle at 50% 35%,
                          #1b1b1b 0%,
                          #0d0d0d 55%,
                          #020202 100%
                        )
                      `,
                      boxShadow: `
                        inset 0 3px 5px rgba(0,0,0,0.92),
                        inset 0 -1px 2px rgba(255,255,255,0.08)
                      `,
                    }}
                  />

                  {/* =================================
                      LARGE DARK METALLIC MEDAL FACE
                     ================================= */}
                  <div
                    className={`
                      absolute
                      ${aspectRatio === '9/16' ? 'inset-[25px]' : 'inset-[18px]'}
                      rounded-full
                      flex flex-col items-center justify-center
                      overflow-hidden
                      z-10
                    `}
                    style={{
                      background: medalConfig.faceGradient,
                      boxShadow: `
                        inset 0 4px 10px rgba(255,255,255,0.12),
                        inset 0 -8px 16px rgba(0,0,0,0.90),
                        0 2px 4px rgba(0,0,0,0.80)
                      `,
                    }}
                  >
                    {/* Face highlight */}
                    <div
                      className="absolute pointer-events-none rounded-full"
                      style={{
                        width: aspectRatio === '1/1' ? '50px' : '76px',
                        height: aspectRatio === '1/1' ? '50px' : '76px',
                        top: '-20px',
                        left: '-15px',
                        background:
                          'radial-gradient(circle, rgba(255,255,255,0.18), transparent 68%)',
                        filter: 'blur(5px)',
                      }}
                    />

                    {/* Subtle lower shadow */}
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        width: '80%',
                        height: '30%',
                        bottom: '-5%',
                        left: '10%',
                        background:
                          'radial-gradient(ellipse, rgba(0,0,0,0.65), transparent 72%)',
                        filter: 'blur(7px)',
                      }}
                    />

                    {/* Medal Icon */}
                    <Icon
                      size={aspectRatio === '1/1' ? 32 : 48}
                      strokeWidth={2.2}
                      className={`${medalConfig.textColor} relative z-10`}
                      style={{
                        filter: `
                          drop-shadow(0 2px 2px rgba(0,0,0,0.95))
                          drop-shadow(0 0 6px ${medalConfig.glowColor})
                        `,
                      }}
                    />

                    {/* Embossed Metallic Rank Text */}
                    <div
                      className={`
                        ${aspectRatio === '1/1' ? 'mt-0.5 text-[9px] tracking-[0.2em]' : 'mt-1 text-[11px] sm:text-xs tracking-[0.24em]'}
                        font-mono
                        font-black
                        relative
                        z-10
                        select-none
                        uppercase
                      `}
                      style={{
                        background: medalConfig.rankTextGradient,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        filter: `
                          drop-shadow(0 1px 1px rgba(0,0,0,0.95))
                          drop-shadow(0 0 5px ${medalConfig.glowColor})
                        `,
                      }}
                    >
                      RANK #{badge.rank}
                    </div>
                  </div>
                </div>
              </div>

              {/* Medal category title */}
              <div
                className={`
                  ${aspectRatio === '1/1' ? 'text-[9px] mb-0.5 tracking-[0.14em]' : 'text-[11px] mb-1 tracking-[0.18em]'}
                  font-mono
                  uppercase
                  font-black
                  ${medalConfig.textColor}
                `}
              >
                {medalConfig.title}
              </div>

              <h2
                className={`
                  font-display
                  ${aspectRatio === '1/1' ? 'text-sm sm:text-base line-clamp-1 max-w-[240px]' : 'text-xl leading-tight max-w-[260px] line-clamp-2'}
                  ${tPrimary}
                  font-bold
                  drop-shadow-md
                `}
              >
                {badge.title}
              </h2>

              {badge.description && (
                <p
                  className={`
                    ${aspectRatio === '1/1' ? 'text-[9px] mt-0.5 line-clamp-1 max-w-[240px]' : 'text-[11px] mt-2 line-clamp-2 max-w-[260px]'}
                    font-mono
                    ${tSecondary}
                  `}
                >
                  {badge.description}
                </p>
              )}
            </div>

            {/* Bottom Footer */}
            <div className={`relative z-10 ${aspectRatio === '1/1' ? 'pt-2' : 'pt-3'} border-t ${borderLight} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                {avatarSrc && !imgError ? (
                  <img
                    src={avatarSrc}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className={`${aspectRatio === '1/1' ? 'w-6 h-6' : 'w-7 h-7'} rounded-full object-cover border ${borderLight} shrink-0`}
                  />
                ) : (
                  <div className={`${aspectRatio === '1/1' ? 'w-6 h-6' : 'w-7 h-7'} rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/10 border ${borderLight} flex items-center justify-center font-bold text-xs ${tPrimary} shrink-0`}>
                    {(displayName || 'A')[0].toUpperCase()}
                  </div>
                )}
                <div className="text-left min-w-0">
                  <div className={`text-xs font-bold ${tPrimary} truncate max-w-[130px] leading-tight`}>
                    {displayName}
                  </div>
                  <div className={`text-[9px] font-mono ${tSecondary} flex items-center gap-1 leading-tight`}>
                    {badge.clanName ? (
                      <>
                        <Shield size={9} className="text-amber-500 shrink-0" /> <span className="truncate max-w-[90px]">{badge.clanName}</span>
                      </>
                    ) : badge.clanId ? (
                      <>
                        <Shield size={9} className="text-amber-500 shrink-0" /> Clan Challenge
                      </>
                    ) : (
                      <>Global Challenge</>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className={`text-[9px] font-mono ${tTertiary}`}>apparatus.fit</span>
              </div>
            </div>
          </div>

          {/* Action Buttons (Icon Only) */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              aria-label="Download Image"
              title="Download Image"
              className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95 shadow-md border border-white/10"
            >
              {didCopy ? <Check size={18} className="text-[#fca58c]" /> : <Download size={18} className="text-white" />}
            </button>
            <button
              onClick={handleShare}
              disabled={sharing}
              aria-label="Share Medal"
              title="Share Medal"
              className="w-12 h-12 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center transition-all hover:brightness-105 active:scale-95 shadow-lg shadow-amber-500/30"
            >
              <Share2 size={18} className="text-black stroke-[2.4]" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
