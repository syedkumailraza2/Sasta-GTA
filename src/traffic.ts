import { Color3, SpotLight, Vector3 } from "@babylonjs/core";
import { Vehicle, VehicleLibrary, type VehicleKind } from "./vehicles";
import { astar, laneWaypoints, nearestNode, neighbours, nodePos, type Node } from "./nav";
import type { World } from "./world";
import type { NpcManager } from "./npc";
import { groundAt, isWater, clampToBounds, N } from "./world/town";
import { CharacterLibrary, type CharKind } from "./characters";

type TrafficState = { a: Node; b: Node; c: Node };
const PARKED_MIX: [VehicleKind, number][] = [["auto", 30], ["car_small", 18], ["car_sedan", 10], ["suv", 5], ["taxi", 10], ["motorcycle", 10], ["scooter", 12], ["truck", 5]];
const TRAFFIC_MIX: [VehicleKind, number][] = [["auto", 32], ["car_small", 15], ["car_sedan", 10], ["taxi", 10], ["truck", 9], ["motorcycle", 11], ["scooter", 11], ["supercar", 3]];
const RIDERS: CharKind[] = ["business", "beach", "casual", "punk", "woman1", "woman2"];
const pickWeighted = (mix: [VehicleKind, number][]) => {
  let r = Math.random() * mix.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of mix) { if ((r -= w) <= 0) return k; }
  return mix[0][0];
};

export class TrafficManager {
  vehicles: Vehicle[] = [];
  private traffic = new Map<Vehicle, TrafficState & { honkT: number; waitT: number }>();
  private policeCars = new Set<Vehicle>();
  private policeSpawnT = 0;
  private siren: { stop(): void; setVolume(v: number): void } | null = null;

  constructor(private w: World, private lib: VehicleLibrary, private npcs: NpcManager) {
    this.searchlight();
    Vehicle.groundAt = groundAt;
    Vehicle.isWater = isWater;
    Vehicle.clamp = (p) => clampToBounds(p, 8);
  }

  persistent = new Set<Vehicle>();
  init() {
    const t = this.w.town;
    for (const p of t.parking.slice(0, 70)) this.spawn(pickWeighted(PARKED_MIX), new Vector3(p.x, 0, p.z), p.heading);
    for (let i = 0; i < 16; i++) this.spawnTraffic(this.w.player.position, 15, 140);
    // water vehicles at the jetty, chopper on the helipad, supercars on the promenade
    for (const m of t.moorings) this.persistent.add(this.spawn(m.kind, new Vector3(m.x, 0, m.z), m.heading));
    this.persistent.add(this.spawn("heli", t.helipad, Math.PI));
    const promenade = t.parking.filter((p) => p.x > t.size / 2 - 20).slice(0, 4);
    for (const p of promenade) this.persistent.add(this.spawn("supercar", new Vector3(p.x, 0, p.z), p.heading));
    for (const p of t.parking.slice(70, 74)) this.persistent.add(this.spawn("supercar", new Vector3(p.x, 0, p.z), p.heading));
  }

  /** seat an NPC on traffic bikes so they aren't ghost-riding */
  private addRider(v: Vehicle) {
    const kind = RIDERS[Math.floor(Math.random() * RIDERS.length)];
    const ch = this.npcs.borrowCiv(kind);
    ch.root.parent = v.body;
    ch.root.rotation.set(0, 0, 0);
    ch.root.position.set(0, -v.spec.height / 2 + (v.kind === "scooter" ? 0.08 : 0.28), v.kind === "scooter" ? -0.1 : -0.15);
    ch.pose(v.forward, v.kind === "scooter"); // faces the vehicle's nose whatever the model's own axes are
    v.rider = { dispose: () => this.npcs.giveBack(ch) };
  }

  /** removed vehicles wait here (disabled) to be reused: building one costs ~80 ms */
  private vpool = new Map<VehicleKind, Vehicle[]>();
  spawn(kind: VehicleKind, pos: Vector3, heading: number) {
    const pooled = this.vpool.get(kind)?.pop();
    if (pooled) { pooled.reset(pos, heading); this.vehicles.push(pooled); return pooled; }
    const v = new Vehicle(this.w.scene, kind, this.lib, pos, heading);
    this.vehicles.push(v);
    return v;
  }

  spawnTraffic(near: Vector3, minR: number, maxR: number) {
    for (let t = 0; t < 20; t++) {
      const a: Node = { i: Math.floor(Math.random() * (N + 1)), j: Math.floor(Math.random() * (N + 1)) };
      const nbs = neighbours(a);
      if (!nbs.length) continue;
      const b = nbs[Math.floor(Math.random() * nbs.length)];
      const mid = nodePos(a).add(nodePos(b)).scale(0.5);
      const d = Vector3.Distance(mid, near);
      if (d < minR || d > maxR) continue;
      const c = this.nextNode(a, b);
      const path = laneWaypoints(a, b, c);
      const start = path[0];
      const dir = path[1].subtract(path[0]);
      if (this.vehicles.some((v) => Vector3.Distance(v.groundPos, start) < 8)) continue;
      const v = this.spawn(pickWeighted(TRAFFIC_MIX), start, Math.atan2(dir.x, dir.z));
      v.driver = "traffic"; v.aiState = "drive"; v.path = path.slice(1);
      if (v.cls === "bike") this.addRider(v);
      this.traffic.set(v, { a, b, c, honkT: 4 + Math.random() * 10, waitT: 0 });
      return v;
    }
    return null;
  }

  private nextNode(prev: Node, cur: Node): Node {
    const opts = neighbours(cur).filter((n) => !(n.i === prev.i && n.j === prev.j));
    return opts[Math.floor(Math.random() * opts.length)] ?? prev;
  }

  /** nearest vehicle the player can get into */
  nearestEnterable(p: Vector3, maxD = 3.4) {
    let best: Vehicle | null = null, bd = maxD;
    for (const v of this.vehicles) {
      const d = Vector3.Distance(v.groundPos, p) - Math.max(v.spec.length, v.spec.width) * 0.35;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  /** player steals this vehicle: eject any AI driver */
  takeOver(v: Vehicle) {
    if (v.rider) { v.rider.dispose(); v.rider = null; }
    if (v.driver === "traffic" || v.driver === "police") {
      const door = v.doorPoint(-1);
      if (v.driver === "traffic") {
        const n = this.npcs.spawnCiv(door, 0, 999);
        if (n) { n.position.copyFrom(door.add(new Vector3(0, 0.3, 0))); n.state = "flee"; n.timer = 6; n.target = v.groundPos.clone(); }
        this.w.audio.say("phir_hera_pheri", { cooldown: 20 });
      } else { this.w.wanted.crime(3); }
      this.traffic.delete(v);
      this.policeCars.delete(v);
    }
    v.driver = "player"; v.aiState = "parked"; v.path = [];
    if (v.kind === "police") { v.sirenOn = false; }
  }

  private obstacleAhead(v: Vehicle) {
    const f = v.forward, p = v.groundPos, look = 6 + Math.abs(v.speed) * 0.8;
    const check = (q: Vector3, rad: number) => {
      const d = q.subtract(p); d.y = 0;
      const ahead = Vector3.Dot(d, f), lateral = Math.abs(d.x * f.z - d.z * f.x);
      return ahead > 0 && ahead < look + v.spec.length / 2 && lateral < v.spec.width / 2 + rad;
    };
    const pl = this.w.player;
    if (!pl.dead && check(pl.inVehicle ? pl.vehiclePos() : pl.position, 0.9)) return true;
    for (const n of this.npcs.all) if (!n.dead && check(n.position, n.role === "cow" ? 1.2 : 0.6)) return true;
    for (const o of this.vehicles) if (o !== v && check(o.groundPos, o.spec.width / 2 + 0.3)) return true;
    return false;
  }

  update(dt: number) {
    const w = this.w, pp = w.player.inVehicle ? w.player.vehiclePos() : w.player.position;
    // ---------------- traffic AI
    for (const [v, st] of this.traffic) {
      const d = Vector3.Distance(v.groundPos, pp);
      if (d > 160) { this.traffic.delete(v); this.remove(v); continue; }
      if (d > 110) continue; // frozen while far
      if (v.path.length === 0) {
        const a = st.b, b = st.c, c = this.nextNode(a, b);
        Object.assign(st, { a, b, c });
        v.path = laneWaypoints(a, b, c);
      }
      // red light ahead? queue at the stop line like everyone else
      const red = !!w.signals?.mustStop(v.groundPos, v.forward, Math.abs(v.speed));
      const blocked = this.obstacleAhead(v) || red;
      if (blocked && Math.abs(v.speed) < 0.5) {
        st.waitT += dt * (red ? 0.4 : 1); // honk less at a red light (still Indian traffic though)
        if (st.waitT > 2.5 && (st.honkT -= dt) <= 0) {
          st.honkT = 2 + Math.random() * 3;
          w.audio.horn(v, { at: v.groundPos, volume: 0.55, maxDist: 40 });
        }
      } else st.waitT = 0;
      // desi traffic honks for no reason, but only vehicles you can actually see/hear
      if (d < 35 && Math.abs(v.speed) > 3 && (st.honkT -= dt) <= 0) {
        st.honkT = 6 + Math.random() * 14;
        if (Math.random() < 0.45 && v.cls !== "heli") w.audio.horn(v, { at: v.groundPos, volume: 0.4, maxDist: 38 });
      }
      const cruise = v.cls === "truck" ? 7 : v.cls === "auto" ? 8 : v.cls === "bike" ? 10 : 9.5;
      v.followPath(dt, cruise, blocked);
    }
    const trafficCount = this.traffic.size;
    if (trafficCount < 12) this.spawnTraffic(pp, 60, 120);

    // ---------------- police cars
    const lvl = w.wanted.level;
    // 2★ one jeep, 3★ two, 4★ three, 5★ two police + two army jeeps
    const wantCars = [0, 0, 1, 2, 3, 4][lvl];
    this.policeSpawnT -= dt;
    const activeCops = [...this.policeCars].filter((v) => v.driver === "police");
    if (activeCops.length < wantCars && this.policeSpawnT <= 0) {
      this.policeSpawnT = lvl >= 4 ? 5 : 8;
      const armyNow = activeCops.filter((v) => this.armyCars.has(v)).length;
      this.spawnPoliceCar(pp, lvl >= 5 && armyNow < 2);
    }
    this.updateGunship(dt, pp, lvl);
    let nearestSiren = Infinity;
    for (const v of this.policeCars) {
      if (v.driver !== "police") continue;
      if (lvl < 2 || (this.armyCars.has(v) && lvl < 5)) { v.driver = "none"; v.sirenOn = false; v.aiState = "parked"; continue; }
      const to = pp.subtract(v.groundPos); to.y = 0;
      const d = to.length();
      nearestSiren = Math.min(nearestSiren, d);
      if (d > 32 && v.path.length > 0) v.followPath(dt, 17, false);
      else if (!w.player.inVehicle && d < 11) {
        // pull up and let the constables out
        v.speed *= 0.85; v.move(dt);
        if (Math.abs(v.speed) < 1 && v.aiState !== "wait") {
          v.aiState = "wait";
          if (this.npcs.police.length < 12) for (const side of [-1, 1]) this.npcs.spawnPolice(pp, v.doorPoint(side), this.armyCars.has(v));
          w.audio.say("bhai_yaha_kya", { cooldown: 10 });
        }
      } else {
        // direct chase with real physics (rams the player's vehicle)
        v.aiState = "chase";
        const want = Math.atan2(to.x, to.z);
        let dh = want - v.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const reversing = v.stuckT > 0;
        v.drive(dt, { throttle: reversing ? 0 : 1, brake: reversing ? 1 : 0, steer: Math.max(-1, Math.min(1, dh * 2)) * (reversing ? -1 : 1), handbrake: Math.abs(dh) > 1.2 && v.speed > 8 });
        if (Math.abs(v.speed) < 1) v.stuckT += dt; else if (v.stuckT > 0) v.stuckT = Math.max(0, v.stuckT - dt * 0.5);
        if (v.stuckT > 2.5) v.stuckT = 0;
        if (d > 32 && v.path.length === 0) v.path = this.pathTo(v.groundPos, pp);
      }
    }
    if (nearestSiren < 90) {
      if (!this.siren) this.siren = w.audio.loop("siren", 0);
      this.siren.setVolume(0.35 * (1 - nearestSiren / 90));
    } else if (this.siren) { this.siren.stop(); this.siren = null; }

    this.bikeCrashes(dt);
    this.trafficEngines(pp);
    // ---------------- run-overs + lights + cleanup of far parked cars
    for (const v of this.vehicles) {
      v.updateLights(dt);
      const sp = Math.abs(v.speed);
      if (sp > 4 && v.cls !== "heli" && (v.driver === "player" || v.driver === "police" || v.aiState === "chase")) {
        const f = v.forward.scale(Math.sign(v.speed));
        for (const n of this.npcs.all) {
          if (n.dead) continue;
          const d = n.position.subtract(v.groundPos); d.y = 0;
          const ahead = Vector3.Dot(d, f), lat = Math.abs(d.x * f.z - d.z * f.x);
          if (ahead > 0 && ahead < v.spec.length / 2 + 0.7 && lat < v.spec.width / 2 + 0.4) {
            if (n.role === "cow") { v.speed = -v.speed * 0.3; v.lastCrash = sp; } // a cow is a solid object
            this.npcs.runOver(n, sp, f, v.driver === "player");
          }
        }
        if (v.driver !== "player" && !w.player.inVehicle && !w.player.dead) {
          const d = w.player.position.subtract(v.groundPos); d.y = 0;
          const ahead = Vector3.Dot(d, f), lat = Math.abs(d.x * f.z - d.z * f.x);
          if (ahead > 0 && ahead < v.spec.length / 2 + 0.6 && lat < v.spec.width / 2 + 0.4) { w.player.damage(sp * 2.5, v.groundPos, sp * 0.8); v.speed *= 0.5; }
        }
      }
      if (v.driver === "none" && !this.persistent.has(v) && Vector3.Distance(v.groundPos, pp) > 170) { this.remove(v); }
    }
  }

  /**
   * Two-wheelers get knocked over when something hits them hard enough (or they slam into something):
   * the bike tips onto its side and the rider is thrown off, hurt in proportion to the impact speed.
   */
  private bikeCrashes(dt: number) {
    void dt;
    const w = this.w;
    for (const b of this.vehicles) {
      if (b.cls !== "bike" || b.fallen) continue;
      const bv = b.forward.scale(b.speed);
      // the bike itself hit a wall / car hard
      if (b.lastCrash > 8 && b.driver !== "player") { this.fallBike(b, b.forward.scale(-1), b.lastCrash, false); b.lastCrash = 0; continue; }
      for (const o of this.vehicles) {
        if (o === b || o.cls === "boat" || o.cls === "heli") continue;
        const dx = b.position.x - o.position.x, dz = b.position.z - o.position.z;
        const reach = o.spec.length / 2 + b.spec.length / 2;
        if (dx * dx + dz * dz > reach * reach) continue;
        // bike centre inside the other vehicle's footprint (grown by half a bike width)?
        const f = o.forward, lx = dx * f.z - dz * f.x, lz = dx * f.x + dz * f.z;
        if (Math.abs(lx) > o.spec.width / 2 + 0.45 || Math.abs(lz) > o.spec.length / 2 + 0.5) continue;
        const ov = o.forward.scale(o.speed);
        const rel = bv.subtract(ov).length();
        if (rel < 3.5) continue;
        // pushed away from the vehicle that hit it
        const dir = new Vector3(dx, 0, dz).normalize();
        this.fallBike(b, dir, rel, o.driver === "player");
        o.speed *= 0.8;
        if (o.driver === "player") { o.lastCrash = Math.max(o.lastCrash, rel * 0.6); }
        break;
      }
    }
  }

  fallBike(b: Vehicle, dir: Vector3, speed: number, byPlayer: boolean) {
    const w = this.w;
    const right = new Vector3(Math.cos(b.heading), 0, -Math.sin(b.heading));
    b.knockOver(Vector3.Dot(dir, right) >= 0 ? -1 : 1);
    b.speed *= 0.4;
    w.audio.play("sfx_knockout", { at: b.groundPos, volume: 0.6, rate: 0.75, duration: 0.8 });
    if (this.traffic.has(b)) this.traffic.delete(b);
    // the NPC rider becomes a pedestrian lying in the road
    if (b.rider) {
      b.rider.dispose(); b.rider = null;
      const at = b.groundPos.add(dir.scale(1.2));
      const n = this.npcs.spawnCiv(at, 0, 9999);
      if (n) { n.position.copyFrom(at.add(new Vector3(0, 0.3, 0))); this.npcs.runOver(n, Math.max(6, speed), dir, byPlayer); }
    }
    if (b.driver === "traffic") b.driver = "none";
    // the player riding it goes flying
    if (b.driver === "player" && w.player.inVehicle) (w.player as unknown as { thrownOff(d: Vector3, s: number): void }).thrownOff(dir, speed);
  }

  /** the 4 nearest moving AI vehicles get a positional engine voice, so traffic is heard passing by */
  private voices = new Map<Vehicle, ReturnType<import("./audio").Audio["engine"]>>();
  private trafficEngines(pp: Vector3) {
    const near = this.vehicles
      .filter((v) => v.driver !== "player" && v.driver !== "none" && v.cls !== "heli" && Math.abs(v.speed) > 0.5 && Vector3.DistanceSquared(v.groundPos, pp) < 32 * 32)
      .sort((a, b) => Vector3.DistanceSquared(a.groundPos, pp) - Vector3.DistanceSquared(b.groundPos, pp)).slice(0, 4);
    for (const [v, voice] of this.voices) if (!near.includes(v) || !this.vehicles.includes(v)) { voice.stop(); this.voices.delete(v); }
    for (const v of near) {
      let voice = this.voices.get(v);
      if (!voice) { voice = this.w.audio.engine(v.kind); this.voices.set(v, voice); }
      voice.update(Math.min(1, Math.abs(v.speed) / v.spec.maxSpeed), v.aiState === "chase" ? 1 : 0.45, v.groundPos, 32);
    }
  }

  private pathTo(from: Vector3, to: Vector3) {
    const a = nearestNode(from), b = nearestNode(to);
    const nodes = astar(a, b);
    const pts: Vector3[] = [];
    for (let i = 0; i + 1 < nodes.length; i++) pts.push(...laneWaypoints(nodes[i], nodes[i + 1], nodes[i + 2] ?? null));
    pts.push(to.clone());
    return pts;
  }

  private armyCars = new Set<Vehicle>();
  private spawnPoliceCar(pp: Vector3, army = false) {
    for (let t = 0; t < 30; t++) {
      const n: Node = { i: Math.floor(Math.random() * (N + 1)), j: Math.floor(Math.random() * (N + 1)) };
      const d = Vector3.Distance(nodePos(n), pp);
      if (d < 55 || d > 120) continue;
      const nb = neighbours(n)[0];
      if (!nb) continue;
      const p = laneWaypoints(n, nb, null)[0];
      const v = this.spawn(army ? "suv" : "police", p, 0);
      v.driver = "police"; v.sirenOn = true; v.aiState = "drive";
      if (army) { this.armyCars.add(v); v.label = "Fauji Jeep"; }
      v.path = this.pathTo(p, pp);
      const dir = (v.path[0] ?? pp).subtract(p);
      v.heading = Math.atan2(dir.x, dir.z);
      this.policeCars.add(v);
      return;
    }
  }

  // ---------------- 5★ gunship: circles over you, spotlight on, door gunner firing
  private gunship: { v: Vehicle; ang: number; shootT: number; leaving: number; snd: { stop(): void; setVolume(v: number): void }; light: SpotLight } | null = null;
  /**
   * The gunship's searchlight exists from the start at zero intensity: adding a light later forces every material
   * in the scene to recompile its shader (an ~1 s freeze the moment you hit 5 stars).
   */
  private spot: SpotLight | null = null;
  private searchlight() {
    if (!this.spot) { this.spot = new SpotLight("heliSpot", new Vector3(0, -200, 0), new Vector3(0, -1, 0), 0.35, 8, this.w.scene); this.spot.intensity = 0; this.spot.diffuse = new Color3(1, 0.97, 0.85); this.spot.range = 90; }
    return this.spot;
  }
  private updateGunship(dt: number, pp: Vector3, lvl: number) {
    const w = this.w;
    if (!this.gunship && lvl >= 5) {
      const a = Math.random() * Math.PI * 2;
      const v = this.spawn("heli", pp.add(new Vector3(Math.cos(a) * 140, 0, Math.sin(a) * 140)), a + Math.PI);
      v.body.position.y = 45; v.driver = "police"; v.label = "Police Helicopter"; v.rotorSpin = 1;
      const light = this.searchlight(); light.intensity = 6;
      this.gunship = { v, ang: a, shootT: 3, leaving: 0, snd: w.audio.loop("heli_loop", 0), light };
      w.hud.toast("🚁 FAUJ AA GAYI! Upar helicopter bhi hai. Ab tum national news ho!", 4500);
      w.audio.play("police_whistle", { volume: 0.8 });
    }
    const g = this.gunship;
    if (!g) return;
    const v = g.v;
    if (lvl < 5 && !g.leaving) g.leaving = 0.01;
    // where to be: orbiting 24 m around you, 32 m up (or away and up when leaving)
    g.ang += dt * 0.35;
    const target = g.leaving ? v.position.add(v.forward.scale(60)) : pp.add(new Vector3(Math.cos(g.ang) * 24, 0, Math.sin(g.ang) * 24));
    const to = target.subtract(v.position); to.y = 0;
    let dh = Math.atan2(to.x, to.z) - v.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const alt = g.leaving ? 90 : 32;
    v.fly(dt, { lift: Math.max(-1, Math.min(1, (alt - v.altitude) * 0.15)), forward: Math.min(1, to.length() / 25), yaw: Math.max(-1, Math.min(1, dh * 2)) }, true);
    // spotlight on the player
    g.light.position.copyFrom(v.position.add(new Vector3(0, -1.5, 0)));
    g.light.direction = pp.add(new Vector3(0, 1, 0)).subtract(g.light.position).normalize();
    const d = Vector3.Distance(v.position, pp);
    g.snd.setVolume(Math.max(0, 0.6 * (1 - d / 160)));
    // door gunner
    if (!g.leaving && w.wanted.level >= 5 && !w.player.dead && d < 70 && (g.shootT -= dt) <= 0) {
      g.shootT = 0.9 + Math.random() * 0.8;
      const hit = Math.random() < 0.4 * (1 - Math.min(1, w.player.speed / 14) * 0.5);
      const aim = pp.add(new Vector3(hit ? 0 : (Math.random() - 0.5) * 4, hit ? 1.2 : 0, hit ? 0 : (Math.random() - 0.5) * 4));
      w.fx.tracer(v.position.add(new Vector3(0, -1, 0)), aim);
      w.audio.gunshot(false, v.position);
      if (hit) (w.player as unknown as { damage(a: number, f: Vector3, k: number, force?: boolean): boolean }).damage(8, v.position, 1, true);
    }
    if (g.leaving && (g.leaving += dt) > 14) {
      g.snd.stop(); g.light.intensity = 0; g.light.position.set(0, -200, 0); this.gunship = null;
      this.vehicles.splice(this.vehicles.indexOf(v), 1); v.dispose();
    }
  }

  private remove(v: Vehicle) {
    if (v.driver === "player") return;
    this.vehicles.splice(this.vehicles.indexOf(v), 1);
    this.traffic.delete(v);
    this.policeCars.delete(v);
    this.armyCars.delete(v);
    this.voices.get(v)?.stop(); this.voices.delete(v);
    if (v.rider) { v.rider.dispose(); v.rider = null; }
    v.body.setEnabled(false);
    const arr = this.vpool.get(v.kind) ?? []; arr.push(v); this.vpool.set(v.kind, arr);
  }
  /** build vehicles up front (loading screen) and park them in the pool */
  prewarm(counts: [VehicleKind, number][]) {
    const made: Vehicle[] = [];
    for (const [k, n] of counts) for (let i = 0; i < n; i++) made.push(this.spawn(k, new Vector3(0, -50, 0), 0));
    return () => made.forEach((v) => this.remove(v));
  }

  /** cheat: drop a vehicle right in front of the player */
  spawnInFront(kind: VehicleKind, p: Vector3, yaw: number) {
    const f = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    return this.spawn(kind, p.add(f.scale(5)), yaw + Math.PI / 2);
  }
}
