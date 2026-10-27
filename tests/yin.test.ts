import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createYinDetector } from '../src/lib/yin.ts';
import { STANDARD_TUNING, cents, nearestString, nearestNote } from '../src/lib/tuning.ts';

const N = 4096;

function synth(
  freq: number,
  sampleRate: number,
  harmonics: number[] = [1],
  amp = 0.5,
): Float32Array {
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    harmonics.forEach((a, h) => {
      v += a * Math.sin((2 * Math.PI * freq * (h + 1) * i) / sampleRate + h);
    });
    buf[i] = amp * v;
  }
  return buf;
}

for (const sr of [44100, 48000]) {
  test(`seno puro en las 6 cuerdas a ${sr} Hz (±1 cent)`, () => {
    const detect = createYinDetector();
    for (const s of STANDARD_TUNING) {
      const r = detect(synth(s.freq, sr), sr);
      assert.ok(r, `sin resultado para ${s.note}`);
      const c = cents(r.freq, s.freq);
      assert.ok(Math.abs(c) < 1, `${s.note}: ${r.freq.toFixed(3)} Hz (${c.toFixed(2)} cents)`);
    }
  });

  test(`señal con armónicos da la fundamental a ${sr} Hz`, () => {
    const detect = createYinDetector();
    for (const s of STANDARD_TUNING) {
      // Armónicos más fuertes que la fundamental, como una cuerda grave real.
      const r = detect(synth(s.freq, sr, [0.6, 1.0, 0.7, 0.4], 0.3), sr);
      assert.ok(r, `sin resultado para ${s.note}`);
      const c = cents(r.freq, s.freq);
      assert.ok(Math.abs(c) < 2, `${s.note}: ${r.freq.toFixed(3)} Hz (${c.toFixed(2)} cents)`);
    }
  });
}

test('cuerda desafinada: mide el desvío correcto', () => {
  const detect = createYinDetector();
  const target = 110 * Math.pow(2, -20 / 1200); // A2 20 cents bajo
  const r = detect(synth(target, 48000), 48000);
  assert.ok(r);
  assert.ok(Math.abs(cents(r.freq, 110) + 20) < 1, `${cents(r.freq, 110)}`);
});

test('silencio devuelve null', () => {
  const detect = createYinDetector();
  assert.equal(detect(new Float32Array(N), 48000), null);
});

test('ruido débil devuelve null', () => {
  const detect = createYinDetector();
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = (Math.random() * 2 - 1) * 0.005;
  assert.equal(detect(buf, 48000), null);
});

test('ruido blanco fuerte no da una nota con confianza', () => {
  const detect = createYinDetector();
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = (Math.random() * 2 - 1) * 0.5;
  const r = detect(buf, 48000);
  assert.ok(r === null || r.clarity < 0.9, `clarity ${r?.clarity}`);
});

test('nearestString y nearestNote', () => {
  assert.equal(nearestString(84).note, 'E2');
  assert.equal(nearestString(107).note, 'A2');
  assert.equal(nearestString(250).note, 'B3');
  assert.equal(nearestString(320).note, 'E4');
  const n = nearestNote(440);
  assert.equal(n.name, 'A');
  assert.equal(n.octave, 4);
  assert.ok(Math.abs(n.cents) < 1e-9);
  assert.equal(nearestNote(277.18).name, 'C♯');
});
