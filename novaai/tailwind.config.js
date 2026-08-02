/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Both families intentionally map to Inter: "mono" labels keep the
        // font-mono class for intent, but render in Inter like everything else.
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
