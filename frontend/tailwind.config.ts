import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        base: '#F4F1ED',
        primary: {
          50: '#fdf2f6',
          100: '#fbe5ec',
          200: '#f8cddb',
          300: '#f4a4c0',
          400: '#ef729f',
          500: '#e91e63',
          600: '#d71453',
          700: '#b80d41',
          800: '#990f39',
          900: '#801233',
        }
      },
      fontFamily: {
        cairo: ['var(--font-cairo)', 'sans-serif'],
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '1.5rem',
          md: '2rem',
          lg: '3rem',
          xl: '4rem',
        },
      },
    },
  },
  plugins: [],
}
export default config
