/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#080B10',
          900: '#0B0F16',
          850: '#0F141C',
          800: '#131924',
          700: '#1B2330',
          600: '#28323F',
          border: '#212B38',
        },
        ink: {
          100: '#E7EBF1',
          300: '#AEB9C7',
          500: '#7C8798',
          700: '#4C5768',
        },
        brand: {
          400: '#3FE0C5',
          500: '#22C6AA',
          600: '#169983',
        },
        sev: {
          critical: '#FF5470',
          high: '#FF9F45',
          medium: '#FFD24C',
          low: '#4ADE80',
          none: '#3A4557',
        },
      },
      fontFamily: {
        display: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
}
