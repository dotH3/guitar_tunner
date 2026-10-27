// Conecta el motor de afinación con la interfaz.
import { STANDARD_TUNING, cents, nearestNote, nearestString, type GuitarString } from '../lib/tuning.ts';
import { Tuner } from '../lib/tuner.ts';
import { ReferenceTone } from '../lib/tone.ts';

/** Margen en cents para considerar la cuerda afinada. */
const IN_TUNE = 5;
const CLOSE = 15;

const $ = <T extends HTMLElement | SVGElement = HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;

const app = $('.app');
const noteEl = $('#note');
const octaveEl = $('#octave');
const statusEl = $('#status');
const needle = $<SVGGElement>('#needle');
const centsEl = $('#cents');
const freqEl = $('#freq');
const levelEl = $('#level');
const modeBtn = $<HTMLButtonElement>('#mode');
const hintEl = $('#hint');
const startBtn = $<HTMLButtonElement>('#start');
const errorEl = $('#error');
const overlayText = $('#overlay-text');

const byNote = new Map(STANDARD_TUNING.map((s) => [s.note, s]));
const params = new URLSearchParams(location.search);
const demoFreq = Number(params.get('demo')) || null;

let ctx: AudioContext | null = null;
let tuner: Tuner | null = null;
let tone: ReferenceTone | null = null;
/** Cuerda fijada a mano; null = modo automático. */
let locked: GuitarString | null = null;
let wakeLock: WakeLockSentinel | null = null;
let inTuneSince = 0;
let buzzed = false;

// ---------- Arranque ----------

if (!demoFreq && (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)) {
  overlayText.textContent =
    'El micrófono solo funciona en una conexión segura (https). Abre la app desde una dirección https.';
  startBtn.disabled = true;
}
if (demoFreq) {
  overlayText.textContent = `Modo de prueba: se simula una cuerda a ${demoFreq} Hz en lugar del micrófono.`;
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  errorEl.hidden = true;
  try {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.resume();
    tuner = new Tuner(ctx);
    tone = new ReferenceTone(ctx);
    tuner.onReading(render);
    if (demoFreq) tuner.startDemo(demoFreq);
    else await tuner.startMic();
    app.dataset.state = 'running';
    requestWakeLock();
  } catch (err) {
    console.error('[Tuner] no se pudo iniciar', err);
    tuner?.stop();
    await ctx?.close();
    ctx = null;
    const denied = err instanceof DOMException && err.name === 'NotAllowedError';
    errorEl.textContent = denied
      ? 'Permiso de micrófono denegado. Actívalo en los ajustes del sitio (icono del candado) y vuelve a intentarlo.'
      : `No se pudo abrir el micrófono: ${(err as Error).message}`;
    errorEl.hidden = false;
    startBtn.disabled = false;
  }
});

// ---------- Render ----------

function render({ freq, level }: { freq: number | null; level: number }): void {
  levelEl.style.width = `${Math.round(level * 100)}%`;

  if (freq === null) {
    delete app.dataset.signal;
    delete app.dataset.tone;
    noteEl.textContent = locked ? locked.label.toUpperCase() : '–';
    octaveEl.textContent = locked ? locked.note.slice(-1) : '';
    statusEl.textContent = tone?.playing ? 'Escuchando referencia…' : 'Toca una cuerda';
    centsEl.textContent = '0 ¢';
    freqEl.textContent = '– Hz';
    needle.style.transform = 'rotate(0deg)';
    markDetected(null);
    inTuneSince = 0;
    buzzed = false;
    return;
  }

  const target = locked ?? nearestString(freq);
  const c = cents(freq, target.freq);
  const shown = Math.max(-50, Math.min(50, c));
  const abs = Math.abs(c);

  app.dataset.signal = '';
  app.dataset.tone = abs <= IN_TUNE ? 'ok' : abs <= CLOSE ? 'warn' : 'bad';
  noteEl.textContent = target.label.toUpperCase();
  octaveEl.textContent = target.note.slice(-1);
  needle.style.transform = `rotate(${(shown * 60) / 50}deg)`;
  centsEl.textContent = `${c > 0 ? '+' : ''}${Math.round(c)} ¢`;

  const heard = nearestNote(freq);
  freqEl.textContent = `${freq.toFixed(1)} Hz · ${heard.name}${heard.octave}`;

  if (abs <= IN_TUNE) {
    statusEl.textContent = '¡Afinada!';
    const now = performance.now();
    if (!inTuneSince) inTuneSince = now;
    if (!buzzed && now - inTuneSince > 400) {
      navigator.vibrate?.(40);
      buzzed = true;
    }
  } else {
    // Más de un semitono abajo/arriba: avisar que el desvío es grande.
    const far = abs > 100 ? ' mucho' : '';
    statusEl.textContent = c < 0 ? `Sube${far} ↑` : `Baja${far} ↓`;
    inTuneSince = 0;
    buzzed = false;
  }

  markDetected(target);
}

function markDetected(s: GuitarString | null): void {
  document.querySelectorAll('.string').forEach((el) => {
    el.classList.toggle('detected', (el as HTMLElement).dataset.note === s?.note);
  });
}

// ---------- Cuerdas y modo ----------

function setLocked(s: GuitarString | null): void {
  locked = s;
  modeBtn.setAttribute('aria-pressed', String(s === null));
  modeBtn.textContent = s ? 'Fijada' : 'Auto';
  hintEl.textContent = s
    ? `Afinando la ${s.number}ª (${s.note}) · toca Auto para volver`
    : 'Detecta la cuerda sola · toca una para fijarla';
  document.querySelectorAll<HTMLButtonElement>('[data-select]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.select === s?.note));
  });
}

modeBtn.addEventListener('click', () => setLocked(null));

document.querySelectorAll<HTMLButtonElement>('[data-select]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const s = byNote.get(btn.dataset.select!)!;
    setLocked(locked?.note === s.note ? null : s);
  });
});

document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!tone || !tuner) return;
    const s = byNote.get(btn.dataset.play!)!;
    const wasThis = tone.playing === s.freq;
    stopTone();
    if (wasThis) return;
    setLocked(s);
    tone.play(s.freq);
    btn.classList.add('on');
    // No analizar mientras suena: el micrófono escucharía el propio parlante.
    tuner.setPaused(true);
  });
});

function stopTone(): void {
  if (!tone?.playing) return;
  tone.stop();
  document.querySelectorAll('.play.on').forEach((b) => b.classList.remove('on'));
  // Pequeña espera para que el eco del parlante se apague antes de escuchar.
  setTimeout(() => {
    if (!tone?.playing) tuner?.setPaused(false);
  }, 200);
}

// ---------- Pantalla encendida y segundo plano ----------

async function requestWakeLock(): Promise<void> {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    // No soportado o denegado: no es crítico.
  }
}

document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.visibilityState === 'visible') {
    ctx.resume();
    if (!wakeLock || wakeLock.released) requestWakeLock();
  } else {
    stopTone();
    ctx.suspend();
  }
});
