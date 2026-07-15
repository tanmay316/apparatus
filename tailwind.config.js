/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#14151A',
          2: '#1B1D24',
          3: '#22242C',
        },
        bone: {
          DEFAULT: '#EDE9E0',
          dim: '#A9A69D',
        },
        teal: {
          DEFAULT: '#4F9E8D',
          dim: '#3A756A',
          light: '#5FB09E',
        },
        amber: {
          DEFAULT: '#C6862F',
          light: '#D4993F',
        },
        line: '#2A2C33',
        danger: '#B5504A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Oswald', 'sans-serif'],
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
