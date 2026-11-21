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
          ok: 'rgb(var(--nomos-ok) / <alpha-value>)',
          refuse: 'rgb(var(--nomos-refuse) / <alpha-value>)',
          'refuse-soft': 'rgb(var(--nomos-refuse) / 0.1)',
          pending: 'rgb(var(--nomos-pending) / <alpha-value>)',
          text: 'rgb(var(--nomos-text) / <alpha-value>)',
          muted: 'rgb(var(--nomos-muted) / <alpha-value>)',
          'muted-bright': 'rgb(var(--nomos-muted-bright) / <alpha-value>)',
          'on-accent': 'rgb(var(--nomos-on-accent) / <alpha-value>)',
          'on-ok': 'rgb(var(--nomos-on-ok) / <alpha-value>)',
        },
        // The landing page's own palette, defined on .landing in index.css.
        land: {
          ground: 'rgb(var(--l-ground) / <alpha-value>)',
          raised: 'rgb(var(--l-raised) / <alpha-value>)',
          ink: 'rgb(var(--l-ink) / <alpha-value>)',
          muted: 'rgb(var(--l-muted) / <alpha-value>)',
          pass: 'rgb(var(--l-pass) / <alpha-value>)',
          refuse: 'rgb(var(--l-refuse) / <alpha-value>)',
          rule: 'rgb(var(--l-rule) / <alpha-value>)',
          'rule-line': 'rgb(var(--l-rule-line) / <alpha-value>)',
          'on-pass': 'rgb(var(--l-on-pass) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Archivo', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        glow: 'none',
        'glow-sm': 'none',
        'glow-refuse': 'none',
        card: 'none',
        'card-hover': 'none',
        panel: '0 1px 0 rgb(var(--nomos-border) / 0.06)',
      },
      borderRadius: {
        pill: '8px',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config
