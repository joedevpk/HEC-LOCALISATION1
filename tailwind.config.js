/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        hec: {
          50: '#eef4ff',
          100: '#dbe6ff',
          200: '#bdd1ff',
          300: '#90b2ff',
          400: '#5c88ff',
          500: '#1e5eff',
          600: '#1148e6',
          700: '#0f37b4',
          800: '#123090',
          900: '#152c72',
          950: '#111d47',
        },
        // Couleurs mesurées sur le logo officiel (public/images/hec-logo.png) :
        // jaune dominant #faf120, bleu dominant #067fd4, rouge #d90f16.
        // 'gold' = accent (utilisé avec modération, de préférence sur fond
        // bleu foncé où le contraste est excellent). 'logo' = référence
        // exacte du logo, pas une couleur d'interface.
        gold: {
          300: '#fff67a',
          400: '#faf120',
          500: '#e8d900',
        },
        logo: {
          blue: '#067fd4',
          yellow: '#faf120',
          red: '#d90f16',
        },
      },
      boxShadow: {
        glass: '0 8px 30px rgba(17, 29, 71, 0.08)',
        panel: '0 20px 60px -15px rgba(17, 29, 71, 0.25)',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.4s ease both',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};
