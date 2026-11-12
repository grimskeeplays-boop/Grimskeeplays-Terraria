// Synthesised music and sound effects (Web Audio, no sample files).
// The score is an original piece in D minor, arranged per mood.

export type Mood = 'none' | 'day' | 'night' | 'cave' | 'castle' | 'boss';

interface MoodCfg {
  bpm: number; lead: OscillatorType; leadGain: number; arp: OscillatorType; arpGain: number; arpEvery: number;
  bassGain: number; drums: 0 | 1 | 2; pad: number; octave: number;
}

const MOODS: Record<Exclude<Mood, 'none'>, MoodCfg> = {
  day: { bpm: 122, lead: 'square', leadGain: 0.085, arp: 'triangle', arpGain: 0.07, arpEvery: 2, bassGain: 0.13, drums: 1, pad: 0, octave: 0 },
  night: { bpm: 146, lead: 'sawtooth', leadGain: 0.075, arp: 'square', arpGain: 0.04, arpEvery: 1, bassGain: 0.15, drums: 2, pad: 0, octave: 0 },
  cave: { bpm: 80, lead: 'triangle', leadGain: 0.07, arp: 'sine', arpGain: 0.075, arpEvery: 2, bassGain: 0.1, drums: 0, pad: 0.025, octave: -12 },
  boss: { bpm: 172, lead: 'sawtooth', leadGain: 0.085, arp: 'square', arpGain: 0.045, arpEvery: 1, bassGain: 0.17, drums: 2, pad: 0.02, octave: 0 },
  castle: { bpm: 134, lead: 'sawtooth', leadGain: 0.07, arp: 'sawtooth', arpGain: 0.04, arpEvery: 1, bassGain: 0.13, drums: 1, pad: 0.02, octave: 0 },
};

// One chord per bar: [root (MIDI), isMajor]
const CHORDS: [number, boolean][] = [
  [50, false], [50, false], [46, true], [48, true], [43, false], [45, true], [50, false], [45, true],
  [50, false], [46, true], [43, false], [45, true], [50, false], [48, true], [46, true], [45, true],
];

// Section A melody: [step, MIDI note, length in steps]
const MELODY: [number, number, number][] = [
  [0, 69, 6], [6, 74, 2], [8, 77, 4], [12, 76, 2], [14, 74, 2],
  [16, 81, 8], [24, 79, 2], [26, 77, 2], [28, 76, 2], [30, 77, 2],
  [32, 74, 6], [38, 77, 2], [40, 82, 4], [44, 81, 2], [46, 79, 2],
  [48, 76, 8], [56, 79, 4], [60, 84, 4],
  [64, 82, 6], [70, 81, 2], [72, 79, 4], [76, 74, 4],
  [80, 73, 4], [84, 76, 4], [88, 81, 4], [92, 79, 2], [94, 76, 2],
  [96, 77, 6], [102, 76, 2], [104, 74, 8],
  [112, 76, 4], [116, 73, 4], [120, 69, 8],
];
const MELODY_AT = new Map<number, [number, number]>();
for (const [s, n, l] of MELODY) MELODY_AT.set(s, [n, l]);

const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 1];
const RUN = [4, 3, 2, 3, 4, 3, 2, 1, 2, 1, 0, 1, 2, 3, 4, 3];
const BASS = [0, 0, 12, 0, 0, 12, 7, 12];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private mood: Mood = 'none';
  private want: Mood = 'none';
  private step = 0;
  private next = 0;
  muted = false;

  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = 0.9;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    // a little echo for the music, like a stone hall
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.27;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.music.connect(this.master);
    this.music.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.master);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.8;
  }

  setMood(m: Mood): void {
    this.want = m;
  }

  private tone(t: number, midi: number, dur: number, type: OscillatorType, gain: number, bus: GainNode, pluck = false, slideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz(midi), t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(hz(slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    if (pluck) g.gain.exponentialRampToValueAtTime(gain * 0.12, t + dur * 0.9);
    else g.gain.setValueAtTime(gain * 0.8, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, freq: number, gain: number, bus: GainNode, type: BiquadFilterType = 'highpass'): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(bus);
    s.start(t, Math.random() * 0.5, dur + 0.02);
  }

  /** Call once per frame; schedules notes slightly ahead of the clock. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.mood === 'none' && this.want !== 'none') {
      this.mood = this.want;
      this.step = 0;
      this.next = ctx.currentTime + 0.1;
    }
    if (this.mood === 'none') return;
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.2) {
      // moods change on the bar line
      if (this.step % 16 === 0 && this.want !== this.mood) {
        this.mood = this.want;
        if (this.mood === 'none') return;
      }
      const cfg = MOODS[this.mood as Exclude<Mood, 'none'>];
      const sd = 60 / cfg.bpm / 4;
      this.schedule(this.step, this.next, sd, cfg);
      this.next += sd;
      this.step = (this.step + 1) % 256;
    }
  }

  private schedule(step: number, t: number, sd: number, cfg: MoodCfg): void {
    const bar = step >> 4, s = step & 15;
    const [root, major] = CHORDS[bar];
    const third = major ? 4 : 3;
    const tones = [root, root + third, root + 7, root + 12, root + 12 + third];
    const sectionB = bar >= 8;

    // bass
    if (cfg.drums === 0) {
      if (s === 0) this.tone(t, root - 12, sd * 15, 'triangle', cfg.bassGain, this.music);
    } else if (s % 2 === 0) {
      this.tone(t, root - 12 + BASS[s >> 1], sd * 1.8, 'triangle', cfg.bassGain, this.music, true);
    }
    // arpeggio
    if (s % cfg.arpEvery === 0) {
      this.tone(t, tones[ARP[s]] + 12 + cfg.octave, sd * cfg.arpEvery * 0.95, cfg.arp, cfg.arpGain, this.music, true);
    }
    // lead
    if (!sectionB) {
      const m = MELODY_AT.get(step);
      if (m) this.tone(t, m[0] + cfg.octave, m[1] * sd * 0.96, cfg.lead, cfg.leadGain, this.music);
    } else if (cfg.drums > 0 && s % 2 === 0) {
      this.tone(t, tones[RUN[s]] + 24, sd * 1.9, cfg.lead, cfg.leadGain * 0.8, this.music, true);
    } else if (cfg.drums === 0 && s % 8 === 0) {
      this.tone(t, tones[RUN[s]] + 12, sd * 7.5, cfg.lead, cfg.leadGain, this.music);
    }
    // organ pad
    if (cfg.pad > 0 && s === 0) {
      for (const n of [root, root + third, root + 7]) this.tone(t, n + 12, sd * 15.5, 'square', cfg.pad, this.music);
    }
    // drums
    if (cfg.drums > 0) {
      const kick = cfg.drums === 2 ? s === 0 || s === 6 || s === 8 || s === 14 : s === 0 || s === 8;
      if (kick) this.tone(t, 43, 0.13, 'sine', 0.3, this.music, true, 24);
      if (s === 4 || s === 12) this.noise(t, 0.11, 1800, cfg.drums === 2 ? 0.14 : 0.09, this.music);
      if (cfg.drums === 2 ? true : s % 2 === 0) this.noise(t, 0.03, 7000, s % 4 === 2 ? 0.05 : 0.025, this.music);
    }
  }

  sfx(name: string): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const b = this.sfxBus;
    switch (name) {
      case 'swing': this.noise(t, 0.12, 900, 0.12, b, 'bandpass'); break;
      case 'whip': this.noise(t, 0.16, 2600, 0.16, b, 'bandpass'); this.noise(t + 0.12, 0.04, 5000, 0.2, b); break;
      case 'bow': this.tone(t, 64, 0.12, 'triangle', 0.15, b, true, 52); break;
      case 'throw': this.noise(t, 0.08, 1800, 0.1, b, 'bandpass'); break;
      case 'dig': this.noise(t, 0.05, 500, 0.2, b, 'lowpass'); this.tone(t, 40, 0.05, 'square', 0.05, b, true); break;
      case 'break': this.noise(t, 0.12, 900, 0.22, b, 'lowpass'); break;
      case 'shatter': this.noise(t, 0.2, 3000, 0.2, b); this.tone(t, 88, 0.08, 'triangle', 0.08, b, true, 76); break;
      case 'place': this.tone(t, 45, 0.06, 'square', 0.07, b, true, 38); break;
      case 'hit': this.tone(t, 52, 0.09, 'square', 0.13, b, true, 40); this.noise(t, 0.05, 1200, 0.1, b); break;
      case 'crit': this.tone(t, 64, 0.14, 'square', 0.14, b, true, 45); this.noise(t, 0.08, 2000, 0.14, b); break;
      case 'kill': this.tone(t, 57, 0.3, 'sawtooth', 0.11, b, true, 33); this.noise(t, 0.25, 700, 0.14, b, 'lowpass'); break;
      case 'hurt': this.tone(t, 50, 0.22, 'sawtooth', 0.16, b, true, 38); break;
      case 'die': this.tone(t, 50, 0.9, 'sawtooth', 0.18, b, false, 26); break;
      case 'pickup': this.tone(t, 76, 0.05, 'square', 0.06, b, true); this.tone(t + 0.05, 83, 0.07, 'square', 0.06, b, true); break;
      case 'craft': this.tone(t, 69, 0.06, 'triangle', 0.14, b, true); this.tone(t + 0.07, 76, 0.06, 'triangle', 0.14, b, true); this.tone(t + 0.14, 81, 0.1, 'triangle', 0.14, b, true); break;
      case 'chest': this.tone(t, 45, 0.1, 'square', 0.07, b, true, 52); this.noise(t, 0.08, 600, 0.1, b, 'lowpass'); break;
      case 'drink': this.tone(t, 60, 0.08, 'sine', 0.14, b, true, 67); this.tone(t + 0.09, 62, 0.08, 'sine', 0.14, b, true, 69); break;
      case 'life': for (let i = 0; i < 4; i++) this.tone(t + i * 0.08, 69 + [0, 3, 7, 12][i], 0.14, 'triangle', 0.14, b, true); break;
      case 'jump': this.tone(t, 57, 0.08, 'sine', 0.05, b, true, 66); break;
      case 'magic': this.tone(t, 81, 0.16, 'sine', 0.12, b, true, 93); this.tone(t, 69, 0.12, 'triangle', 0.08, b, true, 76); break;
      case 'rankup': for (let i = 0; i < 6; i++) this.tone(t + i * 0.09, 62 + [0, 3, 7, 12, 15, 19][i], 0.22, 'square', 0.1, b, true); break;
      case 'event': this.tone(t, 38, 1.1, 'sawtooth', 0.16, b, false, 31); this.tone(t, 45, 1.1, 'sawtooth', 0.1, b, false, 37); break;
      case 'click': this.tone(t, 72, 0.03, 'square', 0.04, b, true); break;
    }
  }
}

export const audio = new AudioSys();
