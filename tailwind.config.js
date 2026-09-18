/**
 * Theo Design System
 *
 * Google Material 3 × Apple Human Interface
 *
 * Tailwind CSS v3
 *
 * PRINCÍPIOS
 * ─────────────────────────────────────────────────────────────
 * • superfícies neutras
 * • azul como ação primária
 * • tipografia limpa e compacta
 * • bordas extremamente discretas
 * • sombras suaves
 * • estados de interação claros
 * • grande contraste entre conteúdo e chrome
 * • modo claro e escuro
 * • aparência de produto, não de dashboard genérico
 */

/** @type {import('tailwindcss').Config} */

export default {
  darkMode: ["class"],

  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],

  theme: {
    extend: {
      // ========================================================
      // CORES
      // ========================================================

      colors: {
        // ------------------------------------------------------
        // COMPATIBILIDADE — PALETA ANTIGA
        // ------------------------------------------------------

        ink: {
          DEFAULT: "#202124",
          soft: "#292A2D",
          softer: "#35363A",
        },

        paper: {
          DEFAULT: "#FFFFFF",
          alt: "#F8F9FA",
          line: "#DADCE0",
        },

        text: {
          DEFAULT: "#fff",
          muted: "#5F6368",
          faint: "#70757A",
        },

        accent: {
          DEFAULT: "#5F6368",
          dim: "#3C4043",
          bright: "#8AB4F8",
        },

        // ------------------------------------------------------
        // GOOGLE BLUE
        // ------------------------------------------------------

        blue: {
          50: "#F8FAFF",
          100: "#F1F6FF",
          200: "#E8F0FE",
          300: "#D2E3FC",
          400: "#AECBFA",
          500: "#8AB4F8",
          600: "#669DF6",
          700: "#4285F4",
          800: "#1A73E8",
          900: "#185ABC",
          950: "#174EA6",
        },

        // ------------------------------------------------------
        // GREEN
        // ------------------------------------------------------

        green: {
          50: "#F1F8F3",
          100: "#E6F4EA",
          200: "#CEEAD6",
          300: "#A8DAB5",
          400: "#81C995",
          500: "#5BB974",
          600: "#34A853",
          700: "#1E8E3E",
          800: "#188038",
          900: "#137333",
        },

        // ------------------------------------------------------
        // YELLOW / WARNING
        // ------------------------------------------------------

        yellow: {
          50: "#FFFBF0",
          100: "#FEF7E0",
          200: "#FEEFC3",
          300: "#FDE293",
          400: "#FDD663",
          500: "#F9AB00",
          600: "#F29900",
          700: "#E37400",
          800: "#C26401",
        },

        // ------------------------------------------------------
        // RED / ERROR
        // ------------------------------------------------------

        red: {
          50: "#FFF7F7",
          100: "#FCE8E6",
          200: "#FAD2CF",
          300: "#F6AEA9",
          400: "#F28B82",
          500: "#EA4335",
          600: "#D93025",
          700: "#C5221F",
          800: "#B31412",
          900: "#A50E0E",
        },

        // ======================================================
        // SUPERFÍCIES
        // ======================================================

        "app-bg": "#F8F9FA",

        surface: {
          0: "#FFFFFF",
          1: "#FFFFFF",
          2: "#F8F9FA",
          3: "#F1F3F4",
          4: "#E8EAED",
          5: "#DADCE0",
        },

        // ======================================================
        // TEXTO SEMÂNTICO
        // ======================================================

        "on-surface": "#202124",
        "on-variant": "#5F6368",
        "on-faint": "#80868B",

        // ======================================================
        // PRIMARY
        // ======================================================

        primary: "#1A73E8",

        "primary-hover": "#185ABC",

        "primary-active": "#174EA6",

        "primary-soft": "#E8F0FE",

        "primary-container": "#D2E3FC",

        "primary-on": "#FFFFFF",

        "primary-on-container": "#174EA6",

        // ======================================================
        // OUTLINE
        // ======================================================

        outline: "#80868B",

        "outline-variant": "#DADCE0",

        border: "#DADCE0",

        "border-subtle": "#E8EAED",

        // ======================================================
        // ESTADOS
        // ======================================================

        success: "#188038",

        "success-soft": "#E6F4EA",

        warning: "#B06000",

        "warning-soft": "#FEF7E0",

        error: "#C5221F",

        "error-soft": "#FCE8E6",

        info: "#1967D2",

        "info-soft": "#E8F0FE",

        // ======================================================
        // INTERACTION STATES
        // ======================================================

        hover: "rgba(60, 64, 67, 0.06)",

        "hover-strong": "rgba(60, 64, 67, 0.10)",

        pressed: "rgba(60, 64, 67, 0.14)",

        selected: "#E8F0FE",

        "selected-strong": "#D2E3FC",

        // ======================================================
        // SRS
        // ======================================================

        again: "#D93025",

        hard: "#E37400",

        good: "#188038",

        easy: "#1967D2",

        streak: "#F29900",
      },

      // ========================================================
      // TIPOGRAFIA
      // ========================================================

      fontFamily: {
        display: ["Google Sans", "Google Sans Text", "Inter", "Roboto", "Arial", "sans-serif"],

        sans: ["Google Sans Text", "Google Sans", "Inter", "Roboto", "Arial", "sans-serif"],

        mono: [
          "JetBrains Mono",
          "Roboto Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },

      // ========================================================
      // ESCALA TIPOGRÁFICA
      // ========================================================

      fontSize: {
        "label-xs": [
          "0.6875rem",
          {
            lineHeight: "1rem",
            letterSpacing: "0.01em",
            fontWeight: "500",
          },
        ],

        "label-sm": [
          "0.75rem",
          {
            lineHeight: "1rem",
            letterSpacing: "0.01em",
            fontWeight: "500",
          },
        ],

        label: [
          "0.8125rem",
          {
            lineHeight: "1.125rem",
            letterSpacing: "0.01em",
            fontWeight: "500",
          },
        ],

        "body-sm": [
          "0.8125rem",
          {
            lineHeight: "1.25rem",
          },
        ],

        body: [
          "0.875rem",
          {
            lineHeight: "1.375rem",
          },
        ],

        "body-lg": [
          "1rem",
          {
            lineHeight: "1.5rem",
          },
        ],

        title: [
          "1rem",
          {
            lineHeight: "1.5rem",
            letterSpacing: "0",
            fontWeight: "500",
          },
        ],

        "title-lg": [
          "1.375rem",
          {
            lineHeight: "1.75rem",
            letterSpacing: "-0.01em",
            fontWeight: "500",
          },
        ],

        "title-xl": [
          "1.75rem",
          {
            lineHeight: "2.25rem",
            letterSpacing: "-0.015em",
            fontWeight: "500",
          },
        ],

        headline: [
          "2rem",
          {
            lineHeight: "2.5rem",
            letterSpacing: "-0.02em",
            fontWeight: "500",
          },
        ],

        display: [
          "2.75rem",
          {
            lineHeight: "3.25rem",
            letterSpacing: "-0.025em",
            fontWeight: "500",
          },
        ],
      },

      // ========================================================
      // DIMENSÕES
      // ========================================================

      height: {
        control: "2.5rem",

        "control-lg": "3rem",

        "control-sm": "2.25rem",
      },

      minHeight: {
        control: "2.5rem",

        "control-lg": "3rem",

        "control-sm": "2.25rem",
      },

      width: {
        control: "2.5rem",
      },

      maxWidth: {
        measure: "65ch",

        content: "1200px",

        "content-lg": "1440px",
      },

      // ========================================================
      // RADIUS
      // ========================================================

      borderRadius: {
        // Compatibilidade
        pill: "9999px",

        // Sistema principal
        xs: "6px",

        sm: "10px",

        md: "12px",

        lg: "16px",

        xl: "20px",

        "2xl": "24px",

        "3xl": "28px",
      },

      // ========================================================
      // SOMBRAS
      // ========================================================

      boxShadow: {
        e0: "none",

        e1: ["0 1px 2px rgba(60, 64, 67, 0.10)", "0 1px 3px rgba(60, 64, 67, 0.06)"].join(", "),

        e2: ["0 1px 2px rgba(60, 64, 67, 0.12)", "0 2px 6px rgba(60, 64, 67, 0.10)"].join(", "),

        e3: ["0 4px 12px rgba(60, 64, 67, 0.12)", "0 8px 24px rgba(60, 64, 67, 0.08)"].join(", "),

        card: ["0 1px 2px rgba(60, 64, 67, 0.08)", "0 2px 6px rgba(60, 64, 67, 0.06)"].join(", "),

        "card-lift": [
          "0 4px 12px rgba(60, 64, 67, 0.10)",
          "0 12px 28px rgba(60, 64, 67, 0.08)",
        ].join(", "),

        focus: ["0 0 0 3px rgba(26, 115, 232, 0.20)"].join(", "),

        "focus-strong": ["0 0 0 3px rgba(26, 115, 232, 0.28)"].join(", "),
      },

      // ========================================================
      // TRANSIÇÕES
      // ========================================================

      transitionDuration: {
        fast: "120ms",

        base: "180ms",

        slow: "280ms",
      },

      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",

        emphasized: "cubic-bezier(0.2, 0, 0, 1)",

        linear: "linear",
      },

      // ========================================================
      // KEYFRAMES
      // ========================================================

      keyframes: {
        flip: {
          "0%": {
            transform: "rotateY(0deg)",
          },

          "100%": {
            transform: "rotateY(180deg)",
          },
        },

        "scale-in": {
          "0%": {
            opacity: "0",
            transform: "scale(0.97)",
          },

          "100%": {
            opacity: "1",
            transform: "scale(1)",
          },
        },

        "fade-in": {
          "0%": {
            opacity: "0",
          },

          "100%": {
            opacity: "1",
          },
        },

        "slide-up": {
          "0%": {
            opacity: "0",
            transform: "translateY(6px)",
          },

          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },

        "slide-down": {
          "0%": {
            opacity: "0",
            transform: "translateY(-6px)",
          },

          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
      },

      // ========================================================
      // ANIMAÇÕES
      // ========================================================

      animation: {
        flip: "flip 420ms cubic-bezier(0.2, 0, 0, 1)",

        "scale-in": "scale-in 180ms cubic-bezier(0.2, 0, 0, 1)",

        "fade-in": "fade-in 160ms ease-out",

        "slide-up": "slide-up 200ms cubic-bezier(0.2, 0, 0, 1)",

        "slide-down": "slide-down 200ms cubic-bezier(0.2, 0, 0, 1)",
      },

      // ========================================================
      // BACKGROUND
      // ========================================================

      backgroundImage: {
        /*
         * Textura praticamente imperceptível.
         * Use somente em áreas grandes.
         */
        grain: "radial-gradient(circle at 1px 1px, rgba(60,64,67,0.018) 1px, transparent 0)",
      },

      backgroundSize: {
        grain: "4px 4px",
      },
    },
  },

  // ==========================================================
  // PLUGINS
  // ==========================================================

  plugins: [],
};
