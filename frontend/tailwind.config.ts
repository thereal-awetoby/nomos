import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nomos: {
          bg: '#080810',
          'bg-deep': '#050508',
          surface: '#0f0f1a',
          'surface-raised': '#161625',
          border: 'rgba(255,255,255,0.06)',
          'border-bright': 'rgba(255,255,255,0.10)',
          accent: '#00e599',
          'accent-soft': 'rgba(0,229,153,0.15)',
          'accent-glow': 'rgba(0,229,153,0.25)',
          refuse: '#ff3b5c',
          'refuse-soft': 'rgba(255,59,92,0.12)',
          text: '#e8e8f0',
          muted: '#5c5c72',
          'muted-bright': '#8888a0',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(0,229,153,0.15), 0 0 60px rgba(0,229,153,0.05)',
        'glow-sm': '0 0 10px rgba(0,229,153,0.12)',
        'glow-refuse': '0 0 20px rgba(255,59,92,0.15)',
        card: '0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
      },
      borderRadius: {
        pill: '9999px',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config
