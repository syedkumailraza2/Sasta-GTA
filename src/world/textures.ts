import { DynamicTexture, Scene, Texture } from "@babylonjs/core";
import type { Rng } from "./rng";

const HI = `"Rozha One", "Kohinoor Devanagari", "Noto Sans Devanagari", sans-serif`;
const EN = `"Anton", "Impact", sans-serif`;

function tex(scene: Scene, name: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, wrap = true) {
  const t = new DynamicTexture(name, { width: w, height: h }, scene, true);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  draw(c);
  t.update(true);
  t.wrapU = t.wrapV = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
}

function grime(c: CanvasRenderingContext2D, w: number, h: number, rng: Rng, amount = 1) {
  // speckle noise
  for (let i = 0; i < 900 * amount; i++) {
    const a = rng() * 0.08;
    c.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`;
    c.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
  }
  // rain streaks / monsoon stains running down from the top
  for (let i = 0; i < 10 * amount; i++) {
    const x = rng() * w, len = h * (0.2 + rng() * 0.7);
    const g = c.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(40,30,20,${0.12 + rng() * 0.15})`);
    g.addColorStop(1, "rgba(40,30,20,0)");
    c.fillStyle = g;
    c.fillRect(x, 0, 2 + rng() * 8, len);
  }
}

export const WALL_COLORS = [
  "#e8a0a8", "#f2c94c", "#7fc8c1", "#f4e4c1", "#9fc5e8", "#e59866",
  "#c39bd3", "#a9d18e", "#f5f0e6", "#e6b0aa", "#d4b483", "#88c0d0",
];

/** One tile = one floor (3.2m) x one bay (3m) with a window. Tiles across the facade. */
export function facadeTexture(scene: Scene, color: string, rng: Rng, variant: number) {
  return tex(scene, `facade_${color}_${variant}`, 256, 256, (c) => {
    c.fillStyle = color;
    c.fillRect(0, 0, 256, 256);
    grime(c, 256, 256, rng, 1.2);
    // floor slab band at the bottom of each tile
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(0, 240, 256, 16);
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(0, 238, 256, 3);
    // window
    const wx = 58, wy = 60, ww = 140, wh = 120;
    c.fillStyle = "rgba(0,0,0,0.25)"; // chajja shadow
    c.fillRect(wx - 14, wy - 18, ww + 28, 14);
    c.fillStyle = "#6b6b6b";
    c.fillRect(wx - 14, wy - 22, ww + 28, 8); // chajja (sunshade)
    c.fillStyle = "#2a2622";
    c.fillRect(wx - 6, wy - 6, ww + 12, wh + 12); // frame
    const glass = c.createLinearGradient(wx, wy, wx + ww, wy + wh);
    const lit = variant % 4 === 0;
    glass.addColorStop(0, lit ? "#ffd27a" : "#3d5566");
    glass.addColorStop(1, lit ? "#c47a2c" : "#1a2630");
    c.fillStyle = glass;
    c.fillRect(wx, wy, ww, wh);
    // curtains sometimes
    if (variant % 3 === 1) {
      c.fillStyle = ["#b03a2e", "#1f618d", "#7d3c98", "#d68910"][variant % 4];
      c.fillRect(wx, wy, ww * 0.35, wh);
      c.fillRect(wx + ww * 0.7, wy, ww * 0.3, wh);
    }
    // window grill
    c.strokeStyle = "#1b1b1b";
    c.lineWidth = 4;
    for (let x = wx + 20; x < wx + ww; x += 20) { c.beginPath(); c.moveTo(x, wy); c.lineTo(x, wy + wh); c.stroke(); }
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(wx, wy + wh / 2); c.lineTo(wx + ww, wy + wh / 2); c.stroke();
    // AC unit on some
    if (variant % 2 === 0) {
      c.fillStyle = "#dcdcdc";
      c.fillRect(wx + ww - 50, wy + wh + 14, 64, 36);
      c.fillStyle = "#9a9a9a";
      for (let i = 0; i < 6; i++) c.fillRect(wx + ww - 46, wy + wh + 18 + i * 5, 56, 2);
    }
  });
}

export function shutterTexture(scene: Scene) {
  return tex(scene, "shutter", 512, 256, (c) => {
    // left half: closed rolling shutter
    c.fillStyle = "#8d9196";
    c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 8) {
      c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(0, y, 256, 2);
      c.fillStyle = "rgba(255,255,255,0.15)"; c.fillRect(0, y + 2, 256, 1);
    }
    c.fillStyle = "rgba(120,60,20,0.25)";
    c.fillRect(0, 200, 256, 56);
    // right half: open shop with goods on shelves
    c.fillStyle = "#2b1d14";
    c.fillRect(256, 0, 256, 256);
    const goods = ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71", "#e67e22", "#9b59b6", "#ecf0f1"];
    for (let s = 0; s < 4; s++) {
      const y = 30 + s * 50;
      c.fillStyle = "#5d4037"; c.fillRect(262, y + 38, 244, 6);
      for (let x = 266; x < 500; x += 12 + (s * 7 + x) % 9) {
        c.fillStyle = goods[(x + s * 3) % goods.length];
        const hh = 18 + ((x * 7 + s * 13) % 18);
        c.fillRect(x, y + 38 - hh, 9, hh);
      }
    }
    c.fillStyle = "#ffe9a8"; // tube light glow
    c.fillRect(300, 8, 160, 6);
    c.fillStyle = "#6d4c41"; // counter
    c.fillRect(256, 200, 256, 56);
  }, false);
}

export type SignDef = { hi: string; en: string; bg: string; fg: string };
export const SIGNS: SignDef[] = [
  { hi: "शर्मा किराना स्टोर", en: "SHARMA KIRANA STORE", bg: "#f7d21e", fg: "#b3001b" },
  { hi: "गुप्ता मेडिकल", en: "GUPTA MEDICAL & GENERAL", bg: "#0b8a3e", fg: "#ffffff" },
  { hi: "चाय सुट्टा बार", en: "CHAI SUTTA BAR", bg: "#5a2d0c", fg: "#ffd27a" },
  { hi: "बॉम्बे वड़ा पाव", en: "BOMBAY VADA PAV", bg: "#ff7a00", fg: "#1a1a1a" },
  { hi: "साईं राम टेलर्स", en: "SAI RAM TAILORS", bg: "#1746a2", fg: "#ffffff" },
  { hi: "राजू मोबाइल", en: "RAJU MOBILE REPAIRING", bg: "#d7263d", fg: "#ffffff" },
  { hi: "बनारसी पान भंडार", en: "BANARASI PAAN", bg: "#1b5e20", fg: "#ffeb3b" },
  { hi: "जय माता दी स्वीट्स", en: "JAI MATA DI SWEETS", bg: "#c0392b", fg: "#ffe082" },
  { hi: "एसटीडी आईएसडी", en: "STD · ISD · PCO", bg: "#ffd600", fg: "#000000" },
  { hi: "अग्रवाल हार्डवेयर", en: "AGARWAL HARDWARE", bg: "#0d47a1", fg: "#ffeb3b" },
  { hi: "न्यू फैशन", en: "NEW FASHION BOUTIQUE", bg: "#e91e63", fg: "#ffffff" },
  { hi: "लक्ष्मी ज्वेलर्स", en: "LAXMI JEWELLERS", bg: "#6a0d1a", fg: "#ffd54f" },
  { hi: "शिवम कोचिंग", en: "SHIVAM COACHING CLASSES", bg: "#ffffff", fg: "#0d47a1" },
  { hi: "पंजाबी ढाबा", en: "PAAJI DA DHABA", bg: "#ef6c00", fg: "#ffffff" },
  { hi: "फोटोकॉपी", en: "XEROX · PRINTOUT", bg: "#eceff1", fg: "#1565c0" },
  { hi: "सिंह ऑटो पार्ट्स", en: "SINGH AUTO PARTS", bg: "#212121", fg: "#ffca28" },
];

function fitText(c: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, startPx: number) {
  let px = startPx;
  do { c.font = font(px); px -= 2; } while (c.measureText(text).width > maxW && px > 10);
}

/** 4x4 atlas of shop signboards. Cell i -> uv rect via atlasUV(i, 4). */
export const SIGNS2: SignDef[] = [
  { hi: "बंसल स्वीट्स", en: "BANSAL SWEETS & NAMKEEN", bg: "#ff8f00", fg: "#3e2723" },
  { hi: "गणपति इलेक्ट्रॉनिक्स", en: "GANPATI ELECTRONICS", bg: "#283593", fg: "#ffffff" },
  { hi: "गुप्ता टेंट हाउस", en: "GUPTA TENT HOUSE", bg: "#ad1457", fg: "#fff59d" },
  { hi: "रॉयल हेयर कटिंग", en: "ROYAL HAIR CUTTING SALOON", bg: "#000000", fg: "#ffd54f" },
  { hi: "कृष्णा डेयरी", en: "KRISHNA DAIRY · DOODH DAHI", bg: "#e3f2fd", fg: "#1565c0" },
  { hi: "होटल अन्नपूर्णा", en: "HOTEL ANNAPURNA · VEG", bg: "#2e7d32", fg: "#ffffff" },
  { hi: "बॉम्बे स्टेशनरी", en: "BOMBAY STATIONERY", bg: "#fbc02d", fg: "#b71c1c" },
  { hi: "जूस कॉर्नर", en: "FRESH JUICE CORNER", bg: "#00897b", fg: "#ffffff" },
  { hi: "मोबाइल रिचार्ज", en: "ALL MOBILE RECHARGE", bg: "#c62828", fg: "#ffffff" },
  { hi: "लक्ष्मी बेकरी", en: "LAXMI BAKERY & CAKES", bg: "#f8bbd0", fg: "#880e4f" },
  { hi: "ताज टेलर्स", en: "TAJ LADIES TAILORS", bg: "#4a148c", fg: "#ffffff" },
  { hi: "श्याम किराना", en: "SHYAM KIRANA BHANDAR", bg: "#ffeb3b", fg: "#1b5e20" },
  { hi: "भारत गैस", en: "GAS SERVICE · CYLINDER", bg: "#0277bd", fg: "#ffffff" },
  { hi: "साइबर कैफ़े", en: "CYBER CAFE · PRINTOUT", bg: "#212121", fg: "#00e676" },
  { hi: "ड्राई क्लीनर्स", en: "SUPER DRY CLEANERS", bg: "#ffffff", fg: "#d84315" },
  { hi: "मटन चिकन शॉप", en: "ALI MUTTON & CHICKEN", bg: "#b71c1c", fg: "#ffffff" },
];

export function signAtlas(scene: Scene, list: SignDef[] = SIGNS, name = "signs") {
  const W = 2048, H = 1024, cw = W / 4, ch = H / 4;
  return tex(scene, name, W, H, (c) => {
    list.forEach((s, i) => {
      const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
      c.fillStyle = s.bg; c.fillRect(x, y, cw, ch);
      c.strokeStyle = s.fg; c.lineWidth = 6; c.strokeRect(x + 8, y + 8, cw - 16, ch - 16);
      c.fillStyle = s.fg; c.textAlign = "center"; c.textBaseline = "middle";
      fitText(c, s.hi, (p) => `${p}px ${HI}`, cw - 40, 110);
      c.fillText(s.hi, x + cw / 2, y + ch * 0.4);
      fitText(c, s.en, (p) => `${p}px ${EN}`, cw - 40, 54);
      c.fillText(s.en, x + cw / 2, y + ch * 0.78);
    });
  }, false);
}

export const ADS = [
  { title: "BHAUKAAL COLA", sub: "Thanda matlab Bhaukaal!", bg: ["#d50000", "#ff6d00"], fg: "#ffffff" },
  { title: "LAXMI CHIT FUND", sub: "Paisa double in 30 din!*  *T&C", bg: ["#1a237e", "#00b0ff"], fg: "#ffeb3b" },
  { title: "SHIVAM COACHING", sub: "IIT-JEE · NEET · 100% Selection", bg: ["#ffffff", "#ffe082"], fg: "#b71c1c" },
  { title: "SASTA DATA 5G", sub: "Unlimited internet sirf ₹1 mein", bg: ["#00c853", "#1de9b6"], fg: "#0b2b1b" },
];

export function adAtlas(scene: Scene) {
  const W = 2048, H = 1024, cw = W / 2, ch = H / 2;
  return tex(scene, "ads", W, H, (c) => {
    ADS.forEach((a, i) => {
      const x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
      const g = c.createLinearGradient(x, y, x + cw, y + ch);
      g.addColorStop(0, a.bg[0]); g.addColorStop(1, a.bg[1]);
      c.fillStyle = g; c.fillRect(x, y, cw, ch);
      c.fillStyle = a.fg; c.textAlign = "center"; c.textBaseline = "middle";
      fitText(c, a.title, (p) => `${p}px ${EN}`, cw - 80, 170);
      c.fillText(a.title, x + cw / 2, y + ch * 0.42);
      fitText(c, a.sub, (p) => `italic ${p}px ${EN}`, cw - 100, 60);
      c.fillText(a.sub, x + cw / 2, y + ch * 0.75);
      c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 16; c.strokeRect(x + 8, y + 8, cw - 16, ch - 16);
    });
  }, false);
}

export function asphaltTexture(scene: Scene, rng: Rng) {
  return tex(scene, "asphalt", 512, 512, (c) => {
    c.fillStyle = "#4a4744"; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      const v = 50 + rng() * 60;
      c.fillStyle = `rgba(${v},${v - 3},${v - 6},0.5)`;
      c.fillRect(rng() * 512, rng() * 512, 2, 2);
    }
    for (let i = 0; i < 14; i++) { // patches & potholes, obviously
      c.fillStyle = `rgba(${rng() < 0.5 ? "20,20,20" : "110,100,90"},${0.15 + rng() * 0.2})`;
      c.beginPath(); c.ellipse(rng() * 512, rng() * 512, 10 + rng() * 50, 8 + rng() * 30, rng() * 3, 0, 7); c.fill();
    }
  });
}

export function paverTexture(scene: Scene, rng: Rng) {
  return tex(scene, "paver", 256, 256, (c) => {
    const cols = ["#a65e4e", "#8f8f8f", "#b5735f", "#9b9b95"];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      c.fillStyle = cols[(x + y) % 2 === 0 ? (y % 2) * 2 : 1 + (x % 2) * 2];
      c.fillRect(x * 32, y * 32, 32, 32);
      c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 2; c.strokeRect(x * 32 + 1, y * 32 + 1, 30, 30);
    }
    grime(c, 256, 256, rng, 0.6);
  });
}

export function dirtTexture(scene: Scene, rng: Rng) {
  return tex(scene, "dirt", 512, 512, (c) => {
    c.fillStyle = "#b68b5a"; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) {
      const v = rng();
      c.fillStyle = v < 0.5 ? `rgba(120,85,50,${rng() * 0.3})` : `rgba(220,190,140,${rng() * 0.3})`;
      c.fillRect(rng() * 512, rng() * 512, 1 + rng() * 3, 1 + rng() * 3);
    }
    for (let i = 0; i < 40; i++) { // dry grass tufts
      c.fillStyle = `rgba(110,120,50,${0.2 + rng() * 0.3})`;
      c.beginPath(); c.ellipse(rng() * 512, rng() * 512, 6 + rng() * 30, 4 + rng() * 16, rng() * 3, 0, 7); c.fill();
    }
  });
}

export function brickTexture(scene: Scene, rng: Rng) {
  return tex(scene, "brick", 256, 128, (c) => {
    c.fillStyle = "#c9c1b3"; c.fillRect(0, 0, 256, 128);
    for (let r = 0; r < 8; r++) for (let b = -1; b < 9; b++) {
      const x = b * 32 + (r % 2) * 16, y = r * 16;
      c.fillStyle = `hsl(${10 + rng() * 10}, ${45 + rng() * 15}%, ${38 + rng() * 10}%)`;
      c.fillRect(x + 1, y + 1, 30, 14);
    }
    grime(c, 256, 128, rng, 0.5);
  });
}

export const atlasUV = (i: number, cols: number, rows: number) => {
  const cx = i % cols, cy = Math.floor(i / cols);
  // Babylon v=0 is bottom of the canvas image
  return [cx / cols, 1 - (cy + 1) / rows, (cx + 1) / cols, 1 - cy / rows] as const;
};
