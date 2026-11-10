import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        store: {
          canvas: 'var(--store-canvas, #FAFAF8)',
          surface: 'var(--store-surface, #FFFFFF)',
          choice: 'var(--store-surface, rgba(0,0,0,0.6))',
          'choice-selected': 'var(--store-raised, rgba(0,0,0,0.7))',
          raised: 'var(--store-raised, #F0EBE3)',
          text: 'var(--store-text, #292621)',
          muted: 'var(--store-muted, #756B5D)',
          border: 'var(--store-border, #E5DED3)',
          selected: 'var(--store-selected, #343029)',
          action: 'var(--store-action, #292621)',
          'action-hover': 'var(--store-action-hover, #504638)',
          accent: 'var(--store-accent, #947B57)',
          error: 'var(--store-error, #B91C1C)',
          'error-bg': 'var(--store-error-bg, #FEF2F2)',
          success: 'var(--store-success, #166534)',
          'success-bg': 'var(--store-success-bg, #F0FDF4)',
          warning: 'var(--store-warning, #92400E)',
          'warning-bg': 'var(--store-warning-bg, #FFFBEB)',
        },
        serenity: {
          black: '#0A0A0A',
          dark: '#1A1A1A',
          gray: '#6B6B6B',
          'light-gray': '#F4F4F2',
          border: '#E5E5E5',
          cream: '#FAF9F7',
          gold: '#B8986A',
          'gold-light': '#D4B896',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-manrope)',
          'system-ui',
          'sans-serif',
        ],
        display: [
          'var(--font-manrope)',
          'system-ui',
          'sans-serif',
        ],
        body: [
          'var(--font-manrope)',
          'system-ui',
          'sans-serif',
        ],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      maxWidth: {
        '8xl': '88rem',
      },
      aspectRatio: {
        '3/4': '3 / 4',
        '4/5': '4 / 5',
      },
      transitionTimingFunction: {
        luxury: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [],
}

export default config
