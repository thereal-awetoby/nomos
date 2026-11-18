import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nomos: {
          bg: 'rgb(var(--nomos-bg) / <alpha-value>)',
          'bg-deep': 'rgb(var(--nomos-bg-deep) / <alpha-value>)',
          surface: 'rgb(var(--nomos-surface) / <alpha-value>)',
          'surface-raised': 'rgb(var(--nomos-surface-raised) / <alpha-value>)',
          border: 'rgb(var(--nomos-border) / <alpha-value>)',
          'border-bright': 'rgb(var(--nomos-border-bright) / <alpha-value>)',
          accent: 'rgb(var(--nomos-accent) / <alpha-value>)',
          'accent-soft': 'rgb(var(--nomos-accent) / 0.15)',
          'accent-glow': 'rgb(var(--nomos-accent) / 0.25)',
          refuse: 'rgb(var(--nomos-refuse) / <alpha-value>)',
          'refuse-soft': 'rgb(var(--nomos-refuse) / 0.12)',
          text: 'rgb(var(--nomos-text) / <alpha-value>)',
          muted: 'rgb(var(--nomos-muted) / <alpha-value>)',
          'muted-bright': 'rgb(var(--nomos-muted-bright) / <alpha-value>)',
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
