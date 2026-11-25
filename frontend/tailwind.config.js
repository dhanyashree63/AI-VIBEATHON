/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0B0F26',
          900: '#10152F',
          800: '#171B3D',
          700: '#222854',
        },
        brand: {
          primary: '#6429D9',
          violet: '#8755F4',
          lavender: '#F0EDFF',
          softBlue: '#EEF4FF',
        },
        ink: {
          primary: '#151B3B',
          secondary: '#58617E',
        },
        line: '#E4E3F4',
        status: {
          success: '#159B67',
          warning: '#EBA34A',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      boxShadow: {
        'card': '0 4px 20px -2px rgba(21, 27, 59, 0.05), 0 1px 3px rgba(21, 27, 59, 0.03)',
        'card-hover': '0 12px 28px -4px rgba(100, 41, 217, 0.12), 0 4px 10px -2px rgba(21, 27, 59, 0.05)',
        'purple-btn': '0 8px 20px -4px rgba(100, 41, 217, 0.38)',
      }
    },
  },
  plugins: [],
}
