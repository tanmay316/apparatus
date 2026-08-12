import { getExerciseImageFilename } from '@/lib/exercise-visuals';
import { Dumbbell } from 'lucide-react';

interface Props {
  name: string;
  muscleGroup?: string;
  size?: number;
  className?: string;
}

// Statically import all exercise images.
// Vite will bundle these and return a map of path -> URL.
const images = import.meta.glob<{ default: string }>('@/assets/exercises/*.webp', { eager: true });

// Build a dictionary keyed by filename for fast lookup
const IMAGE_MAP: Record<string, string> = {};
for (const path in images) {
  // Extract filename from path (e.g. '/src/assets/exercises/squat-peak.webp' -> 'squat-peak.webp')
  const filename = path.split('/').pop() || '';
  if (filename) {
    IMAGE_MAP[filename] = images[path].default;
  }
}

export function ExerciseIllustration({ name, muscleGroup, size = 40, className = '' }: Props) {
  const filename = getExerciseImageFilename(name, muscleGroup);
  
  if (filename === 'default' || !IMAGE_MAP[filename]) {
    return (
      <div 
        className={`flex items-center justify-center text-sienna/60 bg-sienna/10 rounded-lg ${className}`}
        style={{ width: size, height: size }}
      >
        <Dumbbell size={Math.round(size * 0.55)} />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center shrink-0 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(82,43,28,0.08)] bg-[#d5f1fc] ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={IMAGE_MAP[filename]}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className="h-full w-full object-contain"
        style={{ mixBlendMode: 'darken' }}
        draggable={false}
        decoding="async"
      />
    </div>
  );
}
