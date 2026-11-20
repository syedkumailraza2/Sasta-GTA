import { AbstractMesh, Ray } from "@babylonjs/core";

/**
 * Uniform grid over the static town colliders. Babylon's scene.pickWithRay walks every mesh in the scene
 * (~5000 here) for each ray; with ~60 rays a frame (vehicle probes, camera, ground checks) that was the main
 * source of stutter. The grid only tests the handful of colliders near the ray.
 */
export class ColliderGrid {
  private cells = new Map<number, AbstractMesh[]>();
  private stamp = 1;
  private marks = new WeakMap<AbstractMesh, number>();
  constructor(meshes: AbstractMesh[], private size = 24) { for (const m of meshes) this.add(m); }

  private key(ix: number, iz: number) { return (ix + 2048) * 4096 + (iz + 2048); }

  add(m: AbstractMesh) {
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    const x0 = Math.floor(bb.minimumWorld.x / this.size), x1 = Math.floor(bb.maximumWorld.x / this.size);
    const z0 = Math.floor(bb.minimumWorld.z / this.size), z1 = Math.floor(bb.maximumWorld.z / this.size);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this.key(ix, iz);
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(m);
    }
  }

  /** nearest hit along the ray among grid colliders accepted by `filter` (and any `extra` meshes) */
  pick(ray: Ray, filter?: (m: AbstractMesh) => boolean, extra?: AbstractMesh[]): { hit: boolean; distance: number; mesh: AbstractMesh | null } {
    const o = ray.origin, d = ray.direction, L = ray.length;
    const ex = o.x + d.x * L, ez = o.z + d.z * L;
    const x0 = Math.floor(Math.min(o.x, ex) / this.size), x1 = Math.floor(Math.max(o.x, ex) / this.size);
    const z0 = Math.floor(Math.min(o.z, ez) / this.size), z1 = Math.floor(Math.max(o.z, ez) / this.size);
    const stamp = ++this.stamp;
    let best = Infinity, bm: AbstractMesh | null = null;
    const test = (m: AbstractMesh) => {
      if (this.marks.get(m) === stamp) return;
      this.marks.set(m, stamp);
      if (!m.isEnabled() || (filter && !filter(m))) return;
      const r = ray.intersectsMesh(m, false);
      if (r.hit && r.distance < best && r.distance <= L) { best = r.distance; bm = m; }
    };
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const c = this.cells.get(this.key(ix, iz));
      if (c) for (const m of c) test(m);
    }
    if (extra) for (const m of extra) test(m);
    return { hit: !!bm, distance: best, mesh: bm };
  }
}

/** the town's grid, built once the town and beach colliders exist */
export const Grid: { current: ColliderGrid | null } = { current: null };
