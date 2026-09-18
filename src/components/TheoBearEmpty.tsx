import React from "react";

export function TheoLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Theo"
      role="img"
    >
      <style>{`
        .theo {
          animation: theoFloat 5s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes theoFloat {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-0.8px);
          }
        }

        .eyes {
          animation: tacticalLook 7s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes tacticalLook {
          0%, 18%, 100% {
            transform: translate(0, 0);
          }
          25%, 42% {
            transform: translate(1.5px, -0.5px);
          }
          50%, 65% {
            transform: translate(-1px, 0);
          }
          72%, 85% {
            transform: translate(0, 0);
          }
        }

        .blink {
          animation: blink 6s infinite;
          transform-origin: center;
        }

        @keyframes blink {
          0%, 87%, 100% {
            transform: scaleY(1);
          }
          89%, 91% {
            transform: scaleY(.08);
          }
        }

        .earL {
          transform-origin: 16px 18px;
          animation: earL 6s ease-in-out infinite;
        }

        .earR {
          transform-origin: 48px 18px;
          animation: earR 6s ease-in-out infinite;
        }

        @keyframes earL {
          0%, 100% {
            transform: rotate(0);
          }
          50% {
            transform: rotate(-2deg);
          }
        }

        @keyframes earR {
          0%, 100% {
            transform: rotate(0);
          }
          50% {
            transform: rotate(2deg);
          }
        }

        .browL {
          transform-origin: 25px 27px;
          animation: browL 7s ease-in-out infinite;
        }

        .browR {
          transform-origin: 39px 27px;
          animation: browR 7s ease-in-out infinite;
        }

        @keyframes browL {
          0%, 100% {
            transform: rotate(-4deg);
          }
          35%, 55% {
            transform: rotate(-8deg);
          }
        }

        @keyframes browR {
          0%, 100% {
            transform: rotate(4deg);
          }
          35%, 55% {
            transform: rotate(1deg);
          }
        }

        .thinking {
          animation: thinking 6s ease-in-out infinite;
          transform-origin: 49px 48px;
        }

        @keyframes thinking {
          0%, 72%, 100% {
            opacity: 0;
            transform: translateY(2px);
          }
          77%, 90% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .insignia {
          animation: insigniaPulse 4s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes insigniaPulse {
          0%, 100% {
            opacity: .92;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>

      <g className="theo">
        {/* ORELHAS */}
        <circle className="earL" cx="16" cy="18" r="8" fill="currentColor" />

        <circle className="earR" cx="48" cy="18" r="8" fill="currentColor" />

        <circle cx="16" cy="18" r="4" fill="#D6C9A3" opacity=".7" />

        <circle cx="48" cy="18" r="4" fill="#D6C9A3" opacity=".7" />

        {/* CABEÇA */}
        <circle cx="32" cy="36" r="20" fill="currentColor" />

        {/* SOMBRA INFERIOR DA CABEÇA */}
        <path d="M14 38 Q32 55 50 38 Q47 55 32 56 Q17 55 14 38Z" fill="#16231A" opacity=".12" />

        {/* BOINA MILITAR */}
        <path
          d="
            M13 23
            Q31 16 51 22
            Q52 25 48 27
            Q32 29 16 26
            Q13 25 13 23
            Z
          "
          fill="#1C2A20"
        />

        {/* CORPO DA BOINA */}
        <path
          d="
            M16 22
            Q17 10 29 8
            Q42 6 49 19
            Q50 21 49 23
            Q40 19 31 19
            Q22 19 16 22
            Z
          "
          fill="#314736"
        />

        {/* COSTURA DA BOINA */}
        <path
          d="M18 21 Q32 15 47 20"
          stroke="#526B52"
          strokeWidth="1"
          strokeLinecap="round"
          opacity=".8"
        />

        {/* EMBLEMA MILITAR */}
        <g className="insignia">
          <circle cx="32" cy="14" r="4" fill="#B89A4A" />

          {/* Estrela */}
          <path
            d="
              M32 10.8
              L33 13
              L35.4 13.2
              L33.6 14.7
              L34.2 17
              L32 15.8
              L29.8 17
              L30.4 14.7
              L28.6 13.2
              L31 13
              Z
            "
            fill="#F1E6BD"
          />
        </g>

        {/* SOBRANCELHAS */}
        <path
          className="browL"
          d="M21 27 Q25 24 29 26"
          stroke="#101510"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <path
          className="browR"
          d="M35 26 Q39 24 43 27"
          stroke="#101510"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* OLHOS */}
        <g className="eyes">
          <g className="blink">
            <ellipse cx="25" cy="32" rx="3.5" ry="3" fill="#F8F7F0" />

            <circle cx="26" cy="32" r="1.5" fill="#101510" />
          </g>

          <g className="blink">
            <ellipse cx="39" cy="32" rx="3.5" ry="3" fill="#F8F7F0" />

            <circle cx="40" cy="32" r="1.5" fill="#101510" />
          </g>
        </g>

        {/* FOCINHO */}
        <ellipse cx="32" cy="41" rx="9" ry="7" fill="#E7DDC8" />

        {/* NARIZ */}
        <ellipse cx="32" cy="40" rx="2.5" ry="1.8" fill="#101510" />

        {/* BOCA SÉRIA */}
        <path
          d="M27 45 Q32 46.5 37 45"
          stroke="#101510"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* BOCHECHAS */}
        <circle cx="20" cy="41" r="2" fill="#B77C70" opacity=".22" />

        <circle cx="44" cy="41" r="2" fill="#B77C70" opacity=".22" />

        {/* MÃO NO QUEIXO */}
        <g className="thinking">
          <path
            d="
              M48 54
              Q44 49 42 45
              Q41 43 43 42
              Q45 42 46 45
              L50 49
            "
            fill="currentColor"
            opacity=".95"
          />

          <circle cx="45" cy="43" r="2" fill="#E7DDC8" opacity=".85" />
        </g>
      </g>
    </svg>
  );
}
