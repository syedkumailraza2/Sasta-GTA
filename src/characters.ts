import {
  AbstractMesh, AnimationGroup, AssetContainer, Color3, LoadAssetContainerAsync, Material, Matrix, PBRMaterial, Quaternion, Scene,
  TransformNode, Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

export type CharKind = "player" | "business" | "beach" | "casual" | "punk" | "woman1" | "woman2" | "cow";

const FILES: Record<CharKind, string> = {
  player: "assets/characters/player_hoodie.glb",
  business: "assets/characters/npc_business.glb",
  beach: "assets/characters/npc_beach.glb",
  casual: "assets/characters/npc_casual.glb",
  punk: "assets/characters/npc_punk.glb",
  woman1: "assets/characters/npc_woman1.glb",
  woman2: "assets/characters/npc_woman2.glb",
  cow: "assets/animals/cow.glb",
};

/** Logical animation names -> clip name suffix in the Quaternius files. */
const HUMAN_CLIPS = {
  idle: "Idle", walk: "Walk", run: "Run", punchL: "Punch_Left", punchR: "Punch_Right", kick: "Kick_Right",
  slash: "Sword_Slash", hit: "HitRecieve", hit2: "HitRecieve_2", death: "Death", wave: "Wave", interact: "Interact",
  roll: "Roll", idleSword: "Idle_Sword", shoot: "Gun_Shoot",
} as const;
const COW_CLIPS = {
  idle: "Idle", walk: "Walk", run: "Gallop", eat: "Eating", headbutt: "Attack_Headbutt", hit: "Idle_HitReact_Left",
  death: "Death",
} as const;
/** keyword fallbacks for downloaded rigs with arbitrary clip names */
const FUZZY: Record<string, RegExp> = {
  idle: /idle|stand|breath/i, walk: /walk/i, run: /run|gallop|trot/i, eat: /eat|graz/i,
  headbutt: /attack|headbutt|butt|charge/i, hit: /hit|damage|hurt/i, death: /death|die|dead/i,
};
export type AnimName = keyof typeof HUMAN_CLIPS | keyof typeof COW_CLIPS;

export const SKIN_TONES = ["#8d5524", "#a0662f", "#7a4a26", "#b07a4f", "#6b3f22", "#c68e5c", "#5e3a1e"];
const CLOTH = ["#b71c1c", "#1565c0", "#2e7d32", "#f9a825", "#6a1b9a", "#ef6c00", "#37474f", "#ad1457", "#00838f", "#eeeeee", "#212121", "#795548"];

export class CharacterLibrary {
  private containers = new Map<CharKind, AssetContainer>();
  /** per-kind bind-pose height & foot offset, measured once at load */
  private norms = new Map<CharKind, { h: number; minY: number }>();
  constructor(private scene: Scene) {}

  /** realistic cows (Sketchfab) used instead of the low-poly one when downloaded; yaw fixes the facing */
  static REAL_COWS: { file: string; yaw: number }[] = [{ file: "assets/animals/cow_farm.glb", yaw: 0 }, { file: "assets/animals/cow_zebu.glb", yaw: 0 }];
  private realCows: { c: AssetContainer; yaw: number; norm: { h: number; minY: number } }[] = [];

  async load(kinds: CharKind[], onProgress?: (f: number) => void) {
    let done = 0;
    if (kinds.includes("cow")) {
      for (const rc of CharacterLibrary.REAL_COWS) {
        try {
          const r = await fetch(rc.file, { method: "HEAD" });
          if (!r.ok || (r.headers.get("content-type") ?? "").includes("html")) continue;
          const c = await LoadAssetContainerAsync(rc.file, this.scene);
          const pr = c.instantiateModelsToScene((n) => `probe_${n}`, false, { doNotInstantiate: true });
          const root = pr.rootNodes[0]; root.computeWorldMatrix(true);
          const { min, max } = root.getHierarchyBoundingVectors(true);
          pr.animationGroups.forEach((g) => g.dispose()); pr.rootNodes.forEach((n) => n.dispose());
          this.realCows.push({ c, yaw: rc.yaw, norm: { h: Math.max(0.01, max.y - min.y), minY: min.y } });
        } catch (e) { console.warn("[cow] realistic model failed", rc.file, e); }
      }
    }
    await Promise.all(kinds.map(async (k) => {
      const c = await LoadAssetContainerAsync(FILES[k], this.scene);
      const probe = c.instantiateModelsToScene((n) => `probe_${n}`, false, { doNotInstantiate: true });
      const pr = probe.rootNodes[0];
      pr.computeWorldMatrix(true);
      const { min, max } = pr.getHierarchyBoundingVectors(true);
      this.norms.set(k, { h: Math.max(0.001, max.y - min.y), minY: min.y });
      probe.animationGroups.forEach((g) => g.dispose());
      probe.rootNodes.forEach((n) => n.dispose());
      this.containers.set(k, c);
      onProgress?.(++done / kinds.length);
    }));
  }

  spawn(kind: CharKind, opts: { height?: number; tint?: Record<string, string>; name?: string } = {}) {
    const real = kind === "cow" && this.realCows.length ? this.realCows[Math.floor(Math.random() * this.realCows.length)] : null;
    const c = real ? real.c : this.containers.get(kind);
    if (!c) throw new Error(`character ${kind} not loaded`);
    if (real) { this.norms.set(kind, real.norm); opts = { ...opts, tint: undefined }; }
    const inst = c.instantiateModelsToScene((n) => `${opts.name ?? kind}_${n}`, true, { doNotInstantiate: true });
    const root = inst.rootNodes[0] as TransformNode;
    const holder = new TransformNode(`${opts.name ?? kind}_holder`, this.scene);
    root.parent = holder;
    // normalise size: these files are authored in cm under a 100x node, so measure instead of trusting.
    // Measured ONCE per kind: measuring a fresh clone mid-game can see a partial rig and return a tiny
    // height, which produced 4x giants. Every instance of a kind is identical, so reuse the first result.
    const target = opts.height ?? (kind === "cow" ? 1.5 : 1.75);
    let norm = this.norms.get(kind);
    if (!norm) {
      root.computeWorldMatrix(true);
      const { min, max } = root.getHierarchyBoundingVectors(true);
      norm = { h: Math.max(0.001, max.y - min.y), minY: min.y };
      this.norms.set(kind, norm);
    }
    const s = target / norm.h;
    root.scaling.scaleInPlace(s);
    root.position.y = -norm.minY * s;
    if (real && real.yaw) { const yawNode = new TransformNode("cowYaw", this.scene); yawNode.parent = holder; yawNode.rotation.y = real.yaw; root.parent = yawNode; }
    const meshes = root.getChildMeshes(false);
    // skinned meshes keep their bind-pose bounds, so frustum culling wrongly drops heads/limbs up close
    for (const m of meshes) { m.isPickable = false; m.receiveShadows = false; m.alwaysSelectAsActiveMesh = true; m.metadata = { noShadow: kind !== "player" }; }
    // tint materials (materials were cloned per instance)
    const mats = new Set<Material>();
    meshes.forEach((m) => m.material && collectMats(m.material, mats));
    for (const m of mats) {
      // cloned materials are named "<prefix>_<original>"
      const key = Object.keys(opts.tint ?? {}).find((k) => m.name === k || m.name.endsWith(`_${k}`));
      if (key && m instanceof PBRMaterial) {
        m.albedoColor = Color3.FromHexString(opts.tint![key]).toLinearSpace();
      }
      if (m instanceof PBRMaterial) { m.metallic = 0; m.roughness = 0.85; }
    }
    return new Character(kind, holder, meshes, inst.animationGroups, kind === "cow" ? COW_CLIPS : HUMAN_CLIPS);
  }

  /** Random desi-ish outfit for a pedestrian. */
  static randomTint(kind: CharKind, rng = Math.random): Record<string, string> {
    const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
    const t: Record<string, string> = { Skin: pick(SKIN_TONES), Hair: "#120c08", Hair_Blond: "#120c08", Hair_Brown: "#1a110b", Eyebrows: "#120c08" };
    const clothKeys: Record<string, string[]> = {
      business: ["Red_Dark", "White", "LightBrown"],
      beach: ["Red_Dark", "LightBrown", "White", "LightBlue"],
      casual: ["White", "Red_Dark", "LightBrown", "LightBlue"],
      punk: ["Black", "LightBlue", "White", "Red_Dark", "Red"],
      woman1: ["White", "Grey", "Brown", "Orange"],
      woman2: ["Red", "Brown", "LimeGreen", "Gold"],
      player: [], cow: [],
    };
    for (const k of clothKeys[kind]) t[k] = pick(CLOTH);
    return t;
  }

  /** olive fatigues for the army at 5 stars */
  static armyTint(): Record<string, string> {
    const olive = "#4b5320";
    return { Skin: SKIN_TONES[Math.floor(Math.random() * 4)], Suit: olive, White: "#5a6330", Tie: "#2f3318", Black: "#1f2410", Red_Dark: olive, LightBrown: olive, Hair: "#120c08", Eyebrows: "#120c08" };
  }

  static policeTint(): Record<string, string> {
    // khaki uniform, dark brown belt/shoes, black hair
    return { Skin: SKIN_TONES[Math.floor(Math.random() * 4)], Suit: "#b59a62", White: "#c4aa70", Tie: "#5d4037", Black: "#3e2a1a", Red_Dark: "#b59a62", LightBrown: "#b59a62", Hair: "#120c08", Eyebrows: "#120c08" };
  }
}

/** recompute world matrices from the scene root down to `n` (parents first), so positions read this frame are fresh */
export function refreshChain(n: { parent: unknown; computeWorldMatrix(force?: boolean): unknown }) {
  const chain: { computeWorldMatrix(force?: boolean): unknown }[] = [];
  for (let c: typeof n | null = n; c; c = c.parent as typeof n | null) chain.push(c);
  for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true);
}

function collectMats(m: Material, out: Set<Material>) {
  const sub = (m as { subMaterials?: Material[] }).subMaterials;
  if (sub) sub.forEach((s) => s && out.add(s)); else out.add(m);
}

/** One spawned, independently animated character. */
export class Character {
  private groups = new Map<string, AnimationGroup>();
  private loco = { idle: 1, walk: 0, run: 0 };
  private action: { g: AnimationGroup; until: number; hold: boolean } | null = null;
  private time = 0;
  dead = false;
  private standing = new Map<TransformNode, { p: Vector3; q: Quaternion; s: Vector3 }>();

  constructor(
    readonly kind: CharKind,
    readonly root: TransformNode,
    readonly meshes: AbstractMesh[],
    groups: AnimationGroup[],
    clips: Record<string, string>,
  ) {
    for (const g of groups) g.stop();
    // standing pose of everything any clip animates: restored on reset(), because clips like Death move nodes
    // (hips/root) that Idle never touches, which left a respawned hero half lying on the ground
    for (const g of groups) for (const ta of g.targetedAnimations) {
      const n = ta.target as TransformNode;
      if (!n || this.standing.has(n) || !(n instanceof TransformNode)) continue;
      this.standing.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation)).clone(), s: n.scaling.clone() });
    }
    for (const [logical, suffix] of Object.entries(clips)) {
      const g = groups.find((x) => x.name.endsWith(`|${suffix}`)) ?? groups.find((x) => x.name.endsWith(suffix))
        ?? (FUZZY[logical] ? groups.find((x) => FUZZY[logical].test(x.name)) : undefined);
      if (g) this.groups.set(logical, g);
    }
    if (!this.groups.has("idle") && groups[0]) this.groups.set("idle", groups[0]);
    // downloaded animals with unnamed/missing clips: borrow by position so they still move
    const others = groups.filter((g) => ![...this.groups.values()].includes(g) || g === this.groups.get("idle"));
    if (!this.groups.has("walk") && groups.length > 1) this.groups.set("walk", others[1] ?? groups[1]);
    if (!this.groups.has("run") && this.groups.has("walk")) this.groups.set("run", groups[2] && !/death|attack/i.test(groups[2].name) ? groups[2] : this.groups.get("walk")!);
    for (const k of ["idle", "walk", "run"] as const) {
      const g = this.groups.get(k);
      if (g) { g.play(true); g.weight = k === "idle" ? 1 : 0; }
    }
  }

  has(name: AnimName) { return this.groups.has(name); }

  /** Locomotion blend from ground speed (m/s). */
  locomotion(speed: number, walkSpeed: number, runSpeed: number, dt: number, airborne = false) {
    if (this.riding) return;
    this.time += dt;
    const tw = { idle: 0, walk: 0, run: 0 };
    if (speed < 0.2) tw.idle = 1;
    else if (speed < walkSpeed + 0.3) { const t = Math.min(1, speed / walkSpeed); tw.idle = 1 - t; tw.walk = t; }
    else { const t = Math.min(1, (speed - walkSpeed) / (runSpeed - walkSpeed)); tw.walk = 1 - t; tw.run = t; }
    const actionW = this.action ? 1 : 0;
    const k = Math.min(1, 10 * dt);
    for (const key of ["idle", "walk", "run"] as const) {
      this.loco[key] += (tw[key] - this.loco[key]) * k;
      const g = this.groups.get(key);
      if (!g) continue;
      const w = this.loco[key] * (1 - actionW);
      g.weight = w;
      // zero-weight clips still cost a full skeleton evaluation each frame: pause them
      if (w < 0.01) { if (g.isPlaying) g.pause(); }
      else if (!g.isPlaying) g.play(true);
    }
    const walk = this.groups.get("walk"), run = this.groups.get("run");
    const r = airborne ? 0.3 : 1;
    if (walk) walk.speedRatio = r * Math.max(0.6, Math.min(1.5, speed / walkSpeed));
    if (run) run.speedRatio = r * Math.max(0.7, Math.min(1.3, speed / runSpeed));
    if (this.action && !this.action.hold && this.time >= this.action.until) this.endAction();
  }

  /** Play a one-shot clip over locomotion. Returns its duration (s). */
  play(name: AnimName, opts: { speed?: number; hold?: boolean; from?: number } = {}) {
    const g = this.groups.get(name);
    if (!g) return 0;
    if (this.action && this.action.g !== g) { this.action.g.stop(); this.action.g.weight = 0; }
    const speed = opts.speed ?? 1;
    g.stop();
    g.speedRatio = speed;
    g.weight = 1;
    g.start(false, speed, opts.from ?? g.from, g.to);
    for (const k of ["idle", "walk", "run"] as const) { const lg = this.groups.get(k); if (lg) lg.weight = 0; }
    const dur = (g.to - (opts.from ?? g.from)) / 60 / speed; // babylon glTF clips are in 60fps frames
    this.action = { g, until: this.time + dur, hold: !!opts.hold };
    return dur;
  }

  get busy() { return !!this.action && (this.action.hold || this.time < this.action.until); }

  endAction() {
    if (!this.action) return;
    this.action.g.stop();
    this.action.g.weight = 0;
    this.action = null;
  }

  /** Re-enable after death (pooling). */
  reset() {
    this.endAction();
    this.dead = false;
    for (const [n, t] of this.standing) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); n.scaling.copyFrom(t.s); }
    for (const k of ["idle", "walk", "run"] as const) { const g = this.groups.get(k); if (g) { g.play(true); g.weight = k === "idle" ? 1 : 0; } }
  }

  private rest = new Map<TransformNode, { q: Quaternion; p: Vector3 }>();
  private save(b: TransformNode) {
    if (!this.rest.has(b)) this.rest.set(b, { q: (b.rotationQuaternion ?? Quaternion.FromEulerVector(b.rotation)).clone(), p: b.position.clone() });
  }

  /** which way the face points in world space (eyes relative to the head bone) */
  faceDir(): Vector3 | null {
    const eye = this.meshes.find((m) => m.material && /(^|_)Eyes?$/.test(m.material.name));
    const head = this.bone("Head").find((b) => !b.name.endsWith("_end"));
    if (!eye || !head) return null;
    refreshChain(head); refreshChain(eye);
    const d = eye.getBoundingInfo().boundingBox.centerWorld.subtract(head.getAbsolutePosition());
    d.y = 0;
    return d.lengthSquared() > 1e-8 ? d.normalize() : null;
  }

  /** turn the whole character (root yaw) so the face points along `fwd` (world) */
  faceTowards(fwd: Vector3) {
    const f = this.faceDir();
    if (!f) return;
    let d = Math.atan2(fwd.x, fwd.z) - Math.atan2(f.x, f.z);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d;
    this.root.computeWorldMatrix(true);
  }

  /**
   * Rotate `boneName` so the direction to `childName` points along `dir` (world). Works whatever the rig's local
   * bone axes are, because the rotation is solved in world space and converted into the parent's frame.
   * weight < 1 blends part of the way.
   */
  aimBone(boneName: string, childName: string, dir: Vector3, weight = 1, remember = true) {
    const b = this.bone(boneName).find((n) => n.name.endsWith(boneName)), c = this.bone(childName)[0];
    if (!b || !c || !b.parent) return;
    if (remember) this.save(b);
    const parent = b.parent as TransformNode;
    refreshChain(parent); b.computeWorldMatrix(true); c.computeWorldMatrix(true);
    const cur = c.getAbsolutePosition().subtract(b.getAbsolutePosition());
    if (cur.lengthSquared() < 1e-10) return;
    cur.normalize();
    const want = dir.normalizeToNew();
    const dot = Math.max(-1, Math.min(1, Vector3.Dot(cur, want)));
    const ang = Math.acos(dot) * weight;
    if (ang < 1e-4) return;
    let axis = Vector3.Cross(cur, want);
    if (axis.lengthSquared() < 1e-10) axis = Vector3.Cross(cur, Math.abs(cur.y) < 0.9 ? Vector3.Up() : Vector3.Right());
    axis.normalize();
    // parent world rotation (scale stripped)
    const pr = new Quaternion(); parent.getWorldMatrix().decompose(undefined, pr);
    const prM = new Matrix(); Matrix.FromQuaternionToRef(pr, prM);
    const prInv = prM.clone().transpose();
    const lq = b.rotationQuaternion ?? Quaternion.FromEulerVector(b.rotation);
    const L = new Matrix(); Matrix.FromQuaternionToRef(lq, L);
    const tryAng = (a: number) => {
      const R = Matrix.RotationAxis(axis, a);
      const nl = L.multiply(prM).multiply(R).multiply(prInv);
      return Quaternion.FromRotationMatrix(nl);
    };
    // the handedness of RotationAxis differs between conventions: keep whichever sign actually got closer
    let best: Quaternion | null = null, bestDot = -2;
    for (const sgn of [1, -1]) {
      b.rotationQuaternion = tryAng(ang * sgn);
      b.computeWorldMatrix(true); c.computeWorldMatrix(true);
      const nd = Vector3.Dot(c.getAbsolutePosition().subtract(b.getAbsolutePosition()).normalize(), want);
      if (nd > bestDot) { bestDot = nd; best = b.rotationQuaternion.clone(); }
    }
    b.rotationQuaternion = best!;
    b.computeWorldMatrix(true);
  }

  /** move a free-floating IK foot bone onto the end of the shin (Quaternius feet aren't children of the legs) */
  private footTo(foot: string, shinEnd: string) {
    const f = this.bone(foot).find((n) => n.name.endsWith(foot)), e = this.bone(shinEnd)[0];
    if (!f || !e || !f.parent) return;
    this.save(f);
    refreshChain(f.parent as TransformNode); refreshChain(e);
    const inv = (f.parent as TransformNode).getWorldMatrix().clone().invert();
    f.position.copyFrom(Vector3.TransformCoordinates(e.getAbsolutePosition(), inv));
  }

  riding = false;
  /** freeze animations and sit astride a two-wheeler facing `fwd` (world). `scoot` = feet on a floorboard */
  pose(fwd = new Vector3(0, 0, 1), scoot = false) {
    this.endAction();
    for (const g of this.groups.values()) { g.stop(); g.weight = 0; }
    for (const [b, r] of this.rest) { b.rotationQuaternion = r.q.clone(); b.position.copyFrom(r.p); }
    this.faceTowards(fwd);
    const F = new Vector3(fwd.x, 0, fwd.z).normalize(), U = Vector3.Up(), R = new Vector3(F.z, 0, -F.x);
    for (const s of [1, -1]) {
      const side = s > 0 ? "L" : "R";
      // which side is "L" in world? use the actual hip position so knees go outward, not crossed
      const hip = this.bone(`UpperLeg.${side}`)[0];
      const out = hip ? Math.sign(Vector3.Dot(hip.getAbsolutePosition().subtract(this.root.getAbsolutePosition()), R)) || s : s;
      this.aimBone(`UpperLeg.${side}`, `LowerLeg.${side}`, F.scale(1).add(U.scale(scoot ? -0.05 : -0.2)).add(R.scale(out * (scoot ? 0.08 : 0.2))));
      this.aimBone(`LowerLeg.${side}`, `LowerLeg.${side}_end`, U.scale(-1).add(F.scale(scoot ? 0.35 : -0.1)).add(R.scale(out * 0.05)));
      this.footTo(`Foot.${side}`, `LowerLeg.${side}_end`);
      // hands forward and down to the handlebar
      const sh = this.bone(`UpperArm.${side}`)[0];
      const aout = sh ? Math.sign(Vector3.Dot(sh.getAbsolutePosition().subtract(this.root.getAbsolutePosition()), R)) || s : s;
      this.aimBone(`UpperArm.${side}`, `LowerArm.${side}`, F.scale(0.75).add(U.scale(-0.55)).add(R.scale(aout * 0.25)));
      this.aimBone(`LowerArm.${side}`, `Wrist.${side}`, F.scale(1).add(U.scale(-0.15)).add(R.scale(-aout * 0.15)));
    }
    this.riding = true;
  }
  unpose() {
    for (const [b, r] of this.rest) { b.rotationQuaternion = r.q.clone(); b.position.copyFrom(r.p); }
    this.rest.clear();
    this.root.rotation.y = 0;
    this.riding = false;
    this.reset();
  }

  bone(name: string) {
    return this.root.getDescendants(false, (n) => n.name.endsWith(name)) as TransformNode[];
  }

  private hidden = false;
  setVisible(v: boolean) {
    if (this.hidden === !v) return;
    this.hidden = !v;
    this.meshes.forEach((m) => m.setEnabled(v && !m.metadata?.hiddenByLook));
    // hidden characters shouldn't burn CPU on animation either
    for (const g of this.groups.values()) { if (!v) { if (g.isPlaying) g.pause(); } }
    if (v) for (const k of ["idle", "walk", "run"] as const) { const g = this.groups.get(k); if (g && g.weight > 0.01) g.play(true); }
  }

  dispose() {
    this.groups.forEach((g) => g.dispose());
    this.root.dispose(false, true);
  }

  get position(): Vector3 { return this.root.position; }
}
