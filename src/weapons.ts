import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, Vector4 } from "@babylonjs/core";

export type WeaponId = "fists" | "belt" | "lathi" | "hockey" | "bat" | "katta";
/** order on the weapon wheel / number keys */
export const WEAPON_ORDER: WeaponId[] = ["fists", "belt", "lathi", "hockey", "bat", "katta"];

export type Attack = {
  anim: "punchL" | "punchR" | "slash" | "kick";
  /** fraction of the clip at which the hit lands */
  impact: number;
  speed: number;
  damage: number;
  range: number;
  knock: number;
  sound: "sfx_punch" | "sfx_slap" | "sfx_bone_crack";
  label: string;
  heavy?: boolean;
};

export const WEAPONS: Record<WeaponId, { name: string; hi: string; primary: Attack; secondary?: Attack; icon: string; gun?: { damage: number; clip: number; reload: number; cooldown: number; jam: number } }> = {
  fists: {
    name: "Mukka", hi: "मुक्का", icon: "👊",
    primary: { anim: "punchR", impact: 0.38, speed: 1.5, damage: 14, range: 1.25, knock: 3, sound: "sfx_punch", label: "DHISHUM!" },
    secondary: { anim: "punchL", impact: 0.35, speed: 1.7, damage: 9, range: 1.2, knock: 2, sound: "sfx_slap", label: "CHATAAK!" },
  },
  belt: {
    name: "Belt", hi: "बेल्ट", icon: "🪢",
    primary: { anim: "slash", impact: 0.42, speed: 1.5, damage: 20, range: 1.9, knock: 3.5, sound: "sfx_slap", label: "SADAAK!" },
  },
  lathi: {
    name: "Lathi", hi: "लाठी", icon: "🦯",
    primary: { anim: "slash", impact: 0.42, speed: 1.3, damage: 26, range: 2.1, knock: 5, sound: "sfx_bone_crack", label: "THAKK!", heavy: true },
  },
  hockey: {
    name: "Hockey Stick", hi: "हॉकी", icon: "🏑",
    primary: { anim: "slash", impact: 0.42, speed: 1.3, damage: 32, range: 2.1, knock: 6.5, sound: "sfx_bone_crack", label: "GOAAAL!", heavy: true },
  },
  katta: {
    name: "Katta", hi: "कट्टा", icon: "🔫",
    // a hand-made desi pistol: hits hard, reloads slowly and jams now and then
    primary: { anim: "punchR", impact: 0.38, speed: 1.5, damage: 14, range: 1.25, knock: 3, sound: "sfx_punch", label: "DHISHUM!" },
    gun: { damage: 60, clip: 6, reload: 1.6, cooldown: 0.38, jam: 0.08 },
  },
  bat: {
    name: "Cricket Bat", hi: "बल्ला", icon: "🏏",
    primary: { anim: "slash", impact: 0.45, speed: 1.15, damage: 40, range: 1.9, knock: 8, sound: "sfx_bone_crack", label: "CHHAKKA!", heavy: true },
  },
};

/**
 * How each weapon sits in the fist and how it swings. rot is relative to the wrist (whose +Y runs back up the forearm);
 * slide moves the weapon along its own length (negative = choke up, more sticks out past the fist);
 * the swing overlay adds a wind-up and a follow-through on top of the body animation, on the given local axis.
 */
export type Hold = { rot: [number, number, number]; slide: number; swing?: { axis: "x" | "z"; windup: number; follow: number }; lunge?: number; shake?: number; hitStop?: number; launch?: number };
export const HOLDS: Record<WeaponId, Hold> = {
  fists: { rot: [0, 0, 0], slide: 0, lunge: 1.5, shake: 0.08, hitStop: 0.04 },
  belt: { rot: [Math.PI, 0, 0], slide: 0, shake: 0.06, hitStop: 0.03 },                               // dangles: rope physics
  lathi: { rot: [-Math.PI / 2 + 0.45, 0, 0], slide: -0.35, swing: { axis: "x", windup: 1.1, follow: 0.9 }, lunge: 2, shake: 0.15, hitStop: 0.06 },
  hockey: { rot: [-Math.PI / 2 - 0.85, 0, 0.25], slide: 0, swing: { axis: "z", windup: 1.2, follow: 1.3 }, lunge: 2.5, shake: 0.18, hitStop: 0.07, launch: 3 },
  bat: { rot: [-Math.PI / 2 + 0.2, 0, 0], slide: -0.05, swing: { axis: "x", windup: 1.5, follow: 1.2 }, lunge: 3, shake: 0.32, hitStop: 0.11, launch: 6 },
  katta: { rot: [Math.PI, 0, 0], slide: -0.06 },                                                         // barrel continues the forearm
};
/** swing overlay angle at normalised attack time t (0..1), impact at `imp` */
export function swingCurve(t: number, imp: number, windup: number, follow: number) {
  if (t <= 0 || t >= 1) return 0;
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (t < imp * 0.7) return -windup * ease(t / (imp * 0.7));                       // wind up (slow)
  if (t < imp) return -windup + (windup + follow) * ease((t - imp * 0.7) / (imp * 0.3)); // whip through (fast)
  return follow * (1 - ease((t - imp) / (1 - imp)));                               // settle back
}

/** In-hand belt: a little verlet rope so it hangs, sways and whips when swung. */
export class BeltRope {
  private pts: Vector3[] = [];
  private prev: Vector3[] = [];
  private tube: Mesh;
  private buckle: Mesh;
  private readonly seg = 0.15;
  constructor(private scene: Scene, start: Vector3, n = 7) {
    for (let i = 0; i < n; i++) { const p = start.add(new Vector3(0, -i * this.seg, 0)); this.pts.push(p); this.prev.push(p.clone()); }
    const leather = mat(scene, "beltLeather", "#2b1a10");
    this.tube = MeshBuilder.CreateTube("beltRope", { path: this.pts, radius: 0.018, tessellation: 4, updatable: true }, scene);
    this.tube.material = leather; this.tube.isPickable = false; this.tube.alwaysSelectAsActiveMesh = true;
    const metal = mat(scene, "buckleM", "#d7d7d7"); metal.specularColor = new Color3(0.9, 0.9, 0.9);
    this.buckle = MeshBuilder.CreateTorus("beltBuckle", { diameter: 0.07, thickness: 0.014, tessellation: 10 }, scene);
    this.buckle.material = metal; this.buckle.isPickable = false;
  }
  /** pin the first point to the hand and step the rope */
  update(dt: number, hand: Vector3, groundY: number) {
    const g = -9.8 * dt * dt, n = this.pts.length;
    this.pts[0].copyFrom(hand); this.prev[0].copyFrom(hand);
    for (let i = 1; i < n; i++) {
      const p = this.pts[i], v = p.subtract(this.prev[i]).scale(0.985);
      this.prev[i].copyFrom(p);
      p.addInPlace(v); p.y += g;
      if (p.y < groundY + 0.02) p.y = groundY + 0.02;
    }
    for (let k = 0; k < 6; k++) for (let i = 1; i < n; i++) {
      const a = this.pts[i - 1], b = this.pts[i], d = b.subtract(a), l = d.length() || 1e-6;
      const corr = d.scale((l - this.seg) / l);
      if (i === 1) b.subtractInPlace(corr); else { a.addInPlace(corr.scale(0.5)); b.subtractInPlace(corr.scale(0.5)); }
    }
    this.tube = MeshBuilder.CreateTube("beltRope", { path: this.pts, radius: 0.018, instance: this.tube });
    this.buckle.position.copyFrom(this.pts[n - 1]);
    const dir = this.pts[n - 1].subtract(this.pts[n - 2]);
    this.buckle.rotation.set(Math.atan2(Math.hypot(dir.x, dir.z), dir.y), Math.atan2(dir.x, dir.z), 0);
  }
  /** fling the tip (the crack of the belt) */
  whip(dir: Vector3, speed: number, dt = 1 / 60) {
    const n = this.pts.length;
    for (let i = 2; i < n; i++) this.prev[i].subtractInPlace(dir.scale(speed * dt * (i / n)));
  }
  get tip() { return this.pts[this.pts.length - 1]; }
  setEnabled(v: boolean) { this.tube.setEnabled(v); this.buckle.setEnabled(v); }
  dispose() { this.tube.dispose(); this.buckle.dispose(); }
}

const mat = (scene: Scene, name: string, hex: string) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.1, 0.1, 0.1);
  return m;
};

/** Builds the hand-held mesh for a weapon. Local +Y is "out of the fist". */
export function buildWeaponMesh(scene: Scene, id: WeaponId): TransformNode | null {
  if (id === "fists") return null;
  const root = new TransformNode(`weapon_${id}`, scene);
  const parts: Mesh[] = [];
  if (id === "lathi") {
    const bamboo = mat(scene, "bamboo", "#8a6234");
    const s = MeshBuilder.CreateCylinder("lathi", { height: 1.5, diameterTop: 0.035, diameterBottom: 0.045, tessellation: 8 }, scene);
    s.material = bamboo; s.position.y = 0.45; parts.push(s);
    const brass = mat(scene, "brass", "#c9a227");
    for (const y of [-0.28, 1.15]) { const b = MeshBuilder.CreateCylinder("band", { height: 0.06, diameter: 0.05, tessellation: 8 }, scene); b.material = brass; b.position.y = y; parts.push(b); }
  } else if (id === "belt") {
    const leather = mat(scene, "leather", "#2b1a10");
    const strap = MeshBuilder.CreateBox("strap", { width: 0.035, height: 0.9, depth: 0.008 }, scene);
    strap.material = leather; strap.position.y = 0.42; strap.rotation.z = 0.08; parts.push(strap);
    const metal = mat(scene, "buckle", "#d7d7d7");
    metal.specularColor = new Color3(0.9, 0.9, 0.9);
    const buckle = MeshBuilder.CreateTorus("buckle", { diameter: 0.07, thickness: 0.012, tessellation: 12 }, scene);
    buckle.material = metal; buckle.position.y = 0.88; buckle.rotation.x = Math.PI / 2; parts.push(buckle);
  } else if (id === "bat") {
    const willow = new StandardMaterial("willow", scene);
    const t = new DynamicTexture("batTex", { width: 128, height: 512 }, scene, true);
    const c = t.getContext() as unknown as CanvasRenderingContext2D;
    c.fillStyle = "#e8cf9a"; c.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(150,110,60,${Math.random() * 0.15})`; c.fillRect(Math.random() * 128, 0, 1 + Math.random() * 2, 512); }
    c.fillStyle = "#d50000"; c.fillRect(14, 70, 100, 150);
    c.save(); c.translate(64, 145); c.rotate(-Math.PI / 2);
    c.fillStyle = "#fff"; c.font = "bold 40px Anton, Impact, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("BHAUKAAL", 0, 0); c.restore();
    t.update();
    willow.diffuseTexture = t; willow.specularColor = new Color3(0.05, 0.05, 0.05);
    const blade = MeshBuilder.CreateBox("blade", { width: 0.11, height: 0.56, depth: 0.04, faceUV: [new Vector4(0, 0, 1, 1), new Vector4(0, 0, 1, 1), new Vector4(0, 0, 0.1, 0.1), new Vector4(0, 0, 0.1, 0.1), new Vector4(0, 0, 0.1, 0.1), new Vector4(0, 0, 0.1, 0.1)] }, scene);
    blade.material = willow; blade.position.y = 0.55; parts.push(blade);
    const grip = MeshBuilder.CreateCylinder("grip", { height: 0.3, diameter: 0.035, tessellation: 8 }, scene);
    grip.material = mat(scene, "grip", "#1a1a1a"); grip.position.y = 0.12; parts.push(grip);
  }
  else if (id === "hockey") {
    const wood = mat(scene, "hockeyWood", "#c58b4a");
    const shaft = MeshBuilder.CreateCylinder("hockeyShaft", { height: 1.0, diameter: 0.035, tessellation: 8 }, scene);
    shaft.material = wood; shaft.position.y = 0.4; parts.push(shaft);
    const tape = MeshBuilder.CreateCylinder("hockeyTape", { height: 0.25, diameter: 0.04, tessellation: 8 }, scene);
    tape.material = mat(scene, "hockeyTapeM", "#1565c0"); tape.position.y = 0.0; parts.push(tape);
    const blade = MeshBuilder.CreateBox("hockeyBlade", { width: 0.22, height: 0.08, depth: 0.04 }, scene);
    blade.material = wood; blade.position.set(0.09, 0.92, 0); blade.rotation.z = -0.35; parts.push(blade);
  } else if (id === "katta") {
    const steel = mat(scene, "kattaSteel", "#3a3a3c"); steel.specularColor = new Color3(0.6, 0.6, 0.6);
    const barrel = MeshBuilder.CreateCylinder("kattaBarrel", { height: 0.26, diameter: 0.032, tessellation: 10 }, scene);
    barrel.material = steel; barrel.position.set(0, 0.12, 0.05); parts.push(barrel);
    const body = MeshBuilder.CreateBox("kattaBody", { width: 0.03, height: 0.1, depth: 0.05 }, scene);
    body.material = steel; body.position.set(0, 0.0, 0.05); parts.push(body);
    const grip = MeshBuilder.CreateBox("kattaGrip", { width: 0.035, height: 0.06, depth: 0.12 }, scene);
    grip.material = mat(scene, "kattaWood", "#6d4325"); grip.position.set(0, -0.02, -0.02); grip.rotation.x = 0.35; parts.push(grip);
    const tip = new TransformNode("muzzle", scene); tip.parent = root; tip.position.set(0, 0.26, 0.05);
  }
  parts.forEach((p) => { p.parent = root; p.isPickable = false; });
  return root;
}
