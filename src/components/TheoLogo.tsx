import type { SVGProps } from "react";

export function TheoLogo({ className = "h-6 w-6", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Theo"
      role="img"
      {...props}
    >
      <style>
        {`
          .theo-body {
            transform-origin: center;
            animation: theo-breathe 5s ease-in-out infinite;
          }

          .theo-ears {
            transform-origin: 32px 34px;
            animation: theo-ears 6s ease-in-out infinite;
          }

          .theo-eyes {
            transform-origin: center;
            animation: theo-look 7s ease-in-out infinite;
          }

          .theo-blink {
            transform-origin: center;
            animation: theo-blink 6s ease-in-out infinite;
          }

          .theo-brow-left {
            transform-origin: 25px 27px;
            animation: theo-brow-left 7s ease-in-out infinite;
          }

          .theo-brow-right {
            transform-origin: 39px 27px;
            animation: theo-brow-right 7s ease-in-out infinite;
          }

          .theo-beret {
            transform-origin: 32px 21px;
            animation: theo-beret 7s ease-in-out infinite;
          }

          .theo-badge {
            transform-origin: 43px 20px;
            animation: theo-badge 5s ease-in-out infinite;
          }

          .theo-beret-stitch {
            stroke-dasharray: 1 2;
            animation: theo-stitch 5s linear infinite;
          }

          @keyframes theo-breathe {
            0%, 100% {
              transform: translateY(0);
            }

            50% {
              transform: translateY(-0.7px);
            }
          }

          @keyframes theo-ears {
            0%, 100% {
              transform: rotate(0deg);
            }

            50% {
              transform: rotate(1deg);
            }
          }

          @keyframes theo-look {
            0%, 25% {
              transform: translate(0, 0);
            }

            35%, 50% {
              transform: translate(1px, 0);
            }

            60%, 75% {
              transform: translate(-0.6px, 0);
            }

            85%, 100% {
              transform: translate(0, 0);
            }
          }

          @keyframes theo-blink {
            0%, 89%, 100% {
              transform: scaleY(1);
            }

            91%, 93% {
              transform: scaleY(0.08);
            }
          }

          @keyframes theo-brow-left {
            0%, 100% {
              transform: rotate(-5deg);
            }

            40%, 55% {
              transform: rotate(-8deg);
            }
          }

          @keyframes theo-brow-right {
            0%, 100% {
              transform: rotate(5deg);
            }

            40%, 55% {
              transform: rotate(2deg);
            }
          }

          @keyframes theo-beret {
            0%, 100% {
              transform: rotate(-3deg) translateY(0);
            }

            50% {
              transform: rotate(-4deg) translateY(-0.5px);
            }
          }

          @keyframes theo-badge {
            0%, 100% {
              transform: scale(1);
            }

            50% {
              transform: scale(1.035);
            }
          }

          @keyframes theo-stitch {
            0% {
              stroke-dashoffset: 0;
            }

            100% {
              stroke-dashoffset: -12;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .theo-body,
            .theo-ears,
            .theo-eyes,
            .theo-blink,
            .theo-brow-left,
            .theo-brow-right,
            .theo-beret,
            .theo-badge,
            .theo-beret-stitch {
              animation: none;
            }
          }
        `}
      </style>

      <g className="theo-body">
        {/* =====================================================
            ORELHAS
        ====================================================== */}

        <g className="theo-ears">
          <circle cx="15" cy="22" r="8" fill="currentColor" />

          <circle cx="49" cy="22" r="8" fill="currentColor" />

          <circle cx="15" cy="22" r="4" fill="#fff" opacity="0.18" />

          <circle cx="49" cy="22" r="4" fill="#fff" opacity="0.18" />
        </g>

        {/* =====================================================
            CABEÇA
        ====================================================== */}

        <circle cx="32" cy="36" r="21" fill="currentColor" />

        {/* Sombra inferior */}

        <path
          d="
            M12.5 37
            C14 48 22 56 32 57
            C42 56 50 48 51.5 37
            C47 43 40 46 32 46
            C24 46 17 43 12.5 37
            Z
          "
          fill="#000"
          opacity="0.1"
        />

        {/* =====================================================
            BOINA MILITAR
        ====================================================== */}

        <g className="theo-beret">
          {/* Copa principal assimétrica */}

          <path
            d="
              M13 22
              C14 16 18 11 24 8.5
              C30 6 37 7 43 9.5
              C48 11.5 51 15 52 19
              C48 18 44 18 40 18
              C33 17 26 18 20 20
              C17 21 15 22 13 22
              Z
            "
            fill="#26382C"
          />

          {/* Volume superior */}

          <path
            d="
              M17 19
              C19 13 24 9.5 30 8.5
              C36 7.5 42 10 46 13
              C48 14.5 49 16.5 49.5 18
              C43 15.5 36 14.5 30 15
              C25 15.5 21 17 17 19
              Z
            "
            fill="#3B5340"
          />

          {/* Luz suave na copa */}

          <path
            d="
              M20 15
              C24 11 29 9.5 34 9.5
              C39 9.5 43 11 46 13
            "
            stroke="#60735B"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.55"
          />

          {/* Faixa / banda */}

          <path
            d="
              M12 22
              C18 19 25 18 32 18
              C40 18 47 19 52 21
              C53 23 52 25 50 26
              C44 24 38 23 32 23
              C24 23 17 24 13 26
              C11.5 25 11 23.5 12 22
              Z
            "
            fill="#17241B"
          />

          {/* Faixa frontal mais clara */}

          <path
            d="
              M14 22.5
              C22 20.5 27 20 33 20
              C40 20 46 21 50 22.5
            "
            stroke="#4D644F"
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity="0.8"
          />

          {/* Costura da boina */}

          <path
            className="theo-beret-stitch"
            d="
              M17 19
              C24 15.5 32 14 40 15
              C44 15.5 47 16.5 49 18
            "
            stroke="#718268"
            strokeWidth="0.65"
            strokeLinecap="round"
            fill="none"
            opacity="0.65"
          />

          {/* Aba lateral / queda típica da boina */}

          <path
            d="
              M38 18
              C44 18 49 20 53 22
              C54 23 53 25 51 26
              C47 24 43 23 38 22
              Z
            "
            fill="#1B281F"
          />

          {/* Pequeno botão lateral */}

          <circle cx="48" cy="18" r="1.2" fill="#B79A4D" opacity="0.9" />

          {/* =================================================
              DISTINTIVO LATERAL
          ================================================== */}

          <g className="theo-badge">
            {/* Base metálica */}

            <circle cx="43" cy="15" r="4.2" fill="#B79A4D" />

            {/* Centro verde */}

            <circle cx="43" cy="15" r="3.1" fill="#26382C" stroke="#D8BD61" strokeWidth="0.55" />

            {/* Estrela */}

            <path
              d="
                M43 12.7
                L43.6 14.2
                L45.2 14.25
                L44 15.25
                L44.45 16.8
                L43 15.9
                L41.55 16.8
                L42 15.25
                L40.8 14.25
                L42.4 14.2
                Z
              "
              fill="#F2E8C7"
            />
          </g>
        </g>

        {/* =====================================================
            SOBRANCELHAS
        ====================================================== */}

        <path
          className="theo-brow-left"
          d="M21 28 Q25 25 29 27"
          stroke="#111"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <path
          className="theo-brow-right"
          d="M35 27 Q39 25 43 28"
          stroke="#111"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* =====================================================
            OLHOS
        ====================================================== */}

        <g className="theo-eyes">
          <g className="theo-blink">
            <ellipse cx="25" cy="33" rx="3.7" ry="3.1" fill="#fff" />

            <circle cx="26" cy="33" r="1.55" fill="#111" />

            <circle cx="26.5" cy="32.5" r="0.45" fill="#fff" opacity="0.8" />
          </g>

          <g className="theo-blink">
            <ellipse cx="39" cy="33" rx="3.7" ry="3.1" fill="#fff" />

            <circle cx="40" cy="33" r="1.55" fill="#111" />

            <circle cx="40.5" cy="32.5" r="0.45" fill="#fff" opacity="0.8" />
          </g>
        </g>

        {/* =====================================================
            FOCINHO
        ====================================================== */}

        <ellipse cx="32" cy="42" rx="9" ry="7" fill="#FFF" />

        {/* =====================================================
            NARIZ
        ====================================================== */}

        <path
          d="
            M29.5 40
            Q32 38.5 34.5 40
            Q34.5 42 32 42.5
            Q29.5 42 29.5 40
            Z
          "
          fill="#111"
        />

        {/* =====================================================
            BOCA
        ====================================================== */}

        <path d="M28 46 Q32 47 36 46" stroke="#111" strokeWidth="1.5" strokeLinecap="round" />

        {/* =====================================================
            BOCHECHAS
        ====================================================== */}

        <circle cx="20" cy="42" r="2" fill="#D96C6C" opacity="0.14" />

        <circle cx="44" cy="42" r="2" fill="#D96C6C" opacity="0.14" />

        {/* =====================================================
            DETALHE MILITAR
        ====================================================== */}

        <path
          d="M27 53 Q32 55 37 53"
          stroke="#26382C"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.45"
        />
      </g>
    </svg>
  );
}
