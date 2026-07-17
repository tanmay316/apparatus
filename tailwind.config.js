/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#090b12',
          2: '#111522',
          3: '#181c2a',
        },
        bone: {
          DEFAULT: '#F5F1E8',
          dim: '#A9A69D',
        },
        teal: {
          DEFAULT: '#4F9E8D',
          dim: '#3A756A',
          light: '#5FB09E',
        },
        amber: {
          DEFAULT: '#D29A36',
          light: '#D4993F',
        },
        line: '#1e2130',
        danger: '#B5504A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Oswald', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse-teal': 'pulseTeal 2s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'float': 'particleFloat 8s ease-in-out infinite',
        'float-delay': 'particleFloat 10s ease-in-out 2s infinite',
        'float-slow': 'particleFloat 12s ease-in-out 4s infinite',
        'counter-up': 'counterUp 0.6s ease-out',
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
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        particleFloat: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.3' },
          '25%': { transform: 'translate(30px, -20px) scale(1.1)', opacity: '0.6' },
          '50%': { transform: 'translate(-10px, -40px) scale(0.9)', opacity: '0.4' },
          '75%': { transform: 'translate(20px, -10px) scale(1.05)', opacity: '0.5' },
        },
        counterUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
