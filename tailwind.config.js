/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'claude-bg': 'var(--claude-bg)',
        'claude-orange': 'var(--claude-orange)',
        'claude-text': 'var(--claude-text)',
        'claude-text-dim': 'var(--claude-text-dim)',
        'claude-active': 'var(--claude-active)',
        'claude-idle': 'var(--claude-idle)',
        'claude-bar-bg': 'var(--claude-bar-bg)',
        'claude-border': 'var(--claude-border)',
        'claude-input': 'var(--claude-input)',
      },
    },
  },
  plugins: [],
};
