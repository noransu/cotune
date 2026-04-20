/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          dark: '#1e1e2e'
        },
        panel: {
          DEFAULT: '#f8f9fa',
          dark: '#181825'
        },
        border: {
          DEFAULT: '#e2e8f0',
          dark: '#313244'
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5'
        }
      }
    }
  },
  plugins: []
}
