// Detector de tono YIN (de Cheveigné & Kawahara, 2002).
// Código puro, sin DOM, para poder probarlo con `node --test`.

export interface YinOptions {
  /** Umbral de la CMNDF para aceptar un mínimo (más bajo = más estricto). */
  threshold?: number;
  /** Frecuencia mínima que se busca, en Hz. */
  minFreq?: number;
  /** Frecuencia máxima que se busca, en Hz. */
  maxFreq?: number;
  /** RMS mínimo de la señal; por debajo se considera silencio. */
  minRms?: number;
}

export interface PitchResult {
  /** Frecuencia fundamental estimada, en Hz. */
  freq: number;
  /** 0…1: qué tan periódica es la señal (1 = perfecta). */
  clarity: number;
  /** Nivel RMS de la ventana. */
  rms: number;
}

const DEFAULTS: Required<YinOptions> = {
  threshold: 0.15,
  minFreq: 60,
  maxFreq: 1200,
  minRms: 0.01,
};

/**
 * Crea un detector que reutiliza su memoria entre llamadas
 * (importante para no generar basura 60 veces por segundo en el móvil).
 */
export function createYinDetector(options: YinOptions = {}) {
  const opts = { ...DEFAULTS, ...options };
  let cmndf = new Float32Array(0);

  return function detect(buf: Float32Array, sampleRate: number): PitchResult | null {
    const n = buf.length;

    // 1. Silencio: no vale la pena analizar.
    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / n);
    if (rms < opts.minRms) return null;

    // Rango de periodos (en muestras) que nos interesa.
    const minTau = Math.max(2, Math.floor(sampleRate / opts.maxFreq));
    const maxTau = Math.min(Math.floor(n / 2), Math.ceil(sampleRate / opts.minFreq) + 1);
    // Ventana de integración: todo lo que cabe después de desplazar maxTau.
    const w = n - maxTau;
    if (maxTau <= minTau || w <= 0) return null;

    if (cmndf.length < maxTau + 1) cmndf = new Float32Array(maxTau + 1);

    // 2. Función de diferencia + 3. normalización acumulada (CMNDF).
    cmndf[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let i = 0; i < w; i++) {
        const delta = buf[i] - buf[i + tau];
        sum += delta * delta;
      }
      running += sum;
      cmndf[tau] = running > 0 ? (sum * tau) / running : 1;
    }

    // 4. Primer mínimo que cae bajo el umbral (evita errores de octava).
    let tau = -1;
    for (let t = minTau; t < maxTau; t++) {
      if (cmndf[t] < opts.threshold) {
        while (t + 1 < maxTau && cmndf[t + 1] < cmndf[t]) t++;
        tau = t;
        break;
      }
    }

    // Si nada baja del umbral, usar el mínimo global solo si es razonable.
    if (tau === -1) {
      let best = minTau;
      for (let t = minTau + 1; t < maxTau; t++) if (cmndf[t] < cmndf[best]) best = t;
      if (cmndf[best] > 0.35) return null;
      tau = best;
    }

    // 5. Interpolación parabólica para precisión sub-muestra.
    let betterTau = tau;
    if (tau > 1 && tau < maxTau) {
      const s0 = cmndf[tau - 1];
      const s1 = cmndf[tau];
      const s2 = cmndf[tau + 1];
      const denom = s0 + s2 - 2 * s1;
      if (denom !== 0) betterTau = tau + (s0 - s2) / (2 * denom);
    }

    const freq = sampleRate / betterTau;
    if (freq < opts.minFreq || freq > opts.maxFreq) return null;

    return { freq, clarity: Math.max(0, 1 - cmndf[tau]), rms };
  };
}
