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
          'accent-soft': 'rgb(var(--nomos-accent) / 0.12)',
          'accent-glow': 'rgb(var(--nomos-accent) / 0.2)',
          refuse: 'rgb(var(--nomos-refuse) / <alpha-value>)',
          'refuse-soft': 'rgb(var(--nomos-refuse) / 0.1)',
          pending: 'rgb(var(--nomos-pending) / <alpha-value>)',
          text: 'rgb(var(--nomos-text) / <alpha-value>)',
          muted: 'rgb(var(--nomos-muted) / <alpha-value>)',
          'muted-bright': 'rgb(var(--nomos-muted-bright) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: 'none',
        'glow-sm': 'none',
        'glow-refuse': 'none',
        card: 'none',
        'card-hover': 'none',
        panel: '0 1px 0 rgb(var(--nomos-border) / 0.06)',
      },
      // Square, instrument-like corners everywhere. Existing rounded-* classes
      // collapse to hairline radii; rounded-full stays round for avatars.
      borderRadius: {
        sm: '1px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        '2xl': '3px',
        '3xl': '3px',
        pill: '2px',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config
