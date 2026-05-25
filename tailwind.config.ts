import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Token names kept stable across the app — values dark-navy + gold per template.html.
        primary: '#c8a35a',         // accent gold (was brown)
        primaryDark: '#a8843f',
        primaryLight: '#d9b878',
        accent: '#d9b878',
        treeBg: '#0a1628',          // page background
        treeBg2: '#0f1e35',
        treeSurface: '#16263f',     // cards, topbar, nav
        treeSurface2: '#1d3050',
        treeBorder: '#243a5c',
        treeBorderLight: '#2e4566',
        treeText: '#e8edf5',
        treeTextSec: '#8a9bb8',
        treeTextMuted: '#6b7d9a',
        // Status palette (named so we don't sprinkle hex values around)
        statusGreen: '#4ade80',
        statusBlue: '#60a5fa',
        statusOrange: '#fb923c',
        statusPink: '#f472b6',
        statusRed: '#f87171',
        statusPurple: '#a78bfa',
        statusYellow: '#fbbf24',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
