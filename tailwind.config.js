/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        tutor: {
          bg: 'var(--tutor-bg)',
          surface: 'var(--tutor-surface)',
          'surface-elevated': 'var(--tutor-surface-elevated)',
          border: 'var(--tutor-border)',
          'border-subtle': 'var(--tutor-border-subtle)',
          text: 'var(--tutor-text)',
          'text-secondary': 'var(--tutor-text-secondary)',
          'text-tertiary': 'var(--tutor-text-tertiary)',
          accent: 'var(--tutor-accent)',
          'accent-hover': 'var(--tutor-accent-hover)',
          'accent-subtle': 'var(--tutor-accent-subtle)',
          success: 'var(--tutor-success)',
          warning: 'var(--tutor-warning)',
          error: 'var(--tutor-error)',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'Fira Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem', letterSpacing: '-0.01em' }],
        'sm': ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '-0.01em' }],
        'base': ['0.875rem', { lineHeight: '1.5rem', letterSpacing: '-0.011em' }],
        'lg': ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.011em' }],
        'xl': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.014em' }],
        '2xl': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.017em' }],
        '3xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.019em' }],
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '8px',
        'lg': '10px',
        'xl': '12px',
        '2xl': '16px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'glow': '0 0 20px rgb(129 140 248 / 0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
