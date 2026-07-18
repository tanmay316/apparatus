import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLibraryExercises } from '@/services/library';
import type { LibraryExercise } from '@/types';
import { Search, ChevronDown } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelect?: (ex: LibraryExercise) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// ─── Fuzzy Search Helpers ─────────────────────────────────────
function levenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function fuzzyMatch(text: string, query: string): boolean {
  const target = text.toLowerCase();
  const search = query.toLowerCase().trim();
  if (target.includes(search)) return true;

  const queryTokens = search.split(/\s+/);
  const targetTokens = target.split(/\s+/);

  return queryTokens.every((qToken) => {
    return targetTokens.some((tToken) => {
      if (tToken.includes(qToken)) return true;
      if (qToken.length > 3) {
        const dist = levenshteinDistance(qToken, tToken);
        return dist <= 2; // Allow up to 2 character edits for longer tokens
      }
      return false;
    });
  });
}

export function ExerciseAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search or enter exercise...',
  className = '',
  disabled = false
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: library = [] } = useQuery({
    queryKey: ['exerciseLibrary'],
    queryFn: getLibraryExercises,
    staleTime: 1000 * 60 * 15, // Cache for 15 mins
  });

  // Filter based on input using exact and fuzzy matching
  const suggestions = library.filter((ex) => {
    if (!value.trim()) return false;
    if (ex.name.toLowerCase() === value.toLowerCase()) return false;

    const queryLower = value.toLowerCase();
    
    // 1. Direct matches
    if (ex.name.toLowerCase().includes(queryLower)) return true;
    if (ex.tags.some(t => t.toLowerCase().includes(queryLower))) return true;
    if (ex.muscleGroup.toLowerCase().includes(queryLower)) return true;

    // 2. Fuzzy matches
    return fuzzyMatch(ex.name, value) || ex.tags.some(t => fuzzyMatch(t, value));
  }).slice(0, 6);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectOption = (ex: LibraryExercise) => {
    onChange(ex.name);
    if (onSelect) {
      onSelect(ex);
    }
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          className="input-field w-full pr-8"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-bone-dim pointer-events-none">
          <ChevronDown size={14} />
        </div>
      </div>

      {isOpen && suggestions.length > 0 && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-ink-2 border border-line rounded-lg shadow-xl max-h-48 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {suggestions.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => handleSelectOption(ex)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-sienna hover:text-bone transition-colors flex flex-col"
            >
              <span className="font-bold">{ex.name}</span>
              <span className="text-[10px] text-bone-dim hover:text-ink/80 font-mono">
                {ex.muscleGroup} • {ex.equipment}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
