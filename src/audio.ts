import type { Settings } from "./settings";

/** All clips live in /public/assets/sfx/<name>.mp3 */
export const CLIPS = [
  "paisa_hi_paisa_hoga", "paisa_hi_paisa", "money_follows", "jis_raah_pe", "khopdi_tod", "phir_hera_pheri",
  "kya_kar_raha_hai_tu", "aayein", "ek_dum_se_waqt", "abe_sale", "thappad_mardunga", "iss_sajjan", "bhai_yaha_kya",
  "are_baap_re", "baap_hu_mai_tera", "khel_khatam", "kaisa_laga_majak", "oye_bhai_oye", "maa_kasam", "tunak_tunak",
  "sfx_slap", "sfx_punch", "sfx_knockout", "sfx_ouch", "sfx_bone_crack", "horn_bus", "horn_truck", "horn_goofy",
  "siren", "siren_brr",
  // spec 04
  "maro_mujhe_maro", "horn_truck_ok", "horn_truck_pls", "horn_truck_scream", "horn_kerala_bus", "horn_happy_bday", "horn_kgf",
  "horn_mission", "horn_ddlg", "horn_scooter", "horn_bike", "police_whistle", "cow_moo", "heli_loop", "jetski", "boat_horn", "supercar_rev",
] as const;
export type Clip = (typeof CLIPS)[number];
/** desi musical/pressure horns trucks pick from */
export const TRUCK_HORNS: Clip[] = ["horn_truck", "horn_truck_ok", "horn_truck_pls", "horn_truck_scream", "horn_kerala_bus", "horn_happy_bday", "horn_kgf", "horn_mission", "horn_ddlg"];

type Bus = "sfx" | "voice" | "music" | "ambience";

/** engine character per vehicle kind (Hz at idle/redline of the firing note, gears, putt depth/rate...) */
type EngineP = { idle: number; max: number; gears: number; wave: OscillatorType; sub: number; putt: number; puttRate: number; roar: number; whine: number; whineHz: number; filt: number; gain: number };
const E = (p: Partial<EngineP>): EngineP => ({ idle: 30, max: 110, gears: 5, wave: "sawtooth", sub: 0.3, putt: 0.1, puttRate: 0.5, roar: 0.05, whine: 0, whineHz: 0, filt: 1500, gain: 0.08, ...p });
const ENGINES: Record<string, EngineP> = {
  car_small: E({ idle: 32, max: 120, gears: 4, filt: 1300, gain: 0.07 }),                              // 3-cylinder Maruti buzz
  car_sedan: E({ idle: 28, max: 125, gears: 5, filt: 1500, gain: 0.075, putt: 0.05 }),
  suv: E({ idle: 22, max: 90, gears: 5, sub: 0.5, roar: 0.09, filt: 1100, gain: 0.09, putt: 0.18 }),  // diesel clatter
  taxi: E({ idle: 24, max: 85, gears: 4, sub: 0.45, putt: 0.22, puttRate: 0.5, filt: 1000, gain: 0.08 }), // old Ambassador
  police: E({ idle: 22, max: 95, gears: 5, sub: 0.5, roar: 0.08, filt: 1200, gain: 0.09, putt: 0.15 }),
  truck: E({ idle: 16, max: 58, gears: 6, sub: 0.7, roar: 0.14, filt: 800, gain: 0.11, putt: 0.25, puttRate: 0.5 }),
  supercar: E({ idle: 48, max: 280, gears: 7, wave: "sawtooth", sub: 0.25, roar: 0.12, whine: 0.025, whineHz: 3200, filt: 3200, gain: 0.1 }),
  auto: E({ idle: 38, max: 115, gears: 1, wave: "square", sub: 0.2, putt: 0.65, puttRate: 1, roar: 0.06, filt: 1400, gain: 0.11 }),   // two-stroke putt-putt
  motorcycle: E({ idle: 20, max: 95, gears: 5, sub: 0.6, putt: 0.75, puttRate: 1, roar: 0.07, filt: 900, gain: 0.11 }),            // Bullet dug-dug
  scooter: E({ idle: 55, max: 170, gears: 1, wave: "square", sub: 0.15, putt: 0.2, puttRate: 1, whine: 0.02, whineHz: 900, filt: 2000, gain: 0.07 }), // CVT whine
  boat: E({ idle: 26, max: 80, gears: 1, sub: 0.6, putt: 0.2, roar: 0.12, filt: 900, gain: 0.09 }),
  jetski: E({ idle: 60, max: 190, gears: 1, wave: "square", putt: 0.25, puttRate: 1, roar: 0.1, filt: 2400, gain: 0.08 }),
  heli: E({ idle: 18, max: 30, gears: 1, sub: 0.4, putt: 0.1, filt: 400, gain: 0.03 }),
};

/** synthesized horns: each vehicle kind gets its own voice (and each vehicle a slightly different pitch) */
type SynthHorn = { f: number[]; wave: OscillatorType; dur: number; beeps: number; gap?: number; bend?: number; filt: number; gain: number };
const SYNTH_HORNS: Record<string, SynthHorn> = {
  car_small: { f: [640, 760], wave: "square", dur: 0.16, beeps: 2, gap: 0.07, filt: 2400, gain: 0.16 },   // Maruti "meep-meep"
  car_sedan: { f: [415, 520], wave: "sawtooth", dur: 0.5, beeps: 1, filt: 1800, gain: 0.18 },             // classic dual-tone
  suv: { f: [300, 378], wave: "sawtooth", dur: 0.7, beeps: 1, filt: 1300, gain: 0.24 },                    // neta-ji SUV, deep
  taxi: { f: [470, 590], wave: "square", dur: 0.12, beeps: 3, gap: 0.06, filt: 2000, gain: 0.16 },        // kaali-peeli "pom-pom-pom"
  supercar: { f: [196, 247, 294], wave: "sawtooth", dur: 0.8, beeps: 1, filt: 2600, gain: 0.22 },        // chord, very loud
  auto: { f: [900], wave: "triangle", dur: 0.16, beeps: 2, gap: 0.09, bend: 1.3, filt: 3200, gain: 0.26 }, // rubber bulb "pee-pee"
  jetski: { f: [720, 900], wave: "square", dur: 0.14, beeps: 2, gap: 0.05, filt: 2600, gain: 0.14 },
};
/** sampled horns per kind (trucks pick one of the desi musical horns, fixed per truck) */
export function hornSound(kind: string, id = 0): { clip?: Clip; synth?: string; rate: number } {
  const pitch = 0.92 + (id % 5) * 0.04;
  switch (kind) {
    case "truck": return { clip: TRUCK_HORNS[id % TRUCK_HORNS.length], rate: 1 };
    case "motorcycle": return { clip: "horn_bike", rate: pitch };
    case "scooter": return { clip: "horn_scooter", rate: pitch };
    case "police": return { clip: "siren_brr", rate: 1 };
    case "boat": return { clip: "boat_horn", rate: pitch };
    case "heli": return { rate: 1 };
    default: return { synth: SYNTH_HORNS[kind] ? kind : "car_sedan", rate: pitch };
  }
}

export class Audio {
  readonly ctx = new AudioContext();
  private master = this.ctx.createGain();
  private buses: Record<Bus, GainNode>;
  private buffers = new Map<string, AudioBuffer>();
  private voiceBusyUntil = 0;
  private lastSaid = new Map<string, number>();
  private music: { stop: () => void } | null = null;
  private ambience: { stop: () => void } | null = null;
  listener = { x: 0, z: 0 };

  constructor(private settings: Settings) {
    this.master.connect(this.ctx.destination);
    const mk = () => { const g = this.ctx.createGain(); g.connect(this.master); return g; };
    this.buses = { sfx: mk(), voice: mk(), music: mk(), ambience: mk() };
    this.applySettings();
  }

  applySettings() {
    const s = this.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.buses.voice.gain.setTargetAtTime(s.voice, t, 0.05);
    this.buses.music.gain.setTargetAtTime(s.music * 0.55, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(s.ambience, t, 0.05);
  }

  /** Browsers only allow audio after a user gesture. */
  unlock() { if (this.ctx.state !== "running") void this.ctx.resume(); }

  async preload(onProgress?: (f: number) => void, voices: string[] = []) {
    let done = 0;
    const jobs = [...CLIPS.map((c) => [c, `assets/sfx/${c}.mp3`]), ...voices.flatMap((v) => [[`${v}_f`, `assets/voice/${v}_f.mp3`], [`${v}_m`, `assets/voice/${v}_m.mp3`]])];
    await Promise.all(jobs.map(async ([key, url]) => {
      try {
        const ab = await fetch(url).then((r) => r.arrayBuffer());
        this.buffers.set(key, await this.ctx.decodeAudioData(ab));
      } catch (e) { console.warn("[audio] failed", key, e); }
      onProgress?.(++done / jobs.length);
    }));
  }

  /** NPC Hindi voice line (positional, short range so distant chatter isn't noise) */
  voice(key: string, female: boolean, at: { x: number; z: number }, maxDist = 18) {
    const name = `${key}_${female ? "f" : "m"}`;
    const buf = this.buffers.get(name);
    if (!buf) return 0;
    const src = this.play(name as Clip, { bus: "voice", at, maxDist, volume: 0.9 });
    return src ? buf.duration : 0;
  }

  /** Fire-and-forget sample. `at` gives simple distance attenuation + stereo pan relative to the listener. */
  play(name: Clip | string, opts: { volume?: number; rate?: number; at?: { x: number; z: number }; bus?: Bus; maxDist?: number; offset?: number; duration?: number } = {}) {
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    let vol = opts.volume ?? 1;
    const pan = this.ctx.createStereoPanner();
    if (opts.at) {
      const dx = opts.at.x - this.listener.x, dz = opts.at.z - this.listener.z;
      const d = Math.hypot(dx, dz), max = opts.maxDist ?? 45;
      if (d > max) return null;
      vol *= 1 - d / max;
      pan.pan.value = Math.max(-0.8, Math.min(0.8, (dx * Math.cos(this.listenerYaw) - dz * Math.sin(this.listenerYaw)) / 12));
    }
    g.gain.value = vol;
    src.connect(g).connect(pan).connect(this.buses[opts.bus ?? "sfx"]);
    src.start(0, opts.offset ?? 0, opts.duration);
    return src;
  }
  listenerYaw = 0;

  private spatial(at: { x: number; z: number } | undefined, maxDist: number) {
    if (!at) return { vol: 1, pan: 0 };
    const dx = at.x - this.listener.x, dz = at.z - this.listener.z, d = Math.hypot(dx, dz);
    if (d > maxDist) return null;
    return { vol: 1 - d / maxDist, pan: Math.max(-0.8, Math.min(0.8, (dx * Math.cos(this.listenerYaw) - dz * Math.sin(this.listenerYaw)) / 12)) };
  }

  /** the horn of a specific vehicle: same vehicle always sounds the same, different kinds sound different */
  horn(v: { kind: string; id: number }, opts: { at?: { x: number; z: number }; volume?: number; maxDist?: number } = {}) {
    const h = hornSound(v.kind, v.id);
    if (h.clip) return void this.play(h.clip, { at: opts.at, volume: opts.volume ?? 0.8, rate: h.rate, maxDist: opts.maxDist });
    if (!h.synth) return;
    const sp = this.spatial(opts.at, opts.maxDist ?? 45);
    if (!sp) return;
    const p = SYNTH_HORNS[h.synth], ctx = this.ctx, t0 = ctx.currentTime;
    const out = ctx.createGain(), pan = ctx.createStereoPanner(), f = ctx.createBiquadFilter(), sh = ctx.createWaveShaper();
    // a little saturation makes it sound like a cheap horn diaphragm
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.5); }
    sh.curve = curve;
    f.type = "lowpass"; f.frequency.value = p.filt; f.Q.value = 2;
    pan.pan.value = sp.pan;
    out.gain.value = 0;
    sh.connect(f).connect(out).connect(pan).connect(this.buses.sfx);
    const vol = p.gain * sp.vol * (opts.volume ?? 0.8) * 1.6;
    let t = t0;
    for (let b = 0; b < p.beeps; b++) {
      out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(vol, t + 0.012);
      out.gain.setValueAtTime(vol, t + p.dur - 0.03); out.gain.linearRampToValueAtTime(0, t + p.dur);
      for (const hz of p.f) {
        const o = ctx.createOscillator(); o.type = p.wave;
        o.frequency.setValueAtTime(hz * h.rate, t);
        if (p.bend) o.frequency.exponentialRampToValueAtTime(hz * h.rate * p.bend, t + p.dur);
        o.connect(sh); o.start(t); o.stop(t + p.dur + 0.02);
      }
      t += p.dur + (p.gap ?? 0);
    }
  }

  /** Meme dialogue: never overlaps another line, with per-line cooldowns so it stays funny. */
  say(name: Clip, opts: { at?: { x: number; z: number }; cooldown?: number; force?: boolean; chance?: number } = {}) {
    const now = this.ctx.currentTime;
    if (!opts.force && now < this.voiceBusyUntil) return false;
    if (!opts.force && now - (this.lastSaid.get(name) ?? -99) < (opts.cooldown ?? 8)) return false;
    if (opts.chance !== undefined && Math.random() > opts.chance) return false;
    const src = this.play(name, { bus: "voice", at: opts.at, maxDist: 60 });
    if (!src) return false;
    this.voiceBusyUntil = now + (src.buffer?.duration ?? 2);
    this.lastSaid.set(name, now);
    return true;
  }

  loop(name: Clip | string, volume = 1, bus: Bus = "sfx") {
    const buf = this.buffers.get(name);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    g.connect(this.buses[bus]);
    if (!buf) return { stop() { /* */ }, setVolume() { /* */ } };
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(g); src.start();
    return {
      stop: () => { g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); setTimeout(() => src.stop(), 800); },
      setVolume: (v: number) => g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1),
    };
  }

  // ------------------------------------------------------------------
  // Procedural desi title music: tanpura drone + tabla (keherwa taal) + plucked "sitar" in raag Bhairav.
  // ------------------------------------------------------------------
  startTitleMusic() {
    if (this.music) return;
    const ctx = this.ctx, out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    out.connect(this.buses.music);
    // a little room
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(2.4);
    const wet = ctx.createGain(); wet.gain.value = 0.28;
    verb.connect(wet).connect(out);
    const dry = ctx.createGain(); dry.connect(out); dry.connect(verb);

    const SA = 146.83; // D3
    const bhairav = [0, 1, 4, 5, 7, 8, 11, 12, 13, 16, 17, 19]; // S r G m P d N S' r' G' m' P'
    const hz = (semi: number) => SA * Math.pow(2, semi / 12);

    // tanpura: Pa Sa' Sa' Sa, each a buzzy saw through a lowpass
    const tanpura = ctx.createGain(); tanpura.gain.value = 0.07; tanpura.connect(dry);
    const tanpuraNotes = [hz(-5), hz(0), hz(0), hz(-12)];
    const bpm = 92, beat = 60 / bpm;
    let next = ctx.currentTime + 0.1, step = 0, phrase: number[] = [], stopped = false;
    const pluckBuffers = new Map<number, AudioBuffer>();
    const pluck = (f: number) => {
      const key = Math.round(f * 10);
      let b = pluckBuffers.get(key);
      if (!b) { b = this.karplus(f, 1.6); pluckBuffers.set(key, b); }
      return b;
    };
    let melodyIdx = 3;
    const thekaa = ["dha", "ge", "na", "ti", "na", "ka", "dhi", "na"]; // keherwa
    const schedule = () => {
      if (stopped) return;
      while (next < ctx.currentTime + 0.25) {
        const half = beat / 2, t = next;
        // tabla on every half-beat
        const bol = thekaa[step % 8];
        this.tabla(bol, t, dry);
        // tanpura cycle: one string every 2 beats
        if (step % 4 === 0) this.drone(tanpuraNotes[(step / 4) % 4], t, beat * 2.2, tanpura);
        // sitar melody: phrases of 8 half-beats with rests
        if (step % 16 === 0) phrase = this.makePhrase(melodyIdx);
        const n = phrase[step % 16];
        if (n !== undefined && n >= 0) {
          melodyIdx = n;
          const src = ctx.createBufferSource();
          src.buffer = pluck(hz(bhairav[n]));
          const g = ctx.createGain(); g.gain.value = 0.32;
          // meend (slide) on some notes
          if (Math.random() < 0.25) { src.playbackRate.setValueAtTime(0.94, t); src.playbackRate.linearRampToValueAtTime(1, t + 0.12); }
          src.connect(g).connect(dry); src.start(t);
        }
        next += half; step++;
      }
      setTimeout(schedule, 60);
    };
    schedule();
    this.music = { stop: () => { stopped = true; out.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(() => out.disconnect(), 3000); this.music = null; } };
  }

  stopMusic() { this.music?.stop(); }

  private makePhrase(from: number) {
    const p: number[] = [];
    let n = from;
    for (let i = 0; i < 16; i++) {
      if (i % 8 === 7 || (i > 10 && Math.random() < 0.35)) { p.push(-1); continue; }
      if (Math.random() < 0.2 && i % 2 === 1) { p.push(-1); continue; }
      n = Math.max(0, Math.min(11, n + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
      p.push(n);
    }
    p[12] = 4; // resolve towards Pa
    return p;
  }

  private tabla(bol: string, t: number, dest: AudioNode) {
    const ctx = this.ctx;
    const bass = bol.startsWith("dh") || bol === "ge";
    const treble = bol !== "ge" && bol !== "ka";
    if (bass) { // bayan: pitch-bending low thump
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
      g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(g).connect(dest); o.start(t); o.stop(t + 0.5);
    }
    if (treble) { // dayan: ringing "na" with a slap of noise
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = bol === "ti" ? 620 : 440;
      g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(dest); o.start(t); o.stop(t + 0.2);
    }
    const n = ctx.createBufferSource(); n.buffer = this.noise(0.08);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = bol === "ka" ? 1800 : 3000; bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(bol === "ka" ? 0.35 : 0.12, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(bp).connect(ng).connect(dest); n.start(t);
  }

  private drone(f: number, t: number, dur: number, dest: AudioNode) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o2.type = "sawtooth"; o.frequency.value = f; o2.frequency.value = f * 1.003;
    lp.type = "lowpass"; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(dest);
    o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
  }

  /** Karplus-Strong plucked string with a "jawari" buzz. */
  private karplus(f: number, dur: number) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * dur), N = Math.max(2, Math.floor(sr / f));
    const buf = this.ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const a = ring[idx], b = ring[(idx + 1) % N];
      ring[idx] = (a + b) * 0.4985;
      const s = ring[idx];
      d[i] = Math.tanh(s * 2.2) * 0.6 + s * 0.4; // buzz
      idx = (idx + 1) % N;
    }
    return buf;
  }

  private noiseCache = new Map<number, AudioBuffer>();
  private noise(dur: number) {
    let b = this.noiseCache.get(dur);
    if (b) return b;
    const sr = this.ctx.sampleRate;
    b = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseCache.set(dur, b);
    return b;
  }

  private impulse(dur: number) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * dur), b = this.ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  // ------------------------------------------------------------------
  // City ambience: traffic rumble + crowd murmur + random synthetic/real honks.
  // ------------------------------------------------------------------
  startAmbience() {
    if (this.ambience) return;
    const ctx = this.ctx, out = ctx.createGain();
    out.gain.value = 0; out.gain.setTargetAtTime(1, ctx.currentTime, 2);
    out.connect(this.buses.ambience);
    // brown-noise traffic rumble
    const sr = ctx.sampleRate, len = sr * 4, nb = ctx.createBuffer(1, len, sr), d = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const rumble = ctx.createBufferSource(); rumble.buffer = nb; rumble.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380;
    const rg = ctx.createGain(); rg.gain.value = 0.5;
    rumble.connect(lp).connect(rg).connect(out); rumble.start();
    // crowd murmur: band-passed noise with slow wobble
    const crowd = ctx.createBufferSource(); crowd.buffer = this.noise(3); crowd.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 650; bp.Q.value = 0.8;
    const cg = ctx.createGain(); cg.gain.value = 0.05;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.23; lg.gain.value = 0.025;
    lfo.connect(lg).connect(cg.gain); lfo.start();
    crowd.connect(bp).connect(cg).connect(out); crowd.start();

    let stopped = false;
    // levels follow what's actually around the player (set every frame via setAmbienceLevels)
    this.levels = { traffic: rg.gain, crowd: cg.gain };
    this.ambience = {
      stop: () => { stopped = true; out.gain.setTargetAtTime(0, ctx.currentTime, 0.5); setTimeout(() => { rumble.stop(); crowd.stop(); lfo.stop(); }, 2500); this.ambience = null; },
    };
  }

  stopAmbience() { this.ambience?.stop(); }
  private levels: { traffic: AudioParam; crowd: AudioParam } | null = null;
  /** traffic01 = moving vehicles nearby, crowd01 = people nearby */
  setAmbienceLevels(traffic01: number, crowd01: number) {
    if (!this.levels) return;
    const t = this.ctx.currentTime;
    this.levels.traffic.setTargetAtTime(0.08 + traffic01 * 0.5, t, 0.6);
    this.levels.crowd.setTargetAtTime(crowd01 * 0.07, t, 0.6);
  }

  /** indicator relay click */
  tick(hi = true) {
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "square"; o.frequency.value = hi ? 1900 : 1300;
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(g).connect(this.buses.sfx); o.start(t); o.stop(t + 0.04);
  }

  /** metal pole hitting the road: a few inharmonic partials ringing down */
  clang(at?: { x: number; z: number }) {
    const sp = this.spatial(at, 60); if (!sp) return;
    const ctx = this.ctx, t = ctx.currentTime, g = ctx.createGain(), pan = ctx.createStereoPanner();
    pan.pan.value = sp.pan; g.connect(pan).connect(this.buses.sfx);
    g.gain.setValueAtTime(0.35 * sp.vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    for (const f of [220, 563, 921, 1407]) { const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f * (0.95 + Math.random() * 0.1); o.connect(g); o.start(t); o.stop(t + 1.5); }
    const n = ctx.createBufferSource(); n.buffer = this.noise(0.2); const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5 * sp.vol, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(ng).connect(pan); n.start(t);
  }

  /** desi katta: a sharp crack + low thump (or a sad click when it jams) */
  gunshot(jam = false, at?: { x: number; z: number }) {
    const ctx = this.ctx, t = ctx.currentTime;
    const sp = this.spatial(at, 120); if (!sp) return;
    const pan = ctx.createStereoPanner(); pan.pan.value = sp.pan; pan.connect(this.buses.sfx);
    if (jam) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "square"; o.frequency.value = 2400;
      g.gain.setValueAtTime(0.12 * sp.vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      o.connect(g).connect(pan); o.start(t); o.stop(t + 0.04);
      return;
    }
    const n = ctx.createBufferSource(); n.buffer = this.noise(0.6);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(6000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * sp.vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    n.connect(f).connect(g).connect(pan); n.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = "sine";
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    og.gain.setValueAtTime(0.8 * sp.vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(og).connect(pan); o.start(t); o.stop(t + 0.3);
  }

  /** Short synthetic whoosh for weapon swings. */
  whoosh(heavy = false) {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noise(0.3);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.5;
    f.frequency.setValueAtTime(heavy ? 300 : 600, t); f.frequency.exponentialRampToValueAtTime(heavy ? 1200 : 2500, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(heavy ? 0.5 : 0.3, t + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.connect(f).connect(g).connect(this.buses.sfx); n.start(t);
  }

  /**
   * Engine voice per vehicle kind: firing-frequency oscillators through a filter, an AM "putt" for singles and
   * two-strokes, intake/exhaust noise that opens up with the throttle, gear changes (rpm drops on upshift) and a
   * turbo whine for supercars. update(speed01, throttle01, at?) each frame; `at` makes it positional (traffic).
   */
  engine(kind: string) {
    const P = ENGINES[kind] ?? ENGINES.car_sedan;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner();
    out.connect(pan).connect(this.buses.sfx);
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.Q.value = 3; filt.frequency.value = 500;
    const body = ctx.createGain(); body.gain.value = 1;
    filt.connect(body).connect(out);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createOscillator();
    o1.type = P.wave; o2.type = "square"; sub.type = "sine";
    const g1 = ctx.createGain(), g2 = ctx.createGain(), gs = ctx.createGain();
    g1.gain.value = 0.55; g2.gain.value = 0.3; gs.gain.value = P.sub;
    o1.connect(g1).connect(filt); o2.connect(g2).connect(filt); sub.connect(gs).connect(filt);
    // AM: the individual power strokes ("dug-dug" / "putt-putt")
    const am = ctx.createOscillator(), amDepth = ctx.createGain();
    am.type = "square"; amDepth.gain.value = P.putt;
    am.connect(amDepth).connect(body.gain);
    // intake/exhaust roar
    const nz = ctx.createBufferSource(); nz.buffer = this.noise(2); nz.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.Q.value = 1.2; nf.frequency.value = 400;
    const ng = ctx.createGain(); ng.gain.value = 0;
    nz.connect(nf).connect(ng).connect(out);
    // turbo / CVT whine
    const wh = ctx.createOscillator(), wg = ctx.createGain(); wh.type = "sine"; wg.gain.value = 0;
    wh.connect(wg).connect(out);
    for (const o of [o1, o2, sub, am, wh]) o.start(t0);
    nz.start(t0);
    let gear = 0, shiftT = 0, rpmS = 0;
    return {
      update: (speed01: number, throttle = 0.5, at?: { x: number; z: number }, maxDist = 32) => {
        const t = ctx.currentTime;
        let sp = 1, vol = 1;
        if (at) { const s2 = this.spatial(at, maxDist); if (!s2) vol = 0; else { vol = s2.vol * s2.vol; sp = s2.pan; pan.pan.setTargetAtTime(sp, t, 0.05); } }
        // gearbox: rpm climbs within a gear, drops when it shifts up
        let rpm: number;
        if (P.gears <= 1) rpm = Math.min(1, speed01 * 1.15);
        else {
          const g = Math.min(P.gears - 1, Math.floor(speed01 * P.gears * 0.999));
          if (g > gear) shiftT = 0.18; // brief lift during the shift
          gear = g;
          const within = speed01 * P.gears - g;
          rpm = 0.25 + within * 0.7 + g * 0.02;
        }
        if (speed01 < 0.02) rpm = 0;
        shiftT = Math.max(0, shiftT - 1 / 60);
        rpm = Math.min(1, rpm + throttle * 0.08); // flooring it revs a bit higher
        rpmS += (rpm - rpmS) * 0.25;
        const hz = P.idle + (P.max - P.idle) * rpmS;
        o1.frequency.setTargetAtTime(hz, t, 0.03); o2.frequency.setTargetAtTime(hz * 0.5, t, 0.03); sub.frequency.setTargetAtTime(hz * 0.25, t, 0.03);
        am.frequency.setTargetAtTime(Math.max(4, hz * P.puttRate), t, 0.03);
        const load = shiftT > 0 ? 0.15 : 0.35 + throttle * 0.65;
        filt.frequency.setTargetAtTime(P.filt * (0.35 + rpmS * 0.8) * (0.6 + load * 0.6), t, 0.05);
        nf.frequency.setTargetAtTime(300 + rpmS * 1400, t, 0.05);
        ng.gain.setTargetAtTime(P.roar * load * (0.3 + rpmS) * vol, t, 0.06);
        wh.frequency.setTargetAtTime(P.whineHz * (0.4 + rpmS), t, 0.05);
        wg.gain.setTargetAtTime(P.whine * rpmS * (0.3 + throttle * 0.7) * vol, t, 0.08);
        out.gain.setTargetAtTime(P.gain * (0.55 + load * 0.45) * vol, t, 0.06);
      },
      stop: () => {
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        setTimeout(() => { for (const o of [o1, o2, sub, am, wh]) o.stop(); nz.stop(); out.disconnect(); }, 500);
      },
    };
  }
}
