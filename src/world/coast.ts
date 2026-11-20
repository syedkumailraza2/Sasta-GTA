import {
  AbstractMesh, Color3, DynamicTexture, LoadAssetContainerAsync, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector2, Vector3, VertexData,
} from "@babylonjs/core";
import { WaterMaterial } from "@babylonjs/materials/water";
import "@babylonjs/loaders/glTF";
import { HALF, JETTY, coastR, coastX, isWater, inLandCell } from "./town";
import { mulberry32 } from "./rng";

/** Procedural tileable wave normal map (no external texture needed). */
function waveNormals(scene: Scene) {
  const S = 256, t = new DynamicTexture("waterBump", { width: S, height: S }, scene, true);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  const img = c.createImageData(S, S);
  const h = (x: number, y: number) => {
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    return Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 7 - v * 5) * 0.25 + Math.sin(u * 13 + v * 11) * 0.12 + Math.cos(v * 4 - u) * 0.3;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const n = new Vector3(-dx * 2, -dy * 2, 1).normalize();
    const i = (y * S + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  t.update();
  return t;
}

export function createSea(scene: Scene, reflect: AbstractMesh[]) {
  // a ring that starts just inside the waterline (under the sloping beach) and runs out to the horizon:
  // no sea surface under the town, so waves can never show through the streets
  const A = 360, rings = [-14, -8, -3, 2, 8, 16, 30, 55, 90, 140, 210, 300, 420, 600, 850, 1200];
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], nrm: number[] = [];
  for (let k = 0; k < A; k++) {
    const a = (k / A) * Math.PI * 2, r0 = coastR(a), ca = Math.cos(a), sa = Math.sin(a);
    for (const o of rings) { const r = r0 + o, x = ca * r, z = sa * r; pos.push(x, 0, z); nrm.push(0, 1, 0); uv.push(x / 1500 + 0.5, z / 1500 + 0.5); }
  }
  const R = rings.length;
  for (let k = 0; k < A; k++) for (let i = 0; i < R - 1; i++) {
    const a = k * R + i, b = ((k + 1) % A) * R + i;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const water = new Mesh("sea", scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv; vd.applyToMesh(water);
  water.position.y = -0.5; // sea level: the beach mesh slopes through it
  water.isPickable = false;
  const m = new WaterMaterial("seaMat", scene, new Vector2(512, 512));
  const bump = waveNormals(scene);
  bump.uScale = bump.vScale = 40;
  m.bumpTexture = bump;
  m.windForce = -6;
  m.windDirection = new Vector2(1, 0.3);
  m.waveHeight = 0.12;
  m.waveLength = 0.12;
  m.waveSpeed = 40;
  m.bumpHeight = 0.35;
  // lean on the water colour: the reflected sky is dark towards the east and turned the sea black
  m.waterColor = new Color3(0.12, 0.45, 0.55);
  m.colorBlendFactor = 0.75;
  m.waterColor2 = new Color3(0.2, 0.55, 0.6);
  m.colorBlendFactor2 = 0.45;
  m.backFaceCulling = true;
  for (const r of reflect) m.addToRenderList(r);
  water.material = m;
  return water;
}

const exists = async (url: string) => {
  try { const r = await fetch(url, { method: "HEAD" }); return r.ok && !(r.headers.get("content-type") ?? "").includes("html"); } catch { return false; }
};

/** Instance a downloaded prop (normalised to `height`), or return null so we build a procedural one. */
async function propFactory(scene: Scene, url: string, height: number) {
  if (!(await exists(url))) return null;
  const c = await LoadAssetContainerAsync(url, scene);
  const inst = c.instantiateModelsToScene((n) => `tpl_${n}`, false, { doNotInstantiate: true });
  const root = inst.rootNodes[0] as TransformNode;
  for (const m of root.getChildMeshes()) if (/shadow|ground|floor|plane/i.test(m.name)) m.dispose();
  root.computeWorldMatrix(true);
  const { min, max } = root.getHierarchyBoundingVectors(true);
  const s = height / Math.max(0.01, max.y - min.y);
  const holder = new TransformNode("propHolder", scene);
  root.parent = holder; holder.scaling.setAll(s); holder.position.set(-(min.x + max.x) / 2 * s, -min.y * s, -(min.z + max.z) / 2 * s);
  holder.computeWorldMatrix(true);
  // MergeMeshes needs identical vertex layouts: merge per layout group
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
    merged.isVisible = false; merged.isPickable = false;
    parts.push(merged);
  }
  holder.dispose();
  if (!parts.length) return null;
  return (pos: Vector3, yaw: number, scale = 1) => {
    const n = new TransformNode("prop", scene);
    n.position.copyFrom(pos); n.rotation.y = yaw; n.scaling.setAll(scale);
    for (const t of parts) { const i = t.createInstance("propPart"); i.parent = n; i.isPickable = false; }
    return n;
  };
}

/** Palms, umbrellas and a lifeguard tower along the beach. Returns colliders for the big ones. */
export async function decorateBeach(scene: Scene): Promise<AbstractMesh[]> {
  const rng = mulberry32(99);
  const colliders: AbstractMesh[] = [];
  const solid = (w: number, h: number, d: number, p: Vector3) => {
    const c = MeshBuilder.CreateBox("collider", { width: w, height: h, depth: d }, scene);
    c.position.set(p.x, h / 2, p.z); c.isVisible = false; c.checkCollisions = true; c.isPickable = true;
    colliders.push(c);
  };
  // a broken download must never stop the game from loading: fall back to procedural props
  const safe = (p: Promise<ReturnType<typeof propFactory> extends Promise<infer T> ? T : never>) => p.catch((e) => { console.warn("[beach] prop failed", e); return null; });
  const [palm, umbrella, tower] = await Promise.all([
    safe(propFactory(scene, "assets/props/palm.glb", 9)),
    safe(propFactory(scene, "assets/props/umbrella.glb", 2.6)),
    safe(propFactory(scene, "assets/props/lifeguard.glb", 5)),
  ]);

  // procedural fallbacks
  const trunkMat = new StandardMaterial("palmTrunk", scene); trunkMat.diffuseColor = Color3.FromHexString("#7a5a3a");
  const leafMat = new StandardMaterial("palmLeaf", scene); leafMat.diffuseColor = Color3.FromHexString("#3d7a2a"); leafMat.backFaceCulling = false;
  const proceduralPalm = (p: Vector3, yaw: number) => {
    const n = new TransformNode("palm", scene); n.position.copyFrom(p); n.rotation.y = yaw;
    let y = 0, x = 0;
    for (let i = 0; i < 6; i++) {
      const seg = MeshBuilder.CreateCylinder("pt", { height: 1.6, diameterTop: 0.32, diameterBottom: 0.38, tessellation: 8 }, scene);
      seg.material = trunkMat; seg.parent = n; seg.position.set(x, y + 0.8, 0); seg.rotation.z = -0.06 * i; y += 1.55; x += 0.1 * i;
    }
    for (let i = 0; i < 7; i++) {
      const leaf = MeshBuilder.CreatePlane("leaf", { width: 0.9, height: 3.6 }, scene);
      leaf.material = leafMat; leaf.parent = n; leaf.position.set(x, y + 0.2, 0);
      leaf.rotation.set(1.1, (i / 7) * Math.PI * 2, 0); leaf.setPivotPoint(new Vector3(0, -1.8, 0));
    }
  };
  const stripes = new DynamicTexture("umbStripes", { width: 256, height: 32 }, scene, true);
  const sc = stripes.getContext() as unknown as CanvasRenderingContext2D;
  ["#e53935", "#ffffff", "#1e88e5", "#ffffff", "#fdd835", "#ffffff", "#43a047", "#ffffff"].forEach((c, i) => { sc.fillStyle = c; sc.fillRect(i * 32, 0, 32, 32); });
  stripes.update();
  const umbMat = new StandardMaterial("umb", scene); umbMat.diffuseTexture = stripes; umbMat.backFaceCulling = false;
  const proceduralUmbrella = (p: Vector3) => {
    const pole = MeshBuilder.CreateCylinder("umbPole", { height: 2.4, diameter: 0.06 }, scene);
    pole.position.set(p.x, 1.2, p.z); pole.material = trunkMat;
    const top = MeshBuilder.CreateCylinder("umbTop", { height: 0.6, diameterTop: 0, diameterBottom: 2.6, tessellation: 16 }, scene);
    top.position.set(p.x, 2.5, p.z); top.material = umbMat;
  };

  // palms along the promenade and dotted on the sand
  for (let z = -HALF + 20; z < HALF - 20; z += 18 + rng() * 10) {
    const p = new Vector3(HALF + 6 + rng() * 4, 0.03, z);
    if (Math.abs(z - JETTY.z) < 6 || isWater(p.x + 2, z) || !inLandCell(HALF - 2, z)) continue;
    if (palm) palm(p, rng() * 6.28, 0.85 + rng() * 0.3); else proceduralPalm(p, rng() * 6.28);
    solid(0.6, 4, 0.6, p);
  }
  // umbrellas near the water
  for (let i = 0; i < 26; i++) {
    const z = -HALF + 30 + rng() * (2 * HALF - 60);
    if (Math.abs(z - JETTY.z) < 8) continue;
    const sx = coastX(z), p = new Vector3(Math.max(HALF + 8, sx - 25 + rng() * 16), 0.03, z);
    if (sx - HALF < 22) continue;
    if (umbrella) umbrella(p, rng() * 6.28, 0.9 + rng() * 0.2); else proceduralUmbrella(p);
  }
  // lifeguard towers
  for (const z of [-HALF + 80, -40, 70, HALF - 120]) {
    const sx = coastX(z);
    if (sx - HALF < 26) continue;
    const p = new Vector3(sx - 12, 0.03, z);
    if (tower) tower(p, -Math.PI / 2);
    else {
      const m = new StandardMaterial("lg", scene); m.diffuseColor = Color3.FromHexString("#e53935");
      const cab = MeshBuilder.CreateBox("lgCab", { width: 2.4, height: 1.8, depth: 2.4 }, scene); cab.position.set(p.x, 3.4, p.z); cab.material = m;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = MeshBuilder.CreateCylinder("lgLeg", { height: 2.5, diameter: 0.12 }, scene); leg.position.set(p.x + dx, 1.25, p.z + dz); leg.material = trunkMat; }
    }
    solid(2.6, 5, 2.6, p);
  }
  return colliders;
}
