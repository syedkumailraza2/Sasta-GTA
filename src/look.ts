import { AbstractMesh, Color3, Mesh, MeshBuilder, PBRMaterial, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";
import type { Character } from "./characters";

/** What the hero looks like: hairstyle from the barber, clothes from the fashion shop. */
export type Look = { hair: string; hairColor: string; top: string; pants: string; glasses: boolean; cap: boolean; chain: boolean };
export const DEFAULT_LOOK: Look = { hair: "original", hairColor: "#120c08", top: "#5b1a2e", pants: "#22385e", glasses: false, cap: false, chain: false };

export const HAIRSTYLES: { id: string; name: string; hi: string; price: number }[] = [
  { id: "original", name: "College Cut", hi: "कॉलेज कट", price: 0 },
  { id: "army", name: "Army Cut", hi: "आर्मी कट", price: 80 },
  { id: "takla", name: "Takla", hi: "टकला", price: 50 },
  { id: "puff", name: "Bhai Puff", hi: "भाई पफ़", price: 250 },
  { id: "spikes", name: "Gel Spikes", hi: "जेल वाले", price: 200 },
  { id: "mohawk", name: "Mohawk", hi: "मोहॉक", price: 350 },
  { id: "rockstar", name: "Rockstar Lambe Baal", hi: "रॉकस्टार", price: 450 },
  { id: "jooda", name: "Man Bun", hi: "जूड़ा", price: 300 },
];
export const HAIR_COLORS: { id: string; name: string; price: number }[] = [
  { id: "#120c08", name: "Kaala", price: 0 }, { id: "#4a2a12", name: "Brown", price: 120 },
  { id: "#b5501c", name: "Mehendi", price: 150 }, { id: "#d9b45a", name: "Golden", price: 300 },
];
export const TOPS: { id: string; name: string; price: number }[] = [
  { id: "#5b1a2e", name: "Maroon Hoodie", price: 0 }, { id: "#e65100", name: "Bhagwa Hoodie", price: 399 },
  { id: "#1b1b1b", name: "Kaala Hoodie", price: 499 }, { id: "#0d47a1", name: "IPL Blue", price: 599 },
  { id: "#2e7d32", name: "Hara Bhara", price: 349 }, { id: "#d81b60", name: "Gulabi Swag", price: 449 },
  { id: "#ececec", name: "Safed Shaadi Special", price: 799 }, { id: "#f9a825", name: "CSK Peela", price: 599 },
];
export const PANTS: { id: string; name: string; price: number }[] = [
  { id: "#22385e", name: "Blue Jeans", price: 0 }, { id: "#1c1c1c", name: "Kaali Jeans", price: 699 },
  { id: "#a38b5a", name: "Khaki Pant", price: 499 }, { id: "#e8e2d0", name: "Safed Pyjama", price: 299 },
  { id: "#6d4c41", name: "Brown Cargo", price: 599 },
];
export const EXTRAS: { id: "glasses" | "cap" | "chain"; name: string; price: number }[] = [
  { id: "glasses", name: "Kaala Chashma", price: 999 }, { id: "cap", name: "Topi (Cap)", price: 299 }, { id: "chain", name: "Sone ki Chain", price: 4999 },
];

/** Builds hairstyles/accessories on a head anchor that follows the head bone. */
export class PlayerLook {
  private anchor: TransformNode;
  private parts: Mesh[] = [];
  private hairMesh: AbstractMesh | null = null;
  private W = 0.2; // hair cap width (m)
  private H = 0.1; // hair cap height (m)
  /** eye & neck positions in anchor space (for glasses and the chain) */
  private eyeY = -0.06; private eyeZ = 0.09; private neckY = -0.2;
  current: Look = { ...DEFAULT_LOOK };
  private skin = "#9a6236";

  constructor(private scene: Scene, private char: Character) {
    const byMat = (suffix: string, nameHas = "") => char.meshes.filter((m) => m.material && (m.material.name === suffix || m.material.name.endsWith(`_${suffix}`)) && m.name.includes(nameHas));
    this.hairMesh = byMat("Hair")[0] ?? null;
    const eye = byMat("Eye")[0];
    const head = char.bone("Head").find((b) => !b.name.endsWith("Head_end")) ?? char.bone("Head")[0];
    this.anchor = new TransformNode("hairAnchor", scene);
    if (!this.hairMesh || !head) return;
    char.root.computeWorldMatrix(true);
    for (const m of char.meshes) m.computeWorldMatrix(true);
    const hb = this.hairMesh.getBoundingInfo().boundingBox;
    const min = hb.minimumWorld, max = hb.maximumWorld;
    const c = min.add(max).scale(0.5);
    this.W = Math.max(max.x - min.x, max.z - min.z);
    this.H = max.y - min.y;
    // the eyes tell us which way the face points
    let yaw = 0;
    if (eye) {
      const e = eye.getBoundingInfo().boundingBox.centerWorld.subtract(c); yaw = Math.atan2(e.x, e.z);
      this.eyeY = e.y; this.eyeZ = Math.hypot(e.x, e.z);
    }
    const neck = char.bone("Neck")[0];
    if (neck) { neck.computeWorldMatrix(true); this.neckY = neck.getAbsolutePosition().y - c.y; }
    this.anchor.position.copyFrom(c);
    this.anchor.rotation.y = yaw;
    this.anchor.computeWorldMatrix(true);
    head.computeWorldMatrix(true);
    this.anchor.setParent(head);
  }

  private mat(name: string, hex: string) {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = Color3.FromHexString(hex); m.specularColor = new Color3(0.08, 0.08, 0.08);
    return m;
  }
  private add<T extends Mesh>(m: T, mat: StandardMaterial, x: number, y: number, z: number) {
    m.material = mat; m.parent = this.anchor; m.position.set(x, y, z); m.isPickable = false; m.alwaysSelectAsActiveMesh = true;
    this.parts.push(m); this.char.meshes.push(m);
    return m;
  }
  private setPbr(suffix: string, hex: string) {
    for (const m of this.char.meshes) {
      const mt = m.material;
      if (mt instanceof PBRMaterial && (mt.name === suffix || mt.name.endsWith(`_${suffix}`))) mt.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    }
  }

  apply(look: Look) {
    this.current = { ...look };
    for (const p of this.parts) {
      const i = this.char.meshes.indexOf(p); if (i >= 0) this.char.meshes.splice(i, 1);
      if (p.material && !(p.material instanceof PBRMaterial)) p.material.dispose(); // PBR = the shared face skin
      p.dispose();
    }
    this.parts = [];
    this.setPbr("Purple", look.top);
    this.setPbr("LightBlue", look.pants);
    this.setPbr("Hair", look.hairColor);
    const { W, H } = this;
    const hair = this.mat("styleHair", look.hairColor), skin = this.mat("styleSkin", this.skin);
    // the bald cap uses the face's own material so it matches the skin exactly
    const faceSkin = this.char.meshes.find((m) => m.material && /(^|_)Skin$/.test(m.material.name) && /Head/.test(m.name))?.material;
    const visible = this.char.meshes[0]?.isEnabled() ?? true;
    const keepOriginal = ["original", "puff", "spikes", "rockstar", "jooda"].includes(look.hair);
    this.hairMesh?.setEnabled(keepOriginal && visible);
    if (this.hairMesh) this.hairMesh.metadata = { ...(this.hairMesh.metadata ?? {}), hiddenByLook: !keepOriginal };
    // a dome over the scalp only (top slice of a sphere), so the face stays visible
    const cap = (m: StandardMaterial, k = 1) => { const s = MeshBuilder.CreateSphere("lookCap", { diameter: 1, segments: 12, slice: 0.55, sideOrientation: Mesh.DOUBLESIDE }, this.scene); s.scaling.set(W * 0.96 * k, H * 1.05 * k, W * 1.0 * k); return this.add(s, m, 0, -H * 0.02, -W * 0.02); };
    switch (look.hair) {
      case "army": cap(hair, 0.97); break;
      case "takla": { const c = cap(skin, 0.97); if (faceSkin) c.material = faceSkin; break; }
      case "puff": { const s = MeshBuilder.CreateSphere("lookPuff", { diameter: 1, segments: 10 }, this.scene); s.scaling.set(W * 0.62, H * 0.5, W * 0.5); this.add(s, hair, 0, H * 0.4, W * 0.24); break; }
      case "spikes": for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, r = W * 0.22 * (i % 2 ? 1 : 0.5);
        const s = MeshBuilder.CreateCylinder("lookSpike", { height: H * 0.9, diameterTop: 0, diameterBottom: W * 0.18, tessellation: 5 }, this.scene);
        this.add(s, hair, Math.cos(a) * r, H * 0.55, Math.sin(a) * r); s.rotation.set(Math.sin(a) * 0.5 - 0.15, 0, -Math.cos(a) * 0.5);
      } break;
      case "mohawk": {
        { const c = cap(skin, 0.96); if (faceSkin) c.material = faceSkin; }
        for (let i = 0; i < 6; i++) { const s = MeshBuilder.CreateCylinder("lookMohawk", { height: H * 1.1, diameterTop: W * 0.04, diameterBottom: W * 0.26, tessellation: 4 }, this.scene); s.scaling.x = 0.55; this.add(s, hair, 0, H * 0.55, W * (0.38 - i * 0.15)); s.rotation.x = -0.2; }
        break;
      }
      case "rockstar": {
        const back = MeshBuilder.CreateSphere("lookLong", { diameter: 1, segments: 10 }, this.scene); back.scaling.set(W * 1.05, H * 3.2, W * 0.5);
        this.add(back, hair, 0, -H * 1.2, -W * 0.28);
        for (const sx of [-1, 1]) { const side = MeshBuilder.CreateSphere("lookSide", { diameter: 1, segments: 8 }, this.scene); side.scaling.set(W * 0.22, H * 2.4, W * 0.6); this.add(side, hair, sx * W * 0.45, -H * 0.9, -W * 0.05); }
        break;
      }
      case "jooda": { const s = MeshBuilder.CreateSphere("lookBun", { diameter: 1, segments: 10 }, this.scene); s.scaling.setAll(W * 0.42); this.add(s, hair, 0, H * 0.35, -W * 0.48); break; }
    }
    if (look.glasses) {
      const black = this.mat("shades", "#0a0a0a"); black.specularColor = new Color3(0.9, 0.9, 0.9); black.specularPower = 64;
      const ez = this.eyeZ + W * 0.06, ey = this.eyeY + W * 0.01;
      for (const sx of [-1, 1]) { const l = MeshBuilder.CreateBox("lookLens", { width: W * 0.34, height: W * 0.17, depth: W * 0.04 }, this.scene); this.add(l, black, sx * W * 0.2, ey, ez); }
      const bridge = MeshBuilder.CreateBox("lookBridge", { width: W * 0.95, height: W * 0.035, depth: W * 0.035 }, this.scene); this.add(bridge, black, 0, ey + W * 0.06, ez);
      for (const sx of [-1, 1]) { const arm = MeshBuilder.CreateBox("lookArm", { width: W * 0.03, height: W * 0.03, depth: ez + W * 0.1 }, this.scene); this.add(arm, black, sx * W * 0.47, ey + W * 0.05, ez / 2 - W * 0.05); }
    }
    if (look.cap) {
      const red = this.mat("capCloth", "#c62828");
      const dome = MeshBuilder.CreateSphere("lookCapDome", { diameter: 1, segments: 12, slice: 0.5, sideOrientation: Mesh.DOUBLESIDE }, this.scene); dome.scaling.set(W * 1.08, H * 1.35, W * 1.1);
      this.add(dome, red, 0, -H * 0.02, 0);
      const brim = MeshBuilder.CreateBox("lookBrim", { width: W * 0.8, height: W * 0.03, depth: W * 0.5 }, this.scene); this.add(brim, red, 0, -H * 0.02, W * 0.66); brim.rotation.x = -0.12;
    }
    if (look.chain) {
      const gold = this.mat("gold", "#d4a017"); gold.specularColor = new Color3(1, 0.9, 0.5); gold.emissiveColor = new Color3(0.25, 0.18, 0.02);
      const t = MeshBuilder.CreateTorus("lookChain", { diameter: W * 1.6, thickness: W * 0.06, tessellation: 20 }, this.scene);
      this.add(t, gold, 0, this.neckY - W * 0.15, W * 0.12); t.rotation.x = 0.5;
      const pendant = MeshBuilder.CreateCylinder("lookPendant", { height: W * 0.05, diameter: W * 0.26, tessellation: 12 }, this.scene);
      this.add(pendant, gold, 0, this.neckY - W * 0.55, W * 0.62); pendant.rotation.x = Math.PI / 2 - 0.35;
    }
    for (const p of this.parts) p.setEnabled(visible);
  }
}

export function loadLook(): { look: Look; owned: string[] } {
  try {
    const raw = localStorage.getItem("sastaGta.look");
    if (raw) { const v = JSON.parse(raw); return { look: { ...DEFAULT_LOOK, ...v.look }, owned: v.owned ?? [] }; }
  } catch { /* private mode etc. */ }
  return { look: { ...DEFAULT_LOOK }, owned: [] };
}
export function saveLook(look: Look, owned: Set<string>) {
  try { localStorage.setItem("sastaGta.look", JSON.stringify({ look, owned: [...owned] })); } catch { /* ignore */ }
}

