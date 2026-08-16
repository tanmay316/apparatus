import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface AnimatedHeartProps {
  isLiked: boolean;
  size?: number;
  className?: string;
}

export function AnimatedHeart({ isLiked, size = 15, className = '' }: AnimatedHeartProps) {
  return (
    <motion.div
      animate={isLiked ? { scale: [1, 1.3, 1] } : { scale: 1 }}
      transition={{ duration: 0.3, type: 'spring', stiffness: 300 }}
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      {isLiked && (
        <motion.div
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 rounded-full bg-red-500/30"
        />
      )}
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill={isLiked ? 'url(#heart-gradient)' : 'none'}
        stroke={isLiked ? 'none' : 'currentColor'}
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className={isLiked ? 'drop-shadow-sm' : ''}
        style={isLiked ? { filter: 'drop-shadow(0 3px 4px rgba(239, 68, 68, 0.4)) drop-shadow(0 1px 1px rgba(255, 255, 255, 0.3))' } : {}}
      >
        <defs>
          <linearGradient id="heart-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff7a7a" />
            <stop offset="50%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
        </defs>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
      {isLiked && (
        <motion.div
          initial={{ opacity: 0, x: -2, y: -2, scale: 0 }}
          animate={{ opacity: [0, 1, 0], x: 6, y: -8, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="absolute top-0 right-0 text-white"
        >
          <Sparkles size={size * 0.5} />
        </motion.div>
      )}
    </motion.div>
  );
}
