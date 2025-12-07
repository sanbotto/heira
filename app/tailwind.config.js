/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        primary: {
          yellow: '#FED80E',
          white: '#FFFFFF',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
