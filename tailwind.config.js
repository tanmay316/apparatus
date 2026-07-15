/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#ffffff', // Pure White Canvas
          2: '#f1f5f9',       // Fog Alt
          3: '#ebdafd',       // Lavender Field
        },
        bone: {
          DEFAULT: '#111827', // Midnight Ink
          dim: '#3f4654',     // Graphite
          slate: '#6b7589',   // Slate
        },
        teal: {
          DEFAULT: '#862fe7', // Voltage Violet
          dim: '#5f259e',     // Ultra Violet
          light: '#ad6df4',    // Lavender Mist
          wash: '#bd8ff0',    // Orchid Wash
        },
        amber: {
          DEFAULT: '#dc5f05', // Amber Pulse
          light: '#ff5fe4',   // Magenta Spark
          ray: '#e22ba4',     // Hot Pink Ray
          mint: '#d6fcf4',    // Mint Wash
        },
        line: '#d8e0ea',      // Mist (Subtle border)
        danger: '#e22ba4',    // Hot Pink Ray
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse-teal': 'pulseTeal 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-105%)' },
          '100%': { transform: 'translateX(0)' },
        },
        pulseTeal: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(79, 158, 141, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(79, 158, 141, 0)' },
        },
      },
    },
  },
  plugins: [],
};
