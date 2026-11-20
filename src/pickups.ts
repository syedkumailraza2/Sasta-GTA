import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, Vector4 } from "@babylonjs/core";
import { buildWeaponMesh, type WeaponId } from "./weapons";

type Kind = "money" | "weapon" | "chai";
export type Pickup = { kind: Kind; node: TransformNode; label?: Mesh; amount: number; weapon?: WeaponId; age: number; life: number; respawn?: number; home?: Vector3 };

/** ₹ note bundles that pop out of knocked-out people, weapon pickups and cutting-chai health. */
export class Pickups {
  items: Pickup[] = [];
  private noteMat: StandardMaterial;
  private bandMat: StandardMaterial;
  private chaiMat: StandardMaterial;

  constructor(private scene: Scene) {
    // ₹500 note texture (stone-grey with a hint of green, like the new series)
    const t = new DynamicTexture("note", { width: 256, height: 128 }, scene, true);
    const c = t.getContext() as unknown as CanvasRenderingContext2D;
    const g = c.createLinearGradient(0, 0, 256, 128); g.addColorStop(0, "#c9c4b5"); g.addColorStop(1, "#a7b49b");
    c.fillStyle = g; c.fillRect(0, 0, 256, 128);
    c.strokeStyle = "#5d6b55"; c.lineWidth = 4; c.strokeRect(4, 4, 248, 120);
    c.fillStyle = "#3e4a3a"; c.font = "bold 46px Anton, Impact, sans-serif"; c.textBaseline = "middle"; c.fillText("₹500", 14, 40);
    c.font = "bold 18px sans-serif"; c.fillText("SASTA RESERVE BANK", 14, 90);
    c.beginPath(); c.arc(196, 64, 34, 0, 7); c.fillStyle = "#e6e1d3"; c.fill(); c.strokeStyle = "#5d6b55"; c.stroke();
    c.fillStyle = "#5d6b55"; c.font = "bold 30px sans-serif"; c.textAlign = "center"; c.fillText("₹", 196, 66);
    t.update();
    this.noteMat = new StandardMaterial("noteMat", scene); this.noteMat.diffuseTexture = t; this.noteMat.emissiveColor = new Color3(0.25, 0.25, 0.25);
    this.bandMat = new StandardMaterial("bandMat", scene); this.bandMat.diffuseColor = Color3.FromHexString("#f5d76e"); this.bandMat.emissiveColor = new Color3(0.2, 0.15, 0);
    this.chaiMat = new StandardMaterial("chaiMat", scene); this.chaiMat.diffuseColor = Color3.FromHexString("#b0723c"); this.chaiMat.emissiveColor = new Color3(0.25, 0.12, 0.03);
  }

  private label(text: string, color: string) {
    const tex = new DynamicTexture("pl", { width: 512, height: 128 }, this.scene, true);
    const c = tex.getContext() as unknown as CanvasRenderingContext2D;
    c.clearRect(0, 0, 512, 128);
    c.font = "bold 80px Anton, Impact, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = 12; c.strokeStyle = "#000"; c.strokeText(text, 256, 64); c.fillStyle = color; c.fillText(text, 256, 64);
    tex.update(); tex.hasAlpha = true;
    const m = new StandardMaterial("plm", this.scene);
    m.diffuseTexture = tex; m.useAlphaFromDiffuseTexture = true; m.emissiveColor = Color3.White(); m.disableLighting = true;
    const p = MeshBuilder.CreatePlane("pl", { width: 1.4, height: 0.35 }, this.scene);
    p.material = m; p.billboardMode = Mesh.BILLBOARDMODE_ALL; p.isPickable = false;
    return p;
  }

  money(at: Vector3, amount: number) {
    const node = new TransformNode("money", this.scene);
    const uv = new Vector4(0, 0, 1, 1);
    const bundle = MeshBuilder.CreateBox("bundle", { width: 0.34, height: 0.1, depth: 0.16, faceUV: [uv, uv, uv, uv, uv, uv] }, this.scene);
    bundle.material = this.noteMat; bundle.parent = node; bundle.isPickable = false;
    const band = MeshBuilder.CreateBox("band", { width: 0.06, height: 0.105, depth: 0.165 }, this.scene);
    band.material = this.bandMat; band.parent = node; band.isPickable = false;
    if (amount >= 200) { const b2 = bundle.clone("b2"); b2.position.y = 0.1; b2.rotation.y = 0.3; b2.parent = node; }
    node.position.set(at.x, 0.45 + (at.y > 0.1 ? 0.18 : 0), at.z);
    const label = this.label(`₹${amount}`, "#7ee081");
    label.parent = node; label.position.y = 0.6;
    this.items.push({ kind: "money", node, label, amount, age: 0, life: 45 });
  }

  weapon(at: Vector3, id: WeaponId) {
    const node = new TransformNode("wpPickup", this.scene);
    const mesh = buildWeaponMesh(this.scene, id);
    if (mesh) { mesh.parent = node; mesh.rotation.z = 0.5; mesh.position.y = -0.3; }
    const ring = MeshBuilder.CreateTorus("ring", { diameter: 1.0, thickness: 0.05, tessellation: 24 }, this.scene);
    const rm = new StandardMaterial("ringm", this.scene); rm.emissiveColor = new Color3(1, 0.6, 0.1); rm.disableLighting = true;
    ring.material = rm; ring.parent = node; ring.position.y = -0.55; ring.isPickable = false;
    node.position.set(at.x, 0.8 + at.y, at.z);
    const label = this.label(({ bat: "🏏 BALLA", lathi: "LATHI", hockey: "🏑 HOCKEY", katta: "🔫 KATTA", belt: "BELT", fists: "" } as Record<WeaponId, string>)[id], "#ffd166");
    label.parent = node; label.position.y = 0.9;
    this.items.push({ kind: "weapon", node, label, amount: 0, weapon: id, age: 0, life: Infinity, home: node.position.clone() });
  }

  chai(at: Vector3) {
    const node = new TransformNode("chai", this.scene);
    const cup = MeshBuilder.CreateCylinder("cup", { height: 0.22, diameterTop: 0.16, diameterBottom: 0.11, tessellation: 12 }, this.scene);
    const glass = new StandardMaterial("chaiGlass", this.scene); glass.diffuseColor = new Color3(0.9, 0.95, 1); glass.alpha = 0.45;
    cup.material = glass; cup.parent = node; cup.isPickable = false;
    const tea = MeshBuilder.CreateCylinder("tea", { height: 0.17, diameterTop: 0.145, diameterBottom: 0.1, tessellation: 12 }, this.scene);
    tea.material = this.chaiMat; tea.parent = node; tea.position.y = -0.02; tea.isPickable = false;
    node.position.set(at.x, 0.7 + at.y, at.z);
    const label = this.label("☕ CHAI +40", "#ffb38a");
    label.parent = node; label.position.y = 0.55;
    this.items.push({ kind: "chai", node, label, amount: 40, age: 0, life: Infinity, home: node.position.clone() });
  }

  /** Returns pickups collected this frame (within radius of `at`). */
  update(dt: number, at: Vector3, radius = 1.3): Pickup[] {
    const got: Pickup[] = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      if (p.respawn !== undefined) {
        p.respawn -= dt;
        if (p.respawn <= 0) { p.respawn = undefined; p.node.setEnabled(true); }
        continue;
      }
      p.node.rotation.y += dt * 2.2;
      const base = p.home?.y ?? (p.kind === "money" ? p.node.position.y : 0.8);
      if (p.home) p.node.position.y = base + Math.sin(p.age * 3) * 0.08;
      if (p.age > p.life) { this.remove(i); continue; }
      const dx = p.node.position.x - at.x, dz = p.node.position.z - at.z;
      if (dx * dx + dz * dz < radius * radius && Math.abs(p.node.position.y - at.y - 0.6) < 1.6) {
        got.push(p);
        if (p.kind === "money") this.remove(i);
        else { p.node.setEnabled(false); p.respawn = 60; }
      }
    }
    return got;
  }

  private remove(i: number) {
    const p = this.items[i];
    p.label?.material?.dispose(true, true);
    p.node.dispose(); // shared note/band materials must survive
    this.items.splice(i, 1);
  }
}
