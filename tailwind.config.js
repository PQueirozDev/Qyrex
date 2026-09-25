/** @type {import('tailwindcss').Config} */
import typography from "@tailwindcss/typography";

// As cores vêm de variáveis CSS (src/renderer/styles/index.css), o que permite
// alternar Dark / Light / System sem duplicar classes.
const color = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: color("bg"),
          elevated: color("bg-elevated"),
          card: color("bg-card"),
          hover: color("bg-hover"),
        },
        border: {
          DEFAULT: color("border"),
          subtle: color("border-subtle"),
        },
        text: {
          DEFAULT: color("text"),
          muted: color("text-muted"),
          faint: color("text-faint"),
        },
        accent: {
          DEFAULT: color("accent"),
          hover: color("accent-hover"),
          muted: color("accent-muted"),
          fg: color("accent-fg"),
        },
        danger: color("danger"),
        success: color("success"),
        warning: color("warning"),
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "Segoe UI Variable Text", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(4px) scale(0.985)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "slide-in": { from: { opacity: "0", transform: "translateX(12px)" }, to: { opacity: "1", transform: "translateX(0)" } },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "pop-in": "pop-in 140ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        "slide-in": "slide-in 160ms cubic-bezier(0.2, 0.9, 0.3, 1)",
      },
    },
  },
  plugins: [typography],
};
