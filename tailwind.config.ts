import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          50: "#f8fafc",
          100: "#1e2028",
          200: "#1a1b20",
          300: "#16171c",
          400: "#121318",
          500: "#0e0f14",
          600: "#0a0b10",
        },
        accent: {
          purple: "#8b5cf6",
          blue: "#3b82f6",
          green: "#10b981",
          pink: "#ec4899",
        },
      },
    },
  },
  plugins: [],
};

export default config;
