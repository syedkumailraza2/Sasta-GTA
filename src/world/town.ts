import {
  Color3, DynamicTexture, Material, Mesh, MeshBuilder, Scene, StandardMaterial, Texture,
  TransformNode, Vector3, Vector4, AbstractMesh, VertexData,
} from "@babylonjs/core";
import { mulberry32, pick, range, type Rng } from "./rng";
import {
  SIGNS2,
  WALL_COLORS, facadeTexture, shutterTexture, signAtlas, adAtlas, asphaltTexture, paverTexture,
  dirtTexture, brickTexture, atlasUV, SIGNS, ADS,
} from "./textures";

export type MapRect = { minX: number; minZ: number; maxX: number; maxZ: number; kind: "building" | "maidan" | "block" | "prop" | "sand" | "water" | "jetty" | "road" | "park" };

export const SHOP_KINDS = ["barber", "clothes", "gun", "medical", "motors"] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];
export type ShopSpot = { kind: ShopKind; x: number; z: number; rot: number };
export interface Town {
  /** walk-in shops: barber (hairstyles) and fashion (clothes) */
  shops: ShopSpot[];
  moorings: { x: number; z: number; heading: number; kind: "boat" | "jetski" }[];
  helipad: Vector3;
  parking: { x: number; z: number; heading: number }[];
  /** non-maidan blocks, for pedestrians walking the footpath rings */
  blocks: { x0: number; z0: number }[];
  size: number;
  colliders: AbstractMesh[];
  rects: MapRect[];
  spawn: Vector3;
  spawnYaw: number;
  meshes: Mesh[];
  shots: { from: Vector3; to: Vector3; lookFrom: Vector3; lookTo: Vector3 }[];
}

// ---- layout constants (metres) ----
export const N = 10;         // blocks per side (spec 04: 4x the area of the original 5x5)
export const BLOCK = 44;     // block size
export const ROAD = 14;      // road width
const FOOT = 3;              // footpath width (inside block edge)
const CURB = 0.18;           // footpath height
const FLOOR_H = 3.2;
export const SIZE = N * BLOCK + (N + 1) * ROAD;
export const HALF = SIZE / 2;
export const blockMin = (i: number) => -HALF + ROAD + i * (BLOCK + ROAD);
export const FOOTPATH = FOOT;
export const KERB = CURB;
/** Height of the walkable surface (road 0, footpath/maidan kerb, sloping beach, sea bed) at a point. */
export function groundAt(x: number, z: number) {
  if (Math.abs(z - JETTY.z) < JETTY.w / 2 && x > JETTY.x0 && x < JETTY.x1) return JETTY.deck;
  const c = cellIndex(x, z);
  if (!c || CELLS[c[0]][c[1]] !== "land") return sandH(x, z);
  const i = Math.floor((x + HALF - ROAD) / (BLOCK + ROAD)), j = Math.floor((z + HALF - ROAD) / (BLOCK + ROAD));
  if (i < 0 || j < 0 || i >= N || j >= N) return 0;
  const lx = x - blockMin(i), lz = z - blockMin(j);
  return lx >= 0 && lx <= BLOCK && lz >= 0 && lz <= BLOCK ? CURB : 0;
}
// ---- island: a noisy, lumpy coastline (not a square!) carves the town grid; beaches wrap the land ----
export type CellType = "land" | "sand";
const TAU = Math.PI * 2;
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** rough land radius: a few random harmonics give peninsulas and bays */
const landR = (a: number) => 242 * (1 + 0.2 * Math.sin(2 * a + 0.7) + 0.15 * Math.sin(3 * a + 2.1) + 0.1 * Math.sin(5 * a + 4.0) + 0.07 * Math.sin(7 * a + 1.3))
  + 90 * Math.exp(-((wrapA(a - 2.3) / 0.25) ** 2))   // a long peninsula to the north-west
  + 70 * Math.exp(-((wrapA(a + 2.0) / 0.22) ** 2));  // and a headland to the south-west
export const CELLS: CellType[][] = (() => {
  const g: CellType[][] = [];
  const c = (N - 1) / 2, M = Math.floor(N / 2);
  for (let i = 0; i < N; i++) {
    g.push([]);
    for (let j = 0; j < N; j++) {
      const x = blockMin(i) + BLOCK / 2, z = blockMin(j) + BLOCK / 2;
      const east = i === N - 1 && Math.abs(j - c) < c - 1; // Juhu promenade stays built up
      g[i].push(east || Math.hypot(x, z) < landR(Math.atan2(z, x)) ? "land" : "sand");
    }
  }
  // keep only land connected to the maidan (no unreachable islets)
  const seen = new Set<number>(), q = [[M, M]];
  g[M][M] = "land";
  while (q.length) {
    const [i, j] = q.pop()!;
    if (seen.has(i * 100 + j)) continue; seen.add(i * 100 + j);
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (a >= 0 && b >= 0 && a < N && b < N && g[a][b] === "land") q.push([a, b]);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (g[i][j] === "land" && !seen.has(i * 100 + j)) g[i][j] = "sand";
  return g;
})();
export const cellLand = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < N && CELLS[i][j] === "land";
/** which grid cell owns a point (each cell = its block + half of the surrounding roads) */
export function cellIndex(x: number, z: number): [number, number] | null {
  if (x < -HALF || x > HALF || z < -HALF || z > HALF) return null;
  const f = (v: number) => Math.max(0, Math.min(N - 1, Math.floor((v + HALF - ROAD / 2) / (BLOCK + ROAD))));
  return [f(x), f(z)];
}
export function cellTypeAt(x: number, z: number): CellType {
  const c = cellIndex(x, z);
  return c ? CELLS[c[0]][c[1]] : "sand";
}
export const inLandCell = (x: number, z: number) => cellTypeAt(x, z) === "land";
/** coastline radius per angle: land extent, dilated + blurred so it flows, plus a noisy beach */
const K = 720;
const COAST: Float32Array = (() => {
  const le = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    const a = (k / K) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    for (let r = 0; r < 520; r += 2) if (inLandCell(ca * r, sa * r) && cellIndex(ca * r, sa * r)) le[k] = r;
  }
  const win = (src: Float32Array, w: number, f: (acc: number, v: number) => number, init: number, avg: boolean) => {
    const out = new Float32Array(K);
    for (let k = 0; k < K; k++) {
      let acc = init;
      for (let o = -w; o <= w; o++) acc = f(acc, src[(k + o + K) % K]);
      out[k] = avg ? acc / (2 * w + 1) : acc;
    }
    return out;
  };
  const dil = win(le, 10, Math.max, 0, false);        // ±5°
  const blur = win(win(dil, 10, (a, v) => a + v, 0, true), 6, (a, v) => a + v, 0, true);
  const out = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    const a = (k / K) * TAU;
    const beach = Math.max(14, 30 + 16 * Math.sin(2 * a + 1) + 10 * Math.sin(5 * a + 2.5) + 6 * Math.sin(11 * a + 0.4))
      + 40 * Math.exp(-((wrapA(a + 1.0) / 0.3) ** 2))    // a sandy spit to the south
      + 34 * Math.exp(-((wrapA(a) / 0.6) ** 2)); // the wide Juhu beach on the east
    out[k] = Math.max(blur[k], le[k] + 8) + beach;
  }
  return out;
})();
export function coastR(a: number) {
  const f = ((a / TAU) % 1 + 1) % 1 * K, k = Math.floor(f), t = f - k;
  return COAST[k % K] * (1 - t) + COAST[(k + 1) % K] * t;
}
/** signed distance (approx., radial) inland from the waterline: + on land, - out at sea */
export const coastDist = (x: number, z: number) => coastR(Math.atan2(z, x)) - Math.hypot(x, z);
/** beach profile: flat sand, sloping down through the waterline (sea level -0.5) to the sea bed */
export function sandH(x: number, z: number) {
  const d = coastDist(x, z);
  return d >= 10 ? 0 : Math.max(-2.4, -0.5 + d * 0.05);
}
export const MAX_COAST = Math.max(...COAST);
/** the outline as points (minimap, sea mesh) */
export const coastline = (n = 360) => Array.from({ length: n }, (_, k) => { const a = (k / n) * TAU, r = coastR(a); return { x: Math.cos(a) * r, z: Math.sin(a) * r }; });
/** is the road between two intersections on land? (used by traffic/nav) */
export function segmentLand(a: { i: number; j: number }, b: { i: number; j: number }) {
  if (a.j === b.j) { const i = Math.min(a.i, b.i); return cellLand(i, a.j - 1) || cellLand(i, a.j); }
  const j = Math.min(a.j, b.j); return cellLand(a.i - 1, j) || cellLand(a.i, j);
}
export const KIOSKS = [
  { hi: "चाय", en: "CHAI TAPRI", bg: "#6d4c41" }, { hi: "पान", en: "PAAN BHANDAR", bg: "#1b5e20" },
  { hi: "फल", en: "TAAZE PHAL", bg: "#e65100" }, { hi: "गन्ने का रस", en: "GANNE KA RAS", bg: "#558b2f" },
  { hi: "वड़ा पाव", en: "VADA PAV", bg: "#f57f17" }, { hi: "अख़बार", en: "AKHBAAR · MAGAZINE", bg: "#37474f" },
];
export const roadCenter = (k: number) => -HALF + ROAD / 2 + k * (BLOCK + ROAD);
const MAIDAN = Math.floor(N / 2);
// ---- coast (east side): Juhu beach then the Arabian Sea ----
export const SHORE = coastR(0);                  // x of the waterline at the jetty
export const BEACH = SHORE - HALF;
export const SEA = 260;                          // sailable sea beyond the coastline
/** square that contains everything (minimap extent) */
const EXT = MAX_COAST + SEA;
export const BOUNDS = { minX: -EXT, maxX: EXT, minZ: -EXT, maxZ: EXT };
/** how far out to sea you may go at this point (radial limit) */
export const limitR = (x: number, z: number) => coastR(Math.atan2(z, x)) + SEA;
export const outOfBounds = (x: number, z: number, margin = 0) => Math.hypot(x, z) > limitR(x, z) - margin;
/** pull a point back inside the playable area; returns true if it was clamped */
export function clampToBounds(p: { x: number; z: number }, margin = 0) {
  const r = Math.hypot(p.x, p.z), lim = limitR(p.x, p.z) - margin;
  if (r <= lim) return false;
  p.x *= lim / r; p.z *= lim / r;
  return true;
}
export const JETTY = { x0: SHORE - 10, x1: SHORE + 46, z: 0, w: 5, deck: 0.55 };
const onJetty = (x: number, z: number) => z > JETTY.z - JETTY.w / 2 && z < JETTY.z + JETTY.w / 2 && x > JETTY.x0 && x < JETTY.x1;
export const isWater = (x: number, z: number) => !inLandCell(x, z) && !onJetty(x, z) && sandH(x, z) < -0.45;
/** x of the waterline along a line of constant z on the east side (for beach props) */
export function coastX(z: number) { let x = HALF; while (x < HALF + 200 && !isWater(x, z)) x += 1; return x; }

/** Collects meshes per material and merges them at the end -> a few dozen draw calls for the whole town. */
class Batcher {
  groups = new Map<Material, Mesh[]>();
  add(m: Mesh, mat: Material) {
    m.material = mat;
    let g = this.groups.get(mat);
    if (!g) this.groups.set(mat, (g = []));
    g.push(m);
    return m;
  }
  merge(): Mesh[] {
    const out: Mesh[] = [];
    for (const [mat, list] of this.groups) {
      // keep chunks reasonably sized so frustum culling still helps a bit
      for (let i = 0; i < list.length; i += 400) {
        const merged = Mesh.MergeMeshes(list.slice(i, i + 400), true, true, undefined, false, false);
        if (merged) {
          merged.material = mat;
          merged.name = `town_${mat.name}_${i}`;
          merged.isPickable = false;
          merged.freezeWorldMatrix();
          out.push(merged);
        }
      }
    }
    this.groups.clear();
    return out;
  }
}

export function buildTown(scene: Scene): Town {
  const rng = mulberry32(1947);
  const B = new Batcher();
  const colliders: AbstractMesh[] = [];
  const rects: MapRect[] = [];
  const tmpNodes: TransformNode[] = [];

  // ---------- materials ----------
  const mat = (name: string, color: string | null, tex?: Texture, emissive?: string) => {
    const m = new StandardMaterial(name, scene);
    if (color) m.diffuseColor = Color3.FromHexString(color);
    if (tex) m.diffuseTexture = tex;
    m.specularColor = new Color3(0.04, 0.04, 0.04);
    if (emissive) m.emissiveColor = Color3.FromHexString(emissive);
    return m;
  };
  const facadeMats = WALL_COLORS.map((c, i) => mat(`facade${i}`, null, facadeTexture(scene, c, rng, i)));
  const concrete = mat("concrete", "#9c9a94");
  const darkConcrete = mat("darkConcrete", "#6f6d68");
  const black = mat("tank", "#1d1d1f");
  const rebar = mat("rebar", "#5a3d2b");
  const white = mat("paint", "#f2f2ee");
  const yellow = mat("yellowPaint", "#f5c518");
  const shutter = mat("shutter", null, shutterTexture(scene));
  const signs = mat("signs", null, signAtlas(scene), "#3a3a3a");
  const ads = mat("ads", null, adAtlas(scene), "#555555");
  const asphalt = mat("asphalt", null, asphaltTexture(scene, rng));
  const paver = mat("paver", null, paverTexture(scene, rng));
  const dirt = mat("dirt", null, dirtTexture(scene, rng));
  const brick = mat("brick", null, brickTexture(scene, rng));
  const trunk = mat("trunk", "#5b4636");
  const leaves = [mat("leaf0", "#3f6b2a"), mat("leaf1", "#557a2e"), mat("leaf2", "#2f5a2a")];
  const tarps = [mat("tarpBlue", "#1e5fa8"), mat("tarpOrange", "#e0731f"), mat("tarpGreen", "#2e7d32")];
  const cream = mat("cream", "#efe2c4");
  const terracotta = mat("terracotta", "#b5532f");
  const signs2 = mat("signs2", null, signAtlas(scene, SIGNS2, "signs2"), "#3a3a3a");
  const kWood = mat("kioskWood", "#8d6e4b"), kSteel = mat("kioskSteel", "#cfd8dc"), kGreen = mat("ganna", "#7cb342");
  const grass = mat("grass", "#6f9a3a", dirtTexture(scene, mulberry32(11)));
  (grass.diffuseTexture as Texture).uScale = (grass.diffuseTexture as Texture).vScale = 6;
  const fruitMats = ["#e53935", "#fb8c00", "#fdd835", "#43a047"].map((c, i) => mat(`fruit${i}`, c));
  const kioskTex = new DynamicTexture("kioskSigns", { width: 1536, height: 512 }, scene, true);
  {
    const c = kioskTex.getContext() as unknown as CanvasRenderingContext2D;
    KIOSKS.forEach((k, i) => {
      const x = (i % 3) * 512, y = Math.floor(i / 3) * 256;
      c.fillStyle = k.bg; c.fillRect(x, y, 512, 256); c.strokeStyle = "#fff"; c.lineWidth = 8; c.strokeRect(x + 8, y + 8, 496, 240);
      c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
      c.font = '110px "Rozha One", "Kohinoor Devanagari", sans-serif'; c.fillText(k.hi, x + 256, y + 100);
      c.font = "bold 46px Anton, Impact, sans-serif"; c.fillStyle = "#ffeb3b"; c.fillText(k.en, x + 256, y + 200);
    });
    kioskTex.update();
  }
  const kioskSign = mat("kioskSign", null, kioskTex, "#444444");

  // helpers ---------------------------------------------------------
  const node = (x: number, z: number, rotY: number) => {
    const n = new TransformNode("n", scene);
    n.position.set(x, 0, z);
    n.rotation.y = rotY;
    tmpNodes.push(n);
    return n;
  };
  const box = (parent: TransformNode | null, m: Material, w: number, h: number, d: number, x: number, y: number, z: number, faceUV?: Vector4[]) => {
    const b = MeshBuilder.CreateBox("b", { width: w, height: h, depth: d, faceUV, wrap: !!faceUV }, scene);
    b.position.set(x, y, z);
    if (parent) b.parent = parent;
    return B.add(b, m);
  };
  const cyl = (parent: TransformNode | null, m: Material, dia: number, h: number, x: number, y: number, z: number, tess = 12, diaTop?: number) => {
    const c = MeshBuilder.CreateCylinder("c", { diameterBottom: dia, diameterTop: diaTop ?? dia, height: h, tessellation: tess }, scene);
    c.position.set(x, y, z);
    if (parent) c.parent = parent;
    return B.add(c, m);
  };
  const plane = (parent: TransformNode, m: Material, w: number, h: number, x: number, y: number, z: number, uv: readonly number[]) => {
    const p = MeshBuilder.CreatePlane("p", { width: w, height: h, frontUVs: new Vector4(uv[0], uv[1], uv[2], uv[3]), backUVs: new Vector4(uv[0], uv[1], uv[2], uv[3]), sideOrientation: Mesh.DOUBLESIDE }, scene);
    p.position.set(x, y, z);
    p.rotation.y = Math.PI; // plane faces -Z by default; our fronts face +Z
    p.parent = parent;
    return B.add(p, m);
  };
  const collider = (parent: TransformNode | null, w: number, h: number, d: number, x: number, y: number, z: number, kind: MapRect["kind"] = "building") => {
    const c = MeshBuilder.CreateBox("collider", { width: w, height: h, depth: d }, scene);
    c.position.set(x, y, z);
    if (parent) c.parent = parent;
    c.isVisible = false;
    c.checkCollisions = true;
    c.isPickable = true; // camera uses picking to avoid clipping into walls
    c.computeWorldMatrix(true);
    colliders.push(c);
    const bb = c.getBoundingInfo().boundingBox;
    rects.push({ minX: bb.minimumWorld.x, minZ: bb.minimumWorld.z, maxX: bb.maximumWorld.x, maxZ: bb.maximumWorld.z, kind });
    return c;
  };
  /** walkable/solid surface collider that doesn't show on the minimap */
  const solid = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const c = MeshBuilder.CreateBox("solid", { width: w, height: h, depth: d }, scene);
    c.position.set(x, y, z);
    c.isVisible = false; c.checkCollisions = true; c.isPickable = true;
    colliders.push(c);
    return c;
  };
  const solidUV = new Vector4(0.01, 0.97, 0.05, 0.995); // plain wall colour region of a facade tile

  // ---------- ground & roads ----------
  // asphalt tiles on land cells; one sculpted beach mesh around them (sloping into the sea)
  const sandTile = mat("sandTile", "#f1dcb0", dirtTexture(scene, mulberry32(3)));
  const cellSpan = (k: number) => [k === 0 ? -HALF : blockMin(k) - ROAD / 2, k === N - 1 ? HALF : blockMin(k) + BLOCK + ROAD / 2];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (CELLS[i][j] !== "land") continue;
    const [x0, x1] = cellSpan(i), [z0, z1] = cellSpan(j);
    const g = MeshBuilder.CreateGround("ground", { width: x1 - x0, height: z1 - z0 }, scene);
    g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    g.material = asphalt; g.checkCollisions = true; g.receiveShadows = true; g.isPickable = true;
    colliders.push(g);
    rects.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, kind: "road" });
  }
  buildBeach();
  function buildBeach() {
    // grid lines aligned with the cell edges inside the town square, coarser outside it
    const ext = MAX_COAST + 45;
    const axis: number[] = [];
    for (let v = -ext; v < -HALF; v += 6) axis.push(v);
    for (let k = 0; k < N; k++) { const [a, b] = cellSpan(k); for (let t = 0; t < 10; t++) axis.push(a + ((b - a) * t) / 10); }
    for (let v = HALF; v <= ext; v += 6) axis.push(v);
    const n = axis.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = axis[i], z = axis[j];
      pos.push(x, sandH(x, z), z); uv.push(x / 9, z / 9);
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const cx = (axis[i] + axis[i + 1]) / 2, cz = (axis[j] + axis[j + 1]) / 2;
      if (inLandCell(cx, cz) && cellIndex(cx, cz)) continue;
      if (coastDist(cx, cz) < -48) continue;
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.uvs = uv;
    const normals: number[] = []; VertexData.ComputeNormals(pos, idx, normals); vd.normals = normals;
    const beach = new Mesh("beachSand", scene); vd.applyToMesh(beach);
    const bm = mat("beachSand", "#f1dcb0", dirtTexture(scene, mulberry32(7)));
    beach.material = bm; beach.receiveShadows = true; beach.isPickable = false;
    // invisible collision tiles (small meshes keep Babylon's per-triangle collision cheap)
    const T = 36;
    for (let z = -ext; z < ext; z += T) for (let x = -ext; x < ext; x += T) {
      let any = false;
      for (const [sx, sz] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) { const px = x + sx * T, pz = z + sz * T; if (!(inLandCell(px, pz) && cellIndex(px, pz)) && coastDist(px, pz) > -40) any = true; }
      if (!any) continue;
      const g = MeshBuilder.CreateGround("solid", { width: T, height: T, subdivisions: 6, updatable: true }, scene);
      g.position.set(x + T / 2, 0, z + T / 2);
      const p = g.getVerticesData("position")!;
      for (let v = 0; v < p.length; v += 3) p[v + 1] = sandH(p[v] + x + T / 2, p[v + 2] + z + T / 2);
      g.updateVerticesData("position", p); g.refreshBoundingInfo();
      g.isVisible = false; g.checkCollisions = true; g.isPickable = true; g.freezeWorldMatrix();
      colliders.push(g);
    }
  }
  const at = asphalt.diffuseTexture as Texture;
  at.uScale = at.vScale = 7;
  void sandTile;

  // lane dashes + zebra crossings
  for (let k = 0; k <= N; k++) {
    const c = roadCenter(k);
    for (let i = 0; i < N; i++) {
      const a = blockMin(i), bEnd = a + BLOCK;
      const vLand = cellLand(k - 1, i) || cellLand(k, i); // vertical road x=c beside cell row i
      const hLand = cellLand(i, k - 1) || cellLand(i, k); // horizontal road z=c beside cell column i
      for (let t = a + 4; t < bEnd - 4; t += 6) {
        if (vLand) box(null, white, 0.15, 0.02, 3, c, 0.01, t + 1.5);
        if (hLand) box(null, white, 3, 0.02, 0.15, t + 1.5, 0.01, c);
      }
      // zebra at both ends of each road segment
      for (const zEnd of [a + 1.5, bEnd - 1.5]) {
        for (let s = -ROAD / 2 + 1.2; s < ROAD / 2 - 1; s += 1.1) {
          if (vLand) box(null, white, 0.55, 0.02, 2.2, c + s, 0.012, zEnd);
          if (hLand) box(null, white, 2.2, 0.02, 0.55, zEnd, 0.012, c + s);
        }
      }
    }
  }

  // ---------- blocks ----------
  const landBlocks: { x0: number; z0: number }[] = [];
  const shops: ShopSpot[] = [];
  // 10 walk-in shops (2 of each kind), spread over the island: greedy farthest-point pick over land blocks
  const shopBlocks = new Set<number>();
  {
    const cand: [number, number][] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (CELLS[i][j] === "land" && !(i === MAIDAN && j === MAIDAN) && cellLand(i, j + 1)) cand.push([i, j]);
    const picked: [number, number][] = [[MAIDAN, MAIDAN]];
    for (let k = 0; k < 10 && cand.length; k++) {
      let best = 0, bd = -1;
      cand.forEach(([i, j], c) => { const d = Math.min(...picked.map(([a, b]) => Math.hypot(a - i, b - j))) + rng() * 0.6; if (d > bd) { bd = d; best = c; } });
      const [i, j] = cand.splice(best, 1)[0];
      picked.push([i, j]); shopBlocks.add(i * 100 + j);
    }
  }
  const wireLines: Vector3[][] = [];
  const lots: { x: number; z: number; rot: number; len: number }[] = [];
  for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
    const x0 = blockMin(bi), z0 = blockMin(bj);
    const cx = x0 + BLOCK / 2, cz = z0 + BLOCK / 2;
    if (bi === MAIDAN && bj === MAIDAN) { buildMaidan(cx, cz); continue; }
    if (CELLS[bi][bj] === "sand") {
      for (let k = 0; k < 4; k++) { const x = cx + range(rng, -16, 16), z = cz + range(rng, -16, 16); if (coastDist(x, z) > 16) tree(x, z, range(rng, 0.9, 1.2)); }
      continue;
    }
    if (CELLS[bi][bj] !== "land") continue;
    landBlocks.push({ x0, z0 });
    const shopHere = shopBlocks.has(bi * 100 + bj);
    const district = shopHere ? 1 : rng();
    if (district < 0.13) { buildPark(x0, z0, cx, cz); continue; }
    if (district < 0.25) { buildBazaar(x0, z0, cx, cz); continue; }

    // footpath slab with a curb
    box(null, paver, BLOCK, CURB, BLOCK, cx, CURB / 2, cz, Array(6).fill(new Vector4(0, 0, BLOCK / 4, BLOCK / 4)));
    solid(BLOCK, CURB, BLOCK, cx, CURB / 2, cz);
    // curb paint (black-yellow, very desi)
    for (const [w, d, x, z] of [[BLOCK, 0.25, cx, z0], [BLOCK, 0.25, cx, z0 + BLOCK], [0.25, BLOCK, x0, cz], [0.25, BLOCK, x0 + BLOCK, cz]] as const)
      box(null, yellow, w + 0.02, CURB + 0.02, d, x, CURB / 2, z);
    rects.push({ minX: x0, minZ: z0, maxX: x0 + BLOCK, maxZ: z0 + BLOCK, kind: "block" });

    // four street-facing sides: [frontage centre x, z, rotation (outward normal), frontage length]
    const inner = BLOCK - 2 * FOOT;
    const sides = [
      { x: cx, z: z0 + BLOCK - FOOT, rot: 0, len: inner },                 // north, faces +z
      { x: cx, z: z0 + FOOT, rot: Math.PI, len: inner },                   // south, faces -z
      { x: x0 + BLOCK - FOOT, z: cz, rot: Math.PI / 2, len: inner - 26 },  // east, faces +x
      { x: x0 + FOOT, z: cz, rot: -Math.PI / 2, len: inner - 26 },         // west, faces -x
    ];
    for (const s of sides) {
      lots.push(s); fillSide(s.x, s.z, s.rot, s.len, s.len === inner ? 13 : 11);
      // a few frontages become walk-in shops (no kiosk blocking the door)
      if (shopHere && s.rot === 0) {
        shops.push({ kind: SHOP_KINDS[shops.length % SHOP_KINDS.length], x: s.x + Math.sin(s.rot) * 1.4, z: s.z + Math.cos(s.rot) * 1.4, rot: s.rot });
        continue;
      }
      // a tapri or two on the footpath, near the kerb, facing the walkers
      for (let k = 0; k < (rng() < 0.5 ? 1 : 2); k++) {
        const along = range(rng, -s.len / 2 + 3, s.len / 2 - 3), nx = Math.sin(s.rot), nz = Math.cos(s.rot), tx = Math.cos(s.rot), tz = -Math.sin(s.rot);
        kiosk(Math.floor(rng() * KIOSKS.length), s.x + nx * 2.45 + tx * along, s.z + nz * 2.45 + tz * along, s.rot + Math.PI);
      }
    }
    // electric poles along the curb
    poles(x0, z0);
  }

  function fillSide(fx: number, fz: number, rot: number, len: number, maxDepth: number) {
    let cursor = -len / 2;
    while (cursor < len / 2 - 4) {
      let w = range(rng, 6, 11);
      if (cursor + w > len / 2) w = len / 2 - cursor;
      if (w < 4) break;
      const lx = cursor + w / 2;
      const n = node(fx, fz, rot);
      // translate within the side frame
      const sub = new TransformNode("lot", scene);
      sub.parent = n; sub.position.x = lx;
      tmpNodes.push(sub);
      building(sub, w, range(rng, 9, maxDepth));
      cursor += w + (rng() < 0.18 ? range(rng, 1.8, 3) : 0); // occasional narrow galli
    }
  }

  function building(p: TransformNode, w: number, d: number) {
    const floors = 1 + Math.floor(Math.pow(rng(), 1.3) * 5) + (rng() < 0.15 ? 2 : 0);
    const h = floors * FLOOR_H + 0.4;
    const fm = pick(rng, facadeMats);
    const tile = (u: number, v: number) => new Vector4(0, 0, u / 3, v / FLOOR_H);
    box(p, fm, w, h, d, 0, h / 2, -d / 2, [tile(w, h), tile(w, h), tile(d, h), tile(d, h), solidUV, solidUV]);
    collider(p, w, h, d, 0, h / 2, -d / 2);
    // roof slab + parapet
    box(p, concrete, w + 0.3, 0.22, d + 0.3, 0, h + 0.11, -d / 2);
    const pu = Array(6).fill(solidUV);
    box(p, fm, w, 0.9, 0.18, 0, h + 0.67, -0.09, pu);
    box(p, fm, w, 0.9, 0.18, 0, h + 0.67, -d + 0.09, pu);
    box(p, fm, 0.18, 0.9, d, -w / 2 + 0.09, h + 0.67, -d / 2, pu);
    box(p, fm, 0.18, 0.9, d, w / 2 - 0.09, h + 0.67, -d / 2, pu);

    // ground floor shop
    if (rng() < 0.88) {
      const open = rng() < 0.55;
      plane(p, shutter, w - 0.6, 2.6, 0, 1.3, 0.03, open ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1]);
      const si = Math.floor(rng() * SIGNS.length);
      box(p, darkConcrete, w - 0.3, 1.0, 0.12, 0, 3.05, 0.06);
      plane(p, rng() < 0.5 ? signs : signs2, w - 0.4, 0.9, 0, 3.05, 0.13, atlasUV(si, 4, 4));
      if (rng() < 0.45) { // tarpaulin awning
        const a = box(p, pick(rng, tarps), w - 0.4, 0.05, 1.5, 0, 2.55, 0.75);
        a.rotation.x = -0.28;
      }
    }
    // balconies
    if (floors > 1 && rng() < 0.6) {
      const bw = w * range(rng, 0.5, 0.8);
      for (let f = 1; f < floors; f++) {
        box(p, concrete, bw, 0.15, 1.1, 0, f * FLOOR_H, 0.55);
        box(p, fm, bw, 0.9, 0.1, 0, f * FLOOR_H + 0.52, 1.05, Array(6).fill(solidUV));
        if (rng() < 0.4) box(p, pick(rng, tarps), bw * 0.6, 0.6, 0.02, 0, f * FLOOR_H + 1.25, 1.0); // drying clothes
      }
    }
    // roof clutter: Sintex tank, rebar, dish
    if (rng() < 0.8) {
      const tx = range(rng, -w / 2 + 1, w / 2 - 1), tz = range(rng, -d + 1.2, -1.2);
      cyl(p, concrete, 1.6, 0.5, tx, h + 0.47, tz, 4);
      cyl(p, black, 1.2, 1.3, tx, h + 1.37, tz, 14);
      cyl(p, black, 0.4, 0.15, tx, h + 2.08, tz, 10);
    }
    if (rng() < 0.3) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = sx * (w / 2 - 0.4), z = -d / 2 + sz * (d / 2 - 0.4);
        cyl(p, darkConcrete, 0.35, 0.6, x, h + 0.52, z, 4);
        for (const o of [-0.08, 0.08]) cyl(p, rebar, 0.03, 1.5, x + o, h + 1.5, z + o, 4);
      }
    }
    if (rng() < 0.3) {
      const dish = cyl(p, white, 0.7, 0.08, range(rng, -w / 2 + 0.6, w / 2 - 0.6), h + 1.0, -0.8, 12);
      dish.rotation.x = 1.0;
    }
    // rooftop hoarding
    if (floors >= 4 && rng() < 0.35) {
      const bw = Math.min(9, w + 1), bh = bw / 2;
      for (const s of [-1, 1]) box(p, darkConcrete, 0.15, bh + 2, 0.15, s * bw * 0.4, h + (bh + 2) / 2, -1.5);
      box(p, darkConcrete, bw + 0.2, bh + 0.2, 0.1, 0, h + 2 + bh / 2, -1.58);
      plane(p, ads, bw, bh, 0, h + 2 + bh / 2, -1.5, atlasUV(Math.floor(rng() * ADS.length), 2, 2));
    }
  }

  // ---------- electric poles & wires ----------
  function poles(x0: number, z0: number) {
    const inset = 0.5;
    const runs: [Vector3, Vector3][] = [
      [new Vector3(x0 + 3, 0, z0 + inset), new Vector3(x0 + BLOCK - 3, 0, z0 + inset)],
      [new Vector3(x0 + 3, 0, z0 + BLOCK - inset), new Vector3(x0 + BLOCK - 3, 0, z0 + BLOCK - inset)],
      [new Vector3(x0 + inset, 0, z0 + 3), new Vector3(x0 + inset, 0, z0 + BLOCK - 3)],
      [new Vector3(x0 + BLOCK - inset, 0, z0 + 3), new Vector3(x0 + BLOCK - inset, 0, z0 + BLOCK - 3)],
    ];
    for (const [a, b] of runs) {
      if (rng() < 0.35) continue;
      const count = 3;
      let prev: Vector3 | null = null;
      for (let i = 0; i < count; i++) {
        const p = Vector3.Lerp(a, b, i / (count - 1));
        const along = b.subtract(a).normalize();
        const crossX = Math.abs(along.x) > 0.5;
        box(null, concrete, 0.22, 8.5, 0.22, p.x, 4.25 + CURB, p.z);
        box(null, darkConcrete, crossX ? 0.12 : 1.8, 0.12, crossX ? 1.8 : 0.12, p.x, 8.2 + CURB, p.z);
        collider(null, 0.3, 8, 0.3, p.x, 4, p.z, "prop");
        if (prev) {
          for (const o of [-0.75, 0, 0.75]) {
            const off = crossX ? new Vector3(0, 0, o) : new Vector3(o, 0, 0);
            wireLines.push(catenary(prev.add(off).addInPlaceFromFloats(0, 8.3, 0), p.add(off).addInPlaceFromFloats(0, 8.3, 0), 0.7 + rng() * 0.5));
          }
        }
        // the inevitable tangle down to a shop
        if (rng() < 0.5) {
          const target = p.add(crossX ? new Vector3(range(rng, -3, 3), 0, 0) : new Vector3(0, 0, range(rng, -3, 3)));
          const toward = new Vector3(Math.sign(target.x - (x0 + BLOCK / 2)) * -1, 0, Math.sign(target.z - (z0 + BLOCK / 2)) * -1);
          wireLines.push(catenary(p.add(new Vector3(0, 8.0, 0)), target.add(toward.scale(3.2)).addInPlaceFromFloats(0, 5.2, 0), 0.5));
        }
        prev = p;
      }
    }
  }
  function catenary(a: Vector3, b: Vector3, sag: number) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const p = Vector3.Lerp(a, b, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
    }
    return pts;
  }

  // ---------- maidan (cricket ground) + clock tower ----------
  /** small street stalls: chai tapri, paan, fruit, sugarcane juice, vada pav, newspapers */
  function kiosk(type: number, x: number, z: number, rot: number) {
    const n = node(x, z, rot), k = KIOSKS[type], y0 = groundAt(x, z);
    box(n, kWood, 1.8, 0.95, 0.9, 0, y0 + 0.475, 0);
    for (const [px, pz] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) cyl(n, kWood, 0.06, 2.1, px, y0 + 1.05, pz, 5);
    const roof = box(n, pick(rng, tarps), 2.2, 0.06, 1.5, 0, y0 + 2.12, 0.1); roof.rotation.x = -0.15;
    plane(n, kioskSign, 1.7, 0.55, 0, y0 + 1.75, 0.5, atlasUV(type, 3, 2));
    const top = y0 + 0.95;
    if (type === 0) { // chai: kettle on a stove + glasses
      cyl(n, darkConcrete, 0.4, 0.2, -0.45, top + 0.1, 0, 10); cyl(n, kSteel, 0.3, 0.32, -0.45, top + 0.36, 0, 12, 0.18);
      for (let g = 0; g < 5; g++) cyl(n, kSteel, 0.07, 0.11, 0.1 + g * 0.13, top + 0.055, 0.15, 6);
    } else if (type === 2) { for (let f = 0; f < 10; f++) { const b = MeshBuilder.CreateIcoSphere("fruit", { radius: 0.11, subdivisions: 1 }, scene); b.position.set(-0.7 + (f % 5) * 0.32, top + 0.1 + Math.floor(f / 5) * 0.16, -0.1 + Math.floor(f / 5) * 0.12); b.parent = n; B.add(b, fruitMats[f % 4]); } }
    else if (type === 3) { box(n, kSteel, 0.5, 0.5, 0.5, 0.45, top + 0.25, 0); for (let g = 0; g < 6; g++) { const st = cyl(n, kGreen, 0.05, 1.7, -0.75 + g * 0.06, y0 + 0.85, -0.5, 5); st.rotation.x = 0.15; } }
    else if (type === 4) { box(n, kSteel, 1.0, 0.06, 0.5, 0, top + 0.03, 0); cyl(n, black, 0.55, 0.12, 0.55, top + 0.06, 0.05, 12); }
    else if (type === 5) { for (let g = 0; g < 4; g++) box(n, white, 0.35, 0.12 + g * 0.03, 0.25, -0.6 + g * 0.4, top + 0.06, 0); }
    else box(n, kSteel, 0.9, 0.18, 0.4, 0, top + 0.09, 0);
    void k;
    collider(n, 1.9, 2.2, 1.0, 0, 1.1, 0, "prop");
  }

  function buildPark(x0: number, z0: number, cx: number, cz: number) {
    box(null, grass, BLOCK, CURB, BLOCK, cx, CURB / 2, cz, Array(6).fill(new Vector4(0, 0, 1, 1)));
    solid(BLOCK, CURB, BLOCK, cx, CURB / 2, cz);
    rects.push({ minX: x0, minZ: z0, maxX: x0 + BLOCK, maxZ: z0 + BLOCK, kind: "park" });
    // fountain + paths
    box(null, paver, 3, 0.02, BLOCK - 6, cx, CURB + 0.01, cz); box(null, paver, BLOCK - 6, 0.02, 3, cx, CURB + 0.01, cz);
    cyl(null, concrete, 7, 0.6, cx, CURB + 0.3, cz, 24); cyl(null, mat("fountainWater", "#4fc3f7"), 6.2, 0.62, cx, CURB + 0.32, cz, 24);
    cyl(null, concrete, 0.7, 2.2, cx, CURB + 1.1, cz, 10);
    collider(null, 7, 1, 7, cx, 0.5, cz, "prop");
    for (let t = 0; t < 10; t++) { const a = rng() * 6.28, r = range(rng, 9, 18); tree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, range(rng, 0.9, 1.3)); }
    for (const [dx, dz, ry] of [[-6, 0, Math.PI / 2], [6, 0, -Math.PI / 2], [0, -6, 0], [0, 6, Math.PI]]) {
      const n = node(cx + dx * 1.6, cz + dz * 1.6, ry);
      box(n, kWood, 2, 0.08, 0.5, 0, CURB + 0.45, 0); box(n, kWood, 2, 0.5, 0.08, 0, CURB + 0.75, -0.25);
      for (const lx of [-0.85, 0.85]) box(n, darkConcrete, 0.08, 0.45, 0.45, lx, CURB + 0.22, 0);
    }
    poles(x0, z0);
  }

  function buildBazaar(x0: number, z0: number, cx: number, cz: number) {
    box(null, paver, BLOCK, CURB, BLOCK, cx, CURB / 2, cz, Array(6).fill(new Vector4(0, 0, BLOCK / 4, BLOCK / 4)));
    solid(BLOCK, CURB, BLOCK, cx, CURB / 2, cz);
    rects.push({ minX: x0, minZ: z0, maxX: x0 + BLOCK, maxZ: z0 + BLOCK, kind: "block" });
    // rows of stalls with walking lanes between them
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      if (rng() < 0.15) continue;
      kiosk(Math.floor(rng() * KIOSKS.length), x0 + 7 + c * 7.5, z0 + 8 + r * 9.5, r % 2 ? 0 : Math.PI);
    }
    poles(x0, z0);
  }

  function buildMaidan(cx: number, cz: number) {
    const x0 = cx - BLOCK / 2, z0 = cz - BLOCK / 2;
    box(null, dirt, BLOCK, CURB, BLOCK, cx, CURB / 2, cz, Array(6).fill(new Vector4(0, 0, 3, 3)));
    solid(BLOCK, CURB, BLOCK, cx, CURB / 2, cz);
    rects.push({ minX: x0, minZ: z0, maxX: x0 + BLOCK, maxZ: z0 + BLOCK, kind: "maidan" });
    // boundary wall with 4 gates
    const wallH = 1.1, gate = 6, seg = (BLOCK - gate) / 2;
    const uv = (l: number) => Array(6).fill(new Vector4(0, 0, l / 2, wallH / 1));
    for (const side of [0, 1, 2, 3]) {
      for (const s of [-1, 1]) {
        const off = s * (gate / 2 + seg / 2);
        const horiz = side < 2;
        const x = horiz ? cx + off : side === 2 ? x0 + 0.4 : x0 + BLOCK - 0.4;
        const z = horiz ? (side === 0 ? z0 + 0.4 : z0 + BLOCK - 0.4) : cz + off;
        const w = horiz ? seg : 0.3, d = horiz ? 0.3 : seg;
        box(null, brick, w, wallH, d, x, CURB + wallH / 2, z, uv(seg));
        collider(null, w, wallH + 0.5, d, x, (wallH + 0.5) / 2, z, "prop");
      }
    }
    // pitch + stumps
    box(null, mat("pitch", "#d8c08c"), 3, 0.02, 20, cx, CURB + 0.01, cz);
    for (const e of [-9, 9]) for (const o of [-0.12, 0, 0.12]) cyl(null, cream, 0.05, 0.7, cx + o, CURB + 0.35, cz + e, 6);
    // trees around the edge
    for (let i = 0; i < 14; i++) {
      const t = i / 14 * Math.PI * 2;
      tree(cx + Math.cos(t) * 18.5, cz + Math.sin(t) * 18.5, range(rng, 0.9, 1.3));
    }
    // clock tower (ghanta ghar) in the NE corner
    const tx = x0 + BLOCK - 7, tz = z0 + BLOCK - 7;
    box(null, terracotta, 6, 2, 6, tx, CURB + 1, tz);
    box(null, cream, 4, 18, 4, tx, CURB + 11, tz);
    for (let y = 4; y < 19; y += 4) box(null, terracotta, 4.3, 0.3, 4.3, tx, CURB + y, tz);
    box(null, terracotta, 5, 1, 5, tx, CURB + 20.5, tz);
    const roof = cyl(null, terracotta, 6.4, 4, tx, CURB + 23, tz, 4, 0);
    roof.rotation.y = Math.PI / 4;
    const clockTex = new DynamicTexture("clock", { width: 256, height: 256 }, scene, true);
    const c = clockTex.getContext() as unknown as CanvasRenderingContext2D;
    c.fillStyle = "#f8f3e3"; c.beginPath(); c.arc(128, 128, 120, 0, 7); c.fill();
    c.lineWidth = 10; c.strokeStyle = "#3b2a1a"; c.stroke();
    c.fillStyle = "#3b2a1a";
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.fillRect(128 + Math.cos(a) * 96 - 5, 128 + Math.sin(a) * 96 - 5, 10, 10); }
    c.lineCap = "round"; c.lineWidth = 9; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + 50, 128 - 30); c.stroke();
    c.lineWidth = 6; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 - 10, 128 - 85); c.stroke();
    clockTex.update(true);
    const clockMat = mat("clockFace", null, clockTex, "#444444");
    clockMat.diffuseTexture!.hasAlpha = false;
    for (let i = 0; i < 4; i++) {
      const n = node(tx, tz, (i * Math.PI) / 2);
      const p = MeshBuilder.CreateDisc("clock", { radius: 1.5, tessellation: 32 }, scene);
      p.position.set(0, CURB + 16.5, 2.03); p.rotation.y = Math.PI; p.parent = n;
      B.add(p, clockMat);
    }
    collider(null, 6, 24, 6, tx, 12, tz);
  }

  function tree(x: number, z: number, s: number) {
    cyl(null, trunk, 0.5 * s, 3.4 * s, x, CURB + 1.7 * s, z, 7, 0.35 * s);
    for (let i = 0; i < 3; i++) {
      const ball = MeshBuilder.CreateIcoSphere("leaf", { radius: range(rng, 1.6, 2.4) * s, subdivisions: 1, flat: true }, scene);
      ball.position.set(x + range(rng, -1, 1) * s, CURB + range(rng, 3.6, 4.8) * s, z + range(rng, -1, 1) * s);
      ball.scaling.y = 0.8;
      B.add(ball, pick(rng, leaves));
    }
    collider(null, 0.6 * s, 3, 0.6 * s, x, 1.5, z, "prop");
  }

  // ---------- parking spots along kerbs (vehicles are spawned by the vehicle system) ----------
  const parking: { x: number; z: number; heading: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const lot = pick(rng, lots);
    const along = range(rng, -lot.len / 2 + 3, lot.len / 2 - 3);
    const out = FOOT + 1.4; // just off the kerb on the road
    const nx = Math.sin(lot.rot), nz = Math.cos(lot.rot);
    const tx = Math.cos(lot.rot), tz = -Math.sin(lot.rot);
    const x = lot.x + nx * out + tx * along, z = lot.z + nz * out + tz * along;
    if (parking.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
    if (rects.some((r) => r.kind === "prop" && x > r.minX - 2 && x < r.maxX + 2 && z > r.minZ - 3 && z < r.maxZ + 3)) continue;
    parking.push({ x, z, heading: lot.rot + Math.PI / 2 + (rng() < 0.5 ? Math.PI : 0) });
  }
  // street trees on random footpaths
  for (let i = 0; i < 30; i++) {
    const lot = pick(rng, lots);
    const along = range(rng, -lot.len / 2 + 2, lot.len / 2 - 2);
    const nx = Math.sin(lot.rot), nz = Math.cos(lot.rot), tx = Math.cos(lot.rot), tz = -Math.sin(lot.rot);
    const x = lot.x + nx * (FOOT - 1.2) + tx * along, z = lot.z + nz * (FOOT - 1.2) + tz * along;
    if (rects.some((r) => r.kind === "prop" && x > r.minX - 1.5 && x < r.maxX + 1.5 && z > r.minZ - 1.5 && z < r.maxZ + 1.5)) continue;
    tree(x, z, range(rng, 0.8, 1.1));
  }

  // ---------- coast: beach, sea wall, jetty, helipad, stalls ----------
  // Marine-Drive style sea wall with gaps to walk/drive onto the sand
  const wallMat = mat("seawall", "#d9d4c7");
  for (let z = -HALF + 2; z < HALF - 2; z += 34) {
    const len = 26;
    if (!inLandCell(HALF - 2, z + 2) || !inLandCell(HALF - 2, z + len - 2)) continue;
    box(null, wallMat, 0.5, 0.7, len, HALF + 1.2, 0.35, z + len / 2);
    collider(null, 0.5, 0.7, len, HALF + 1.2, 0.35, z + len / 2, "prop");
  }
  // jetty with a ramp, posts and bollards
  const wood = mat("jettyWood", "#8a6440");
  const jl = JETTY.x1 - JETTY.x0;
  box(null, wood, jl, 0.25, JETTY.w, (JETTY.x0 + JETTY.x1) / 2, JETTY.deck - 0.12, JETTY.z);
  solid(jl, 0.25, JETTY.w, (JETTY.x0 + JETTY.x1) / 2, JETTY.deck - 0.12, JETTY.z);
  const ramp = box(null, wood, 5, 0.2, JETTY.w, JETTY.x0 - 2.4, JETTY.deck / 2 - 0.05, JETTY.z);
  ramp.rotation.z = Math.atan2(JETTY.deck, 5);
  const rampCol = solid(5.1, 0.2, JETTY.w, JETTY.x0 - 2.4, JETTY.deck / 2 - 0.05, JETTY.z); rampCol.rotation.z = ramp.rotation.z;
  for (let x = JETTY.x0 + 2; x < JETTY.x1; x += 6) for (const side of [-1, 1]) {
    cyl(null, darkConcrete, 0.3, 3, x, JETTY.deck - 1.5, JETTY.z + side * (JETTY.w / 2 - 0.15), 8);
  }
  rects.push({ minX: JETTY.x0, maxX: JETTY.x1, minZ: JETTY.z - JETTY.w / 2, maxZ: JETTY.z + JETTY.w / 2, kind: "jetty" });
  // helipad on the sand
  const hTex = new DynamicTexture("helipad", { width: 256, height: 256 }, scene, true);
  const hc = hTex.getContext() as unknown as CanvasRenderingContext2D;
  hc.fillStyle = "#3a3d42"; hc.beginPath(); hc.arc(128, 128, 126, 0, 7); hc.fill();
  hc.strokeStyle = "#ffd400"; hc.lineWidth = 10; hc.beginPath(); hc.arc(128, 128, 104, 0, 7); hc.stroke();
  hc.fillStyle = "#ffffff"; hc.font = "bold 150px Anton, Impact, sans-serif"; hc.textAlign = "center"; hc.textBaseline = "middle"; hc.fillText("H", 128, 136);
  hTex.update(); hTex.hasAlpha = true;
  const hMat = mat("helipadMat", null, hTex); hMat.useAlphaFromDiffuseTexture = true;
  const hz = 150, helipad = new Vector3(Math.min(HALF + 36, coastX(hz) - 16), 0.06, hz);
  const pad = MeshBuilder.CreateGround("helipad", { width: 18, height: 18 }, scene);
  pad.position.copyFrom(helipad); pad.material = hMat; pad.isPickable = false;
  // beach food stalls (Juhu chowpatty)
  const stallTex = new DynamicTexture("stallSigns", { width: 1024, height: 256 }, scene, true);
  const st = stallTex.getContext() as unknown as CanvasRenderingContext2D;
  [["PAV BHAJI", "#e65100"], ["BHEL PURI", "#2e7d32"], ["BARF KA GOLA", "#1565c0"], ["NARIYAL PAANI", "#6d4c41"]].forEach(([t, c], i) => {
    st.fillStyle = c; st.fillRect(i * 256, 0, 256, 256); st.fillStyle = "#fff"; st.textAlign = "center"; st.textBaseline = "middle";
    st.font = "bold 46px Anton, Impact, sans-serif"; st.fillText(t, i * 256 + 128, 100);
    st.font = "bold 30px Anton, Impact, sans-serif"; st.fillStyle = "#ffeb3b"; st.fillText("JUHU SPECIAL", i * 256 + 128, 180);
  });
  stallTex.update();
  const stallSign = mat("stallSign", null, stallTex, "#555555");
  const canopies = [mat("stallRed", "#c62828"), mat("stallYellow", "#f9a825"), mat("stallBlue", "#1565c0"), mat("stallGreen", "#2e7d32")];
  for (let i = 0; i < 8; i++) {
    const z = -HALF + 60 + i * ((SIZE - 120) / 7), x = HALF + 12;
    if (isWater(x + 3, z) || !inLandCell(HALF - 2, z)) continue;
    const n = node(x, z, -Math.PI / 2); // facing the sea
    box(n, wood, 3.2, 1.0, 1.6, 0, 0.5, 0);
    for (const [px, pz] of [[-1.5, -0.7], [1.5, -0.7], [-1.5, 0.7], [1.5, 0.7]]) cyl(n, darkConcrete, 0.08, 2.4, px, 1.2, pz, 6);
    const roof = box(n, canopies[i % 4], 3.6, 0.1, 2.2, 0, 2.45, 0); roof.rotation.x = 0.12;
    plane(n, stallSign, 3.2, 0.8, 0, 2.0, 0.85, [(i % 4) / 4, 0, (i % 4 + 1) / 4, 1]);
    collider(n, 3.4, 2.5, 1.8, 0, 1.25, 0, "prop");
  }

  // ---------- wires as one line system ----------
  const wires = MeshBuilder.CreateLineSystem("wires", { lines: wireLines }, scene);
  wires.color = new Color3(0.07, 0.07, 0.07);
  wires.isPickable = false;

  const meshes = B.merge();
  meshes.forEach((m) => (m.receiveShadows = true));
  for (const n of tmpNodes) if (n.getChildren().length === 0) n.dispose();

  const spawnZ = blockMin(MAIDAN) - ROAD / 2;
  // boats/jet skis moored along the jetty, supercars parked on the promenade
  const moorings = [
    // side by side (not nose-to-tail) so each can pull straight out to sea
    { x: JETTY.x0 + 30, z: JETTY.z + 6, heading: Math.PI / 2, kind: "boat" as const },
    { x: JETTY.x0 + 30, z: JETTY.z + 11, heading: Math.PI / 2, kind: "boat" as const },
    { x: JETTY.x0 + 26, z: JETTY.z - 4.5, heading: Math.PI / 2, kind: "jetski" as const },
    { x: JETTY.x0 + 26, z: JETTY.z - 7.5, heading: Math.PI / 2, kind: "jetski" as const },
    { x: JETTY.x0 + 26, z: JETTY.z - 10.5, heading: Math.PI / 2, kind: "jetski" as const },
  ];
  const look = (x: number, y: number, z: number) => new Vector3(x, y, z);
  return {
    size: SIZE,
    colliders,
    rects,
    spawn: new Vector3(blockMin(MAIDAN) + BLOCK / 2 + 2, 1, spawnZ),
    spawnYaw: 0,
    parking,
    moorings,
    helipad,
    shops,
    blocks: landBlocks,
    meshes,
    shots: [
      // low dolly down the main road towards the sun
      { from: look(roadCenter(1), 2.2, -HALF + 20), to: look(roadCenter(1), 3.2, -20), lookFrom: look(roadCenter(1) + 4, 4, 40), lookTo: look(roadCenter(1) + 2, 5, 80) },
      // crane over the maidan and clock tower
      { from: look(-30, 30, -50), to: look(10, 40, -40), lookFrom: look(10, 10, 10), lookTo: look(15, 14, 15) },
      // street-level orbit past rickshaws & shops
      { from: look(roadCenter(3) - 3, 1.6, blockMin(1) + 5), to: look(roadCenter(3) + 3, 2.4, blockMin(2) + 10), lookFrom: look(roadCenter(3) - 20, 4, blockMin(2) + 30), lookTo: look(roadCenter(3) + 20, 6, blockMin(3) + 10) },
      // sunset glide along the beach and jetty
      { from: look(HALF + 20, 6, -60), to: look(HALF + 34, 9, 40), lookFrom: look(SHORE + 60, 2, 0), lookTo: look(SHORE + 30, 2, 60) },
    ],
  };
}
