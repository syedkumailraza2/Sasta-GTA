import { Grid } from "./grid";
import {
  AssetContainer, InstancedMesh, Color3, DynamicTexture, LoadAssetContainerAsync, Material, Mesh, MeshBuilder, PBRMaterial, Ray, Scene,
  StandardMaterial, TransformNode, Vector3, Vector4,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

export type VehicleKind = "auto" | "car_small" | "car_sedan" | "suv" | "taxi" | "police" | "truck" | "motorcycle" | "scooter" | "supercar" | "boat" | "jetski" | "heli";
export type VClass = "car" | "bike" | "auto" | "truck" | "boat" | "heli";

type Spec = {
  file?: string; name: string; hi: string; cls: VClass;
  length: number; width: number; height: number;
  maxSpeed: number; accel: number; turn: number;
  /** extra yaw so the model's nose points to +Z */
  yaw?: number;
  paint?: string[]; paintMat?: string;
};

export const SPECS: Record<VehicleKind, Spec> = {
  auto: { name: "Auto Rickshaw", hi: "ऑटो", cls: "auto", length: 2.7, width: 1.4, height: 1.9, maxSpeed: 15, accel: 5, turn: 1.9 },
  car_small: { file: "assets/vehicles/car_small.glb", name: "Maruti", hi: "मारुति", cls: "car", length: 3.5, width: 1.6, height: 1.45, maxSpeed: 27, accel: 7, turn: 1.4, paint: ["#e8e8e8", "#b71c1c", "#9e9e9e", "#f5f5dc", "#1e3a8a"], paintMat: "LightBlue" },
  car_sedan: { file: "assets/vehicles/car_sedan.glb", name: "Sedan", hi: "गाड़ी", cls: "car", length: 4.3, width: 1.8, height: 1.45, maxSpeed: 31, accel: 8, turn: 1.25, paint: ["#ffffff", "#212121", "#7f0000", "#9e9e9e", "#0d47a1"], paintMat: "Blue" },
  suv: { file: "assets/vehicles/suv.glb", name: "Neta-ji ki SUV", hi: "स्कॉर्पियो", cls: "car", length: 4.5, width: 2.0, height: 1.85, maxSpeed: 29, accel: 8.5, turn: 1.2, paint: ["#111111", "#ffffff", "#e8e8e8"], paintMat: "White" },
  taxi: { file: "assets/vehicles/taxi.glb", name: "Kaali-Peeli Taxi", hi: "टैक्सी", cls: "car", length: 4.2, width: 1.8, height: 1.5, maxSpeed: 26, accel: 7, turn: 1.3 },
  police: { file: "assets/vehicles/police.glb", name: "Police Gypsy", hi: "पुलिस", cls: "car", length: 4.1, width: 1.8, height: 1.5, maxSpeed: 30, accel: 9, turn: 1.35 },
  truck: { file: "assets/vehicles/truck.glb", name: "Tata Truck", hi: "ट्रक", cls: "truck", length: 7, width: 2.4, height: 3.2, maxSpeed: 19, accel: 3.5, turn: 0.85 },
  motorcycle: { file: "assets/vehicles/motorcycle.glb", name: "Bullet", hi: "बुलेट", cls: "bike", length: 2.1, width: 0.8, height: 1.2, maxSpeed: 30, accel: 9, turn: 2.2 },
  scooter: { file: "assets/vehicles/scooter.glb", name: "Scooty", hi: "स्कूटी", cls: "bike", length: 1.8, width: 0.7, height: 1.15, maxSpeed: 20, accel: 7, turn: 2.4 },
  supercar: { file: "assets/vehicles/supercar.glb", name: "Supercar", hi: "सुपरकार", cls: "car", length: 4.6, width: 2.0, height: 1.2, maxSpeed: 58, accel: 16, turn: 1.35 },
  boat: { file: "assets/vehicles/boat.glb", name: "Speedboat", hi: "नाव", cls: "boat", length: 6.5, width: 2.3, height: 1.6, maxSpeed: 22, accel: 5, turn: 0.9 },
  jetski: { file: "assets/vehicles/jetski.glb", name: "Jet Ski", hi: "जेट स्की", cls: "boat", length: 3.2, width: 1.2, height: 1.2, maxSpeed: 26, accel: 9, turn: 1.8 },
  heli: { file: "assets/vehicles/helicopter.glb", name: "Helicopter", hi: "हेलीकॉप्टर", cls: "heli", length: 11, width: 2.6, height: 3.4, maxSpeed: 40, accel: 10, turn: 1.2 },
};
/** per-name display overrides for realistic variants */
export const VARIANT_NAMES: Record<string, string> = {
  super_ferrari: "Ferrari 288 GTO", super_koenigsegg: "Koenigsegg One:1", super_mclaren: "McLaren P1 GTR", super_porsche: "Porsche 911 Turbo",
  super_lambo: "Lamborghini Aventador", boat_riva: "Riva Speedboat", boat_fisher: "Machhli wali Nav", jetski: "Kawasaki Jet Ski", helicopter: "EC135 Helicopter",
};

/**
 * Realistic Sketchfab models (downloaded by scripts/download-vehicles.mjs). When present they replace the
 * low-poly fallbacks. `yaw` turns the model so its nose points +Z.
 */
export const REAL: Record<VehicleKind, { file: string; yaw?: number }[]> = {
  auto: [{ file: "assets/vehicles/real/auto_delhi.glb", yaw: Math.PI }, { file: "assets/vehicles/real/auto_mumbai.glb" }],
  car_small: [{ file: "assets/vehicles/real/wagonr.glb", yaw: Math.PI }],
  car_sedan: [{ file: "assets/vehicles/real/honda_city.glb" }],
  suv: [{ file: "assets/vehicles/real/bolero.glb" }],
  taxi: [{ file: "assets/vehicles/real/ambassador.glb", yaw: Math.PI }], // authored tail-first
  police: [{ file: "assets/vehicles/real/police_jeep.glb" }],
  truck: [{ file: "assets/vehicles/real/tata_truck.glb" }],
  motorcycle: [{ file: "assets/vehicles/real/pulsar.glb", yaw: Math.PI }],
  scooter: [{ file: "assets/vehicles/real/scooter.glb" }],
  supercar: ["ferrari", "koenigsegg", "mclaren", "porsche", "lambo"].map((n) => ({ file: `assets/vehicles/real/super_${n}.glb` })),
  // the Riva file renders edge-on/invisible after normalisation; the fishing boat is used for now
  boat: [{ file: "assets/vehicles/real/boat_fisher.glb" }],
  jetski: [{ file: "assets/vehicles/real/jetski.glb" }],
  heli: [{ file: "assets/vehicles/real/helicopter.glb", yaw: Math.PI }],
};

/** Yaw that rotates the model's dominant horizontal axis (PCA of vertices in XZ) onto +Z. */
function principalYaw(root: TransformNode) {
  let n = 0, mx = 0, mz = 0, cxx = 0, czz = 0, cxz = 0;
  const pts: number[] = [];
  root.computeWorldMatrix(true);
  for (const m of root.getChildMeshes()) {
    const pos = m.getVerticesData("position");
    if (!pos) continue;
    const wm = m.computeWorldMatrix(true);
    const step = Math.max(3, Math.floor(pos.length / 3 / 4000) * 3); // subsample big meshes
    for (let i = 0; i < pos.length; i += step) {
      const v = Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), wm);
      pts.push(v.x, v.z); mx += v.x; mz += v.z; n++;
    }
  }
  if (!n) return 0;
  mx /= n; mz /= n;
  for (let i = 0; i < pts.length; i += 2) { const dx = pts[i] - mx, dz = pts[i + 1] - mz; cxx += dx * dx; czz += dz * dz; cxz += dx * dz; }
  const theta = 0.5 * Math.atan2(2 * cxz, cxx - czz); // major axis angle from +X
  const ax = Math.cos(theta), az = Math.sin(theta);
  // an axis has no direction: keep the smallest correction so front/back stays as authored
  let yaw = Math.atan2(-ax, az);
  if (yaw > Math.PI / 2) yaw -= Math.PI;
  if (yaw <= -Math.PI / 2) yaw += Math.PI;
  return yaw;
}

async function exists(url: string) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    // the dev server answers unknown paths with index.html, so check the type too
    return r.ok && !(r.headers.get("content-type") ?? "").includes("html");
  } catch { return false; }
}

type Variant = { c: AssetContainer; yaw: number; real: boolean; file: string };

export class VehicleLibrary {
  private variants = new Map<VehicleKind, Variant[]>();
  constructor(private scene: Scene) {}

  get realCount() { return [...this.variants.values()].filter((v) => v.some((x) => x.real)).length; }

  async load(onProgress?: (f: number) => void) {
    const kinds = Object.keys(SPECS) as VehicleKind[];
    let done = 0;
    await Promise.all(kinds.map(async (k) => {
      const list: Variant[] = [];
      for (const r of REAL[k]) {
        if (!(await exists(r.file))) continue;
        try { list.push({ c: await LoadAssetContainerAsync(r.file, this.scene), yaw: r.yaw ?? 0, real: true, file: r.file }); }
        catch (e) { console.warn("[vehicles] realistic model failed", r.file, e); }
      }
      if (!list.length && SPECS[k].file) {
        try { list.push({ c: await LoadAssetContainerAsync(SPECS[k].file!, this.scene), yaw: SPECS[k].yaw ?? 0, real: false, file: SPECS[k].file! }); }
        catch (e) { console.warn("[vehicles] failed", k, e); }
      }
      this.variants.set(k, list);
      onProgress?.(++done / kinds.length);
    }));
    console.info(`[vehicles] realistic models loaded for ${this.realCount}/${kinds.length} vehicle types`);
  }

  private templates = new Map<Variant, Mesh[]>();

  /** Normalise a downloaded model once, bake it, and merge its parts (grouped by vertex layout). */
  private buildTemplate(kind: VehicleKind, v: Variant): Mesh[] {
    const spec = SPECS[kind];
    const inst = v.c.instantiateModelsToScene((n) => `${kind}_tpl_${n}`, false, { doNotInstantiate: true });
    const root = inst.rootNodes[0] as TransformNode;
    const holder = new TransformNode(`${kind}_tplHolder`, this.scene);
    const yawFix = new TransformNode(`${kind}_tplYaw`, this.scene);
    yawFix.parent = holder;
    root.parent = yawFix;
    for (const m of root.getChildMeshes()) if (/shadow|ground|floor|backdrop/i.test(m.name)) m.dispose();
    if (kind === "heli") for (const m of root.getChildMeshes()) if (/rotor|blade|propel/i.test(m.name)) m.dispose(); // we spin our own
    for (const m of root.getChildMeshes()) {
      const mats = m.material ? ((m.material as { subMaterials?: Material[] }).subMaterials ?? [m.material]) : [];
      // autos/bikes/boats are full of single-sided panels: render both faces so they don't look like a cut-out poster from behind
      if (kind === "auto" || spec.cls === "bike" || spec.cls === "boat") for (const mt of mats) if (mt) { mt.backFaceCulling = false; if (mt instanceof PBRMaterial) mt.twoSidedLighting = true; }
    }
    root.computeWorldMatrix(true);
    let { min, max } = root.getHierarchyBoundingVectors(true);
    const pca = principalYaw(root);
    if (Math.abs(pca) > 0.17) yawFix.rotation.y = pca;
    else if (max.x - min.x > max.z - min.z) yawFix.rotation.y = Math.PI / 2;
    yawFix.rotation.y += v.yaw;
    yawFix.computeWorldMatrix(true); root.computeWorldMatrix(true);
    ({ min, max } = root.getHierarchyBoundingVectors(true));
    const s = spec.length / Math.max(0.001, Math.max(max.x - min.x, max.z - min.z));
    holder.scaling.setAll(s);
    holder.computeWorldMatrix(true);
    ({ min, max } = root.getHierarchyBoundingVectors(true));
    const c = min.add(max).scale(0.5);
    holder.position.set(-c.x, -min.y, -c.z);
    holder.computeWorldMatrix(true);
    // group by vertex attribute layout (MergeMeshes requires identical layouts), then merge each group
    const groups = new Map<string, Mesh[]>();
    for (const m of root.getChildMeshes()) {
      if (!(m instanceof Mesh) || !m.getTotalVertices()) continue;
      m.computeWorldMatrix(true);
      const key = m.getVerticesDataKinds().sort().join(",");
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    const parts: Mesh[] = [];
    for (const list of groups.values()) {
      const merged = list.length === 1 ? list[0] : Mesh.MergeMeshes(list, true, true, undefined, false, true);
      if (!merged) continue;
      merged.setParent(null);
      merged.bakeCurrentTransformIntoVertices();
      merged.isPickable = false;
      merged.isVisible = false; // template only: instances render
      merged.name = `${kind}_template`;
      merged.metadata = { noShadow: true };
      for (const mt of merged.material instanceof Material ? [merged.material] : []) if (mt instanceof PBRMaterial) mt.roughness = Math.max(0.35, mt.roughness ?? 0.5);
      parts.push(merged);
    }
    holder.dispose();
    return parts;
  }

  /** Visual model normalised to spec length, nose to +Z, wheels on y=0. */
  buildModel(kind: VehicleKind, paint?: string): { node: TransformNode; lights: Material[]; label?: string } {
    const spec = SPECS[kind];
    const vars = this.variants.get(kind) ?? [];
    const v = vars[Math.floor(Math.random() * vars.length)];
    if (!v) return { node: buildAuto(this.scene), lights: [] };
    if (v.real) {
      // realistic models: one merged, pre-normalised template per model, GPU-instanced per vehicle
      let parts = this.templates.get(v);
      if (!parts) { parts = this.buildTemplate(kind, v); this.templates.set(v, parts); }
      const outer = new TransformNode(`${kind}_outer`, this.scene);
      for (const t of parts) {
        const inst = t.createInstance(`${kind}_part`);
        inst.parent = outer; inst.isPickable = false;
      }
      const key = v.file.split("/").pop()!.replace(".glb", "");
      return { node: outer, lights: [], label: VARIANT_NAMES[key] };
    }
    const c = v.c;
    const inst = c.instantiateModelsToScene((n) => `${kind}_${n}`, true, { doNotInstantiate: true });
    const root = inst.rootNodes[0] as TransformNode;
    const holder = new TransformNode(`${kind}_model`, this.scene);
    const yawFix = new TransformNode(`${kind}_yaw`, this.scene);
    yawFix.parent = holder;
    root.parent = yawFix;
    if (v.real) {
      // Sketchfab exports often carry baked "shadow"/ground planes that wreck the size measurement
      for (const m of root.getChildMeshes()) if (/shadow|ground|floor|backdrop/i.test(m.name)) m.dispose();
    }
    root.computeWorldMatrix(true);
    let { min, max } = root.getHierarchyBoundingVectors(true);
    // orient the long axis along Z. Downloaded models can be skewed by arbitrary angles inside their file
    // (the Tata truck is ~30° off), so use the principal axis of the vertices; low-poly ones use their box.
    const pca = v.real ? principalYaw(root) : 0;
    if (Math.abs(pca) > 0.17) yawFix.rotation.y = pca; // only fix genuinely skewed files; small PCA wobble comes from spare wheels etc.
    else if (max.x - min.x > max.z - min.z) yawFix.rotation.y = Math.PI / 2;
    yawFix.rotation.y += v.yaw;
    yawFix.computeWorldMatrix(true); root.computeWorldMatrix(true);
    ({ min, max } = root.getHierarchyBoundingVectors(true));
    const len = Math.max(max.x - min.x, max.z - min.z);
    const s = spec.length / Math.max(0.001, len);
    holder.scaling.setAll(s);
    holder.computeWorldMatrix(true);
    ({ min, max } = root.getHierarchyBoundingVectors(true));
    const center = min.add(max).scale(0.5);
    holder.position.set(-center.x, -min.y, -center.z);
    const lights: Material[] = [];
    for (const m of root.getChildMeshes()) {
      m.isPickable = false;
      const mt = m.material;
      if (!mt) continue;
      if (spec.paintMat && paint && mt.name.endsWith(spec.paintMat) && mt instanceof PBRMaterial) mt.albedoColor = Color3.FromHexString(paint).toLinearSpace();
      if (mt.name.endsWith("BlueLights") || mt.name.endsWith("TailLights")) lights.push(mt);
      if (mt instanceof PBRMaterial) { mt.roughness = Math.max(0.35, mt.roughness ?? 0.5); }
    }
    if (kind === "truck" && !v.real) addTruckArt(this.scene, holder, spec, s);
    // skinned/animated parts of downloaded models can have stale bounds: never cull a vehicle up close
    const outer = new TransformNode(`${kind}_outer`, this.scene);
    holder.parent = outer;
    return { node: outer, lights };
  }
}

// ---------------------------------------------------------------------------
// Procedural auto-rickshaw (no free CC0 one exists, so we build a nice one).
// ---------------------------------------------------------------------------
const AUTO_LIVERIES = [
  { body: "#1f7a3a", canopy: "#f2c200" }, // Delhi CNG
  { body: "#f2c200", canopy: "#151515" }, // Mumbai
  { body: "#151515", canopy: "#f2c200" }, // Bengaluru-ish
];
let autoArt: DynamicTexture | null = null;
function buildAuto(scene: Scene) {
  const liv = AUTO_LIVERIES[Math.floor(Math.random() * AUTO_LIVERIES.length)];
  const root = new TransformNode("auto_model", scene);
  const m = (hex: string, spec = 0.15) => { const x = new StandardMaterial("auto_" + hex, scene); x.diffuseColor = Color3.FromHexString(hex); x.specularColor = new Color3(spec, spec, spec); return x; };
  const body = m(liv.body, 0.4), canopy = m(liv.canopy, 0.1), black = m("#111111"), chrome = m("#cfd8dc", 0.8), seat = m("#6d1b1b");
  const glass = new StandardMaterial("autoGlass", scene); glass.diffuseColor = new Color3(0.2, 0.3, 0.35); glass.alpha = 0.35; glass.specularColor = new Color3(1, 1, 1);
  const lamp = new StandardMaterial("autoLamp", scene); lamp.emissiveColor = new Color3(1, 0.95, 0.75);
  const add = (mesh: Mesh, mat: Material, x: number, y: number, z: number) => { mesh.material = mat; mesh.position.set(x, y, z); mesh.parent = root; mesh.isPickable = false; return mesh; };
  // chassis + floor
  add(MeshBuilder.CreateBox("chassis", { width: 1.2, height: 0.18, depth: 2.5 }, scene), black, 0, 0.42, -0.05);
  // passenger tub (rounded rear)
  add(MeshBuilder.CreateBox("tub", { width: 1.34, height: 0.55, depth: 1.25 }, scene), body, 0, 0.78, -0.55);
  const rearRound = add(MeshBuilder.CreateCylinder("rearRound", { height: 1.34, diameter: 0.55, tessellation: 16 }, scene), body, 0, 0.78, -1.17);
  rearRound.rotation.z = Math.PI / 2;
  // driver section + front cowl with nose
  add(MeshBuilder.CreateBox("mid", { width: 1.1, height: 0.4, depth: 0.7 }, scene), body, 0, 0.7, 0.4);
  const cowl = add(MeshBuilder.CreateCylinder("cowl", { height: 1.05, diameterTop: 0.42, diameterBottom: 0.7, tessellation: 16 }, scene), body, 0, 0.95, 0.98);
  cowl.rotation.x = -0.18;
  add(MeshBuilder.CreateSphere("headlight", { diameter: 0.2, segments: 8 }, scene), lamp, 0, 1.25, 1.18);
  add(MeshBuilder.CreateTorus("hlRim", { diameter: 0.22, thickness: 0.03, tessellation: 16 }, scene), chrome, 0, 1.25, 1.2).rotation.x = Math.PI / 2;
  // windscreen + handlebar
  const ws = add(MeshBuilder.CreatePlane("ws", { width: 1.15, height: 0.55, sideOrientation: Mesh.DOUBLESIDE }, scene), glass, 0, 1.55, 0.78);
  ws.rotation.x = -0.12;
  const hb = add(MeshBuilder.CreateCylinder("handlebar", { height: 0.8, diameter: 0.04, tessellation: 6 }, scene), chrome, 0, 1.2, 0.7);
  hb.rotation.z = Math.PI / 2;
  // seats
  add(MeshBuilder.CreateBox("rearSeat", { width: 1.2, height: 0.16, depth: 0.55 }, scene), seat, 0, 1.12, -0.65);
  add(MeshBuilder.CreateBox("rearBack", { width: 1.2, height: 0.5, depth: 0.12 }, scene), seat, 0, 1.38, -0.95);
  add(MeshBuilder.CreateBox("driverSeat", { width: 0.45, height: 0.14, depth: 0.4 }, scene), seat, 0, 1.08, 0.25);
  // canopy: half-cylinder roof + rear panel with art
  const roof = add(MeshBuilder.CreateCylinder("roof", { height: 2.05, diameter: 1.42, tessellation: 24, arc: 0.5, enclose: true }, scene), canopy, 0, 1.68, -0.18);
  roof.rotation.x = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.scaling.y = 1; roof.scaling.x = 0.55;
  for (const [x, z] of [[-0.66, 0.75], [0.66, 0.75], [-0.66, -1.1], [0.66, -1.1]]) add(MeshBuilder.CreateCylinder("pole", { height: 0.85, diameter: 0.04, tessellation: 6 }, scene), black, x, 1.45, z);
  if (!autoArt) {
    autoArt = new DynamicTexture("autoArt", { width: 512, height: 256 }, scene, true);
    const c = autoArt.getContext() as unknown as CanvasRenderingContext2D;
    c.fillStyle = "#151515"; c.fillRect(0, 0, 512, 256);
    const g = c.createLinearGradient(0, 0, 512, 0); ["#ff1744", "#ffea00", "#00e676", "#2979ff", "#d500f9"].forEach((col, i) => g.addColorStop(i / 4, col));
    c.strokeStyle = g; c.lineWidth = 12; c.strokeRect(8, 8, 496, 240);
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#ffea00"; c.font = "bold 56px Anton, Impact, sans-serif"; c.fillText("HORN OK PLEASE", 256, 70);
    c.fillStyle = "#ffffff"; c.font = '38px "Rozha One", "Kohinoor Devanagari", sans-serif'; c.fillText("बुरी नज़र वाले तेरा मुँह काला", 256, 145);
    c.fillStyle = "#ff8a80"; c.font = "bold 30px Anton, Impact, sans-serif"; c.fillText("DL 3C AB 1947  ·  MAA KA AASHIRWAD", 256, 210);
    // nimbu-mirchi
    c.fillStyle = "#cddc39"; c.beginPath(); c.ellipse(40, 120, 16, 20, 0, 0, 7); c.fill();
    c.fillStyle = "#1b5e20"; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(40 + (i % 2 ? 6 : -6), 150 + i * 14, 5, 12, 0, 0, 7); c.fill(); }
    autoArt.update();
  }
  const artMat = new StandardMaterial("autoArtMat", scene); artMat.diffuseTexture = autoArt; artMat.specularColor = Color3.Black(); artMat.emissiveColor = new Color3(0.75, 0.75, 0.75); artMat.disableLighting = true;
  // a default plane faces -Z (the rear) with plain 0..1 UVs, so the text reads correctly from behind
  add(MeshBuilder.CreatePlane("autoBack", { width: 1.3, height: 0.62 }, scene), artMat, 0, 1.5, -1.21);
  // tail lamps
  const tail = new StandardMaterial("autoTail", scene); tail.emissiveColor = new Color3(0.55, 0.0, 0.0); tail.diffuseColor = new Color3(0.4, 0, 0);
  for (const x of [-0.55, 0.55]) add(MeshBuilder.CreateBox("tail", { width: 0.14, height: 0.08, depth: 0.04 }, scene), tail, x, 0.92, -1.45);
  // wheels
  const tyre = black, hub = chrome;
  for (const [x, z] of [[0, 1.0], [-0.62, -0.75], [0.62, -0.75]]) {
    const w = add(MeshBuilder.CreateCylinder("tyre", { height: 0.17, diameter: 0.56, tessellation: 18 }, scene), tyre, x, 0.28, z); w.rotation.z = Math.PI / 2;
    const h = add(MeshBuilder.CreateCylinder("hub", { height: 0.19, diameter: 0.24, tessellation: 12 }, scene), hub, x, 0.28, z); h.rotation.z = Math.PI / 2;
  }
  return root;
}

function addTruckArt(scene: Scene, holder: TransformNode, spec: Spec, s: number) {
  const t = new DynamicTexture("truckArt", { width: 512, height: 384 }, scene, true);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  const g = c.createLinearGradient(0, 0, 0, 384); g.addColorStop(0, "#ff6f00"); g.addColorStop(1, "#c62828");
  c.fillStyle = g; c.fillRect(0, 0, 512, 384);
  c.strokeStyle = "#ffeb3b"; c.lineWidth = 14; c.strokeRect(10, 10, 492, 364);
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff";
  c.font = "bold 70px Anton, Impact, sans-serif"; c.fillText("HORN", 256, 80);
  c.fillStyle = "#ffeb3b"; c.font = "bold 90px Anton, Impact, sans-serif"; c.fillText("OK", 256, 175);
  c.fillStyle = "#fff"; c.font = "bold 70px Anton, Impact, sans-serif"; c.fillText("PLEASE", 256, 270);
  c.font = "26px Anton, Impact, sans-serif"; c.fillStyle = "#1a1a1a"; c.fillText("USE DIPPER AT NIGHT · TATA", 256, 345);
  t.update();
  const mat = new StandardMaterial("truckArtMat", scene); mat.diffuseTexture = t; mat.specularColor = Color3.Black(); mat.emissiveColor = new Color3(0.2, 0.2, 0.2);
  const p = MeshBuilder.CreatePlane("truckBack", { width: spec.width * 0.85, height: spec.width * 0.64, sideOrientation: Mesh.DOUBLESIDE, frontUVs: new Vector4(0, 0, 1, 1), backUVs: new Vector4(0, 0, 1, 1) }, scene);
  p.material = mat; p.isPickable = false;
  // holder is scaled by s; place in holder-local units at the rear (-Z)
  p.parent = holder;
  p.scaling.setAll(1 / s);
  p.scaling.x = -1 / s;
  p.position.set(0, (spec.height * 0.45) / s, (-spec.length / 2 - 0.03) / s);
}

// ---------------------------------------------------------------------------
// Vehicle (shared physics for player-driven, traffic and police)
// ---------------------------------------------------------------------------
export type Controls = { throttle: number; brake: number; steer: number; handbrake: boolean };
export type Driver = "none" | "player" | "traffic" | "police";

let vid = 1;
export class Vehicle {
  readonly id = vid++;
  readonly spec: Spec;
  readonly body: Mesh;
  speed = 0;
  heading: number;
  driver: Driver = "none";
  health = 1000;
  private lean = 0;
  /** two-wheeler knocked over: lies on its side until someone picks it up */
  fallen = false;
  fallSide = 1;
  private fallT = 0;
  /** set by the game: ground height (road 0 / footpath kerb) at a point */
  static groundAt: (x: number, z: number) => number = () => 0;
  static isWater: (x: number, z: number) => boolean = () => false;
  /** pulls a position back inside the map; true if it had to */
  static clamp: (p: { x: number; z: number }) => boolean = () => false;
  /** every live vehicle body (for cheap probe rays) */
  static bodies: Mesh[] = [];
  /** display name (real model name if any) */
  label: string;
  indicator: "off" | "left" | "right" | "hazard" = "off";
  private indLights: StandardMaterial[] = [];
  private indT = 0;
  /** helicopter state */
  vy = 0; altitude = 0; rotorSpin = 0;
  private rotor: TransformNode | null = null;
  private bob = Math.random() * 6;
  /** NPC rider on traffic bikes (disposed with the vehicle) */
  rider: { dispose(): void } | null = null;
  sirenOn = false;
  private lightT = 0;
  /** traffic/police path following */
  path: Vector3[] = [];
  aiState: "drive" | "wait" | "chase" | "parked" = "parked";
  stuckT = 0;
  model: TransformNode;
  lights: Material[];
  lastCrash = 0;

  constructor(private scene: Scene, readonly kind: VehicleKind, lib: VehicleLibrary, pos: Vector3, heading: number) {
    this.spec = SPECS[kind];
    const s = this.spec;
    this.body = MeshBuilder.CreateBox(`veh${this.id}`, { width: s.width, height: s.height, depth: s.length }, scene);
    this.body.setPivotPoint(new Vector3(0, -s.height / 2, 0));
    this.body.isVisible = false;
    this.body.checkCollisions = true;
    this.body.isPickable = true;
    this.body.metadata = { vehicle: this };
    Vehicle.bodies.push(this.body);
    // knockable street furniture (collisionGroup 2) doesn't stop vehicles: they knock it over instead
    this.body.collisionMask = -1 & ~2;
    // horizontal-only collision: ellipsoid floats above kerbs (0.18m) so vehicles can hop onto footpaths
    const r = Math.min(s.width / 2 + 0.05, s.length / 2);
    this.body.ellipsoid = new Vector3(r, s.height / 2 - 0.25, r);
    this.body.ellipsoidOffset = new Vector3(0, 0.2, 0);
    this.heading = heading;
    // box centre sits at half height
    this.body.position.set(pos.x, s.height / 2 + 0.02, pos.z);
    this.body.rotation.y = heading;
    const paint = s.paint ? s.paint[Math.floor(Math.random() * s.paint.length)] : undefined;
    const { node, lights, label } = lib.buildModel(kind, paint);
    this.model = node; this.lights = lights; this.label = label ?? s.name; this.baseLabel = this.label;
    node.parent = this.body;
    node.position.y = -s.height / 2;
    if (kind === "police") this.addLightBar();
    if (s.cls === "heli") { this.addRotor(); this.body.ellipsoid = new Vector3(2.2, s.height / 2, 2.2); this.body.ellipsoidOffset = Vector3.Zero(); }
    if (s.cls === "boat") this.body.position.y = s.height / 2 - 0.85;
  }

  /** reuse a pooled vehicle */
  private baseLabel = "";
  reset(pos: Vector3, heading: number) {
    const s = this.spec;
    this.speed = 0; this.heading = heading; this.driver = "none"; this.health = 1000;
    this.fallen = false; this.fallT = 0; this.lean = 0; this.path = []; this.aiState = "parked"; this.stuckT = 0; this.lastCrash = 0;
    this.sirenOn = false; this.vy = 0; this.altitude = 0; this.rotorSpin = 0;
    if (this.indicator !== "off") this.setIndicator("off");
    if (this.baseLabel) this.label = this.baseLabel;
    this.body.position.set(pos.x, s.cls === "boat" ? s.height / 2 - 0.85 : s.height / 2 + 0.02 + Math.max(0, pos.y), pos.z);
    this.body.rotation.set(0, heading, 0);
    this.body.setEnabled(true);
  }

  /** knock a two-wheeler over (side: which way it falls) */
  knockOver(side: number) { if (this.fallen) return; this.fallen = true; this.fallSide = side >= 0 ? 1 : -1; this.fallT = 0; this.setIndicator("off"); }
  /** stand it back up (player picks it up) */
  pickUp() { if (!this.fallen) return; this.fallen = false; this.fallT = 0; this.lean = 0; this.speed = 0; }

  get position() { return this.body.position; }
  get forward() { return new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get cls() { return this.spec.cls; }
  get groundPos() { return new Vector3(this.body.position.x, this.body.position.y - this.spec.height / 2, this.body.position.z); }

  /** Where the player stands to get in / gets out. */
  doorPoint(side = -1) {
    const right = new Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    return this.groundPos.add(right.scale(side * (this.spec.width / 2 + 0.7)));
  }

  /** Physics step (player and police chase). */
  drive(dt: number, c: Controls) {
    const s = this.spec;
    if (this.fallen) c = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    const fwdSpeed = this.speed;
    // engine & brakes
    if (c.throttle > 0) this.speed += (fwdSpeed < -0.5 ? s.accel * 3 : s.accel) * c.throttle * dt * (1 - Math.max(0, fwdSpeed) / s.maxSpeed * 0.7);
    if (c.brake > 0) this.speed -= (fwdSpeed > 0.5 ? s.accel * 2.6 : s.accel * 0.7) * c.brake * dt;
    this.speed = Math.max(-s.maxSpeed * 0.3, Math.min(s.maxSpeed, this.speed));
    const drag = c.throttle === 0 && c.brake === 0 ? 1.2 : 0.15;
    this.speed -= this.speed * drag * dt;
    if (c.handbrake) this.speed -= this.speed * 2.2 * dt;
    if (Math.abs(this.speed) < 0.05 && c.throttle === 0) this.speed = 0;
    // steering: grip falls off a bit at speed, handbrake lets the rear step out
    const sp = Math.abs(this.speed);
    const steerAuth = Math.min(1, sp / 4) * (1 - Math.min(0.45, sp / s.maxSpeed * 0.45)) * (c.handbrake ? 1.7 : 1);
    this.heading += c.steer * s.turn * steerAuth * Math.sign(this.speed || 1) * dt;
    this.lean += ((this.cls === "bike" ? -c.steer * Math.min(1, sp / 8) * 0.45 : -c.steer * Math.min(1, sp / 15) * 0.04) - this.lean) * Math.min(1, 6 * dt);
    this.move(dt);
  }

  /** Move along heading with collisions; bounce off walls. Returns true if blocked. */
  move(dt: number) {
    const s = this.spec;
    const f = this.forward;
    const dist = this.speed * dt;
    // ellipsoid is a circle of ~half-width, so probe the nose/tail with a ray to stop the bonnet entering walls
    let blocked = false;
    if (Math.abs(dist) > 1e-4) {
      const dir = f.scale(Math.sign(dist));
      for (const side of [-0.4, 0.4]) {
        const right = new Vector3(f.z, 0, -f.x);
        const origin = this.body.position.add(right.scale(side * s.width)).addInPlaceFromFloats(0, -s.height / 4, 0);
        const ray = new Ray(origin, dir, s.length / 2 + Math.abs(dist) + 0.05);
        const others = Vehicle.bodies.filter((b) => b !== this.body && b.isEnabled() && Math.abs(b.position.x - origin.x) < 20 && Math.abs(b.position.z - origin.z) < 20);
        const hit = Grid.current ? Grid.current.pick(ray, (m) => m.checkCollisions && m.isPickable, others)
          : this.scene.pickWithRay(ray, (m) => m !== this.body && m.checkCollisions && m.isPickable && m.isEnabled());
        if (hit?.hit) { blocked = true; break; }
      }
    }
    // boats stay in the water, everything else stays out of it
    if (!blocked && Math.abs(dist) > 1e-4) {
      const nx = this.body.position.x + f.x * (dist + Math.sign(dist) * s.length / 2), nz = this.body.position.z + f.z * (dist + Math.sign(dist) * s.length / 2);
      const wet = Vehicle.isWater(nx, nz);
      if ((s.cls === "boat") !== wet) blocked = true;
    }
    const before = this.body.position.clone();
    const disp = new Vector3(blocked ? 0 : f.x * dist, 0, blocked ? 0 : f.z * dist);
    this.body.moveWithCollisions(disp);
    if (Vehicle.clamp(this.body.position)) { this.speed *= -0.3; blocked = true; }
    const moved = this.body.position.subtract(before);
    let gy: number;
    if (s.cls === "boat") {
      this.bob += dt * (1.2 + Math.abs(this.speed) * 0.05);
      gy = s.height / 2 - 0.85 + Math.sin(this.bob) * 0.08; // sea surface sits at y = -0.5
    } else gy = Vehicle.groundAt(this.body.position.x, this.body.position.z) + s.height / 2 + 0.02;
    this.body.position.y += (gy - this.body.position.y) * Math.min(1, 14 * dt);
    const horiz = Math.hypot(moved.x, moved.z);
    if (blocked || (Math.abs(dist) > 0.02 && horiz < Math.abs(dist) * 0.3)) {
      const impact = Math.abs(this.speed);
      this.speed = -this.speed * 0.25;
      if (impact > 3) this.lastCrash = impact;
      blocked = true;
    }
    const pitch = s.cls === "boat" ? -Math.min(0.12, Math.abs(this.speed) / s.maxSpeed * 0.14) + Math.sin(this.bob * 1.3) * 0.02 : 0;
    // a fallen bike tips over onto its side (quick, with a little bounce) and scrapes to a stop
    if (this.fallen) {
      this.fallT = Math.min(1, this.fallT + dt * 2.2);
      const t = this.fallT, ease = t < 0.8 ? (t / 0.8) ** 2 : 1 - Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.08;
      this.body.rotation.set(0, this.heading, this.fallSide * 1.38 * ease);
      this.speed *= Math.max(0, 1 - 2.5 * dt);
      return blocked;
    }
    this.body.rotation.set(pitch, this.heading, this.lean);
    return blocked;
  }

  // ------------------------------------------------------------------ helicopter
  private addRotor() {
    const s = this.spec;
    const m = new StandardMaterial("rotorMat", this.scene); m.diffuseColor = new Color3(0.08, 0.08, 0.08);
    const r = new TransformNode("rotor", this.scene); r.parent = this.body; r.position.set(0, s.height / 2 + 0.25, 0.4);
    for (let i = 0; i < 4; i++) {
      const b = MeshBuilder.CreateBox("blade", { width: 5.4, height: 0.04, depth: 0.28 }, this.scene);
      b.material = m; b.parent = r; b.position.x = 2.7; b.isPickable = false;
      const pivot = new TransformNode("bladePivot", this.scene); pivot.parent = r; pivot.rotation.y = (i * Math.PI) / 2; b.parent = pivot;
    }
    const hub = MeshBuilder.CreateCylinder("hub", { height: 0.4, diameter: 0.35 }, this.scene); hub.material = m; hub.parent = r; hub.position.y = -0.15;
    const tail = new TransformNode("tailRotor", this.scene); tail.parent = this.body; tail.position.set(0.25, 0.3, -s.length / 2 + 0.4);
    for (let i = 0; i < 2; i++) { const b = MeshBuilder.CreateBox("tblade", { width: 0.05, height: 1.4, depth: 0.14 }, this.scene); b.material = m; b.parent = tail; b.rotation.x = (i * Math.PI) / 2; }
    this.rotor = r;
    (this as unknown as { tail: TransformNode }).tail = tail;
  }

  /** flight model: lift (space/shift), pitch forward/back (W/S), yaw (A/D) */
  fly(dt: number, c: { lift: number; forward: number; yaw: number }, engineOn: boolean) {
    const s = this.spec;
    this.rotorSpin += ((engineOn ? 1 : 0) - this.rotorSpin) * Math.min(1, dt * 0.8);
    if (this.rotor) this.rotor.rotation.y += this.rotorSpin * 28 * dt;
    const tail = (this as unknown as { tail?: TransformNode }).tail; if (tail) tail.rotation.x += this.rotorSpin * 40 * dt;
    const ground = Vehicle.groundAt(this.body.position.x, this.body.position.z);
    const canFly = this.rotorSpin > 0.7;
    // vertical
    const lift = canFly ? c.lift * 9 : 0;
    this.vy += (lift - this.vy) * Math.min(1, 2.2 * dt) - (canFly ? 0 : 9.8 * dt);
    // horizontal: forward speed along heading
    const target = canFly ? c.forward * s.maxSpeed : 0;
    this.speed += (target - this.speed) * Math.min(1, (c.forward ? 0.9 : 0.6) * dt);
    if (canFly) this.heading += c.yaw * s.turn * dt;
    const f = this.forward;
    const before = this.body.position.clone();
    this.body.moveWithCollisions(new Vector3(f.x * this.speed * dt, this.vy * dt, f.z * this.speed * dt));
    const p = this.body.position;
    // ground & ceiling & map bounds
    const minY = ground + s.height / 2 + 0.02;
    if (p.y < minY) { p.y = minY; if (this.vy < 0) this.vy = 0; }
    if (p.y > 160) { p.y = 160; this.vy = Math.min(0, this.vy); }
    if (Vehicle.clamp(p)) this.speed *= -0.3;
    const moved = p.subtract(before);
    if (Math.abs(this.speed) > 3 && Math.hypot(moved.x, moved.z) < Math.abs(this.speed) * dt * 0.3) { this.lastCrash = Math.abs(this.speed); this.speed *= -0.3; }
    this.altitude = p.y - minY;
    // visual tilt
    const tiltX = -this.speed / s.maxSpeed * 0.22, tiltZ = -c.yaw * 0.12 * Math.min(1, Math.abs(this.speed) / 8 + 0.3);
    this.lean += (tiltZ - this.lean) * Math.min(1, 3 * dt);
    const cur = (this as unknown as { pitchV?: number }).pitchV ?? 0;
    const pv = cur + (tiltX - cur) * Math.min(1, 3 * dt);
    (this as unknown as { pitchV?: number }).pitchV = pv;
    this.body.rotation.set(-pv, this.heading, this.lean);
  }

  // ------------------------------------------------------------------ indicators
  setIndicator(mode: "off" | "left" | "right" | "hazard") {
    this.indicator = this.indicator === mode ? "off" : mode;
    if (!this.indLights.length) {
      const s = this.spec;
      for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const m = new StandardMaterial("ind", this.scene); m.diffuseColor = new Color3(0.4, 0.25, 0); m.emissiveColor = Color3.Black();
        const b = MeshBuilder.CreateBox("indicator", { width: 0.16, height: 0.1, depth: 0.08 }, this.scene);
        b.material = m; b.parent = this.body; b.isPickable = false;
        b.position.set(x * (s.width / 2 - 0.05), -s.height / 2 + Math.min(0.9, s.height * 0.5), z * (s.length / 2 + 0.02));
        this.indLights.push(m);
      }
    }
  }
  /** returns true on each blink-on edge (for the tick sound) */
  updateIndicators(dt: number) {
    if (!this.indLights.length) return false;
    const was = Math.floor(this.indT * 3) % 2 === 0;
    this.indT += dt;
    const on = Math.floor(this.indT * 3) % 2 === 0;
    const L = this.indicator === "left" || this.indicator === "hazard", R = this.indicator === "right" || this.indicator === "hazard";
    this.indLights.forEach((m, i) => { const left = i % 2 === 0; m.emissiveColor = on && (left ? L : R) ? new Color3(2, 1.1, 0) : Color3.Black(); });
    return this.indicator !== "off" && on !== was;
  }

  /** Kinematic path following for AI (traffic + police). */
  followPath(dt: number, target: number, obstacleAhead: boolean) {
    if (this.fallen) { this.speed *= Math.max(0, 1 - 3 * dt); this.move(dt); return; }
    if (this.path.length === 0) { this.speed *= 0.9; return; }
    const p = this.path[0];
    const to = p.subtract(this.groundPos); to.y = 0;
    const d = to.length();
    if (d < 2.2) { this.path.shift(); return; }
    const want = Math.atan2(to.x, to.z);
    let dh = want - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const turnRate = this.spec.turn * 1.4;
    this.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, dh));
    const sharp = Math.abs(dh) > 0.5 ? 0.45 : 1;
    const goal = obstacleAhead ? 0 : target * sharp;
    this.speed += Math.max(-12 * dt, Math.min(this.spec.accel * dt, goal - this.speed));
    this.move(dt);
  }

  private bar: StandardMaterial[] = [];
  /** red/blue beacon on the roof (works for any police model) */
  private addLightBar() {
    const s = this.spec;
    const mk = (hex: string) => { const m = new StandardMaterial("beacon", this.scene); m.diffuseColor = Color3.FromHexString(hex); m.emissiveColor = Color3.Black(); return m; };
    const red = mk("#ff2020"), blue = mk("#2050ff");
    for (const [mat, x] of [[red, -0.28], [blue, 0.28]] as const) {
      const b = MeshBuilder.CreateBox("beacon", { width: 0.42, height: 0.14, depth: 0.22 }, this.scene);
      b.material = mat; b.parent = this.body; b.isPickable = false;
      b.position.set(x, s.height / 2 + 0.05, -0.1);
    }
    this.bar = [red, blue];
  }

  /** police light flashing, call every frame */
  updateLights(dt: number) {
    if (!this.bar.length) return;
    if (!this.sirenOn) { this.bar.forEach((m) => (m.emissiveColor = Color3.Black())); return; }
    this.lightT += dt;
    const on = Math.floor(this.lightT * 6) % 2 === 0;
    this.bar[0].emissiveColor = on ? new Color3(2.5, 0.1, 0.1) : Color3.Black();
    this.bar[1].emissiveColor = on ? Color3.Black() : new Color3(0.2, 0.4, 3);
    for (const m of this.lights) if (m instanceof PBRMaterial && m.name.endsWith("BlueLights")) m.emissiveColor = on ? new Color3(0.1, 0.3, 3) : new Color3(2.5, 0.1, 0.1);
  }

  dispose() {
    const bi = Vehicle.bodies.indexOf(this.body); if (bi >= 0) Vehicle.bodies.splice(bi, 1);
    this.rider?.dispose();
    // dispose this vehicle's own (cloned) materials but NOT textures: those are shared between instances
    const mats = new Set(this.body.getChildMeshes().filter((m) => !(m instanceof InstancedMesh)).map((m) => m.material).filter((m): m is Material => !!m));
    this.body.dispose(false, false);
    mats.forEach((m) => m.dispose(false, false));
  }
}
