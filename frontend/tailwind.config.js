/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#09090b', // zinc-950
                surface: '#18181b', // zinc-900
                primary: '#6366f1', // indigo-500
                secondary: '#a1a1aa', // zinc-400
                accent: '#8b5cf6', // violet-500
            }
        },
    },
    plugins: [],
}
