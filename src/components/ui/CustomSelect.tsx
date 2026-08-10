import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  options,
  className = '',
  placeholder = 'Select...',
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`input-field w-full flex items-center justify-between text-left focus:ring-2 transition-all group ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className={selectedOption ? 'text-bone' : 'text-bone-dim/50'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown 
          size={16} 
          className={`text-bone-dim transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute z-[9999] w-full mt-2 rounded-2xl overflow-hidden bg-ink-2/95 backdrop-blur-xl border border-line/30 shadow-2xl origin-top"
          >
            <div className="max-h-[250px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-1">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-sans transition-colors ${
                      isSelected
                        ? 'bg-sienna/20 text-sienna font-semibold'
                        : 'text-bone hover:bg-white/5'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={16} className="text-sienna" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
