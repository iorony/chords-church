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
          light: '#FAF7F2',
          dark: '#17181C'
        },
        primary: {
          DEFAULT: '#1E3A8A',
          light: '#3B5BDB'
        },
        accent: {
          gold: '#D4A94C',
          teal: '#2DB6A3'
        },
        chord: '#B4552B',
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
