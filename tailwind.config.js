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
          from: { opacity: "0", transform: "translateY(6px) scale(0.97)", filter: "blur(4px)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)", filter: "blur(0)" },
        },
        "blur-in": {
          from: { opacity: "0", transform: "translateY(4px)", filter: "blur(6px)" },
          to: { opacity: "1", transform: "translateY(0)", filter: "blur(0)" },
        },
        eq: { "0%, 100%": { height: "3px" }, "50%": { height: "12px" } },
        "page-in": {
          from: { opacity: "0", transform: "translateY(8px)", filter: "blur(3px)" },
          to: { opacity: "1", transform: "translateY(0)", filter: "blur(0)" },
        },
        "slide-in": { from: { opacity: "0", transform: "translateX(12px)" }, to: { opacity: "1", transform: "translateX(0)" } },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "pop-in": "pop-in 260ms cubic-bezier(0.34, 1.4, 0.64, 1)",
        "blur-in": "blur-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1) both",
        eq: "eq 0.9s ease-in-out infinite",
        "page-in": "page-in 280ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        "slide-in": "slide-in 160ms cubic-bezier(0.2, 0.9, 0.3, 1)",
      },
    },
  },
  plugins: [typography],
};
