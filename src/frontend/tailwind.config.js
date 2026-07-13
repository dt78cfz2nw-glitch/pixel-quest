import typography from "@tailwindcss/typography";
import containerQueries from "@tailwindcss/container-queries";
import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["index.html", "src/**/*.{js,ts,jsx,tsx,html,css}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "oklch(var(--border))",
        input: "oklch(var(--input))",
        ring: "oklch(var(--ring) / <alpha-value>)",
        background: "oklch(var(--background))",
        foreground: "oklch(var(--foreground))",
        primary: {
          DEFAULT: "oklch(var(--primary) / <alpha-value>)",
          foreground: "oklch(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "oklch(var(--secondary) / <alpha-value>)",
          foreground: "oklch(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "oklch(var(--destructive) / <alpha-value>)",
          foreground: "oklch(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "oklch(var(--muted) / <alpha-value>)",
          foreground: "oklch(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "oklch(var(--accent) / <alpha-value>)",
          foreground: "oklch(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "oklch(var(--popover))",
          foreground: "oklch(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "oklch(var(--card))",
          foreground: "oklch(var(--card-foreground))",
        },
        chart: {
          1: "oklch(var(--chart-1))",
          2: "oklch(var(--chart-2))",
          3: "oklch(var(--chart-3))",
          4: "oklch(var(--chart-4))",
          5: "oklch(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "oklch(var(--sidebar))",
          foreground: "oklch(var(--sidebar-foreground))",
          primary: "oklch(var(--sidebar-primary))",
          "primary-foreground": "oklch(var(--sidebar-primary-foreground))",
          accent: "oklch(var(--sidebar-accent))",
          "accent-foreground": "oklch(var(--sidebar-accent-foreground))",
          border: "oklch(var(--sidebar-border))",
          ring: "oklch(var(--sidebar-ring))",
        },
        warrior: {
          DEFAULT: "oklch(var(--warrior) / <alpha-value>)",
          foreground: "oklch(var(--warrior-foreground))",
        },
        mage: {
          DEFAULT: "oklch(var(--mage) / <alpha-value>)",
          foreground: "oklch(var(--mage-foreground))",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(0,0,0,0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "character-idle": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-2px)" },
        },
        "character-walk-1": {
          "0%": { transform: "translateY(0px) scaleY(1)" },
          "50%": { transform: "translateY(-1px) scaleY(0.98)" },
        },
        "character-walk-enhanced": {
          "0%": { transform: "translateY(0px)" },
          "25%": { transform: "translateY(-2px)" },
          "50%": { transform: "translateY(0px)" },
          "75%": { transform: "translateY(-1px)" },
          "100%": { transform: "translateY(0px)" },
        },
        "scanline": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(4px)" },
        },
        "camera-ease": {
          "0%": { transform: "translate(0, 0)" },
          "100%": { transform: "translate(var(--camera-x, 0), var(--camera-y, 0))" },
        },
        "portal-pulse": {
          "0%": { opacity: 0.6, transform: "scale(1)" },
          "50%": { opacity: 1, transform: "scale(1.05)" },
          "100%": { opacity: 0.6, transform: "scale(1)" },
        },
        "loot-bob": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "bar-fill-glow": {
          "0%, 100%": { boxShadow: "0 0 4px oklch(var(--gradient-hp-end) / 0.4)" },
          "50%": { boxShadow: "0 0 8px oklch(var(--gradient-hp-end) / 0.7)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "character-idle": "character-idle 1.5s ease-in-out infinite",
        "character-walk": "character-walk-1 0.5s steps(4, end) infinite",
        "character-walk-enhanced": "character-walk-enhanced 0.6s ease-in-out infinite",
        "scanline": "scanline 0.15s linear infinite",
        "camera-ease": "camera-ease 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards",
        "portal-pulse": "portal-pulse 1.2s ease-in-out infinite",
        "loot-bob": "loot-bob 0.8s ease-in-out infinite",
        "bar-fill-glow": "bar-fill-glow 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [typography, containerQueries, animate],
};
