import {
  Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, Scene, StandardMaterial, Texture, TransformNode, Vector3, Color3,
} from "@babylonjs/core";

/** Blood spatter particles, ground splats and floating text. Everything is pooled. */
export class Fx {
  private dropTex: Texture;
  private splatMat: StandardMaterial;
  private splats: { m: Mesh; age: number }[] = [];
  private splatIdx = 0;
  private texts: { m: Mesh; age: number; life: number; vy: number }[] = [];

  constructor(private scene: Scene) {
    // round soft droplet
    const dt = new DynamicTexture("drop", { width: 64, height: 64 }, scene, false);
    const c = dt.getContext() as unknown as CanvasRenderingContext2D;
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(160,0,0,1)"); g.addColorStop(0.6, "rgba(120,0,0,0.9)"); g.addColorStop(1, "rgba(80,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, 64, 64); dt.update(); dt.hasAlpha = true;
    this.dropTex = dt;

    // irregular splat decal
    const st = new DynamicTexture("splat", { width: 256, height: 256 }, scene, true);
    const sc = st.getContext() as unknown as CanvasRenderingContext2D;
    sc.clearRect(0, 0, 256, 256);
    sc.fillStyle = "rgba(110,0,0,0.9)";
    sc.beginPath(); sc.arc(128, 128, 60, 0, 7); sc.fill();
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 7, r = 50 + Math.random() * 70, s = 4 + Math.random() * 18;
      sc.beginPath(); sc.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, s, 0, 7); sc.fill();
    }
    sc.fillStyle = "rgba(60,0,0,0.6)";
    sc.beginPath(); sc.arc(120, 124, 35, 0, 7); sc.fill();
    st.update(); st.hasAlpha = true;
    this.splatMat = new StandardMaterial("splatMat", scene);
    this.splatMat.diffuseTexture = st;
    this.splatMat.useAlphaFromDiffuseTexture = true;
    this.splatMat.specularColor = Color3.Black();
    this.splatMat.zOffset = -2;
    this.splatMat.backFaceCulling = false;
  }

  blood(at: Vector3, dir: Vector3, amount = 1) {
    const ps = new ParticleSystem("blood", Math.floor(80 * amount), this.scene);
    ps.particleTexture = this.dropTex;
    ps.emitter = at.clone();
    ps.minEmitBox = new Vector3(-0.08, -0.08, -0.08);
    ps.maxEmitBox = new Vector3(0.08, 0.08, 0.08);
    const d = dir.normalizeToNew();
    ps.direction1 = new Vector3(d.x * 2 - 1, 1.2, d.z * 2 - 1);
    ps.direction2 = new Vector3(d.x * 4 + 1, 3.5, d.z * 4 + 1);
    ps.color1 = new Color4(0.75, 0.02, 0.02, 1);
    ps.color2 = new Color4(0.45, 0, 0, 1);
    ps.colorDead = new Color4(0.3, 0, 0, 0);
    ps.minSize = 0.04; ps.maxSize = 0.14;
    ps.minLifeTime = 0.35; ps.maxLifeTime = 0.9;
    ps.emitRate = 0; ps.manualEmitCount = Math.floor(70 * amount);
    ps.minEmitPower = 1.2; ps.maxEmitPower = 3.2;
    ps.gravity = new Vector3(0, -14, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.targetStopDuration = 1.2;
    ps.disposeOnStop = true;
    ps.start();
    // ground splat a moment later where it lands
    const p = at.add(d.scale(0.6 + Math.random() * 0.6));
    setTimeout(() => this.splat(p, 0.5 + amount * 0.5), 250);
  }

  splat(at: Vector3, size = 1) {
    let s = this.splats[this.splatIdx];
    if (!s) {
      const m = MeshBuilder.CreateGround("splat", { width: 1, height: 1 }, this.scene);
      m.material = this.splatMat; m.isPickable = false;
      s = { m, age: 0 }; this.splats[this.splatIdx] = s;
    }
    this.splatIdx = (this.splatIdx + 1) % 40;
    s.m.setEnabled(true);
    s.m.position.set(at.x, (at.y > 0.1 ? 0.2 : 0.02) + Math.random() * 0.005, at.z);
    s.m.rotation.y = Math.random() * Math.PI * 2;
    s.m.scaling.setAll(size * (0.8 + Math.random() * 0.8));
    s.m.visibility = 1;
    s.age = 0;
  }

  /** Billboard text that floats up and fades (₹ amounts, "SLAP!", etc). */
  floatText(text: string, at: Vector3, color = "#7ee081", life = 1.6, size = 1) {
    const tex = new DynamicTexture("ft", { width: 512, height: 128 }, this.scene, true);
    const c = tex.getContext() as unknown as CanvasRenderingContext2D;
    c.clearRect(0, 0, 512, 128);
    c.font = "bold 84px Anton, Impact, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = 12; c.strokeStyle = "#000"; c.strokeText(text, 256, 64);
    c.fillStyle = color; c.fillText(text, 256, 64);
    tex.update(); tex.hasAlpha = true;
    const mat = new StandardMaterial("ftm", this.scene);
    mat.diffuseTexture = tex; mat.useAlphaFromDiffuseTexture = true; mat.emissiveColor = Color3.White();
    mat.disableLighting = true; mat.backFaceCulling = false; mat.disableDepthWrite = true;
    const m = MeshBuilder.CreatePlane("ft", { width: 1.6 * size, height: 0.4 * size }, this.scene);
    m.material = mat; m.billboardMode = Mesh.BILLBOARDMODE_ALL; m.isPickable = false;
    m.position.copyFrom(at); m.renderingGroupId = 1;
    this.texts.push({ m, age: 0, life, vy: 0.9 });
  }

  /** Comic speech bubble above a character (Hindi + romanised line). */
  speech(parent: TransformNode, hi: string, en: string, life = 3) {
    const tex = new DynamicTexture("bubble", { width: 512, height: 192 }, this.scene, true);
    const c = tex.getContext() as unknown as CanvasRenderingContext2D;
    c.clearRect(0, 0, 512, 192);
    c.fillStyle = "rgba(255,255,255,0.95)"; c.strokeStyle = "#111"; c.lineWidth = 6;
    c.beginPath(); c.roundRect(8, 8, 496, 140, 28); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(220, 146); c.lineTo(256, 186); c.lineTo(280, 146); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#111"; c.textAlign = "center"; c.textBaseline = "middle";
    let px = 48; do { c.font = `${px}px "Rozha One", "Kohinoor Devanagari", sans-serif`; px -= 2; } while (c.measureText(hi).width > 470 && px > 16);
    c.fillText(hi, 256, 62);
    px = 28; do { c.font = `italic ${px}px Inter, sans-serif`; px -= 1; } while (c.measureText(en).width > 470 && px > 12);
    c.fillStyle = "#555"; c.fillText(en, 256, 118);
    tex.update(); tex.hasAlpha = true;
    const mat = new StandardMaterial("bubbleM", this.scene);
    mat.diffuseTexture = tex; mat.useAlphaFromDiffuseTexture = true; mat.emissiveColor = Color3.White(); mat.disableLighting = true; mat.backFaceCulling = false;
    const m = MeshBuilder.CreatePlane("bubble", { width: 2.1, height: 0.79 }, this.scene);
    m.material = mat; m.billboardMode = Mesh.BILLBOARDMODE_ALL; m.isPickable = false; m.renderingGroupId = 1;
    m.parent = parent; m.position.set(0, 2.45, 0);
    this.texts.push({ m, age: 0, life, vy: 0 });
  }

  /** bullet streak + muzzle flash (gunfire from anyone) */
  tracer(from: Vector3, to: Vector3) {
    const line = MeshBuilder.CreateLines("ft", { points: [from, to] }, this.scene);
    line.color = new Color3(1, 0.85, 0.5); line.isPickable = false;
    const flash = MeshBuilder.CreateSphere("ft", { diameter: 0.25, segments: 3 }, this.scene);
    if (!this.flashMat) { this.flashMat = new StandardMaterial("npcFlash", this.scene); this.flashMat.emissiveColor = new Color3(1, 0.75, 0.3); this.flashMat.disableLighting = true; }
    flash.material = this.flashMat; flash.position.copyFrom(from); flash.isPickable = false;
    setTimeout(() => { line.dispose(); flash.dispose(); }, 70);
  }
  private flashMat: StandardMaterial | null = null;
  /** keep one (underground) tracer + flash alive so their shaders are compiled during loading, not mid-fight */
  warm() {
    const a = new Vector3(0, -100, 0), b = new Vector3(0, -99, 0);
    const line = MeshBuilder.CreateLines("warmLine", { points: [a, b] }, this.scene); line.isPickable = false;
    this.tracer(a, b);
    const s = MeshBuilder.CreateSphere("warmFlash", { diameter: 0.1, segments: 3 }, this.scene);
    s.material = this.flashMat; s.position.copyFrom(a); s.isPickable = false;
  }

  update(dt: number) {
    for (const s of this.splats) {
      if (!s) continue;
      s.age += dt;
      if (s.age > 40) s.m.visibility = Math.max(0, 1 - (s.age - 40) / 5);
      if (s.age > 45) s.m.setEnabled(false);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      t.m.position.y += t.vy * dt;
      t.m.visibility = t.age > t.life * 0.6 ? 1 - (t.age - t.life * 0.6) / (t.life * 0.4) : 1;
      if (t.age >= t.life) {
        t.m.material?.dispose(true, true);
        t.m.dispose();
        this.texts.splice(i, 1);
      }
    }
  }
}
