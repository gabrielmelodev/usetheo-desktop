import { ArrowRight, Brain, Music2, Sparkles, Stars, Volume2, VolumeX, Zap } from "lucide-react";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Link } from "react-router-dom";

/* ================================================================
   ESTRELAS
================================================================ */

const particles = [
  { left: "8%", top: "18%", delay: "0s", duration: "5s" },
  { left: "17%", top: "72%", delay: "1.2s", duration: "6s" },
  { left: "28%", top: "31%", delay: "2.1s", duration: "5.5s" },
  { left: "76%", top: "22%", delay: "0.8s", duration: "6.5s" },
  { left: "87%", top: "64%", delay: "1.8s", duration: "5.8s" },
  { left: "69%", top: "78%", delay: "2.7s", duration: "6.2s" },
  { left: "45%", top: "12%", delay: "1.5s", duration: "5.2s" },
  { left: "54%", top: "88%", delay: "3s", duration: "6.8s" },
];

/* ================================================================
   COMPONENTE
================================================================ */

export default function Stats() {
  const [musicEnabled, setMusicEnabled] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const musicTimerRef = useRef<number | null>(null);

  /* ==============================================================
     CRIA AMBIENTE MUSICAL
  ============================================================== */

  const startMusic = useCallback(() => {
    if (audioContextRef.current) {
      setMusicEnabled(true);
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      const audioContext = new AudioContextClass();

      const masterGain = audioContext.createGain();

      masterGain.gain.setValueAtTime(0, audioContext.currentTime);

      masterGain.gain.linearRampToValueAtTime(0.035, audioContext.currentTime + 3);

      masterGain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      masterGainRef.current = masterGain;

      /*
       * Acorde ambiente muito suave.
       *
       * Frequências baixas e espaçadas para dar sensação
       * de espaço/cosmos sem parecer uma música agressiva.
       */

      const satelliteFrequencies = [1200, 1350, 1500, 1650, 1800];
      function playSatelliteSignal(audioContext: AudioContext) {
        const now = audioContext.currentTime;

        const frequencies = [1200, 1500, 1800];

        frequencies.forEach((frequency, index) => {
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();

          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, now);

          const start = now + index * 0.35;

          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.012, start + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);

          oscillator.connect(gain);
          gain.connect(audioContext.destination);

          oscillator.start(start);
          oscillator.stop(start + 0.4);
        });
      }

      /*
       * LFO extremamente leve para movimentar o som.
       */

      const lfo = audioContext.createOscillator();
      const lfoGain = audioContext.createGain();

      lfo.type = "sine";
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 0.015;

      lfo.connect(lfoGain);
      lfoGain.connect(masterGain.gain);

      lfo.start();

      /*
       * Pequenas variações harmônicas.
       * Não cria vários osciladores constantemente.
       */

      const ambientNotes = [392.0, 329.63, 261.63, 293.66, 349.23, 392.0];

      let noteIndex = 0;

      const playAmbientNote = () => {
        const context = audioContextRef.current;
        const master = masterGainRef.current;

        if (!context || !master) {
          return;
        }

        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = "sine";

        const frequency = ambientNotes[noteIndex];

        oscillator.frequency.setValueAtTime(frequency, context.currentTime);

        gain.gain.setValueAtTime(0.0001, context.currentTime);

        gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 1.8);

        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 5.5);

        oscillator.connect(gain);
        gain.connect(master);

        oscillator.start();

        oscillator.stop(context.currentTime + 6);

        noteIndex = (noteIndex + 1) % ambientNotes.length;
      };

      playAmbientNote();

      musicTimerRef.current = window.setInterval(playAmbientNote, 5200);

      setMusicEnabled(true);
    } catch (error) {
      console.warn("Não foi possível iniciar o ambiente musical:", error);
    }
  }, []);

  /* ==============================================================
     DESLIGA MÚSICA
  ============================================================== */

  const stopMusic = useCallback(() => {
    const context = audioContextRef.current;
    const master = masterGainRef.current;

    if (!context || !master) {
      setMusicEnabled(false);
      return;
    }

    const now = context.currentTime;

    master.gain.cancelScheduledValues(now);

    master.gain.setValueAtTime(master.gain.value, now);

    master.gain.linearRampToValueAtTime(0, now + 1.5);

    if (musicTimerRef.current !== null) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }

    window.setTimeout(() => {
      oscillatorsRef.current.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch {
          // Oscilador já finalizado.
        }
      });

      oscillatorsRef.current = [];

      try {
        context.close();
      } catch {
        // Contexto já fechado.
      }

      audioContextRef.current = null;
      masterGainRef.current = null;
    }, 1600);

    setMusicEnabled(false);
  }, []);

  /* ==============================================================
     TOGGLE
  ============================================================== */

  const toggleMusic = useCallback(async () => {
    if (musicEnabled) {
      stopMusic();
      return;
    }

    const context = audioContextRef.current;

    if (context?.state === "suspended") {
      await context.resume();
      setMusicEnabled(true);
      return;
    }

    startMusic();
  }, [musicEnabled, startMusic, stopMusic]);

  /* ==============================================================
     LIMPEZA
  ============================================================== */

  useEffect(() => {
    return () => {
      if (musicTimerRef.current !== null) {
        window.clearInterval(musicTimerRef.current);
      }

      oscillatorsRef.current.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch {
          // Ignora osciladores já encerrados.
        }
      });

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030712] text-white">
      {/* ============================================================
          FUNDO GALÁCTICO LEVE
      ============================================================ */}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Fundo */}
        <div className="absolute inset-0 bg-[#030712]" />

        {/* Brilho central */}
        <div
          className="
            absolute
            left-1/2
            top-1/2
            h-[500px]
            w-[500px]
            -translate-x-1/2
            -translate-y-1/2
            rounded-full
            bg-cyan-500/[0.035]
            blur-[90px]
          "
        />

        {/* Verde Theo */}
        <div
          className="
            absolute
            -right-32
            top-1/4
            h-[350px]
            w-[350px]
            rounded-full
            bg-emerald-400/[0.035]
            blur-[80px]
          "
        />

        {/* Violeta */}
        <div
          className="
            absolute
            -left-32
            bottom-10
            h-[320px]
            w-[320px]
            rounded-full
            bg-violet-500/[0.025]
            blur-[80px]
          "
        />

        {/* ========================================================
            ESTRELAS
        ======================================================== */}

        {particles.map((particle, index) => (
          <span
            key={index}
            className="
              absolute
              h-1
              w-1
              rounded-full
              bg-white/40
              shadow-[0_0_8px_rgba(255,255,255,.25)]
              animate-[floatParticle_var(--duration)_ease-in-out_var(--delay)_infinite]
            "
            style={
              {
                left: particle.left,
                top: particle.top,
                "--delay": particle.delay,
                "--duration": particle.duration,
              } as CSSProperties
            }
          />
        ))}

        {/* Estrelas maiores */}
        <span
          className="
            absolute
            left-[12%]
            top-[22%]
            h-1
            w-1
            rounded-full
            bg-cyan-200/60
            shadow-[0_0_10px_rgba(103,232,249,.4)]
          "
        />

        <span
          className="
            absolute
            left-[82%]
            top-[18%]
            h-1
            w-1
            rounded-full
            bg-white/50
            shadow-[0_0_10px_rgba(255,255,255,.3)]
          "
        />

        <span
          className="
            absolute
            left-[72%]
            top-[78%]
            h-1
            w-1
            rounded-full
            bg-emerald-200/50
            shadow-[0_0_10px_rgba(110,231,183,.3)]
          "
        />

        <span
          className="
            absolute
            left-[23%]
            top-[82%]
            h-1
            w-1
            rounded-full
            bg-violet-200/40
          "
        />

        {/* Grade quase invisível */}
        <div
          className="
            absolute
            inset-0
            opacity-[0.012]
            [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)]
            [background-size:80px_80px]
          "
        />

        {/* Vinheta */}
        <div
          className="
            absolute
            inset-0
            bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,.45)_100%)]
          "
        />
      </div>

      {/* ============================================================
          BOTÃO DE MÚSICA
      ============================================================ */}

      <button
        type="button"
        onClick={toggleMusic}
        aria-label={musicEnabled ? "Desligar ambiente musical" : "Ligar ambiente musical"}
        title={musicEnabled ? "Desligar ambiente musical" : "Ouvir ambiente musical"}
        className="
          group
          fixed
          right-5
          top-5
          z-50
          flex
          h-10
          w-10
          mt-8
          items-center
          justify-center
          rounded-full
          border
          border-white/[0.08]
          bg-white/[0.045]
          text-white/45
          shadow-[0_8px_30px_rgba(0,0,0,.25)]
          backdrop-blur-xl
          transition-all
          duration-300
          hover:border-emerald-300/20
          hover:bg-emerald-300/[0.07]
          hover:text-emerald-200
          active:scale-95
        "
      >
        {musicEnabled ? <Volume2 size={17} className="animate-pulse" /> : <Music2 size={17} />}

        {/* indicador */}
        {musicEnabled && (
          <span
            className="
              absolute
              -right-0.5
              -top-0.5
              h-2
              w-2
              rounded-full
              bg-emerald-300
              shadow-[0_0_8px_rgba(110,231,183,.8)]
            "
          />
        )}
      </button>

      {/* ============================================================
          CONTEÚDO
      ============================================================ */}

      <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
        <section className="w-full max-w-2xl text-center">
          {/* ========================================================
              ÍCONE / ÓRBITAS
          ======================================================== */}

          <div
            className="
              relative
              mx-auto
              mb-9
              h-32
              w-32
              animate-[fadeUp_.8s_ease-out_both]
            "
          >
            {/* Halo */}
            <div
              className="
                absolute
                inset-7
                rounded-[28px]
                bg-emerald-400/[0.07]
                blur-xl
                animate-[pulse_3s_ease-in-out_infinite]
              "
            />

            {/* Órbita externa */}
            <div
              className="
                absolute
                inset-0
                rounded-full
                border
                border-emerald-400/[0.10]
                animate-[spin_18s_linear_infinite]
              "
            >
              <span
                className="
                  absolute
                  left-1/2
                  -top-1
                  h-2
                  w-2
                  -translate-x-1/2
                  rounded-full
                  bg-emerald-300/70
                  shadow-[0_0_18px_rgba(110,231,183,.7)]
                "
              />
            </div>

            {/* Órbita interna */}
            <div
              className="
                absolute
                inset-4
                rounded-full
                border
                border-white/[0.055]
                animate-[spin_11s_linear_infinite_reverse]
              "
            >
              <span
                className="
                  absolute
                  right-1
                  top-1/2
                  h-1.5
                  w-1.5
                  -translate-y-1/2
                  rounded-full
                  bg-cyan-300/60
                  shadow-[0_0_14px_rgba(103,232,249,.6)]
                "
              />
            </div>

            {/* Logo */}
            <div
              className="
                absolute
                inset-[31px]
                flex
                items-center
                justify-center
                rounded-[22px]
                border
                border-white/[0.10]
                bg-white/[0.045]
                shadow-[0_0_45px_rgba(110,231,183,.08)]
                backdrop-blur-xl
                animate-[logoFloat_4s_ease-in-out_infinite]
              "
            >
              <Brain size={29} strokeWidth={1.5} className="text-emerald-200" />

              <Sparkles
                size={11}
                className="
                  absolute
                  right-1
                  top-1
                  text-emerald-300/80
                  animate-[sparkle_2s_ease-in-out_infinite]
                "
              />
            </div>
          </div>

          {/* ========================================================
              STATUS
          ======================================================== */}

          <div
            className="
              mb-5
              inline-flex
              items-center
              gap-2
              rounded-full
              border
              border-emerald-300/[0.12]
              bg-emerald-300/[0.035]
              px-3
              py-1.5
              text-[10px]
              font-semibold
              uppercase
              tracking-[0.18em]
              text-emerald-200/65
              animate-[fadeUp_.8s_.12s_ease-out_both]
            "
          >
            <span className="relative flex h-2 w-2">
              <span
                className="
                  absolute
                  inline-flex
                  h-full
                  w-full
                  animate-ping
                  rounded-full
                  bg-emerald-300/50
                "
              />

              <span
                className="
                  relative
                  inline-flex
                  h-2
                  w-2
                  rounded-full
                  bg-emerald-300/80
                "
              />
            </span>
            Theo está chegando
          </div>

          {/* ========================================================
              TÍTULO
          ======================================================== */}

          <h1
            className="
              animate-[fadeUp_.8s_.22s_ease-out_both]
              font-display
              text-4xl
              font-semibold
              leading-[1.08]
              tracking-[-0.035em]
              text-white
              sm:text-5xl
              lg:text-[58px]
            "
          >
            A Theo vai{" "}
            <span
              className="
                relative
                mx-2
                inline-block
                bg-gradient-to-r
                from-emerald-200
                via-white
                to-cyan-200
                bg-clip-text
                text-transparent
              "
            >
              conversar
            </span>{" "}
            com você.
          </h1>

          {/* ========================================================
              SUBTÍTULO
          ======================================================== */}

          <p
            className="
              mx-auto
              mt-6
              max-w-xl
              animate-[fadeUp_.8s_.34s_ease-out_both]
              text-sm
              leading-7
              text-white/40
              sm:text-base
            "
          >
            Estamos preparando um espaço inteligente para tirar suas dúvidas, orientar seus estudos
            e acompanhar sua jornada.
          </p>

          {/* ========================================================
              CARDS
          ======================================================== */}

          <div
            className="
              mx-auto
              mt-9
              grid
              max-w-xl
              grid-cols-1
              gap-2.5
              sm:grid-cols-3
              animate-[fadeUp_.8s_.46s_ease-out_both]
            "
          >
            <Feature icon={<Sparkles size={15} />} text="Dúvidas" />

            <Feature icon={<Brain size={15} />} text="Orientação" />

            <Feature icon={<Zap size={15} />} text="Evolução" />
          </div>

          {/* ========================================================
              BOTÃO
          ======================================================== */}

          <div
            className="
              mt-10
              animate-[fadeUp_.8s_.58s_ease-out_both]
            "
          >
            <Link
              to="/"
              className="
                group
                relative
                inline-flex
                items-center
                gap-2.5
                overflow-hidden
                rounded-xl
                border
                border-white/[0.10]
                bg-white/[0.055]
                px-5
                py-3
                text-sm
                font-semibold
                text-white/80
                shadow-[0_10px_40px_rgba(0,0,0,.18)]
                backdrop-blur-xl
                transition-all
                duration-300
                hover:-translate-y-1
                hover:border-emerald-300/25
                hover:bg-emerald-300/[0.07]
                hover:text-white
                hover:shadow-[0_15px_50px_rgba(110,231,183,.08)]
                active:translate-y-0
              "
            >
              <span
                className="
                  absolute
                  inset-y-0
                  -left-20
                  w-16
                  skew-x-[-20deg]
                  bg-gradient-to-r
                  from-transparent
                  via-white/[0.12]
                  to-transparent
                  transition-transform
                  duration-700
                  group-hover:translate-x-[360px]
                "
              />

              <span className="relative">Voltar ao início</span>

              <ArrowRight
                size={15}
                className="
                  relative
                  transition-transform
                  duration-300
                  group-hover:translate-x-1
                "
              />
            </Link>
          </div>

          {/* ========================================================
              RODAPÉ
          ======================================================== */}

          <div
            className="
              mt-12
              flex
              items-center
              justify-center
              gap-2
              animate-[fadeUp_.8s_.7s_ease-out_both]
              text-[10px]
              uppercase
              tracking-[0.18em]
              text-white/20
            "
          >
            <Stars size={11} className="text-emerald-300/30" />
            Construindo algo especial
            <Stars size={11} className="text-cyan-300/30" />
          </div>
        </section>
      </main>

      {/* ============================================================
          ANIMAÇÕES
      ============================================================ */}

      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes logoFloat {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }

          50% {
            transform: translateY(-5px) scale(1.025);
          }
        }

        @keyframes sparkle {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(0.8) rotate(0deg);
          }

          50% {
            opacity: 1;
            transform: scale(1.15) rotate(15deg);
          }
        }

        @keyframes floatParticle {
          0%,
          100% {
            opacity: 0.15;
            transform: translate3d(0, 0, 0) scale(0.8);
          }

          50% {
            opacity: 0.65;
            transform: translate3d(0, -18px, 0) scale(1.15);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ================================================================
   FEATURE
================================================================ */

function Feature({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div
      className="
        group
        flex
        items-center
        justify-center
        gap-2
        rounded-xl
        border
        border-white/[0.055]
        bg-white/[0.018]
        px-3
        py-3
        text-xs
        font-medium
        text-white/35
        backdrop-blur-sm
        transition-all
        duration-300
        hover:-translate-y-0.5
        hover:border-emerald-300/[0.14]
        hover:bg-emerald-300/[0.025]
        hover:text-white/60
      "
    >
      <span
        className="
          text-emerald-300/45
          transition-all
          duration-300
          group-hover:scale-110
          group-hover:text-emerald-200
        "
      >
        {icon}
      </span>

      {text}
    </div>
  );
}
