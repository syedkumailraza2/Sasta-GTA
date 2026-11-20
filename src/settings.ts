export type Settings = {
  master: number;
  music: number;
  sfx: number;
  voice: number;     // meme dialogues
  ambience: number;
  sensitivity: number;
  invertY: boolean;
  shadows: boolean;
  postFx: boolean;
};

const KEY = "sasta-gta-settings";
const DEFAULTS: Settings = {
  master: 0.8, music: 0.6, sfx: 0.8, voice: 0.9, ambience: 0.5,
  sensitivity: 1, invertY: false, shadows: true, postFx: true,
};

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode etc. */ }
}
