import { Vector3 } from "@babylonjs/core";
import { N, roadCenter, segmentLand } from "./world/town";

/** The road network is a (N+1)x(N+1) grid of intersections joined by straight roads. */
export type Node = { i: number; j: number };
const key = (n: Node) => n.i * 100 + n.j;
export const nodePos = (n: Node) => new Vector3(roadCenter(n.i), 0, roadCenter(n.j));

export function neighbours(n: Node): Node[] {
  const out: Node[] = [];
  if (n.i > 0) out.push({ i: n.i - 1, j: n.j });
  if (n.i < N) out.push({ i: n.i + 1, j: n.j });
  if (n.j > 0) out.push({ i: n.i, j: n.j - 1 });
  if (n.j < N) out.push({ i: n.i, j: n.j + 1 });
  return out.filter((m) => segmentLand(n, m)); // no roads into the sea
}

export function nearestNode(p: Vector3): Node {
  let best: Node = { i: 0, j: 0 }, bd = Infinity;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const d = Math.hypot(roadCenter(i) - p.x, roadCenter(j) - p.z);
    if (d < bd) { bd = d; best = { i, j }; }
  }
  return best;
}

/** Closest point on any road centre-line, and the two intersections of that segment. */
export function snapToRoad(p: Vector3): { point: Vector3; a: Node; b: Node } {
  let best = { point: p.clone(), a: { i: 0, j: 0 }, b: { i: 0, j: 0 } }, bd = Infinity;
  const lo = roadCenter(0), hi = roadCenter(N);
  for (let k = 0; k <= N; k++) {
    const c = roadCenter(k);
    // vertical road x=c
    const z = Math.max(lo, Math.min(hi, p.z));
    let d = Math.abs(p.x - c) + Math.abs(p.z - z);
    if (d < bd) {
      bd = d;
      const j0 = Math.max(0, Math.min(N - 1, Math.floor((z - lo) / ((hi - lo) / N))));
      best = { point: new Vector3(c, 0, z), a: { i: k, j: j0 }, b: { i: k, j: j0 + 1 } };
    }
    // horizontal road z=c
    const x = Math.max(lo, Math.min(hi, p.x));
    d = Math.abs(p.z - c) + Math.abs(p.x - x);
    if (d < bd) {
      bd = d;
      const i0 = Math.max(0, Math.min(N - 1, Math.floor((x - lo) / ((hi - lo) / N))));
      best = { point: new Vector3(x, 0, c), a: { i: i0, j: k }, b: { i: i0 + 1, j: k } };
    }
  }
  return best;
}

/** A* between intersections (Manhattan grid, so this is quick). */
export function astar(from: Node, to: Node): Node[] {
  const open = new Map<number, { n: Node; g: number; f: number }>();
  const came = new Map<number, Node>();
  const g = new Map<number, number>();
  const h = (n: Node) => Math.abs(n.i - to.i) + Math.abs(n.j - to.j);
  open.set(key(from), { n: from, g: 0, f: h(from) });
  g.set(key(from), 0);
  while (open.size) {
    let cur: { n: Node; g: number; f: number } | null = null;
    for (const v of open.values()) if (!cur || v.f < cur.f) cur = v;
    if (!cur) break;
    if (cur.n.i === to.i && cur.n.j === to.j) {
      const path = [cur.n];
      let k = key(cur.n);
      while (came.has(k)) { const p = came.get(k)!; path.unshift(p); k = key(p); }
      return path;
    }
    open.delete(key(cur.n));
    for (const nb of neighbours(cur.n)) {
      const ng = cur.g + 1;
      if (ng < (g.get(key(nb)) ?? Infinity)) {
        g.set(key(nb), ng);
        came.set(key(nb), cur.n);
        open.set(key(nb), { n: nb, g: ng, f: ng + h(nb) });
      }
    }
  }
  return [from];
}

/** GPS route from a world point to another along roads (for the minimap line). */
export function route(from: Vector3, to: Vector3): Vector3[] {
  const s = snapToRoad(from), e = snapToRoad(to);
  // pick the segment endpoints giving the shortest total
  let best: Vector3[] = [], bestLen = Infinity;
  for (const a of [s.a, s.b]) for (const b of [e.a, e.b]) {
    const nodes = astar(a, b);
    const pts = [from.clone(), s.point, ...nodes.map(nodePos), e.point, to.clone()];
    // drop a backtrack if the snapped point lies between first two nodes
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Vector3.Distance(pts[i - 1], pts[i]);
    if (len < bestLen) { bestLen = len; best = pts; }
  }
  return best;
}

/** Lane centre for traffic (India drives on the LEFT). */
export function laneWaypoints(a: Node, b: Node, c: Node | null): Vector3[] {
  const A = nodePos(a), B = nodePos(b);
  const f = B.subtract(A).normalize();
  const left = new Vector3(-f.z, 0, f.x);
  const LANE = 3.1, STOP = 9;
  const pts = [A.add(f.scale(STOP)).add(left.scale(LANE)), B.subtract(f.scale(STOP)).add(left.scale(LANE))];
  if (c) {
    const C = nodePos(c);
    const f2 = C.subtract(B).normalize();
    if (Vector3.Dot(f, f2) > 0.9) return pts; // straight on
    const left2 = new Vector3(-f2.z, 0, f2.x);
    const exit = B.add(f2.scale(STOP)).add(left2.scale(LANE));
    const entry = pts[1];
    const ctrl = B.add(left.scale(LANE)).add(left2.scale(LANE));
    for (let t = 0.25; t < 1; t += 0.25) {
      const p = entry.scale((1 - t) * (1 - t)).add(ctrl.scale(2 * t * (1 - t))).add(exit.scale(t * t));
      pts.push(p);
    }
  }
  return pts;
}
