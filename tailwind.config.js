/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // Custom color palette for the tutor app
        tutor: {
          bg: 'var(--tutor-bg)',
          surface: 'var(--tutor-surface)',
          border: 'var(--tutor-border)',
          text: 'var(--tutor-text)',
          'text-secondary': 'var(--tutor-text-secondary)',
          accent: 'var(--tutor-accent)',
          'accent-hover': 'var(--tutor-accent-hover)',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
