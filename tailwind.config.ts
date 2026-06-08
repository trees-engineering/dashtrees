import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Token names kept stable across the app — values are the light "engin"
        // palette (pale blue page, white cards, cobalt-blue accent, coral red),
        // extracted from docs/Design/Engin_logo.png.
        primary: '#4888f8',         // cobalt blue accent (was gold)
        primaryDark: '#2f6fe0',
        primaryLight: '#6ea8fa',
        accent: '#48c8f8',          // bright cyan (logo mark)
        treeBg: '#e9eff9',          // page background — pale periwinkle
        treeBg2: '#e0e8f6',
        treeSurface: '#ffffff',     // cards, topbar, nav — white
        treeSurface2: '#f3f7fd',
        treeBorder: '#d4ddee',
        treeBorderLight: '#e4ebf6',
        treeText: '#16263f',        // dark navy ink (was light)
        treeTextSec: '#5a6b89',
        treeTextMuted: '#8b99b3',
        // Status palette (named so we don't sprinkle hex values around) — tuned
        // to read on a white surface.
        statusGreen: '#16a34a',
        statusBlue: '#4888f8',
        statusOrange: '#ea7a1e',
        statusPink: '#ec4899',
        statusRed: '#f04857',
        statusPurple: '#7c5cf0',
        statusYellow: '#d99e00',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
