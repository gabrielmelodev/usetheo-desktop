import React, { useMemo } from "react";

export type TheoState =
  | "idle"
  | "focused"
  | "studying"
  | "success"
  | "warning"
  | "tired"
  | "motivated"
  | "celebrating"
  | "thinking"
  | "alert"
  | "waiting"
  | "letter";

export type TheoMotion =
  | "idle"
  | "float"
  | "look"
  | "look_left"
  | "look_right"
  | "bounce"
  | "celebrate"
  | "thinking"
  | "alert"
  | "studying"
  | "tired"
  | "waiting";

/**
 * ============================================================
 * DADOS DE DESEMPENHO E CLIMA
 * ============================================================
 * Todos os campos são opcionais — chamadas antigas continuam
 * funcionando sem alteração.
 */
export type TheoPerformance = {
  studyMinutes?: number;
  goalMinutes?: number;
  /** 0 a 100 */
  accuracy?: number;
  streakDays?: number;
  /** alias usado pelo motor de frases */
  streak?: number;
  studiedCards?: number;
  plannedCards?: number;
  reviewsToday?: number;
  pendingReviews?: number;
  trend?: "up" | "down" | "stable";
  subject?: string;
};

export type TheoWeatherCondition =
  | "clear"
  | "partly_cloudy"
  | "cloudy"
  | "rain"
  | "storm"
  | "drizzle"
  | "fog"
  | "snow"
  | "unknown";

export interface TheoWeather {
  condition?: TheoWeatherCondition;
  /** Celsius */
  temperature?: number;
  city?: string;
  isDay?: boolean;
}

interface TheoProps {
  state?: TheoState;
  motion?: TheoMotion;
  reacting?: boolean;
  className?: string;
  autoMessage?: boolean;
  message?: string;

  hasLetter?: boolean;
  letterTitle?: string;
  letterMessage?: string;
  letterSignature?: string;
  onLetterOpen?: () => void;

  performance?: TheoPerformance;
  weather?: TheoWeather;
}

const stateLabel: Record<TheoState, string> = {
  idle: "Theo",
  focused: "Theo concentrado",
  studying: "Theo estudando",
  success: "Theo missão concluída",
  warning: "Theo em atenção",
  tired: "Theo cansado",
  motivated: "Theo motivado",
  celebrating: "Theo comemorando",
  thinking: "Theo pensando",
  alert: "Theo em alerta",
  waiting: "Theo aguardando missão",
  letter: "Theo recebeu uma carta",
};

const motionClass: Record<TheoMotion, string> = {
  idle: "theo-motion-idle",
  float: "theo-motion-float",
  look: "theo-motion-look",
  look_left: "theo-motion-look-left",
  look_right: "theo-motion-look-right",
  bounce: "theo-motion-bounce",
  celebrate: "theo-motion-celebrate",
  thinking: "theo-motion-thinking",
  alert: "theo-motion-alert",
  studying: "theo-motion-studying",
  tired: "theo-motion-tired",
  waiting: "theo-motion-waiting",
};

// ------------------------------------------------------------
// MOTOR DE FRASES (inalterado — só a apresentação mudou)
// ------------------------------------------------------------

function clamp(value: number | undefined, min = 0, max = 100): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function getWeatherText(weather?: TheoWeather): string {
  switch (weather?.condition) {
    case "clear":
      return "O céu está aberto";
    case "partly_cloudy":
      return "O céu está parcialmente nublado";
    case "cloudy":
      return "O céu está nublado";
    case "rain":
      return "A chuva chegou";
    case "storm":
      return "O tempo fechou";
    case "drizzle":
      return "Tem uma garoa lá fora";
    case "fog":
      return "O dia está com neblina";
    case "snow":
      return "Está nevando lá fora";
    default:
      return "";
  }
}

function generateTheoMessage(
  state: TheoState,
  performance?: TheoPerformance,
  weather?: TheoWeather,
): string {
  const accuracy = clamp(performance?.accuracy);
  const progress =
    typeof performance?.studyMinutes === "number" &&
    typeof performance?.goalMinutes === "number" &&
    performance.goalMinutes > 0
      ? clamp((performance.studyMinutes / performance.goalMinutes) * 100)
      : 0;

  const studiedCards = performance?.studiedCards ?? 0;
  const plannedCards = performance?.plannedCards ?? 0;
  const streak = performance?.streak ?? 0;
  const studyMinutes = performance?.studyMinutes ?? 0;
  const subject = performance?.subject;
  const weatherText = getWeatherText(weather);

  if (state === "celebrating") {
    if (accuracy >= 90) {
      return subject
        ? `Excelente trabalho em ${subject}. Hoje você está voando.`
        : "Excelente trabalho. Hoje você está voando.";
    }
    if (progress >= 100) return "Meta concluída. Pode comemorar: você fez a sua parte hoje.";
    if (streak >= 7) return `Mais um dia na sequência. ${streak} dias de constância.`;
    return "Missão concluída. Mais um passo foi dado.";
  }

  if (state === "success") {
    if (accuracy >= 90) return "Muito bem. Seu desempenho mostra que a revisão está funcionando.";
    if (accuracy >= 80) return "Bom desempenho. Continue mantendo esse ritmo.";
    if (studiedCards > 0)
      return `Mais ${studiedCards} cards vencidos. O importante é continuar avançando.`;
    return "Tarefa concluída. Agora é manter a constância.";
  }

  if (state === "tired") {
    if (studyMinutes >= 180)
      return "Você já estudou bastante hoje. Uma pausa também faz parte do estudo.";
    if (studyMinutes >= 90)
      return "O ritmo foi forte. Respira um pouco e depois decide se continua.";
    if (accuracy > 0 && accuracy < 60)
      return "Seu desempenho caiu um pouco. Talvez uma pausa curta ajude a recuperar o foco.";
    return "Parece que a energia baixou. Vamos com calma.";
  }

  if (state === "alert") {
    if (accuracy > 0 && accuracy < 50)
      return "Os erros aumentaram. Vale revisar esse conteúdo antes de avançar.";
    if (plannedCards > 0 && studiedCards > plannedCards)
      return "Você passou da meta. Só cuide para não transformar constância em exaustão.";
    return "Atenção aos detalhes. Vamos desacelerar e acertar o próximo.";
  }

  if (state === "warning") {
    if (accuracy > 0 && accuracy < 65)
      return "Alguns conceitos estão escapando. Que tal revisar antes de continuar?";
    if (progress < 30 && studyMinutes > 0)
      return "Começamos, mas ainda falta ganhar ritmo. Um pouco mais de foco.";
    return "Atenção, concurseiro. Pequenos ajustes fazem diferença.";
  }

  if (state === "focused") {
    if (subject) return `Foco em ${subject}. Uma questão de cada vez.`;
    if (accuracy >= 85) return "Seu foco está rendendo. Continue nesse ritmo.";
    return "Agora é concentração. Menos distração, mais uma questão.";
  }

  if (state === "studying") {
    if (subject && progress >= 75) return `Você já avançou bastante em ${subject}. Falta pouco.`;
    if (accuracy >= 85) return "Boa sequência de acertos. Continue consolidando o conteúdo.";
    if (studiedCards >= 20)
      return `${studiedCards} cards estudados. A repetição está construindo memória.`;
    return "Um card de cada vez. É assim que o conhecimento fica.";
  }

  if (state === "motivated") {
    if (streak >= 30) return `${streak} dias de constância. Você já transformou estudo em hábito.`;
    if (streak >= 7) return `${streak} dias seguidos. Não quebre a corrente agora.`;
    if (progress >= 75) return "Você está perto da meta. Mais um pouco e fechamos o dia.";
    if (accuracy >= 85) return "Seu desempenho está forte. Aproveite esse momento para avançar.";
    return "Vamos nessa. O resultado começa com o próximo bloco.";
  }

  if (state === "thinking") {
    if (accuracy > 0 && accuracy < 70)
      return "Talvez seja hora de voltar naquele conteúdo que está dando trabalho.";
    if (subject) return `Estou de olho no seu progresso em ${subject}.`;
    return "Estou analisando seu ritmo. Cada sessão conta.";
  }

  if (state === "waiting") {
    if (progress >= 100) return "A meta de hoje já foi cumprida. Missão aguardando o próximo dia.";
    return "Quando você estiver pronto, começamos.";
  }

  if (state === "letter") return "Tem uma mensagem esperando por você.";

  if (progress >= 100) return "Meta diária concluída. Constância feita mais um dia.";
  if (streak >= 30) return `Já são ${streak} dias de constância. Continue construindo.`;
  if (streak >= 7) return `${streak} dias mantendo o ritmo. O hábito está ficando forte.`;
  if (accuracy >= 90)
    return "Seu desempenho está excelente. Continue revisando para manter esse nível.";
  if (accuracy >= 80) return "Seu desempenho está consistente. Mais um pouco todos os dias.";
  if (accuracy > 0 && accuracy < 60)
    return "Hoje alguns erros apareceram. Eles também mostram onde estudar melhor.";

  if (weather?.condition === "rain")
    return "Dia de chuva lá fora. Um bom momento para algumas questões.";
  if (weather?.condition === "storm")
    return "O tempo fechou lá fora. Aqui dentro, vamos manter a calma e o foco.";
  if (weather?.condition === "cloudy")
    return "O céu está nublado. Aproveita o clima e faz mais um bloco.";
  if (weather?.condition === "clear")
    return "O céu está aberto. Que tal abrir também mais uma página?";
  if (weatherText) return `${weatherText}. Um pouco de estudo ainda pode fazer diferença hoje.`;

  return "Um pouco todos os dias. O resultado vem com a constância.";
}

/**
 * ============================================================
 * COMPONENTE
 * ============================================================
 * Repaginado para o design system do Theo:
 *  - o "chrome" ao redor do mascote (cartão de mensagem, carta,
 *    distintivos) agora usa as mesmas variáveis de cor, raio e
 *    espaçamento do resto do app (--color-primary, --color-surface-*,
 *    --radius-*) em vez de tons dourados fixos — troca de tema
 *    ou de marca é uma edição em um lugar só;
 *  - o pelo do urso continua com paleta própria (é ilustração,
 *    não interface), mas os acentos — boina, distintivo, selo da
 *    carta — herdam a cor primária do app para o mascote sempre
 *    "casar" com a tela em volta;
 *  - menos camadas de sombra/brilho simultâneas por estado, texto
 *    da mensagem com mais contraste e um pouco mais de respiro;
 *  - toda a animação decorativa já respeita prefers-reduced-motion.
 */
export default function Theo({
  state = "idle",
  motion = "idle",
  reacting = false,
  className = "h-32 w-32",
  message,
  hasLetter = false,
  letterTitle = "Uma carta para você",
  onLetterOpen,
  performance,
  weather,
  autoMessage = true,
}: TheoProps) {
  const isSuccess = state === "success" || state === "celebrating";
  const isAlert = state === "warning" || state === "alert";
  const isTired = state === "tired";
  const isFocused = state === "focused" || state === "studying";
  const isCelebrating = state === "celebrating";
  const isMotivated = state === "motivated";

  const currentMotionClass = motionClass[motion] ?? "theo-motion-idle";

  const generatedMessage = useMemo(
    () => generateTheoMessage(state, performance, weather),
    [state, performance, weather],
  );

  const displayedMessage =
    message && message.trim().length > 0
      ? message
      : autoMessage
        ? generatedMessage
        : "Um pouco todos os dias. O resultado vem com a constância.";

  const handleLetterOpen = () => {
    if (!hasLetter) return;
    onLetterOpen?.();
  };

  return (
    <svg
      viewBox="0 0 220 260"
      className={`${className} ${currentMotionClass} ${reacting ? "theo-reacting" : ""}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={stateLabel[state]}
    >
      <style>{`
        /* =====================================================
           TOKENS LOCAIS — herdam do design system quando presente,
           com fallback para o app funcionar isolado (Storybook etc.)
        ====================================================== */
        .theo-svg {
          --accent: var(--color-primary, #A4C675);
          --on-accent: var(--color-on-primary, #223409);
          --surface-1: var(--color-surface-1, #171D14);
          --surface-2: var(--color-surface-2, #1B2118);
          --on-surface: var(--color-on-surface, #EEF3E7);
          --on-surface-var: var(--color-on-surface-variant, #C1C8B9);
          --outline-var: var(--color-outline-variant, rgba(224,230,217,.14));
        }

        .theo { transform-origin: center; }

        /* ---- movimento do corpo inteiro ---- */
        .theo-motion-idle { animation: theoIdle 4s ease-in-out infinite; }
        .theo-motion-float { animation: theoFloat 1.2s ease-in-out; }
        .theo-motion-look { animation: theoLook 0.45s ease-out; }
        .theo-motion-look-left { animation: theoLookLeft 0.55s ease-out; }
        .theo-motion-look-right { animation: theoLookRight 0.55s ease-out; }
        .theo-motion-bounce { animation: theoBounce 0.85s ease-out; }
        .theo-motion-celebrate { animation: theoCelebrate 1s ease-in-out; }
        .theo-motion-thinking { animation: theoThinking 0.8s ease-in-out; }
        .theo-motion-alert { animation: theoAlertShake 0.8s ease-in-out; }
        .theo-motion-studying { animation: theoStudying 0.7s ease-in-out; }
        .theo-motion-tired { animation: theoTired 1s ease-in-out; }
        .theo-motion-waiting { animation: theoWaiting 0.9s ease-in-out; }
        .theo-motion-idle, .theo-motion-float, .theo-motion-look, .theo-motion-look-left,
        .theo-motion-look-right, .theo-motion-bounce, .theo-motion-celebrate,
        .theo-motion-thinking, .theo-motion-alert, .theo-motion-studying,
        .theo-motion-tired, .theo-motion-waiting { transform-origin: center; }
        .theo-reacting { will-change: transform, opacity; }

        @keyframes theoIdle { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
        @keyframes theoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes theoLook { 0%,100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
        @keyframes theoLookLeft { 0%,100% { transform: translateX(0); } 45% { transform: translateX(-4px); } }
        @keyframes theoLookRight { 0%,100% { transform: translateX(0); } 45% { transform: translateX(4px); } }
        @keyframes theoBounce { 0% { transform: translateY(0); } 35% { transform: translateY(-8px); } 65% { transform: translateY(2px); } 100% { transform: translateY(0); } }
        @keyframes theoCelebrate { 0%,100% { transform: translateY(0) rotate(0); } 25% { transform: translateY(-7px) rotate(-2deg); } 50% { transform: translateY(-11px) rotate(0); } 75% { transform: translateY(-7px) rotate(2deg); } }
        @keyframes theoThinking { 0%,100% { transform: rotate(0); } 50% { transform: rotate(-3deg); } }
        @keyframes theoAlertShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
        @keyframes theoStudying { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes theoTired { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(3px) rotate(-1deg); } }
        @keyframes theoWaiting { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }

        /* ---- cartão de mensagem ---- */
        .message-card { animation: cardFloat 5s ease-in-out infinite; transform-origin: center; }
        @keyframes cardFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }

        /* ---- carta do dia ---- */
        .daily-letter {
          cursor: pointer; outline: none; transform-origin: 182px 72px;
          animation: letterPendulum 3.8s ease-in-out infinite, letterAppear 0.5s ease-out;
        }
        .daily-letter:hover { filter: brightness(1.08); }
        .daily-letter:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 8px; }
        .daily-letter-paper { transform-origin: 182px 72px; animation: letterPaper 3.8s ease-in-out infinite; }
        @keyframes letterPendulum { 0% { transform: rotate(-2deg); } 20% { transform: rotate(.5deg); } 45% { transform: rotate(3deg); } 70% { transform: rotate(-1deg); } 100% { transform: rotate(-2deg); } }
        @keyframes letterPaper { 0%,100% { transform: translateY(0); } 50% { transform: translateY(1.5px); } }
        @keyframes letterAppear { 0% { opacity: 0; transform: translateY(-10px) scale(.85); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .daily-letter-glow { transform-origin: center; animation: letterGlow 2.4s ease-in-out infinite; }
        @keyframes letterGlow { 0%,100% { opacity: .1; transform: scale(.96); } 50% { opacity: .26; transform: scale(1.04); } }
        .daily-letter-seal { transform-origin: 182px 105px; animation: letterSeal 1.8s ease-in-out infinite; }
        @keyframes letterSeal { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
        .daily-letter-particle { transform-origin: center; animation: letterParticle 2.5s ease-in-out infinite; }
        .particle-1 { animation-delay: .2s; } .particle-2 { animation-delay: .8s; } .particle-3 { animation-delay: 1.3s; }
        @keyframes letterParticle { 0%,100% { opacity: .15; transform: translateY(2px) scale(.7); } 50% { opacity: .9; transform: translateY(-5px) scale(1); } }

        /* ---- estados do corpo ---- */
        .state-idle { animation: sIdle 4s ease-in-out infinite; }
        .state-focused, .state-studying { animation: sFocused 3s ease-in-out infinite; }
        .state-success, .state-celebrating { animation: sCelebrate 1.2s ease-in-out infinite; }
        .state-warning, .state-alert { animation: sAlert 0.8s ease-in-out infinite; }
        .state-tired { animation: sTired 5s ease-in-out infinite; }
        .state-thinking { animation: sThinking 3s ease-in-out infinite; }
        .state-waiting { animation: sWaiting 4s ease-in-out infinite; }
        .state-motivated { animation: sMotivated 2.5s ease-in-out infinite; }
        .state-letter { animation: sLetterReact 2.2s ease-in-out infinite; transform-origin: center; }
        @keyframes sIdle { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes sFocused { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1px); } }
        @keyframes sCelebrate { 0%,100% { transform: translateY(0) rotate(0); } 25% { transform: translateY(-5px) rotate(-2deg); } 50% { transform: translateY(-8px) rotate(0); } 75% { transform: translateY(-5px) rotate(2deg); } }
        @keyframes sAlert { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
        @keyframes sTired { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(3px) rotate(-1deg); } }
        @keyframes sThinking { 0%,100% { transform: rotate(0); } 50% { transform: rotate(-3deg); } }
        @keyframes sWaiting { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1px); } }
        @keyframes sMotivated { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-3px) scale(1.015); } }
        @keyframes sLetterReact { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }

        /* ---- boina, orelhas, olhos ---- */
        .beret { animation: beretSway 6s ease-in-out infinite; transform-origin: 110px 64px; }
        @keyframes beretSway { 0%,100% { transform: rotate(0) translateY(0); } 50% { transform: rotate(-1deg) translateY(-1px); } }
        .ear-left { transform-origin: 60px 68px; animation: earL 5s ease-in-out infinite; }
        .ear-right { transform-origin: 160px 68px; animation: earR 5s ease-in-out infinite; }
        @keyframes earL { 0%,100% { transform: rotate(0); } 50% { transform: rotate(-3deg); } }
        @keyframes earR { 0%,100% { transform: rotate(0); } 50% { transform: rotate(3deg); } }
        .look { animation: lookAround 6s ease-in-out infinite; }
        @keyframes lookAround { 0%,100% { transform: translate(0,0); } 25% { transform: translate(2px,0); } 50% { transform: translate(-2px,1px); } 75% { transform: translate(1px,-1px); } }
        .blink { animation: blinkEyes 6s infinite; transform-origin: center; }
        @keyframes blinkEyes { 0%,90%,100% { transform: scaleY(1); } 92%,94% { transform: scaleY(.06); } }

        /* ---- distintivos, estrelas, alertas ---- */
        .beret-badge { transform-origin: center; }
        .beret-badge-success { animation: badgePop .8s ease-in-out infinite; }
        @keyframes badgePop { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
        .star { animation: starTwinkle 1s ease-in-out infinite; transform-origin: center; }
        @keyframes starTwinkle { 0%,100% { opacity: .5; transform: scale(.7); } 50% { opacity: 1; transform: scale(1); } }
        .sweat { animation: sweatDrop 1.5s ease-in infinite; }
        @keyframes sweatDrop { 0% { opacity: 0; transform: translateY(-5px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(12px); } }
        .pulse { animation: pulseFade 1s ease-in-out infinite; }
        @keyframes pulseFade { 0%,100% { opacity: .4; } 50% { opacity: 1; } }
        .motivated-glow { animation: glowFade 1.5s ease-in-out infinite; }
        @keyframes glowFade { 0%,100% { opacity: .2; } 50% { opacity: .8; } }

        @media (prefers-reduced-motion: reduce) {
          .theo, .look, .blink, .ear-left, .ear-right, .beret, .beret-badge-success, .star,
          .sweat, .pulse, .motivated-glow, .message-card, .daily-letter, .daily-letter-paper,
          .daily-letter-glow, .daily-letter-seal, .daily-letter-particle,
          .theo-motion-idle, .theo-motion-float, .theo-motion-look, .theo-motion-look-left,
          .theo-motion-look-right, .theo-motion-bounce, .theo-motion-celebrate,
          .theo-motion-thinking, .theo-motion-alert, .theo-motion-studying,
          .theo-motion-tired, .theo-motion-waiting {
            animation: none;
          }
        }
      `}</style>

      <g className="theo-svg">
        {/* =====================================================
            MENSAGEM DO DIA — mesmo cartão de superfície do resto
            do app: fundo de camada 2, borda sutil, sem brilho
            dourado, texto no par de cores on-surface / on-variant.
        ====================================================== */}
        <g className="message-card">
          <rect
            x="15"
            y="9"
            width="190"
            height="43"
            rx="16"
            fill="var(--surface-2)"
            stroke="var(--outline-var)"
            strokeWidth="1"
          />

          <rect x="15" y="9" width="4" height="43" rx="2" fill="var(--accent)" opacity="0.85" />

          <circle
            cx="32"
            cy="30"
            r="8"
            fill="var(--surface-1)"
            stroke="var(--accent)"
            strokeWidth="1"
          />
          <path
            d="M32 24 L33.7 28 L38 28.4 L34.8 31 L35.8 35 L32 32.8 L28.2 35 L29.2 31 L26 28.4 L30.3 28 Z"
            fill="var(--accent)"
          />

          <text
            x="47"
            y="23"
            fill="var(--accent)"
            fontSize="6.5"
            fontFamily="Inter, Arial, sans-serif"
            fontWeight="700"
            letterSpacing="1"
          >
            MENSAGEM DO DIA
          </text>

          <text
            x="47"
            y="34"
            fill="var(--on-surface)"
            fontSize="6.2"
            fontFamily="Inter, Arial, sans-serif"
            fontWeight="500"
          >
            {displayedMessage.length > 48 ? `${displayedMessage.slice(0, 48)}…` : displayedMessage}
          </text>

          <path d="M47 42 H178" stroke="var(--outline-var)" strokeWidth="1" strokeLinecap="round" />
        </g>

        {/* =====================================================
            CARTA DO DIA — mesmo envelope, cor de selo agora vem
            do token de acento em vez de dourado fixo.
        ====================================================== */}
        {hasLetter && (
          <g
            className="daily-letter"
            role="button"
            tabIndex={0}
            aria-label={letterTitle}
            onClick={handleLetterOpen}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleLetterOpen();
              }
            }}
          >
            <ellipse cx="182" cy="124" rx="25" ry="5" fill="#000" opacity="0.16" />
            <rect
              x="153"
              y="76"
              width="58"
              height="52"
              rx="14"
              fill="var(--accent)"
              opacity="0.12"
              className="daily-letter-glow"
            />

            <circle cx="182" cy="72" r="3.5" fill="var(--accent)" />
            <path
              d="M182 72 C178 76 178 80 182 84 C186 80 186 76 182 72"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />

            <g className="daily-letter-paper">
              <rect
                x="158"
                y="83"
                width="48"
                height="37"
                rx="10"
                fill="#000"
                opacity="0.18"
                transform="translate(1.5 2.5)"
              />
              <rect
                x="158"
                y="82"
                width="48"
                height="36"
                rx="10"
                fill="var(--surface-1)"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />

              <path
                d="M159 87 L182 104 L205 87"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
              <path
                d="M159 113 L175 99"
                stroke="var(--accent)"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.45"
              />
              <path
                d="M205 113 L189 99"
                stroke="var(--accent)"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.45"
              />

              <g className="daily-letter-seal">
                <circle cx="182" cy="105" r="6" fill="var(--accent)" opacity="0.25" />
                <circle cx="182" cy="105" r="4.2" fill="var(--accent)" />
                <path
                  d="M182 102 L183 104 L186 104 L184 106 L185 109 L182 107.2 L179 109 L180 106 L178 104 L181 104 Z"
                  fill="var(--on-accent)"
                />
              </g>
            </g>

            <circle
              cx="151"
              cy="91"
              r="1.5"
              fill="var(--accent)"
              className="daily-letter-particle particle-1"
            />
            <circle
              cx="211"
              cy="99"
              r="1.2"
              fill="var(--accent)"
              className="daily-letter-particle particle-2"
            />
            <circle
              cx="153"
              cy="111"
              r="1"
              fill="var(--accent)"
              className="daily-letter-particle particle-3"
            />
          </g>
        )}

        {/* =====================================================
            THEO — pelo mantém paleta própria de ilustração;
            boina, distintivo e badges herdam a cor de acento.
        ====================================================== */}
        <g className={`theo state-${state}`}>
          {isMotivated && (
            <circle
              cx="110"
              cy="150"
              r="94"
              stroke="var(--accent)"
              strokeWidth="2"
              opacity=".15"
              className="motivated-glow"
            />
          )}

          {/* ORELHAS */}
          <circle className="ear-left" cx="60" cy="68" r="30" fill="#765335" />
          <circle className="ear-right" cx="160" cy="68" r="30" fill="#765335" />
          <circle cx="60" cy="68" r="15" fill="#B7956D" />
          <circle cx="160" cy="68" r="15" fill="#B7956D" />

          {/* CABEÇA */}
          <circle cx="110" cy="125" r="79" fill="#8B633F" />
          <path
            d="M38 140 Q110 205 182 140 Q174 201 110 207 Q46 201 38 140 Z"
            fill="#3C291B"
            opacity=".12"
          />
          <path
            d="M48 115 Q54 72 89 54 Q70 92 72 137 Q72 169 91 195 Q53 179 45 145 Z"
            fill="#563A25"
            opacity=".08"
          />

          {/* BOINA */}
          <g className="beret">
            <path
              d="M42 64 C45 43 62 27 87 21 C112 15 139 18 161 29 C177 37 188 49 191 61 C176 55 157 51 137 50 C113 48 89 51 67 57 C57 59 49 62 42 64 Z"
              fill="#344A38"
            />
            <path
              d="M53 57 C62 39 78 29 96 25 C120 20 143 25 160 34 C145 31 125 31 105 35 C84 39 67 48 53 57 Z"
              fill="#405844"
              opacity=".75"
            />
            <path
              d="M43 63 C66 51 92 46 117 46 C143 46 169 51 190 61 C193 66 191 72 187 77 C165 68 141 63 113 63 C86 63 61 68 47 76 C43 72 41 67 43 63 Z"
              fill="#1C2920"
            />
            <path
              d="M47 66 C67 57 89 54 113 54 C141 54 167 59 188 68 C190 71 189 75 186 79 C164 70 140 67 113 67 C86 67 62 71 49 79 C46 75 45 70 47 66 Z"
              fill="#26382B"
            />
            <path
              d="M50 67 C72 59 92 57 113 57 C140 57 165 62 185 70"
              stroke="#596D53"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              opacity=".9"
            />
            <path
              d="M58 54 C76 42 94 36 113 34 C132 32 149 35 164 42"
              stroke="#687A60"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              opacity=".55"
            />
            <path
              d="M157 56 C171 58 183 62 190 67 C192 70 191 74 187 77 C178 72 169 69 158 67 Z"
              fill="#202F24"
            />
            <path
              d="M151 38 C157 40 161 43 164 48 L159 51 C156 47 153 45 148 44 Z"
              fill="#202F24"
            />

            {/* DISTINTIVO DA BOINA — cor de acento do app */}
            <g className={isSuccess ? "beret-badge beret-badge-success" : "beret-badge"}>
              <circle cx="158" cy="39" r="13" fill="var(--accent)" />
              <circle
                cx="158"
                cy="39"
                r="10"
                fill="#344A38"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
              <path
                d="M158 30 L160.5 36 L167 36.5 L162 40.5 L163.5 47 L158 43.5 L152.5 47 L154 40.5 L149 36.5 L155.5 36 Z"
                fill="var(--on-accent)"
              />
            </g>
          </g>

          {/* SOBRANCELHAS */}
          {isTired ? (
            <>
              <path
                d="M68 90 Q82 96 96 91"
                stroke="#563A25"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M124 91 Q138 96 152 90"
                stroke="#563A25"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </>
          ) : isAlert ? (
            <>
              <path
                d="M68 84 Q82 76 96 82"
                stroke="#563A25"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M124 82 Q138 76 152 84"
                stroke="#563A25"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </>
          ) : isFocused ? (
            <>
              <path
                d="M68 89 Q82 83 96 87"
                stroke="#563A25"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M124 87 Q138 83 152 89"
                stroke="#563A25"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <path
                d="M68 88 Q82 81 96 87"
                stroke="#563A25"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M124 87 Q138 81 152 88"
                stroke="#563A25"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </>
          )}

          {/* OLHOS */}
          <g className="eyes">
            <g className="blink">
              <ellipse
                cx="82"
                cy="108"
                rx={isTired ? 13 : 14}
                ry={isTired ? 8 : 14}
                fill="#F7F5ED"
              />
              <circle className="look" cx="84" cy="108" r="6" fill="#171B17" />
              <circle cx="86" cy="106" r="1.7" fill="#FFF" opacity=".75" />
            </g>
            <g className="blink">
              <ellipse
                cx="138"
                cy="108"
                rx={isTired ? 13 : 14}
                ry={isTired ? 8 : 14}
                fill="#F7F5ED"
              />
              <circle className="look" cx="140" cy="108" r="6" fill="#171B17" />
              <circle cx="142" cy="106" r="1.7" fill="#FFF" opacity=".75" />
            </g>
          </g>

          {/* FOCINHO */}
          <ellipse cx="110" cy="146" rx="36" ry="27" fill="#D9B995" />
          <ellipse cx="110" cy="137" rx="10" ry="7" fill="#171A17" />

          {/* BOCA */}
          {isSuccess ? (
            <path
              d="M88 151 Q110 178 132 151"
              stroke="#171A17"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
          ) : isTired ? (
            <path
              d="M98 157 Q110 151 122 157"
              stroke="#171A17"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          ) : isAlert ? (
            <ellipse cx="110" cy="156" rx="7" ry="9" fill="#171A17" />
          ) : isMotivated ? (
            <path
              d="M91 151 Q110 169 129 151"
              stroke="#171A17"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <path
              d="M110 143 L110 153 M110 153 Q100 162 91 154 M110 153 Q120 162 129 154"
              stroke="#171A17"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* BOCHECHAS */}
          <circle cx="55" cy="145" r="9" fill="#A66D5E" opacity={isSuccess ? ".35" : ".18"} />
          <circle cx="165" cy="145" r="9" fill="#A66D5E" opacity={isSuccess ? ".35" : ".18"} />

          {/* PENSANDO */}
          {state === "thinking" && (
            <g>
              <circle cx="180" cy="35" r="4" fill="var(--accent)" className="star" />
              <circle cx="195" cy="22" r="6" fill="var(--accent)" className="star" />
              <path
                d="M205 45 L208 51 L215 52 L210 57 L211 64 L205 60 L199 64 L200 57 L195 52 L202 51 Z"
                fill="var(--accent)"
                className="star"
              />
            </g>
          )}

          {/* ALERTA */}
          {state === "alert" && (
            <g className="pulse">
              <path
                d="M181 76 L181 48 M173 56 L181 48 L189 56"
                stroke="var(--accent)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* WARNING */}
          {state === "warning" && (
            <g className="pulse">
              <circle cx="181" cy="48" r="10" stroke="var(--accent)" strokeWidth="2" opacity=".8" />
              <path
                d="M181 42 V50"
                stroke="var(--on-accent)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="181" cy="55" r="1.8" fill="var(--on-accent)" />
            </g>
          )}

          {/* CANSADO */}
          {state === "tired" && (
            <g>
              <path d="M45 105 L32 110" stroke="#7396A0" strokeWidth="4" strokeLinecap="round" />
              <path d="M175 105 L188 110" stroke="#7396A0" strokeWidth="4" strokeLinecap="round" />
              <circle cx="188" cy="112" r="3" fill="#7396A0" className="sweat" />
            </g>
          )}

          {/* MOTIVADO */}
          {state === "motivated" && (
            <g>
              <path
                d="M29 67 L32 74 L40 77 L32 80 L29 87 L26 80 L18 77 L26 74 Z"
                fill="var(--accent)"
                className="star"
              />
              <path
                d="M191 88 L194 95 L202 98 L194 101 L191 108 L188 101 L180 98 L188 95 Z"
                fill="var(--accent)"
                className="star"
              />
            </g>
          )}

          {/* COMEMORANDO */}
          {isCelebrating && (
            <g>
              <path
                d="M35 55 L38 63 L46 66 L38 69 L35 77 L32 69 L24 66 L32 63 Z"
                fill="var(--accent)"
                className="star"
              />
              <path
                d="M185 55 L188 63 L196 66 L188 69 L185 77 L182 69 L174 66 L182 63 Z"
                fill="var(--accent)"
                className="star"
              />
              <circle cx="110" cy="19" r="4" fill="var(--accent)" className="star" />
            </g>
          )}

          {/* SUCESSO */}
          {state === "success" && (
            <g className="pulse">
              <circle
                cx="185"
                cy="42"
                r="13"
                stroke="var(--accent)"
                strokeWidth="2"
                opacity=".65"
              />
              <path
                d="M178 42 L183 47 L192 37"
                stroke="var(--on-surface)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* COLETE / PEITO */}
          <path d="M89 190 Q110 182 131 190 L128 207 Q110 212 92 207 Z" fill="#26352A" />
          <path d="M89 190 Q110 182 131 190 L125 196 Q110 190 95 196 Z" fill="#344A38" />

          {/* DISTINTIVO DO PEITO */}
          <circle cx="110" cy="198" r="5" fill="var(--accent)" />
          <path
            d="M110 194 L111.5 197 L115 197.5 L112.5 200 L113 203.5 L110 202 L107 203.5 L107.5 200 L105 197.5 L108.5 197 Z"
            fill="var(--on-accent)"
          />
          <path
            d="M94 202 H101"
            stroke="#596D53"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".8"
          />
          <path
            d="M119 202 H126"
            stroke="#596D53"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".8"
          />
        </g>
      </g>
    </svg>
  );
}
