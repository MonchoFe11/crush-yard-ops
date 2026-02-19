import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        "bg-primary":   "var(--bg-primary)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-tertiary":  "var(--bg-tertiary)",
        "bg-hover":     "var(--bg-hover)",
        "bg-input":     "var(--bg-input)",

        "text-primary":    "var(--text-primary)",
        "text-secondary":  "var(--text-secondary)",
        "text-muted":      "var(--text-muted)",
        "text-on-primary": "var(--text-on-primary)",

        "primary":   "var(--color-primary)",
        "secondary": "var(--color-secondary)",
        "success":   "var(--color-success)",
        "warning":   "var(--color-warning)",
        "error":     "var(--color-error)",
        "conflict":  "var(--color-conflict)",

        "border-light":  "var(--border-light)",
        "border-medium": "var(--border-medium)",
        "border-dark":   "var(--border-dark)",
      },
      boxShadow: {
        panel:  "0 4px 12px rgba(0, 0, 0, 0.35)",
        subtle: "0 2px 6px rgba(0, 0, 0, 0.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;