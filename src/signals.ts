import { Color3, InstancedMesh, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { neighbours, nodePos, type Node } from "./nav";
import { N, ROAD, BLOCK, groundAt, cellLand, segmentLand, roadCenter, KERB } from "./world/town";
import type { Vehicle } from "./vehicles";

/** which way traffic is moving: along world X or along world Z */
export type Axis = "x" | "z";
type Light = "green" | "yellow" | "red";
type Prop = {
  kind: "signal" | "lamp";
  node: TransformNode; collider: Mesh; x: number; z: number;
  down: boolean; fall: { axis: Vector3; t: number; v: number } | null; downT: number;
  bulbs: InstancedMesh[];
};

const CYCLE = 26, GREEN = 11, YELLOW = 2; // seconds: X green, X yellow, Z green, Z yellow

/**
 * Traffic lights at every junction where 3+ roads meet (cars and pedestrians obey them), plus street lamps.
 * Everything is instanced (few draw calls) and knockable: a vehicle that hits a pole at speed sends it flying.
 */
export class Signals {
  private t = 0;
  private props: Prop[] = [];
  /** junction centre -> true (has lights) */
  private junctions: { x: number; z: number }[] = [];
  /** shared bulb materials: [axis][colour] */
  private mats: Record<Axis, Record<Light, StandardMaterial>>;
  onKnock: (p: { kind: "signal" | "lamp"; x: number; z: number }, v: Vehicle, speed: number) => void = () => {};

  constructor(private scene: Scene) {
    const mk = (name: string, hex: string) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex); m.specularColor = new Color3(0.2, 0.2, 0.2); return m; };
    const dark = mk("sigPole", "#2b2d30"), housing = mk("sigHousing", "#151617"), lampHead = mk("lampHead", "#fff3c4");
    lampHead.emissiveColor = new Color3(0.9, 0.8, 0.45);
    const bulb = (name: string) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); return m; };
    this.mats = {
      x: { red: bulb("sxR"), yellow: bulb("sxY"), green: bulb("sxG") },
      z: { red: bulb("szR"), yellow: bulb("szY"), green: bulb("szG") },
    };
    // source meshes (hidden), every prop is built from instances of these
    const src = (m: Mesh, mat: StandardMaterial) => { m.material = mat; m.isVisible = false; m.isPickable = false; m.alwaysSelectAsActiveMesh = false; return m; };
    const pole = src(MeshBuilder.CreateCylinder("sigPoleSrc", { height: 4.2, diameter: 0.16, tessellation: 8 }, scene), dark);
    const arm = src(MeshBuilder.CreateBox("sigArmSrc", { width: 0.1, height: 0.1, depth: 1.6 }, scene), dark);
    const box = src(MeshBuilder.CreateBox("sigBoxSrc", { width: 0.36, height: 1.0, depth: 0.36 }, scene), housing);
    const bulbs: Record<Axis, Record<Light, Mesh>> = {
      x: { red: src(MeshBuilder.CreateSphere("sxRs", { diameter: 0.24, segments: 6 }, scene), this.mats.x.red), yellow: src(MeshBuilder.CreateSphere("sxYs", { diameter: 0.24, segments: 6 }, scene), this.mats.x.yellow), green: src(MeshBuilder.CreateSphere("sxGs", { diameter: 0.24, segments: 6 }, scene), this.mats.x.green) },
      z: { red: src(MeshBuilder.CreateSphere("szRs", { diameter: 0.24, segments: 6 }, scene), this.mats.z.red), yellow: src(MeshBuilder.CreateSphere("szYs", { diameter: 0.24, segments: 6 }, scene), this.mats.z.yellow), green: src(MeshBuilder.CreateSphere("szGs", { diameter: 0.24, segments: 6 }, scene), this.mats.z.green) },
    };
    const lampPole = src(MeshBuilder.CreateCylinder("lampPoleSrc", { height: 6, diameterTop: 0.1, diameterBottom: 0.18, tessellation: 8 }, scene), dark);
    const lampArm = src(MeshBuilder.CreateBox("lampArmSrc", { width: 0.08, height: 0.08, depth: 1.4 }, scene), dark);
    const lampHeadM = src(MeshBuilder.CreateBox("lampHeadSrc", { width: 0.34, height: 0.14, depth: 0.6 }, scene), lampHead);

    const inst = (s: Mesh, parent: TransformNode, x: number, y: number, z: number) => {
      const i = s.createInstance(`${s.name}_i`); i.parent = parent; i.position.set(x, y, z); i.isPickable = false;
      i.metadata = { noShadow: true };
      return i;
    };
    const makeProp = (kind: Prop["kind"], x: number, z: number) => {
      const node = new TransformNode(kind, scene);
      node.position.set(x, groundAt(x, z), z);
      node.rotationQuaternion = Quaternion.Identity();
      const c = MeshBuilder.CreateBox("knockCol", { width: 0.4, height: 3, depth: 0.4 }, scene);
      c.position.set(x, 1.5 + node.position.y, z); c.isVisible = false; c.checkCollisions = true; c.isPickable = false;
      c.collisionGroup = 2; // walkers bump into it; vehicles (mask ~2) knock it over instead
      const p: Prop = { kind, node, collider: c, x, z, down: false, fall: null, downT: 0, bulbs: [] };
      this.props.push(p);
      return p;
    };

    // ---- signals: two poles per junction (diagonal corners), each with a head for each axis
    const off = ROAD / 2 + 1.0;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const n: Node = { i, j };
      if (neighbours(n).length < 3) continue;
      const c = nodePos(n);
      this.junctions.push({ x: c.x, z: c.z });
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        const px = c.x + sx * off, pz = c.z + sz * off;
        if (groundAt(px, pz) < 0) continue;
        const p = makeProp("signal", px, pz);
        inst(pole, p.node, 0, 2.1, 0);
        // head for X-axis traffic hangs over the road along Z from this corner, and vice versa
        const armZ = inst(arm, p.node, 0, 4.0, -sz * 0.8); void armZ;
        const armX = inst(arm, p.node, -sx * 0.8, 4.0, 0); armX.rotation.y = Math.PI / 2;
        for (const [ax, hx, hz] of [["z", 0, -sz * 1.5], ["x", -sx * 1.5, 0]] as const) {
          inst(box, p.node, hx, 3.6, hz);
          (["red", "yellow", "green"] as Light[]).forEach((col, k) => {
            // one round bulb through the housing: visible to drivers from both directions
            const b = inst(bulbs[ax][col], p.node, hx, 3.95 - k * 0.32, hz);
            b.scaling.set(ax === "x" ? 1.7 : 1, 1, ax === "z" ? 1.7 : 1);
            p.bulbs.push(b);
          });
        }
      }
    }
    // ---- street lamps: one per land road segment, on the footpath
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        const a = { i, j }, b = { i: i + di, j: j + dj };
        if (b.i > N || b.j > N || !segmentLand(a, b)) continue;
        const mid = nodePos(a).add(nodePos(b)).scale(0.5);
        // stand on whichever side has a land block
        const sideOk = (s: number) => di ? cellLand(i, j - (s < 0 ? 1 : 0)) : cellLand(i - (s < 0 ? 1 : 0), j);
        const s = sideOk(1) ? 1 : sideOk(-1) ? -1 : 0;
        if (!s) continue;
        const x = mid.x + (dj ? s * (ROAD / 2 + 0.6) : 7), z = mid.z + (di ? s * (ROAD / 2 + 0.6) : 7);
        const p = makeProp("lamp", x, z);
        inst(lampPole, p.node, 0, 3, 0);
        const ax = di ? 0 : -s * 0.6, az = di ? -s * 0.6 : 0;
        const la = inst(lampArm, p.node, ax, 5.9, az); if (!di) la.rotation.y = Math.PI / 2;
        const lh = inst(lampHeadM, p.node, ax * 2, 5.85, az * 2); if (!di) lh.rotation.y = Math.PI / 2;
        p.bulbs.push(lh);
      }
    }
    void BLOCK; void roadCenter; void KERB;
    // static until knocked: frozen world matrices keep ~2k instances cheap
    for (const p of this.props) this.freeze(p, true);
  }

  private freeze(p: Prop, on: boolean) {
    p.node.computeWorldMatrix(true);
    const kids = p.node.getChildMeshes(true);
    if (on) { p.node.freezeWorldMatrix(); for (const k of kids) { k.computeWorldMatrix(true); k.freezeWorldMatrix(); } p.collider.freezeWorldMatrix(); }
    else { p.node.unfreezeWorldMatrix(); for (const k of kids) k.unfreezeWorldMatrix(); }
  }

  light(axis: Axis): Light {
    const t = this.t % CYCLE;
    const xPhase = t < GREEN ? "green" : t < GREEN + YELLOW ? "yellow" : "red";
    const zPhase = t < GREEN + YELLOW ? "red" : t < 2 * GREEN + YELLOW ? "green" : t < CYCLE ? "yellow" : "red";
    return axis === "x" ? xPhase : zPhase;
  }

  /**
   * Should a vehicle at `p` heading `f` stop for a light? True when a junction is just ahead (before its stop
   * line) and the light for its direction is red, or yellow with room to stop.
   */
  mustStop(p: Vector3, f: Vector3, speed: number) {
    const axis: Axis = Math.abs(f.x) > Math.abs(f.z) ? "x" : "z";
    const l = this.light(axis);
    if (l === "green") return false;
    const stopLine = ROAD / 2 + 1.5;
    for (const j of this.junctions) {
      const dx = j.x - p.x, dz = j.z - p.z;
      const along = dx * f.x + dz * f.z, lat = Math.abs(dx * f.z - dz * f.x);
      if (lat > ROAD / 2 + 1 || along < stopLine || along > stopLine + 10) continue;
      if (l === "yellow" && along < stopLine + Math.min(6, speed * 0.6)) return false; // too close to stop: go through
      return true;
    }
    return false;
  }

  /** may a pedestrian at `p` cross a road in direction `axis` right now? (needs the crossing traffic stopped) */
  canWalk(p: Vector3, axis: Axis) {
    const near = this.junctions.find((j) => Math.abs(j.x - p.x) < ROAD + 4 && Math.abs(j.z - p.z) < ROAD + 4);
    if (!near) return true;
    // walking along X crosses a road whose traffic moves along Z
    return this.light(axis === "x" ? "z" : "x") === "red";
  }

  update(dt: number, vehicles: Vehicle[], focus: Vector3) {
    this.t += dt;
    for (const ax of ["x", "z"] as Axis[]) {
      const l = this.light(ax);
      const on = (c: Light) => (c === l ? (c === "red" ? new Color3(1.6, 0.08, 0.05) : c === "yellow" ? new Color3(1.5, 0.95, 0.05) : new Color3(0.1, 1.5, 0.3)) : new Color3(0.05, 0.05, 0.05));
      for (const c of ["red", "yellow", "green"] as Light[]) this.mats[ax][c].emissiveColor = on(c);
    }
    for (const p of this.props) {
      if (p.down) {
        // falling: angular velocity grows like a toppling pole, bounces once on the ground
        if (p.fall && p.fall.v === 0) { this.freeze(p, true); p.fall.v = -1e9; }
        if (p.fall && p.fall.v > -1e8 && p.fall.t < Math.PI / 2) {
          p.fall.v += dt * 9; p.fall.t = Math.min(Math.PI / 2 - 0.04, p.fall.t + p.fall.v * dt);
          if (p.fall.t >= Math.PI / 2 - 0.05) {
            if (p.fall.v > 1) { p.fall.v = -p.fall.v * 0.25; p.fall.t = Math.PI / 2 - 0.06; }
            else if (p.fall.v > 0) { p.node.rotationQuaternion = Quaternion.RotationAxis(p.fall.axis, p.fall.t); p.fall.v = 0; continue; } // at rest
          }
          p.node.rotationQuaternion = Quaternion.RotationAxis(p.fall.axis, p.fall.t);
        }
        // the municipality puts it back up once you're gone
        if ((p.downT += dt) > 90 && Vector3.DistanceSquared(focus, p.node.position) > 70 * 70) {
          p.down = false; p.fall = null; p.node.rotationQuaternion = Quaternion.Identity(); p.collider.setEnabled(true); p.bulbs.forEach((b) => b.setEnabled(true));
          this.freeze(p, true);
        }
        continue;
      }
      if (Vector3.DistanceSquared(focus, p.node.position) > 120 * 120) continue;
      for (const v of vehicles) {
        const sp = Math.abs(v.speed);
        if (sp < 3 || v.cls === "boat" || v.cls === "heli") continue;
        const dx = p.x - v.position.x, dz = p.z - v.position.z;
        if (dx * dx + dz * dz > 36) continue;
        const f = v.forward, lx = dx * f.z - dz * f.x, lz = dx * f.x + dz * f.z;
        if (Math.abs(lx) > v.spec.width / 2 + 0.25 || Math.abs(lz) > v.spec.length / 2 + 0.25) continue;
        this.knock(p, f.scale(Math.sign(v.speed)), sp);
        this.onKnock(p, v, sp);
        v.speed *= p.kind === "signal" ? 0.55 : 0.65;
        break;
      }
    }
  }

  private knock(p: Prop, dir: Vector3, speed: number) {
    p.down = true; p.downT = 0;
    // topple away from the vehicle: rotate around the horizontal axis perpendicular to travel
    const axis = Vector3.Cross(Vector3.Up(), dir).normalize();
    p.fall = { axis: axis.lengthSquared() > 0 ? axis : new Vector3(1, 0, 0), t: 0.05, v: Math.min(4, speed * 0.25) };
    p.collider.setEnabled(false);
    p.bulbs.forEach((b) => b.setEnabled(false)); // smashed
    this.freeze(p, false);
  }
}
