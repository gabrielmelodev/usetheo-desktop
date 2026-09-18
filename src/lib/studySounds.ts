/**
 * Theo — Motor de Sons para Estudo
 *
 * Recursos:
 * - 100% local/offline
 * - Ruído branco
 * - Ruído rosa
 * - Ruído marrom
 * - Chuva
 * - Ondas do mar
 * - Volume persistente
 * - Mute persistente
 * - Fade in/out
 * - Compressor interno
 * - Filtro por tipo de som
 * - Analisador espectral
 * - RMS / Peak meter
 * - Cache de AudioBuffer
 * - Detecção de saída de áudio
 * - Fone / Headset
 * - Caixa de som
 * - Bluetooth
 * - HDMI / DisplayPort
 * - USB / DAC / Interface
 * - Seleção de saída quando suportada pelo Chromium
 * - Persistência local
 * - Estatísticas de sessão
 * - Sem arquivos de áudio externos
 */

export type StudySoundId = "off" | "brown" | "pink" | "white" | "rain" | "ocean" | "radio-senado";

export type StudySoundCharacter = "deep" | "balanced" | "bright" | "natural";

export type StudySoundFrequencyProfile = "low" | "balanced" | "wide" | "dynamic";

export type StudySoundDynamics = "continuous" | "variable";

export type StudySoundIdActive = Exclude<StudySoundId, "off" | "radio-senado">;

export type StudyAudioOutputType =
  | "unknown"
  | "headphones"
  | "speaker"
  | "bluetooth"
  | "hdmi"
  | "usb";

export interface StudySoundDefinition {
  readonly id: StudySoundId;
  readonly name: string;
  readonly description: string;
  readonly type: "noise" | "stream";
  readonly character: StudySoundCharacter;
  readonly frequencyProfile: StudySoundFrequencyProfile;
  readonly dynamics: StudySoundDynamics;
  readonly spectralDescription: string;
  readonly stereo: boolean;
  readonly internalGain: number;
}

export interface PersistedSoundSettings {
  soundId: StudySoundId;
  volume: number;
  muted: boolean;
  outputDeviceId?: string;
  radioSenadoStreamUrl?: string;
}

export interface StudySoundState {
  soundId: StudySoundId;
  volume: number;
  muted: boolean;
  playing: boolean;
  contextState: AudioContextState | "unavailable";
  outputType: StudyAudioOutputType;
  outputDeviceId: string;
}

export interface StudySoundInfo {
  definition: StudySoundDefinition;
  state: StudySoundState;
}

export interface StudySoundMeter {
  rms: number;
  peak: number;
  rmsPercent: number;
  peakPercent: number;
}

export interface StudySoundSpectrum {
  frequencies: Float32Array<ArrayBuffer>;
  magnitudes: Float32Array<ArrayBuffer>;
  binCount: number;
  sampleRate: number;
  fftSize: number;
}

export interface StudySoundSessionStats {
  startedAt: number | null;
  elapsedSeconds: number;
  playCount: number;
  switchCount: number;
}

export interface StudyAudioOutput {
  readonly deviceId: string;
  readonly label: string;
  readonly type: StudyAudioOutputType;
  readonly isDefault: boolean;
}

export interface StudyAudioOutputState {
  readonly outputs: readonly StudyAudioOutput[];
  readonly currentDeviceId: string;
  readonly currentOutput: StudyAudioOutput | null;
  readonly supported: boolean;
  readonly canSelectOutput: boolean;
}

type SoundEventListener = (state: StudySoundState) => void;

type AudioContextConstructor = new () => AudioContext;

type WindowWithAudioContext = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

type AudioContextWithSink = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const STORAGE_KEY = "theo.study.sounds";

const DEFAULT_SOUND_ID: StudySoundId = "off";
const DEFAULT_VOLUME = 35;
const DEFAULT_MUTED = false;
const DEFAULT_OUTPUT_DEVICE_ID = "default";

/**
 * A Rádio Senado pode ser sintonizada em 91,7 MHz FM em Brasília.
 * A frequência FM é física; para reprodução dentro do Theo é necessário
 * um endereço de streaming de áudio compatível com HTMLAudioElement.
 *
 * O site oficial mantém os canais "Ao Vivo", mas a página web não é,
 * por si só, uma URL de áudio que possa ser usada como <audio src>.
 */
const DEFAULT_RADIO_SENADO_STREAM_URL = "";

const MAX_MASTER_GAIN = 0.18;

const COMPRESSOR_THRESHOLD = -18;
const COMPRESSOR_KNEE = 12;
const COMPRESSOR_RATIO = 8;
const COMPRESSOR_ATTACK = 0.003;
const COMPRESSOR_RELEASE = 0.18;

const FADE_IN_SECONDS = 0.8;
const FADE_OUT_SECONDS = 0.45;
const STOP_DELAY_SECONDS = 0.5;

const SAVE_DEBOUNCE_MS = 250;

const ANALYSER_FFT_SIZE = 2048;
const ANALYSER_SMOOTHING = 0.82;

const BUFFER_DURATION: Record<StudySoundIdActive, number> = {
  white: 4,
  pink: 5,
  brown: 5,
  rain: 8,
  ocean: 12,
};

export const STUDY_SOUNDS: Record<StudySoundId, StudySoundDefinition> = {
  off: {
    id: "off",
    name: "Desligado",
    description: "Nenhum som sendo reproduzido.",
    type: "noise",
    character: "balanced",
    frequencyProfile: "balanced",
    dynamics: "continuous",
    spectralDescription: "Nenhum sinal de áudio.",
    stereo: false,
    internalGain: 0,
  },

  brown: {
    id: "brown",
    name: "Ruído Marrom",
    description: "Som grave e profundo, com maior presença de baixas frequências.",
    type: "noise",
    character: "deep",
    frequencyProfile: "low",
    dynamics: "continuous",
    spectralDescription: "Predominância de componentes de baixa frequência.",
    stereo: false,
    internalGain: 0.82,
  },

  pink: {
    id: "pink",
    name: "Ruído Rosa",
    description: "Ruído equilibrado e suave, com distribuição espectral intermediária.",
    type: "noise",
    character: "balanced",
    frequencyProfile: "balanced",
    dynamics: "continuous",
    spectralDescription: "Distribuição espectral aproximada do tipo 1/f.",
    stereo: false,
    internalGain: 0.88,
  },

  white: {
    id: "white",
    name: "Ruído Branco",
    description: "Ruído contínuo e amplo, distribuído por uma grande faixa de frequências.",
    type: "noise",
    character: "bright",
    frequencyProfile: "wide",
    dynamics: "continuous",
    spectralDescription: "Energia distribuída amplamente pelo espectro.",
    stereo: false,
    internalGain: 0.62,
  },

  rain: {
    id: "rain",
    name: "Chuva",
    description: "Textura sonora inspirada em chuva, com ruído suave e pequenas variações.",
    type: "noise",
    character: "natural",
    frequencyProfile: "dynamic",
    dynamics: "variable",
    spectralDescription: "Ruído filtrado com pequenas variações e transientes.",
    stereo: true,
    internalGain: 0.78,
  },

  "radio-senado": {
    id: "radio-senado",
    name: "Rádio Senado — 91,7 FM",
    description: "Rádio Senado FM de Brasília. Frequência: 91,7 MHz.",
    type: "stream",
    character: "balanced",
    frequencyProfile: "dynamic",
    dynamics: "variable",
    spectralDescription: "Áudio de transmissão radiofônica externa.",
    stereo: true,
    internalGain: 1,
  },

  ocean: {
    id: "ocean",
    name: "Ondas do Mar",
    description: "Textura sonora inspirada em ondas, com variação lenta de intensidade.",
    type: "noise",
    character: "natural",
    frequencyProfile: "dynamic",
    dynamics: "variable",
    spectralDescription: "Ruído filtrado com modulação lenta de amplitude.",
    stereo: true,
    internalGain: 0.72,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createArrayBuffer(byteLength: number): ArrayBuffer {
  return new ArrayBuffer(Math.max(0, Math.floor(byteLength)));
}

function createFloat32Buffer(length: number): Float32Array<ArrayBuffer> {
  return new Float32Array(createArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
}

function createUint8Buffer(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createArrayBuffer(length));
}

function randomFloat(): number {
  return Math.random() * 2 - 1;
}

function createExecutionRandom(): number {
  return Math.random();
}

export class StudySoundEngine {
  private context: AudioContext | null = null;

  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;

  private source: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
  private sourceFilter: BiquadFilterNode | null = null;

  private currentSound: StudySoundId = DEFAULT_SOUND_ID;

  private volume = DEFAULT_VOLUME;
  private muted = DEFAULT_MUTED;

  private selectedOutputId = DEFAULT_OUTPUT_DEVICE_ID;

  private radioSenadoAudio: HTMLAudioElement | null = null;
  private radioSenadoSource: MediaElementAudioSourceNode | null = null;
  private radioSenadoStreamUrl = DEFAULT_RADIO_SENADO_STREAM_URL;
  private radioSenadoErrorHandler: (() => void) | null = null;

  private playing = false;
  private starting = false;

  private noiseBuffers = new Map<StudySoundIdActive, AudioBuffer>();

  private listeners = new Set<SoundEventListener>();

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private sessionStartedAt: number | null = null;

  private totalPlayCount = 0;
  private switchCount = 0;

  /**
   * IMPORTANTE:
   *
   * Os buffers são explicitamente ArrayBuffer.
   * Isso evita:
   *
   * Float32Array<ArrayBufferLike>
   * ->
   * Float32Array<ArrayBuffer>
   */
  private meterBuffer: Float32Array<ArrayBuffer> | null = null;

  private spectrumBuffer: Uint8Array<ArrayBuffer> | null = null;

  private audioOutputs: StudyAudioOutput[] = [];

  private deviceChangeHandler: (() => void) | null = null;

  constructor() {
    const settings = this.loadSettings();

    this.currentSound = settings.soundId;

    this.volume = settings.volume;

    this.muted = settings.muted;

    this.selectedOutputId = settings.outputDeviceId ?? DEFAULT_OUTPUT_DEVICE_ID;
  }

  // =========================================================
  // PERSISTÊNCIA
  // =========================================================

  private loadSettings(): PersistedSoundSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return {
          soundId: DEFAULT_SOUND_ID,
          volume: DEFAULT_VOLUME,
          muted: DEFAULT_MUTED,
          outputDeviceId: DEFAULT_OUTPUT_DEVICE_ID,
        };
      }

      const parsed = JSON.parse(raw) as Partial<PersistedSoundSettings>;

      const soundId =
        parsed.soundId && parsed.soundId in STUDY_SOUNDS ? parsed.soundId : DEFAULT_SOUND_ID;

      const volume = clamp(safeNumber(parsed.volume, DEFAULT_VOLUME), 0, 100);

      const muted = typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_MUTED;

      const outputDeviceId =
        typeof parsed.outputDeviceId === "string" && parsed.outputDeviceId.trim()
          ? parsed.outputDeviceId
          : DEFAULT_OUTPUT_DEVICE_ID;

      const radioSenadoStreamUrl =
        typeof parsed.radioSenadoStreamUrl === "string"
          ? parsed.radioSenadoStreamUrl.trim()
          : DEFAULT_RADIO_SENADO_STREAM_URL;

      return {
        soundId,
        volume,
        muted,
        outputDeviceId,
        radioSenadoStreamUrl,
      };
    } catch {
      return {
        soundId: DEFAULT_SOUND_ID,
        volume: DEFAULT_VOLUME,
        muted: DEFAULT_MUTED,
        outputDeviceId: DEFAULT_OUTPUT_DEVICE_ID,
      };
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveSettings();
    }, SAVE_DEBOUNCE_MS);
  }

  private saveSettings(): void {
    try {
      const data: PersistedSoundSettings = {
        soundId: this.currentSound,
        volume: this.volume,
        muted: this.muted,
        outputDeviceId: this.selectedOutputId,
        radioSenadoStreamUrl: this.radioSenadoStreamUrl,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Persistência nunca deve quebrar o áudio.
    }
  }

  // =========================================================
  // AUDIO CONTEXT
  // =========================================================

  private getAudioContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }

    try {
      const win = window as WindowWithAudioContext;

      const AudioContextClass = window.AudioContext ?? win.webkitAudioContext;

      if (!AudioContextClass) {
        return null;
      }

      this.context = new AudioContextClass();

      const context = this.context;

      this.compressor = context.createDynamicsCompressor();

      this.compressor.threshold.value = COMPRESSOR_THRESHOLD;

      this.compressor.knee.value = COMPRESSOR_KNEE;

      this.compressor.ratio.value = COMPRESSOR_RATIO;

      this.compressor.attack.value = COMPRESSOR_ATTACK;

      this.compressor.release.value = COMPRESSOR_RELEASE;

      this.analyser = context.createAnalyser();

      this.analyser.fftSize = ANALYSER_FFT_SIZE;

      this.analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;

      this.masterGain = context.createGain();

      this.masterGain.gain.value = this.getMasterGainValue();

      /*
       * Cadeia:
       *
       * source
       *   ↓
       * filter
       *   ↓
       * sourceGain
       *   ↓
       * compressor
       *   ↓
       * masterGain
       *   ↓
       * analyser
       *   ↓
       * destination
       */

      this.compressor.connect(this.masterGain);

      this.masterGain.connect(this.analyser);

      this.analyser.connect(context.destination);

      context.onstatechange = () => {
        this.emit();
      };

      this.setupDeviceDetection();

      return context;
    } catch {
      this.context = null;
      return null;
    }
  }

  private async ensureContext(): Promise<AudioContext | null> {
    const context = this.getAudioContext();

    if (!context) {
      return null;
    }

    try {
      if (context.state === "suspended") {
        await context.resume();
      }
    } catch {
      return null;
    }

    return context;
  }

  // =========================================================
  // SAÍDA DE ÁUDIO
  // =========================================================

  private setupDeviceDetection(): void {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      return;
    }

    if (this.deviceChangeHandler) {
      return;
    }

    this.deviceChangeHandler = () => {
      void this.refreshAudioOutputs();
    };

    navigator.mediaDevices.addEventListener("devicechange", this.deviceChangeHandler);

    void this.refreshAudioOutputs();
  }

  private classifyAudioOutput(label: string): StudyAudioOutputType {
    const value = normalizeText(label);

    if (!value) {
      return "unknown";
    }

    // Bluetooth primeiro.
    if (
      value.includes("bluetooth") ||
      value.includes("airpods") ||
      value.includes("airpod") ||
      value.includes("buds") ||
      value.includes("wireless")
    ) {
      return "bluetooth";
    }

    // Fones antes de Realtek,
    // evitando classificar headphone Realtek
    // como caixa.
    if (
      value.includes("headphone") ||
      value.includes("headset") ||
      value.includes("earphone") ||
      value.includes("earbud") ||
      value.includes("fone") ||
      value.includes("head phones")
    ) {
      return "headphones";
    }

    if (
      value.includes("hdmi") ||
      value.includes("displayport") ||
      value.includes("display audio") ||
      value.includes("monitor")
    ) {
      return "hdmi";
    }

    if (
      value.includes("usb") ||
      value.includes("dac") ||
      value.includes("audio interface") ||
      value.includes("interface de audio")
    ) {
      return "usb";
    }

    if (
      value.includes("speaker") ||
      value.includes("speakers") ||
      value.includes("alto falante") ||
      value.includes("alto-falante") ||
      value.includes("caixa") ||
      value.includes("realtek") ||
      value.includes("conexant")
    ) {
      return "speaker";
    }

    return "unknown";
  }

  async refreshAudioOutputs(): Promise<StudyAudioOutput[]> {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== "function"
    ) {
      this.audioOutputs = [];
      this.emit();
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const outputs: StudyAudioOutput[] = [];
      const seen = new Set<string>();

      for (const device of devices) {
        if (device.kind !== "audiooutput") {
          continue;
        }

        const deviceId = device.deviceId || "default";

        if (seen.has(deviceId)) {
          continue;
        }

        seen.add(deviceId);

        const label = device.label || "Saída de áudio";

        outputs.push({
          deviceId,
          label,
          type: this.classifyAudioOutput(label),
          isDefault: deviceId === "default",
        });
      }

      this.audioOutputs = outputs;

      const selectedExists =
        this.selectedOutputId === DEFAULT_OUTPUT_DEVICE_ID ||
        outputs.some((output) => output.deviceId === this.selectedOutputId);

      if (!selectedExists) {
        this.selectedOutputId = DEFAULT_OUTPUT_DEVICE_ID;

        this.scheduleSave();
      }

      this.emit();

      return [...outputs];
    } catch {
      this.audioOutputs = [];
      this.emit();
      return [];
    }
  }

  async getAudioOutputs(): Promise<readonly StudyAudioOutput[]> {
    if (this.audioOutputs.length === 0) {
      await this.refreshAudioOutputs();
    }

    return [...this.audioOutputs];
  }

  getCurrentAudioOutput(): StudyAudioOutput | null {
    if (this.selectedOutputId === DEFAULT_OUTPUT_DEVICE_ID) {
      return this.audioOutputs.find((output) => output.isDefault) ?? this.audioOutputs[0] ?? null;
    }

    return this.audioOutputs.find((output) => output.deviceId === this.selectedOutputId) ?? null;
  }

  getAudioOutputState(): StudyAudioOutputState {
    const context = this.context as AudioContextWithSink | null;

    return {
      outputs: [...this.audioOutputs],
      currentDeviceId: this.selectedOutputId,
      currentOutput: this.getCurrentAudioOutput(),
      supported: typeof navigator !== "undefined" && !!navigator.mediaDevices,
      canSelectOutput: !!context && typeof context.setSinkId === "function",
    };
  }

  async setAudioOutput(deviceId: string): Promise<boolean> {
    const normalized = String(deviceId || "").trim();

    if (!normalized) {
      return false;
    }

    const context = await this.ensureContext();

    if (!context) {
      return false;
    }

    const contextWithSink = context as AudioContextWithSink;

    if (typeof contextWithSink.setSinkId !== "function") {
      /*
       * O navegador/Electron pode detectar
       * a saída, mas não permitir seleção
       * programática do sink.
       */
      this.selectedOutputId = normalized;

      this.scheduleSave();
      this.emit();

      return false;
    }

    try {
      await contextWithSink.setSinkId(normalized);

      this.selectedOutputId = normalized;

      this.scheduleSave();
      this.emit();

      return true;
    } catch {
      return false;
    }
  }

  // =========================================================
  // VOLUME
  // =========================================================

  private getMasterGainValue(): number {
    if (this.muted) {
      return 0;
    }

    const normalized = clamp(this.volume, 0, 100) / 100;

    const curved = Math.pow(normalized, 1.65);

    return curved * MAX_MASTER_GAIN;
  }

  private applyMasterGain(immediate = false): void {
    if (!this.masterGain || !this.context) {
      return;
    }

    const gain = this.getMasterGainValue();

    const now = this.context.currentTime;

    try {
      this.masterGain.gain.cancelScheduledValues(now);

      if (immediate) {
        this.masterGain.gain.setValueAtTime(gain, now);
        return;
      }

      this.masterGain.gain.setTargetAtTime(gain, now, 0.04);
    } catch {
      this.masterGain.gain.value = gain;
    }
  }

  setVolume(volume: number): void {
    this.volume = clamp(safeNumber(volume, DEFAULT_VOLUME), 0, 100);

    this.applyMasterGain();

    this.scheduleSave();
    this.emit();
  }

  getVolume(): number {
    return this.volume;
  }

  getVolumeDb(): number {
    const gain = this.getMasterGainValue();

    if (gain <= 0) {
      return -Infinity;
    }

    return 20 * Math.log10(gain);
  }

  setMuted(muted: boolean): void {
    this.muted = Boolean(muted);

    this.applyMasterGain();

    this.scheduleSave();
    this.emit();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  // =========================================================
  // GERAÇÃO DE RUÍDO
  // =========================================================

  private generateWhiteNoise(data: Float32Array<ArrayBuffer>): void {
    for (let i = 0; i < data.length; i++) {
      data[i] = randomFloat();
    }
  }

  private generatePinkNoise(data: Float32Array<ArrayBuffer>): void {
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;

    for (let i = 0; i < data.length; i++) {
      const white = randomFloat();

      b0 = 0.99886 * b0 + white * 0.0555179;

      b1 = 0.99332 * b1 + white * 0.0750759;

      b2 = 0.969 * b2 + white * 0.153852;

      b3 = 0.8665 * b3 + white * 0.3104856;

      b4 = 0.55 * b4 + white * 0.5329522;

      b5 = -0.7616 * b5 - white * 0.016898;

      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;

      b6 = white * 0.115926;

      data[i] = pink * 0.11;
    }
  }

  private generateBrownNoise(data: Float32Array<ArrayBuffer>): void {
    let last = 0;

    for (let i = 0; i < data.length; i++) {
      const white = randomFloat();

      last += white * 0.018;
      last *= 0.9985;

      data[i] = clamp(last * 3.2, -1, 1);
    }
  }

  private generateRain(
    left: Float32Array<ArrayBuffer>,
    right: Float32Array<ArrayBuffer>,
    sampleRate: number,
  ): void {
    let previousLeft = 0;
    let previousRight = 0;

    for (let i = 0; i < left.length; i++) {
      const t = i / sampleRate;

      const envelope = 0.65 + 0.12 * Math.sin(t * 0.37) + 0.08 * Math.sin(t * 0.91);

      let noiseLeft = randomFloat();

      let noiseRight = randomFloat();

      previousLeft = previousLeft * 0.82 + noiseLeft * 0.18;

      previousRight = previousRight * 0.82 + noiseRight * 0.18;

      let sampleLeft = previousLeft * envelope * 0.45;

      let sampleRight = previousRight * envelope * 0.45;

      /*
       * Pequenos transientes,
       * simulando gotas.
       */
      if (Math.random() < 0.00055) {
        const drop = 0.3 + createExecutionRandom() * 0.7;

        sampleLeft += drop;
        sampleRight += drop * 0.9;
      }

      left[i] = clamp(sampleLeft, -1, 1);

      right[i] = clamp(sampleRight, -1, 1);
    }
  }

  private generateOcean(
    left: Float32Array<ArrayBuffer>,
    right: Float32Array<ArrayBuffer>,
    sampleRate: number,
  ): void {
    let previousLeft = 0;
    let previousRight = 0;

    for (let i = 0; i < left.length; i++) {
      const t = i / sampleRate;

      const swell = 0.52 + 0.28 * (0.5 + 0.5 * Math.sin(t * 0.075));

      const secondary = 0.08 * Math.sin(t * 0.41);

      const noiseLeft = randomFloat();

      const noiseRight = randomFloat();

      previousLeft = previousLeft * 0.94 + noiseLeft * 0.06;

      previousRight = previousRight * 0.94 + noiseRight * 0.06;

      const foamLeft = previousLeft * swell;

      const foamRight = previousRight * swell;

      left[i] = clamp(foamLeft * 0.65 + secondary, -1, 1);

      right[i] = clamp(foamRight * 0.65 + secondary, -1, 1);
    }
  }

  // =========================================================
  // CACHE
  // =========================================================

  private generateBuffer(soundId: StudySoundIdActive): AudioBuffer | null {
    const context = this.context;

    if (!context) {
      return null;
    }

    const definition = STUDY_SOUNDS[soundId];

    const duration = BUFFER_DURATION[soundId];

    const channels = definition.stereo ? 2 : 1;

    const frameCount = Math.floor(context.sampleRate * duration);

    try {
      const buffer = context.createBuffer(channels, frameCount, context.sampleRate);

      if (soundId === "white") {
        const channel = buffer.getChannelData(0);

        /*
         * getChannelData pode possuir
         * tipagem ArrayBufferLike.
         *
         * A escrita é segura porque
         * não passamos esse array para
         * uma API que exige ArrayBuffer.
         */
        for (let i = 0; i < channel.length; i++) {
          channel[i] = randomFloat();
        }
      }

      if (soundId === "pink") {
        const channel = buffer.getChannelData(0);

        for (let i = 0; i < channel.length; i++) {
          channel[i] = 0;
        }

        /*
         * Gera em buffer próprio
         * com ArrayBuffer explícito.
         */
        const generated = createFloat32Buffer(frameCount);

        this.generatePinkNoise(generated);

        channel.set(generated);
      }

      if (soundId === "brown") {
        const channel = buffer.getChannelData(0);

        const generated = createFloat32Buffer(frameCount);

        this.generateBrownNoise(generated);

        channel.set(generated);
      }

      if (soundId === "rain") {
        const left = createFloat32Buffer(frameCount);

        const right = createFloat32Buffer(frameCount);

        this.generateRain(left, right, context.sampleRate);

        buffer.getChannelData(0).set(left);

        buffer.getChannelData(1).set(right);
      }

      if (soundId === "ocean") {
        const left = createFloat32Buffer(frameCount);

        const right = createFloat32Buffer(frameCount);

        this.generateOcean(left, right, context.sampleRate);

        buffer.getChannelData(0).set(left);

        buffer.getChannelData(1).set(right);
      }

      this.noiseBuffers.set(soundId, buffer);

      return buffer;
    } catch {
      return null;
    }
  }

  private getBuffer(soundId: StudySoundIdActive): AudioBuffer | null {
    const cached = this.noiseBuffers.get(soundId);

    if (cached) {
      return cached;
    }

    return this.generateBuffer(soundId);
  }

  async preload(soundId: StudySoundIdActive): Promise<boolean> {
    const context = await this.ensureContext();

    if (!context) {
      return false;
    }

    return !!this.getBuffer(soundId);
  }

  async preloadAll(): Promise<void> {
    const context = await this.ensureContext();

    if (!context) {
      return;
    }

    const sounds: StudySoundIdActive[] = ["white", "pink", "brown", "rain", "ocean"];

    for (const sound of sounds) {
      if (!this.noiseBuffers.has(sound)) {
        this.generateBuffer(sound);

        /*
         * Dá oportunidade ao renderer
         * de respirar entre gerações.
         */
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  getCachedBufferCount(): number {
    return this.noiseBuffers.size;
  }

  clearUnusedBuffers(): void {
    if (this.currentSound === "off") {
      this.noiseBuffers.clear();
      return;
    }

    for (const id of ["white", "pink", "brown", "rain", "ocean"] as StudySoundIdActive[]) {
      if (id !== this.currentSound) {
        this.noiseBuffers.delete(id);
      }
    }
  }

  clearAllBuffers(): void {
    this.noiseBuffers.clear();
  }

  // =========================================================
  // FILTROS
  // =========================================================

  private configureFilter(filter: BiquadFilterNode, soundId: StudySoundIdActive): void {
    switch (soundId) {
      case "brown":
        filter.type = "lowpass";
        filter.frequency.value = 420;
        filter.Q.value = 0.45;
        break;

      case "pink":
        filter.type = "lowpass";
        filter.frequency.value = 7500;
        filter.Q.value = 0.25;
        break;

      case "white":
        filter.type = "lowpass";
        filter.frequency.value = 11000;
        filter.Q.value = 0.15;
        break;

      case "rain":
        filter.type = "bandpass";
        filter.frequency.value = 3200;
        filter.Q.value = 0.45;
        break;

      case "ocean":
        filter.type = "lowpass";
        filter.frequency.value = 1800;
        filter.Q.value = 0.35;
        break;
    }
  }

  // =========================================================
  // RÁDIO SENADO
  // =========================================================

  setRadioSenadoStreamUrl(url: string): void {
    this.radioSenadoStreamUrl = String(url ?? "").trim();

    if (this.radioSenadoAudio) {
      this.radioSenadoAudio.pause();
      this.radioSenadoAudio.removeAttribute("src");
      this.radioSenadoAudio.load();
    }

    this.scheduleSave();
    this.emit();
  }

  getRadioSenadoStreamUrl(): string {
    return this.radioSenadoStreamUrl;
  }

  getRadioSenadoInfo() {
    return {
      name: "Rádio Senado",
      frequency: "91,7 MHz",
      city: "Brasília/DF",
      officialPage: "https://www12.senado.leg.br/radio",
      streamUrlConfigured: Boolean(this.radioSenadoStreamUrl),
    };
  }

  private async prepareRadioSenado(): Promise<HTMLAudioElement | null> {
    const context = await this.ensureContext();

    if (!context || !this.radioSenadoStreamUrl) {
      return null;
    }

    if (!this.radioSenadoAudio) {
      const audio = new Audio();
      audio.preload = "none";
      audio.crossOrigin = "anonymous";

      this.radioSenadoErrorHandler = () => {
        this.playing = false;
        this.emit();
      };

      audio.addEventListener("error", this.radioSenadoErrorHandler);

      this.radioSenadoAudio = audio;
    }

    if (!this.radioSenadoSource) {
      try {
        this.radioSenadoSource = context.createMediaElementSource(this.radioSenadoAudio);
        this.radioSenadoSource.connect(this.compressor!);
      } catch {
        return null;
      }
    }

    this.radioSenadoAudio.src = this.radioSenadoStreamUrl;
    this.radioSenadoAudio.load();

    return this.radioSenadoAudio;
  }

  private async playRadioSenado(): Promise<boolean> {
    const audio = await this.prepareRadioSenado();

    if (!audio) {
      return false;
    }

    try {
      await audio.play();

      const previousSound = this.currentSound;
      this.currentSound = "radio-senado";
      this.playing = true;
      this.totalPlayCount++;

      if (previousSound !== "off" && previousSound !== "radio-senado") {
        this.switchCount++;
      }

      if (this.sessionStartedAt === null) {
        this.sessionStartedAt = Date.now();
      }

      this.applyMasterGain(true);
      this.scheduleSave();
      this.emit();

      return true;
    } catch {
      this.playing = false;
      this.emit();
      return false;
    }
  }

  private stopRadioSenado(): void {
    if (this.radioSenadoAudio) {
      try {
        this.radioSenadoAudio.pause();
        this.radioSenadoAudio.currentTime = 0;
      } catch {
        // Ignora se o elemento já estiver encerrado.
      }
    }

    this.playing = false;
    this.emit();
  }

  // =========================================================
  // REPRODUÇÃO
  // =========================================================

  async play(soundId: StudySoundId = this.currentSound): Promise<boolean> {
    if (soundId === "off") {
      this.stop();
      return true;
    }

    if (!STUDY_SOUNDS[soundId]) {
      return false;
    }

    if (this.starting) {
      return false;
    }

    this.starting = true;

    try {
      if (soundId === "radio-senado") {
        this.stop(false);
        return await this.playRadioSenado();
      }

      const context = await this.ensureContext();

      if (!context) {
        return false;
      }

      /*
       * Se já existe uma reprodução,
       * paramos antes de criar a nova.
       */
      if (this.source) {
        this.stop(false);

        await new Promise<void>((resolve) => setTimeout(resolve, 30));
      }

      const buffer = this.getBuffer(soundId);

      if (!buffer) {
        return false;
      }

      const source = context.createBufferSource();

      const sourceGain = context.createGain();

      const filter = context.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      this.configureFilter(filter, soundId);

      sourceGain.gain.setValueAtTime(0.0001, context.currentTime);

      sourceGain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, STUDY_SOUNDS[soundId].internalGain),
        context.currentTime + FADE_IN_SECONDS,
      );

      source.connect(filter);

      filter.connect(sourceGain);

      if (!this.compressor) {
        return false;
      }

      sourceGain.connect(this.compressor);

      source.onended = () => {
        if (this.source === source) {
          this.source = null;
          this.sourceGain = null;
          this.sourceFilter = null;
          this.playing = false;

          this.emit();
        }
      };

      this.source = source;
      this.sourceGain = sourceGain;
      this.sourceFilter = filter;

      source.start();

      const previousSound = this.currentSound;

      this.currentSound = soundId;

      this.playing = true;

      this.totalPlayCount++;

      if (previousSound !== "off" && previousSound !== soundId) {
        this.switchCount++;
      }

      if (this.sessionStartedAt === null) {
        this.sessionStartedAt = Date.now();
      }

      this.applyMasterGain(true);

      this.scheduleSave();
      this.emit();

      return true;
    } catch {
      return false;
    } finally {
      this.starting = false;
    }
  }

  stop(fade = true): void {
    if (this.currentSound === "radio-senado" || this.radioSenadoAudio) {
      this.stopRadioSenado();
    }

    const source = this.source;

    const sourceGain = this.sourceGain;

    const context = this.context;

    if (!source || !sourceGain || !context) {
      this.playing = false;
      this.emit();
      return;
    }

    try {
      const now = context.currentTime;

      sourceGain.gain.cancelScheduledValues(now);

      const currentGain = Math.max(0.0001, sourceGain.gain.value);

      sourceGain.gain.setValueAtTime(currentGain, now);

      if (fade) {
        sourceGain.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT_SECONDS);

        source.stop(now + STOP_DELAY_SECONDS);
      } else {
        source.stop();
      }
    } catch {
      try {
        source.stop();
      } catch {
        // Já encerrado.
      }
    }

    this.source = null;
    this.sourceGain = null;
    this.sourceFilter = null;

    this.playing = false;

    this.emit();
  }

  async toggle(): Promise<boolean> {
    if (this.playing) {
      this.stop();
      return false;
    }

    if (this.currentSound === "off") {
      this.currentSound = "brown";
    }

    return this.play(this.currentSound);
  }

  async setSound(soundId: StudySoundId): Promise<boolean> {
    if (!STUDY_SOUNDS[soundId]) {
      return false;
    }

    if (soundId === "off") {
      this.currentSound = "off";

      this.stop();

      this.scheduleSave();
      this.emit();

      return true;
    }

    if (this.playing) {
      return this.play(soundId);
    }

    this.currentSound = soundId;

    this.scheduleSave();
    this.emit();

    return true;
  }

  // =========================================================
  // ANALISADOR
  // =========================================================

  getMeter(): StudySoundMeter {
    if (!this.analyser) {
      return {
        rms: 0,
        peak: 0,
        rmsPercent: 0,
        peakPercent: 0,
      };
    }

    const length = this.analyser.fftSize;

    if (!this.meterBuffer || this.meterBuffer.length !== length) {
      this.meterBuffer = createFloat32Buffer(length);
    }

    /*
     * Aqui está uma das correções
     * principais do erro TypeScript:
     *
     * meterBuffer:
     * Float32Array<ArrayBuffer>
     */
    this.analyser.getFloatTimeDomainData(this.meterBuffer);

    let sumSquares = 0;
    let peak = 0;

    for (let i = 0; i < this.meterBuffer.length; i++) {
      const value = this.meterBuffer[i];

      sumSquares += value * value;

      const absolute = Math.abs(value);

      if (absolute > peak) {
        peak = absolute;
      }
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, this.meterBuffer.length));

    return {
      rms,
      peak,
      rmsPercent: clamp(rms * 100, 0, 100),
      peakPercent: clamp(peak * 100, 0, 100),
    };
  }

  getSpectrum(): StudySoundSpectrum {
    if (!this.analyser || !this.context) {
      return {
        frequencies: createFloat32Buffer(0),
        magnitudes: createFloat32Buffer(0),
        binCount: 0,
        sampleRate: 0,
        fftSize: 0,
      };
    }

    const binCount = this.analyser.frequencyBinCount;

    if (!this.spectrumBuffer || this.spectrumBuffer.length !== binCount) {
      this.spectrumBuffer = createUint8Buffer(binCount);
    }

    this.analyser.getByteFrequencyData(this.spectrumBuffer);

    const frequencies = createFloat32Buffer(binCount);

    const magnitudes = createFloat32Buffer(binCount);

    const nyquist = this.context.sampleRate / 2;

    for (let i = 0; i < binCount; i++) {
      frequencies[i] = (i / binCount) * nyquist;

      magnitudes[i] = this.spectrumBuffer[i] / 255;
    }

    return {
      frequencies,
      magnitudes,
      binCount,
      sampleRate: this.context.sampleRate,
      fftSize: this.analyser.fftSize,
    };
  }

  setAnalyserFftSize(fftSize: number): boolean {
    if (!this.analyser) {
      return false;
    }

    const allowed = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];

    if (!allowed.includes(fftSize)) {
      return false;
    }

    try {
      this.analyser.fftSize = fftSize;

      this.meterBuffer = createFloat32Buffer(fftSize);

      this.spectrumBuffer = createUint8Buffer(this.analyser.frequencyBinCount);

      return true;
    } catch {
      return false;
    }
  }

  // =========================================================
  // ESTADO
  // =========================================================

  getState(): StudySoundState {
    const contextState = this.context?.state ?? "unavailable";

    const currentOutput = this.getCurrentAudioOutput();

    return {
      soundId: this.currentSound,

      volume: this.volume,

      muted: this.muted,

      playing: this.playing,

      contextState,

      outputType: currentOutput?.type ?? "unknown",

      outputDeviceId: this.selectedOutputId,
    };
  }

  getCurrentSound(): StudySoundDefinition {
    return STUDY_SOUNDS[this.currentSound];
  }

  getSoundInfo(soundId: StudySoundId): StudySoundInfo {
    return {
      definition: STUDY_SOUNDS[soundId],
      state: this.getState(),
    };
  }

  getAllSounds(): StudySoundDefinition[] {
    return Object.values(STUDY_SOUNDS);
  }

  // =========================================================
  // ESTATÍSTICAS
  // =========================================================

  getSessionStats(): StudySoundSessionStats {
    let elapsedSeconds = 0;

    if (this.sessionStartedAt !== null) {
      elapsedSeconds = Math.max(0, Math.floor((Date.now() - this.sessionStartedAt) / 1000));
    }

    return {
      startedAt: this.sessionStartedAt,

      elapsedSeconds,

      playCount: this.totalPlayCount,

      switchCount: this.switchCount,
    };
  }

  resetSessionStats(): void {
    this.sessionStartedAt = this.playing ? Date.now() : null;

    this.totalPlayCount = 0;
    this.switchCount = 0;

    this.emit();
  }

  // =========================================================
  // EVENTOS
  // =========================================================

  subscribe(listener: SoundEventListener): () => void {
    this.listeners.add(listener);

    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const state = this.getState();

    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Um listener quebrado
        // não pode derrubar o motor.
      }
    }
  }

  // =========================================================
  // DIAGNÓSTICO
  // =========================================================

  getDiagnostics() {
    const output = this.getCurrentAudioOutput();

    return {
      contextState: this.context?.state ?? "unavailable",

      sampleRate: this.context?.sampleRate ?? 0,

      currentSound: this.currentSound,

      playing: this.playing,

      volume: this.volume,

      muted: this.muted,

      outputDeviceId: this.selectedOutputId,

      outputType: output?.type ?? "unknown",

      outputLabel: output?.label ?? "Desconhecido",

      outputCount: this.audioOutputs.length,

      canSelectOutput: this.getAudioOutputState().canSelectOutput,

      cachedBuffers: this.noiseBuffers.size,

      fftSize: this.analyser?.fftSize ?? 0,

      session: this.getSessionStats(),
    };
  }

  // =========================================================
  // DESTRUIÇÃO
  // =========================================================

  destroy(): void {
    this.stop(false);

    if (this.deviceChangeHandler && typeof navigator !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.removeEventListener("devicechange", this.deviceChangeHandler);
    }

    this.deviceChangeHandler = null;

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);

      this.saveTimer = null;
    }

    try {
      this.source?.disconnect();
    } catch {}

    try {
      this.sourceGain?.disconnect();
    } catch {}

    try {
      this.sourceFilter?.disconnect();
    } catch {}

    try {
      this.compressor?.disconnect();
    } catch {}

    try {
      this.masterGain?.disconnect();
    } catch {}

    try {
      this.analyser?.disconnect();
    } catch {}

    if (this.context) {
      void this.context.close();
    }

    this.context = null;
    this.source = null;
    this.sourceGain = null;
    this.sourceFilter = null;

    if (this.radioSenadoAudio && this.radioSenadoErrorHandler) {
      this.radioSenadoAudio.removeEventListener("error", this.radioSenadoErrorHandler);
    }

    try {
      this.radioSenadoSource?.disconnect();
    } catch {}

    if (this.radioSenadoAudio) {
      try {
        this.radioSenadoAudio.pause();
        this.radioSenadoAudio.removeAttribute("src");
        this.radioSenadoAudio.load();
      } catch {}
    }

    this.radioSenadoAudio = null;
    this.radioSenadoSource = null;
    this.radioSenadoErrorHandler = null;

    this.compressor = null;
    this.masterGain = null;
    this.analyser = null;

    this.meterBuffer = null;
    this.spectrumBuffer = null;

    this.noiseBuffers.clear();
    this.audioOutputs = [];
    this.listeners.clear();

    this.playing = false;
    this.starting = false;
  }
}

// ===========================================================
// INSTÂNCIA ÚNICA
// ===========================================================

export const studySoundEngine = new StudySoundEngine();

export default studySoundEngine;
