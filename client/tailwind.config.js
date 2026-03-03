/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e8f0fe',
          100: '#d2e3fc',
          200: '#a8c7fa',
          300: '#7cacf8',
          400: '#4d90f0',
          500: '#1a73e8',
          600: '#1557b0',
          700: '#104080',
          800: '#0b2a55',
          900: '#061730',
        },
      },
    },
  },
  plugins: [],
};
