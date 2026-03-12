/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'claude-bg': '#1e1e2e',
        'claude-orange': '#E87443',
        'claude-text': '#cccccc',
        'claude-text-dim': '#888888',
        'claude-active': '#4ade80',
        'claude-idle': '#6b7280',
        'claude-bar-bg': '#2a2a3e',
        'claude-border': '#333346',
        'claude-input': '#60a5fa',
      },
    },
  },
  plugins: [],
};
