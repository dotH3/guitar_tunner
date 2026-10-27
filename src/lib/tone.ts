// Tono de referencia para afinar de oído.

const FADE_S = 0.015;
const VOLUME = 0.25;

export class ReferenceTone {
  private ctx: AudioContext;
  private master: GainNode | null = null;
  private oscs: OscillatorNode[] = [];
  /** Frecuencia que suena ahora, o null. */
  playing: number | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  play(freq: number): void {
    this.stop();
    const t = this.ctx.currentTime;
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(VOLUME, t + FADE_S);
    master.connect(this.ctx.destination);

    // Fundamental + un segundo armónico suave: suena menos "pitido" y se oye
    // mejor en el parlante pequeño del teléfono (que casi no reproduce 82 Hz).
    [
      [1, 1],
      [2, 0.35],
      [3, 0.15],
    ].forEach(([mult, amp]) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const g = this.ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(master);
      osc.start(t);
      this.oscs.push(osc);
    });

    this.master = master;
    this.playing = freq;
  }

  stop(): void {
    if (!this.master) return;
    const t = this.ctx.currentTime;
    const master = this.master;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + FADE_S);
    this.oscs.forEach((o) => o.stop(t + FADE_S + 0.01));
    setTimeout(() => master.disconnect(), 100);
    this.master = null;
    this.oscs = [];
    this.playing = null;
  }
}
