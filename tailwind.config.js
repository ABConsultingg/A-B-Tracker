/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy — keep, still referenced in existing code
        navy: { DEFAULT: '#1a2b4a', light: '#2d4a7c' },
        gold: { DEFAULT: '#d99e2b', soft: 'rgba(217,158,43,0.12)' },

        // New brand tokens (Batch 9 — prototype match)
        'brand-navy':        '#0f1b34',
        'brand-accent':      '#d99e2b',
        'brand-accent-soft': '#fdf6e8',
        'bg-app':            '#f8f9fb',
        'bg-elevated':       '#ffffff',
        'bg-sunken':         '#eef1f5',
        'bg-hover':          '#e7ebf1',
        'border-default':    '#dde2eb',
        'border-strong':     '#c5cdd9',
        'text-muted':        '#5a6577',
        'text-faint':        '#94a0b3',
        'sem-green':         '#15803d',
        'sem-green-soft':    '#ecfdf5',
        'sem-amber':         '#b45309',
        'sem-amber-soft':    '#fffbeb',
        'sem-red':           '#b91c1c',
        'sem-red-soft':      '#fef2f2',
        'sem-blue':          '#1e40af',
        'sem-blue-soft':     '#eff6ff',
        'sem-purple':        '#6b21a8',
        'sem-purple-soft':   '#faf5ff',
        'sem-slate':         '#475569',
        'sem-slate-soft':    '#f1f5f9',
        'pri-urgent':        '#dc2626',
        'pri-high':          '#ea580c',
        'pri-medium':        '#ca8a04',
        'pri-low':           '#64748b',
      },
      fontFamily: {
        // Existing — Inter Next-font variable set in app/layout.tsx, kept for backcompat
        sans: ['"Inter Tight"', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        // New (Batch 9)
        serif: ['Fraunces', 'serif'],
        mono:  ['"JetBrains Mono"', 'monospace'],
      },
    }
  },
  plugins: []
}
