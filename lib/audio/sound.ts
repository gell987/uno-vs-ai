/**
 * Procedural sound effects with the Web Audio API: no audio files at all.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created lazily and resumed from the first pointer or key press. Card sounds
 * are shaped white noise (which is what paper sliding on felt really is);
 * musical cues are short synthesized notes through a master volume control.
 */

export type SoundName =
  | "play"
  | "draw"
  | "shuffle"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4"
  | "uno"
  | "caught"
  | "challenge"
  | "challengeWin"
  | "challengeLose"
  | "yourTurn"
  | "invalid"
  | "roundWin"
  | "roundLose"
  | "matchWin"
  | "click";

type Wave = OscillatorType;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;
  private voice = true;
  private unlockBound = false;

  /** Registers one-time listeners that unlock audio on the first user gesture. */
  bindUnlock(): void {
    if (this.unlockBound || typeof window === "undefined") return;
    this.unlockBound = true;
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === "running") {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.effectiveGain(), this.ctx.currentTime, 0.02);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.setVolume(this.volume);
  }

  setVoice(on: boolean): void {
    this.voice = on;
  }

  private effectiveGain(): number {
    return this.muted ? 0 : this.volume * 0.9;
  }

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.effectiveGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      const length = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // -- building blocks -------------------------------------------------------

  private slide(t: number, dur: number, from: number, to: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private thump(t: number, gain = 0.35, from = 150, to = 55): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  private tone(t: number, freq: number, dur: number, gain: number, wave: Wave = "sine", glideTo?: number, lowpass?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = lowpass;
      node = node.connect(lp);
    }
    node.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private chord(t: number, freqs: number[], dur: number, gain: number, wave: Wave = "triangle", stagger = 0): void {
    freqs.forEach((f, i) => this.tone(t + i * stagger, f, dur, gain / Math.sqrt(freqs.length), wave));
  }

  // -- public ----------------------------------------------------------------

  play(name: SoundName): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted || this.volume === 0 || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case "play":
        this.slide(t, 0.11, 3200, 1100, 0.5);
        this.thump(t + 0.07, 0.3);
        break;
      case "draw":
        this.slide(t, 0.08, 4200, 2200, 0.32);
        break;
      case "shuffle": {
        let at = t;
        for (let i = 0; i < 16; i++) {
          this.slide(at, 0.05 + Math.random() * 0.03, 3800 + Math.random() * 1500, 1500, 0.22);
          at += 0.035 + Math.random() * 0.03;
        }
        this.thump(at + 0.02, 0.25);
        this.thump(at + 0.12, 0.2);
        break;
      }
      case "skip":
        this.slide(t, 0.1, 3000, 1200, 0.4);
        this.tone(t + 0.02, 760, 0.2, 0.18, "sawtooth", 240, 1800);
        break;
      case "reverse":
        this.slide(t, 0.1, 3000, 1200, 0.4);
        this.tone(t + 0.02, 330, 0.12, 0.2, "triangle", 700);
        this.tone(t + 0.14, 700, 0.14, 0.2, "triangle", 330);
        break;
      case "draw2":
        this.slide(t, 0.1, 3000, 1200, 0.4);
        this.tone(t + 0.04, 523, 0.09, 0.18, "square", undefined, 2400);
        this.tone(t + 0.13, 659, 0.12, 0.18, "square", undefined, 2400);
        break;
      case "wild":
        this.slide(t, 0.1, 3000, 1200, 0.35);
        [1047, 1319, 1568, 2093].forEach((f, i) => {
          this.tone(t + 0.04 + i * 0.05, f, 0.35, 0.1);
          this.tone(t + 0.04 + i * 0.05, f * 1.005, 0.35, 0.06);
        });
        break;
      case "wild4":
        this.thump(t, 0.45, 110, 40);
        [392, 494, 587, 784].forEach((f, i) => this.tone(t + 0.03 + i * 0.07, f, 0.16, 0.16, "sawtooth", undefined, 2200));
        break;
      case "uno":
        this.chord(t, [523, 659, 784, 1047], 0.45, 0.3, "triangle", 0.012);
        break;
      case "caught":
        this.tone(t, 622, 0.14, 0.22, "square", undefined, 2000);
        this.tone(t + 0.15, 523, 0.24, 0.22, "square", undefined, 2000);
        break;
      case "challenge":
        for (let i = 0; i < 5; i++) this.tone(t + i * 0.07, 196, 0.08, 0.14, "triangle");
        break;
      case "challengeWin":
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.08, f, 0.22, 0.18, "triangle"));
        break;
      case "challengeLose":
        [392, 330, 262].forEach((f, i) => this.tone(t + i * 0.1, f, 0.25, 0.18, "triangle"));
        break;
      case "yourTurn":
        this.tone(t, 880, 0.18, 0.08);
        this.tone(t + 0.09, 1319, 0.26, 0.07);
        break;
      case "invalid":
        this.tone(t, 190, 0.14, 0.2, "sine", 120);
        break;
      case "roundWin":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.11, f, 0.3, 0.16, "triangle"));
        this.chord(t + 0.44, [523, 659, 784, 1047], 0.9, 0.28);
        break;
      case "roundLose":
        [392, 349, 311, 262].forEach((f, i) => this.tone(t + i * 0.16, f, 0.35, 0.14, "triangle"));
        break;
      case "matchWin":
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.09, f, 0.3, 0.15, "triangle"));
        this.chord(t + 0.5, [523, 659, 784, 1047, 1319], 1.4, 0.32);
        break;
      case "click":
        this.slide(t, 0.025, 6000, 5000, 0.12);
        break;
    }
  }

  /** Short spoken callout ("UNO!") through the browser's speech synthesis, if available. */
  speak(text: string, pitch = 1): void {
    if (!this.voice || this.muted || this.volume === 0 || typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = pitch;
      u.volume = Math.min(1, this.volume * 1.1);
      const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("en"));
      if (voice) u.voice = voice;
      synth.cancel();
      synth.speak(u);
    } catch {
      // Speech is a nice-to-have; ignore platforms that reject it.
    }
  }
}

export const sound = new SoundEngine();

/** Gentle vibration on supporting mobile devices. */
export function haptic(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Unsupported or blocked: ignore.
    }
  }
}
