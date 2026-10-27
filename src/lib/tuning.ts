// Afinación estándar de guitarra y utilidades de notas.

export const A4 = 440;

export interface GuitarString {
  /** Número de cuerda (6 = la más grave). */
  number: number;
  /** Nombre corto que se muestra en el botón. */
  label: string;
  /** Nombre científico de la nota, p. ej. "E2". */
  note: string;
  /** Frecuencia objetivo en Hz. */
  freq: number;
}

/** Frecuencia de una nota a partir de su número MIDI (A4 = 69). */
export function midiToFreq(midi: number): number {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

export const STANDARD_TUNING: readonly GuitarString[] = [
  { number: 6, label: 'E', note: 'E2', freq: midiToFreq(40) }, // 82.41
  { number: 5, label: 'A', note: 'A2', freq: midiToFreq(45) }, // 110.00
  { number: 4, label: 'D', note: 'D3', freq: midiToFreq(50) }, // 146.83
  { number: 3, label: 'G', note: 'G3', freq: midiToFreq(55) }, // 196.00
  { number: 2, label: 'B', note: 'B3', freq: midiToFreq(59) }, // 246.94
  { number: 1, label: 'e', note: 'E4', freq: midiToFreq(64) }, // 329.63
];

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Desvío en cents de `freq` respecto a `ref` (100 cents = 1 semitono). */
export function cents(freq: number, ref: number): number {
  return 1200 * Math.log2(freq / ref);
}

/** Cuerda cuya frecuencia está más cerca (en escala logarítmica). */
export function nearestString(
  freq: number,
  strings: readonly GuitarString[] = STANDARD_TUNING,
): GuitarString {
  let best = strings[0];
  let bestDist = Infinity;
  for (const s of strings) {
    const d = Math.abs(Math.log2(freq / s.freq));
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

export interface NoteInfo {
  /** Nombre sin octava, p. ej. "A" o "C♯". */
  name: string;
  octave: number;
  /** Frecuencia exacta de esa nota. */
  freq: number;
  /** Desvío en cents respecto a esa nota (−50…+50). */
  cents: number;
}

/** Nota cromática más cercana a `freq`. */
export function nearestNote(freq: number): NoteInfo {
  const midi = Math.round(69 + 12 * Math.log2(freq / A4));
  const noteFreq = midiToFreq(midi);
  return {
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    freq: noteFreq,
    cents: cents(freq, noteFreq),
  };
}
