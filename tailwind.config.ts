import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5fa',
          100: '#e1ebf5',
          200: '#c4d7eb',
          300: '#9ab8de',
          400: '#6893cc',
          500: '#4270b8',
          600: '#305899',
          700: '#27477d',
          800: '#233d69',
          900: '#0b1b32', // Deep Navy
          950: '#050c17', // Darker Navy for contrast
        },
        secondary: {
          50: '#fcf9f0',
          100: '#f7f1db',
          200: '#eedfb0',
          300: '#e4c880',
          400: '#dab056',
          500: '#d4af37', // Gold
          600: '#b58e2a',
          700: '#916d23',
          800: '#765622',
          900: '#644822',
          950: '#39270f',
        },
        dark: {
          DEFAULT: '#0b1b32',
          surface: '#112240',
          glass: 'rgba(11, 27, 50, 0.7)',
        }
      },
      fontFamily: {
        sans: ['var(--font-lato)', 'sans-serif'],
        heading: ['var(--font-montserrat)', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 4s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
export default config