/** @type {import('tailwindcss').Config} */
// Tailwind is used mainly for responsive utilities and the mobile layout layer.
// The core visual identity lives in src/styles/design.css (ported design system,
// driven by CSS variables). Preflight is disabled so it never fights the design
// system's own resets and typography.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // expose the design tokens to Tailwind utilities when convenient
      colors: {
        bg: 'var(--bg)',
        card: 'var(--card)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        border: 'var(--border)',
      },
      screens: {
        // mobile-first breakpoint used across the app
        tab: '760px',
        desk: '1100px',
      },
    },
  },
  plugins: [],
};
