// Captura de audio (micrófono o tono de prueba) + análisis continuo + suavizado.
import { createYinDetector } from './yin.ts';

export interface Reading {
  /** Frecuencia suavizada en Hz, o null si no hay nota. */
  freq: number | null;
  /** Nivel de entrada 0…1 (para el medidor). */
  level: number;
}

type Listener = (r: Reading) => void;

const FFT_SIZE = 4096;
/** Cada cuántos ms se analiza (≈25 veces por segundo). */
const ANALYSIS_INTERVAL_MS = 40;
/** Claridad mínima de YIN para aceptar una lectura. */
const MIN_CLARITY = 0.85;
/** Cuánto se mantiene la última lectura tras perder la señal. */
const HOLD_MS = 1000;
/** Dos lecturas seguidas deben estar dentro de este margen. */
const STABLE_RATIO = 0.03;
const HISTORY = 5;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class Tuner {
  readonly ctx: AudioContext;
  private analyser: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;
  private detect = createYinDetector();
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private demoNodes: AudioScheduledSourceNode[] = [];
  private listeners = new Set<Listener>();
  private raf = 0;
  private lastAnalysis = 0;

  private paused = false;
  private lastRaw: number | null = null;
  private history: number[] = [];
  private lastValidAt = 0;
  private current: number | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.buf = new Float32Array(FFT_SIZE);
  }

  /** Abre el micrófono sin los filtros de voz, que arruinan la detección. */
  async startMic(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.connect(this.ctx.createMediaStreamSource(this.stream));
  }

  /**
   * Modo de prueba: una "cuerda" sintética (fundamental + armónicos) alimenta
   * el detector en lugar del micrófono. No suena por los parlantes.
   */
  startDemo(freq: number): void {
    const mix = this.ctx.createGain();
    mix.gain.value = 0.3;
    [1, 0.8, 0.5, 0.3].forEach((amp, i) => {
      const osc = this.ctx.createOscillator();
      osc.frequency.value = freq * (i + 1);
      const g = this.ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(mix);
      osc.start();
      this.demoNodes.push(osc);
    });
    this.connect(mix);
  }

  private connect(node: AudioNode): void {
    this.source = node;
    node.connect(this.analyser);
    this.loop();
  }

  onReading(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Pausa el análisis (p. ej. mientras suena el tono de referencia). */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.reset();
    if (paused) this.emit({ freq: null, level: 0 });
  }

  private reset(): void {
    this.lastRaw = null;
    this.history = [];
    this.current = null;
    this.lastValidAt = 0;
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.lastAnalysis < ANALYSIS_INTERVAL_MS || this.paused) return;
    this.lastAnalysis = now;

    this.analyser.getFloatTimeDomainData(this.buf);
    const r = this.detect(this.buf, this.ctx.sampleRate);
    const level = r ? Math.min(1, r.rms * 6) : 0;

    if (r && r.clarity >= MIN_CLARITY) {
      const f = r.freq;
      const stable = this.lastRaw !== null && Math.abs(f / this.lastRaw - 1) < STABLE_RATIO;
      this.lastRaw = f;
      if (stable) {
        // Si cambió de nota, empezar de cero para no mezclar notas en la mediana.
        if (this.history.length && Math.abs(f / median(this.history) - 1) > STABLE_RATIO) {
          this.history = [];
        }
        this.history.push(f);
        if (this.history.length > HISTORY) this.history.shift();
        this.current = median(this.history);
        this.lastValidAt = now;
      }
    } else {
      this.lastRaw = null;
      if (this.current !== null && now - this.lastValidAt > HOLD_MS) {
        this.history = [];
        this.current = null;
      }
    }

    this.emit({ freq: this.current, level });
  };

  private emit(r: Reading): void {
    for (const fn of this.listeners) fn(r);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.source?.disconnect();
    this.demoNodes.forEach((n) => n.stop());
    this.demoNodes = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
