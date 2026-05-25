import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#7c5e4a',
        primaryDark: '#6b4c3b',
        primaryLight: '#a67c5b',
        accent: '#c49a6c',
        treeBg: '#faf7f5',
        treeSurface: '#ffffff',
        treeBorder: '#e8ddd4',
        treeBorderLight: '#f0e6dd',
        treeText: '#3d3331',
        treeTextSec: '#9b8578',
        treeTextMuted: '#6b4c3b',
      },
    },
  },
  plugins: [],
} satisfies Config
