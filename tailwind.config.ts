import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          light: '#EEF1FA',
          dark: '#171827'
        },
        primary: {
          DEFAULT: '#5B5BD6',
          light: '#7375EA'
        },
        accent: {
          gold: '#F4B860',
          teal: '#54C7B7'
        },
        chord: '#D65B3F',
        danger: '#C0392B',
        success: '#27824C'
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
};

export default config;
