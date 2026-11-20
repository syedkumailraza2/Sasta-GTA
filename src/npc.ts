import { Grid } from "./grid";
import { HOLDS, type WeaponId } from "./weapons";
import { Ray, TransformNode, Vector3 } from "@babylonjs/core";
import { Actor } from "./actor";
import { CharacterLibrary, type Character, type CharKind } from "./characters";
import { buildWeaponMesh } from "./weapons";
import type { World } from "./world";
import { BLOCK, ROAD, N, roadCenter, groundAt, isWater } from "./world/town";
import type { Clip } from "./audio";
import { BUMP_LINES, CHAT_LINES, VOICE_LINES } from "./voiceLines";
const isFemale = (n: Npc) => n.char.kind === "woman1" || n.char.kind === "woman2";

type Role = "civ" | "police" | "cow";
type State = "wander" | "idle" | "flee" | "fight" | "dead" | "chase" | "cross";

const CIV_KINDS: CharKind[] = ["business", "beach", "casual", "punk", "woman1", "woman2"];
const WALK = 1.35, RUN = 5.6, POLICE_RUN = 5.9;
const HIT_LINES: Clip[] = ["kya_kar_raha_hai_tu", "aayein", "abe_sale", "maa_kasam"];

export class Npc extends Actor {
  state: State = "wander";
  target = new Vector3();
  timer = 0;
  attackCd = 0;
  pendingHit: { t: number; dmg: number; knock: number } | null = null;
  brave: boolean;
  block = { x0: 0, z0: 0 };
  corner = 0;
  dir = 1;
  deadT = 0;
  stuckT = 0;
  weapon: TransformNode | null = null;
  lastSeenCheck = 0;
  canSeePlayer = false;
  /** standing in a group: plays talk/gesture anims while idle */
  chatty = false;
  /** waiting at a red light to cross */
  crossWait = false;
  /** 5-star army soldier (role stays "police") */
  army = false;
  gun: "none" | "pistol" | "rifle" = "none";
  shootT = 1 + Math.random();
  lastSpoke = 0;

  constructor(world: World, char: Character, readonly role: Role, pos: Vector3) {
    super(world.scene, char, pos, role === "cow" ? { radius: 0.55, halfHeight: 0.75, health: 9999 } : { health: role === "police" ? 120 : 60 });
    this.brave = role === "police" || Math.random() < 0.45;
  }
}

export class NpcManager {
  npcs: Npc[] = [];
  /** spawned characters kept for reuse: cloning a rigged character costs ~90 ms, which is a visible hitch */
  private pool = new Map<string, Character[]>();
  private spawnT = 0;
  civTarget = 60;
  private policeHitT = 0;

  constructor(private w: World) {}

  get all() { return this.npcs; }
  get police() { return this.npcs.filter((n) => n.role === "police" && !n.dead); }

  /** time of the last brand-new character (they're expensive: at most one every 2 s while playing) */
  private freshT = -99;
  canMakeFresh(kind: string) { return !!this.pool.get(kind)?.length || performance.now() / 1000 - this.freshT > 2; }
  private take(kind: CharKind, tint?: Record<string, string>, key: string = kind) {
    const c = this.pool.get(key)?.pop();
    if (c) { c.setVisible(true); c.reset(); return c; }
    this.freshT = performance.now() / 1000;
    return this.w.chars.spawn(kind, { tint, name: `${key}${Math.floor(Math.random() * 1e6)}` });
  }
  /** put a character back in the pool (key: kind for civilians, "police"/"army" for uniforms) */
  giveBack(c: Character, key: string = c.kind) {
    if (c.riding) c.unpose();
    c.root.parent = null;
    c.root.rotation.set(0, 0, 0);
    c.setVisible(false);
    const arr = this.pool.get(key) ?? []; arr.push(c); this.pool.set(key, arr);
  }
  /** borrow a pedestrian body (bike riders) */
  borrowCiv(kind: CharKind) {
    const pooled = CIV_KINDS.find((k) => this.pool.get(k)?.length);
    const k = this.pool.get(kind)?.length ? kind : pooled ?? kind;
    return this.take(k, CharacterLibrary.randomTint(k));
  }
  /** create characters up front (during loading) so spawning later never stalls */
  prewarm(counts: [string, number][]) {
    for (const [key, n] of counts) for (let i = 0; i < n; i++) {
      const kind = (key === "police" || key === "army" ? "business" : key) as CharKind;
      const tint = key === "police" ? CharacterLibrary.policeTint() : key === "army" ? CharacterLibrary.armyTint() : CharacterLibrary.randomTint(kind);
      this.giveBack(this.w.chars.spawn(kind, { tint, name: `${key}${Math.floor(Math.random() * 1e6)}` }), key);
    }
  }
  private release(n: Npc) {
    n.weapon?.dispose();
    this.giveBack(n.char, n.role === "police" ? (n.army ? "army" : "police") : n.char.kind);
    n.collider.dispose();
    this.npcs.splice(this.npcs.indexOf(n), 1);
  }

  // ------------------------------------------------------------- spawning
  /** Spawn a pedestrian anywhere along a footpath ring (not just corners), 7-40m from `near` by default. */
  spawnCiv(near: Vector3, minR = 7, maxR = 40) {
    const blocks = this.w.town.blocks;
    if (!CIV_KINDS.some((k) => this.canMakeFresh(k))) return null;
    for (let tries = 0; tries < 40; tries++) {
      const b = blocks[Math.floor(Math.random() * blocks.length)];
      const side = Math.floor(Math.random() * 4);
      const p = Vector3.Lerp(this.corner(b, side), this.corner(b, (side + 1) % 4), Math.random());
      const d = Vector3.Distance(p, near);
      if (d < minR || d > maxR) continue;
      if (Math.random() > 1.25 - d / maxR) continue; // bias spawns towards the player so the street around you is busy
      if (this.npcs.some((o) => Vector3.DistanceSquared(o.position, p) < 1)) continue;
      const n = this.makeCiv(b, p);
      n.dir = Math.random() < 0.5 ? 1 : -1;
      n.corner = n.dir === 1 ? side : (side + 1) % 4;
      n.target = this.corner(b, (n.corner + n.dir + 4) % 4);
      n.facing = Math.random() * 6.28;
      // ~1 in 4 spawns is a little group chatting outside a shop
      if (Math.random() < 0.25) this.chatGroup(n, b);
      return n;
    }
    return null;
  }

  private makeCiv(b: { x0: number; z0: number }, p: Vector3) {
    const kind = CIV_KINDS[Math.floor(Math.random() * CIV_KINDS.length)];
    // prefer a kind that's already pooled: reusing is free, cloning a new body is not
    const ready = CIV_KINDS.filter((k) => this.pool.get(k)?.length);
    const use = ready.length && !this.pool.get(kind)?.length ? ready[Math.floor(Math.random() * ready.length)] : kind;
    const char = this.take(use, CharacterLibrary.randomTint(use));
    const n = new Npc(this.w, char, "civ", p.add(new Vector3(0, 0.25, 0)));
    n.block = b;
    this.npcs.push(n);
    return n;
  }

  /** turn `lead` into a group of 2-3 people standing around gossiping */
  private chatGroup(lead: Npc, b: { x0: number; z0: number }) {
    const centre = lead.position.clone();
    const count = 1 + Math.floor(Math.random() * 2);
    const members = [lead];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const m = this.makeCiv(b, centre.add(new Vector3(Math.cos(a) * 1.1, -0.25, Math.sin(a) * 1.1)));
      m.corner = lead.corner; m.dir = lead.dir; m.target = lead.target.clone();
      members.push(m);
    }
    const mid = members.reduce((acc, m) => acc.addInPlace(m.position), new Vector3()).scale(1 / members.length);
    for (const m of members) {
      m.state = "idle"; m.timer = 20 + Math.random() * 40;
      m.facing = Math.atan2(mid.x - m.position.x, mid.z - m.position.z);
      m.chatty = true;
    }
  }

  spawnPolice(near: Vector3, at?: Vector3, army = false) {
    let p = at;
    if (!p) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 15;
      p = near.add(new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      // snap to nearest road so they don't spawn inside a building
      const k = Math.round((p.x - roadCenter(0)) / (BLOCK + ROAD));
      if (Math.random() < 0.5) p.x = roadCenter(Math.max(0, Math.min(N, k)));
      else p.z = roadCenter(Math.max(0, Math.min(N, Math.round((p.z - roadCenter(0)) / (BLOCK + ROAD)))));
    }
    if (isWater(p.x, p.z)) p = near.clone(); // never spawn constables in the sea
    const char = this.take("business", army ? CharacterLibrary.armyTint() : CharacterLibrary.policeTint(), army ? "army" : "police");
    const n = new Npc(this.w, char, "police", new Vector3(p.x, groundAt(p.x, p.z) + 0.3, p.z));
    n.state = "chase";
    n.army = army;
    // lathi up to 3 stars; from 4 stars constables carry pistols; the army carries rifles
    n.gun = army ? "rifle" : this.w.wanted.level >= 4 ? "pistol" : "none";
    if (n.gun === "none") { n.weapon = buildWeaponMesh(this.w.scene, "lathi"); attachToHand(char, n.weapon, "lathi"); }
    else {
      n.weapon = buildWeaponMesh(this.w.scene, "katta");
      if (n.gun === "rifle" && n.weapon) n.weapon.scaling.set(1.3, 2.6, 1.3); // long barrel
      attachToHand(char, n.weapon, "katta");
    }
    if (army) n.health = n.maxHealth = 200;
    this.npcs.push(n);
    return n;
  }

  spawnCow(at: Vector3) {
    const char = this.take("cow", { Main: "#ece4d6", Main_Light: "#f6f1e7", Muzzle: "#d8a7a0", Horns: "#7b5a3c" });
    const n = new Npc(this.w, char, "cow", at.add(new Vector3(0, 0.3, 0)));
    n.state = "idle"; n.timer = 2 + Math.random() * 6; n.facing = Math.random() * 6.28;
    this.npcs.push(n);
    return n;
  }

  private corner(b: { x0: number; z0: number }, i: number) {
    const inset = 1.5;
    const c = [[inset, inset], [BLOCK - inset, inset], [BLOCK - inset, BLOCK - inset], [inset, BLOCK - inset]][i];
    return new Vector3(b.x0 + c[0], 0.18, b.z0 + c[1]);
  }

  // ------------------------------------------------------------- events
  /** Someone (player) hit this NPC. */
  hit(n: Npc, dmg: number, from: Vector3, knock: number, byPlayer = true) {
    if (n.dead) return;
    const w = this.w;
    if (n.role === "cow") {
      n.health = 9999;
      n.char.play("hit");
      n.state = "fight"; n.timer = 4;
      w.audio.play("sfx_punch", { at: n.position, rate: 0.7 });
      if (byPlayer) this.cowCrime(n);
      return;
    }
    const killed = n.damage(dmg, from, knock);
    w.fx.blood(n.position.add(new Vector3(0, 1.4, 0)), n.position.subtract(from), killed ? 1.6 : 0.7);
    if (killed) {
      n.state = "dead"; n.deadT = 0;
      n.collider.ellipsoid.y = 0.2;
      w.audio.play("sfx_knockout", { at: n.position, volume: 0.6, duration: 1.2 });
      const amount = n.role === "police" ? 200 + Math.floor(Math.random() * 400) : 20 + Math.floor(Math.random() * 280);
      setTimeout(() => w.spawnMoney(n.position.clone(), amount), 900);
      if (byPlayer) {
        if (n.role === "police") { w.wanted.crime(2, 1); w.audio.say("baap_hu_mai_tera", { cooldown: 20, chance: 0.5 }); }
        else w.wanted.crime(1, 1);
      }
      this.panic(n.position, 18);
      return;
    }
    n.char.play(Math.random() < 0.5 ? "hit" : "hit2", { speed: 1.3 });
    if (byPlayer) w.wanted.crime(n.role === "police" ? 2 : 1);
    if (n.role === "police") { n.state = "chase"; return; }
    if (n.brave) {
      if (n.state !== "fight") w.audio.say(Math.random() < 0.5 ? "khopdi_tod" : "abe_sale", { at: n.position, cooldown: 6 });
      n.state = "fight"; n.timer = 12;
    } else {
      w.audio.say(HIT_LINES[Math.floor(Math.random() * HIT_LINES.length)], { at: n.position, cooldown: 5 });
      n.state = "flee"; n.timer = 6 + Math.random() * 4;
    }
    this.panic(n.position, 12, n);
  }

  /** touching gau mata = instant 4 stars */
  private cowCrimeT = 0;
  cowCrime(n: Npc) {
    const w = this.w;
    w.audio.play("cow_moo", { at: n.position, volume: 1 });
    if (this.cowCrimeT > 0) return;
    this.cowCrimeT = 4;
    w.wanted.crime(4);
    w.audio.play("police_whistle", { volume: 0.8 });
    w.fx.speech(n.char.root, "हटो! गाय माता को मत छेड़ो!", "Hato! Gaay mata ko mat chhedo!", 3);
    w.audio.voice("cow_1", false, n.position, 40);
    w.hud.toast("🐄🚨 GAU MATA KO HAATH LAGAYA? 4 STAR PULIS!", 4500);
  }

  /** run-over by a vehicle */
  runOver(n: Npc, speed: number, dir: Vector3, byPlayer: boolean) {
    if (n.dead) return;
    if (n.role === "cow") {
      n.vel.addInPlace(dir.scale(speed * 0.3)); n.state = "fight"; n.timer = 3; n.char.play("hit");
      if (byPlayer) this.cowCrime(n);
      return;
    }
    n.damage(speed > 9 ? 999 : speed * 8, n.position.subtract(dir), speed * 0.9);
    n.vel.y = Math.min(9, speed * 0.6);
    this.hit(n, 0, n.position.subtract(dir), 0, byPlayer);
    if (n.dead && byPlayer) { this.w.audio.say("oye_bhai_oye", { cooldown: 15, chance: 0.6 }); }
  }

  /** nearby civilians scatter */
  panic(at: Vector3, radius: number, except?: Npc) {
    let said = false;
    for (const o of this.npcs) {
      if (o === except || o.dead || o.role !== "civ" || o.state === "fight") continue;
      if (Vector3.DistanceSquared(o.position, at) > radius * radius) continue;
      o.state = "flee"; o.timer = 5 + Math.random() * 5; o.target = at.clone();
      if (!said && Math.random() < 0.35) said = this.w.audio.say("are_baap_re", { at: o.position, cooldown: 7 });
    }
  }

  // ------------------------------------------------------------- update
  update(dt: number) {
    const w = this.w, player = w.player, pp = player.inVehicle ? player.vehiclePos() : player.position;
    this.spawnT -= dt;
    // keep the streets busy around the player
    if (this.spawnT <= 0) {
      this.spawnT = 0.12;
      const civs = this.npcs.filter((n) => n.role === "civ" && !n.dead).length;
      if (civs < this.civTarget) this.spawnCiv(pp);
      const cows = this.npcs.filter((n) => n.role === "cow").length;
      // cows are an occasional sight, not a herd
      if (cows < 2 && Math.random() < 0.02) {
        const a = Math.random() * 6.28, r = 40 + Math.random() * 50;
        const p = pp.add(new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        const k = Math.max(0, Math.min(N, Math.round((p.x - roadCenter(0)) / (BLOCK + ROAD))));
        const cp = new Vector3(roadCenter(k) + (Math.random() * 6 - 3), 0, p.z);
        if (!isWater(cp.x, cp.z) && groundAt(cp.x, cp.z) >= 0) this.spawnCow(cp);
      }
      // police on foot scale with stars: 1★ = 1-2 constables ... 5★ = the army
      const lvl = w.wanted.level;
      const wantCops = [0, 2, 3, 5, 6, 4][lvl], wantArmy = lvl >= 5 ? 5 : 0;
      const cops = this.police.filter((n) => !n.army).length, army = this.police.filter((n) => n.army).length;
      if (cops < wantCops && this.canMakeFresh("police")) this.spawnPolice(pp);
      else if (army < wantArmy && this.canMakeFresh("army")) this.spawnPolice(pp, undefined, true);
    }

    let copsSee = false;
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      const d = Vector3.Distance(n.position, pp);
      // despawn far / long-dead
      if ((d > 50 && n.state !== "chase") || (n.dead && (n.deadT += dt) > 25) || (n.role === "police" && w.wanted.level === 0 && d > 45)) {
        this.release(n); continue;
      }
      if (d > 46 && !n.dead) { n.char.setVisible(false); continue; } // far NPCs: hidden and frozen (cheap LOD)
      n.char.setVisible(true);
      this.think(n, dt, pp, d);
      if (n.role === "police" && !n.dead && n.canSeePlayer) copsSee = true;
      if (w.cheats.bigHeads) for (const h of n.char.bone("Head")) h.scaling.setAll(2.4);
    }
    w.wanted.update(dt, copsSee);
    this.cowCrimeT -= dt;
    this.resolveContacts(dt, pp);
    this.policeHitT -= dt;
  }

  private think(n: Npc, dt: number, pp: Vector3, dist: number) {
    const w = this.w;
    n.timer -= dt; n.attackCd -= dt;
    const wish = new Vector3();
    let speed = 0;
    if (n.dead) {
      n.step(dt, wish, 6, false);
      n.char.locomotion(0, WALK, RUN, dt);
      return;
    }
    // resolve a queued punch/lathi swing at its impact frame
    if (n.pendingHit && (n.pendingHit.t -= dt) <= 0) {
      const ph = n.pendingHit; n.pendingHit = null;
      const toP = pp.subtract(n.position); toP.y = 0;
      const reach = n.role === "cow" ? 2.2 : n.role === "police" ? 2.0 : 1.5;
      if (!w.player.inVehicle && toP.length() < reach && Vector3.Dot(toP.normalize(), n.forward) > 0.3 && !w.player.dead) {
        w.player.damage(ph.dmg, n.position, ph.knock);
        w.audio.play(n.role === "police" ? "sfx_bone_crack" : "sfx_punch", { volume: 0.7 });
        w.fx.blood(w.player.position.add(new Vector3(0, 1.4, 0)), toP, 0.4);
      }
    }

    if (n.role === "cow") return this.thinkCow(n, dt, pp, dist);

    if (w.cheats.party && n.role === "civ") {
      if (!n.char.busy) n.char.play(Math.random() < 0.5 ? "wave" : "interact", { speed: 1.4 });
      n.step(dt, wish, 8, false);
      n.turnTowards(Math.atan2(pp.x - n.position.x, pp.z - n.position.z), dt, 3);
      n.char.locomotion(0, WALK, RUN, dt);
      return;
    }

    // line of sight for wanted-level decay (throttled)
    if (n.role === "police" && (n.lastSeenCheck -= dt) <= 0) {
      n.lastSeenCheck = 0.4;
      n.canSeePlayer = dist < 45 && this.los(n.position, pp);
    }

    switch (n.state) {
      case "wander": {
        const to = n.target.subtract(n.position); to.y = 0;
        if (to.length() < 0.8) {
          if (Math.random() < 0.15) { n.state = "idle"; n.timer = 2 + Math.random() * 4; if (Math.random() < 0.3) n.char.play(Math.random() < 0.5 ? "wave" : "interact"); }
          else if (Math.random() < 0.18) this.crossRoad(n);
          else { n.corner = (n.corner + n.dir + 4) % 4; n.target = this.corner(n.block, (n.corner + n.dir + 4) % 4); }
        }
        speed = WALK;
        wish.copyFrom(to.normalize().scale(speed));
        break;
      }
      case "cross": {
        const to = n.target.subtract(n.position); to.y = 0;
        if (to.length() < 0.8) { n.state = "wander"; n.target = this.corner(n.block, (n.corner + n.dir + 4) % 4); }
        speed = WALK * 1.3;
        wish.copyFrom(to.normalize().scale(speed));
        break;
      }
      case "idle":
        if (n.chatty && !n.char.busy && Math.random() < dt * 0.35) n.char.play(Math.random() < 0.6 ? "interact" : "wave", { speed: 0.9 });
        if (n.timer <= 0) { n.state = "wander"; n.chatty = false; if (n.crossWait) this.crossRoad(n); }
        break;
      case "flee": {
        const away = n.position.subtract(w.player.inVehicle ? pp : (n.target.lengthSquared() > 0 ? n.target : pp)); away.y = 0;
        if (away.lengthSquared() < 0.01) away.set(1, 0, 0);
        speed = RUN;
        wish.copyFrom(away.normalize().scale(speed));
        if (n.timer <= 0) { n.state = "wander"; n.target = this.corner(n.block, n.corner); }
        break;
      }
      case "fight":
      case "chase": {
        if (w.player.dead || (n.role === "civ" && (n.timer <= 0 || dist > 25))) { n.state = "wander"; break; }
        if (n.role === "police" && w.wanted.level === 0) { n.state = "wander"; n.block = this.w.town.blocks[0]; break; }
        if (w.player.inVehicle && n.role === "civ") { n.state = "flee"; n.timer = 4; break; }
        const to = pp.subtract(n.position); to.y = 0;
        const d = to.length();
        const reach = n.role === "police" ? 1.7 : 1.15;
        // armed units stop and shoot when they can see you
        if (n.gun !== "none" && d > 3 && d < (n.gun === "rifle" ? 34 : 24) && n.canSeePlayer) {
          n.turnTowards(Math.atan2(to.x, to.z), dt, 10);
          if ((n.shootT -= dt) <= 0) { n.shootT = n.gun === "rifle" ? 0.7 + Math.random() * 0.5 : 1.4 + Math.random() * 0.8; this.shoot(n, pp, d); }
          break;
        }
        if (d > reach) {
          speed = n.role === "police" ? POLICE_RUN : RUN * 0.92;
          wish.copyFrom(to.normalize().scale(speed));
        } else {
          n.turnTowards(Math.atan2(to.x, to.z), dt, 14);
          if (n.attackCd <= 0 && !n.char.busy) {
            const police = n.role === "police";
            const dur = n.char.play(police ? "slash" : Math.random() < 0.5 ? "punchL" : "punchR", { speed: police ? 1.25 : 1.4 });
            n.attackCd = dur + (police ? 0.45 : 0.7);
            n.pendingHit = { t: dur * 0.42, dmg: police ? 11 : 7, knock: police ? 4 : 2.5 };
            if (police && this.policeHitT <= 0 && Math.random() < 0.3) { this.policeHitT = 6; w.audio.say(Math.random() < 0.5 ? "iss_sajjan" : "bhai_yaha_kya", { at: n.position, cooldown: 12 }); }
          }
        }
        break;
      }
    }
    if (n.char.busy && n.state !== "flee") { wish.scaleInPlace(0.15); }
    // stuck detection: wiggle around poles/trees
    if (wish.lengthSquared() > 0.5 && n.speed < 0.2) {
      if ((n.stuckT += dt) > 1.2) { n.stuckT = 0; n.vel.addInPlace(new Vector3(Math.random() * 4 - 2, 0, Math.random() * 4 - 2)); if (n.state === "wander") n.target = this.corner(n.block, Math.floor(Math.random() * 4)); }
    } else n.stuckT = 0;
    if (dist > 14 && n.role === "civ" && n.stunned <= 0 && n.state !== "fight") n.stepCheap(dt, wish); // footpaths are clear: skip the collision sweep
    else n.step(dt, wish, n.state === "wander" ? 6 : 10);
    n.char.locomotion(n.speed, WALK, n.role === "police" ? POLICE_RUN : RUN, dt);
  }

  private thinkCow(n: Npc, dt: number, pp: Vector3, dist: number) {
    const w = this.w, wish = new Vector3();
    if (n.state === "fight") {
      const to = pp.subtract(n.position); to.y = 0;
      if (n.timer <= 0 || dist > 15) { n.state = "idle"; n.timer = 3; }
      else if (to.length() > 1.8) wish.copyFrom(to.normalize().scale(4.5));
      else {
        n.turnTowards(Math.atan2(to.x, to.z), dt, 8);
        if (n.attackCd <= 0 && !n.char.busy) {
          const dur = n.char.play("headbutt", { speed: 1.2 });
          n.attackCd = dur + 1.2;
          n.pendingHit = { t: dur * 0.5, dmg: 18, knock: 9 };
        }
      }
    } else if (n.state === "idle") {
      if (n.timer <= 0) {
        if (Math.random() < 0.5) { n.state = "wander"; n.timer = 4 + Math.random() * 6; n.facing += (Math.random() - 0.5) * 2; }
        else { n.char.play("eat"); n.timer = 3 + Math.random() * 4; }
      }
    } else {
      wish.copyFrom(n.forward.scale(0.9));
      if (n.timer <= 0) { n.state = "idle"; n.timer = 3 + Math.random() * 6; }
    }
    n.step(dt, wish, 3);
    n.char.locomotion(n.speed, 0.9, 4.5, dt);
    void w;
  }

  // ------------------------------------------------------------- bodies, bumps & gossip
  private bumpT = 0;
  private chatT = 2;
  /** soft collision between people (and cows) and the player, with Hindi reactions */
  private resolveContacts(dt: number, pp: Vector3) {
    const w = this.w, pl = w.player;
    this.bumpT -= dt; this.chatT -= dt;
    const near = this.npcs.filter((n) => !n.dead && Vector3.DistanceSquared(n.position, pp) < 30 * 30);
    // player vs npc
    if (!pl.inVehicle && !pl.dead) {
      for (const n of near) {
        const r = (n.role === "cow" ? 0.75 : 0.34) + 0.32;
        const dx = pl.position.x - n.position.x, dz = pl.position.z - n.position.z, d = Math.hypot(dx, dz);
        if (d >= r || d < 1e-4) continue;
        const push = r - d, nx = dx / d, nz = dz / d;
        const share = n.role === "cow" ? 1 : 0.4; // cows don't budge
        pl.position.x += nx * push * share; pl.position.z += nz * push * share;
        n.position.x -= nx * push * (1 - share); n.position.z -= nz * push * (1 - share);
        if (pl.speed > 1.2 && this.bumpT <= 0) {
          this.bumpT = 1.6;
          if (n.role === "cow") { w.audio.play("cow_moo", { at: n.position, volume: 0.8 }); n.char.play("hit"); continue; }
          if ((n.lastSpoke ?? 0) > performance.now() - 5000) continue;
          n.lastSpoke = performance.now();
          const key = BUMP_LINES[Math.floor(Math.random() * BUMP_LINES.length)], line = VOICE_LINES[key];
          w.fx.speech(n.char.root, line.hi, line.en, 2.6);
          w.audio.voice(key, isFemale(n), n.position);
          n.turnTowards(Math.atan2(dx, dz), 1, 1);
          if (n.role === "civ" && n.state === "wander" && Math.random() < 0.15 && n.brave) { n.state = "fight"; n.timer = 6; }
        }
      }
    }
    // npc vs npc (cheap: only people near the player)
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const a = near[i], b = near[j];
      const r = (a.role === "cow" ? 0.75 : 0.3) + (b.role === "cow" ? 0.75 : 0.3);
      const dx = a.position.x - b.position.x, dz = a.position.z - b.position.z, d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (r - d) / 2, nx = dx / d, nz = dz / d;
      if (a.role !== "cow") { a.position.x += nx * push; a.position.z += nz * push; }
      if (b.role !== "cow") { b.position.x -= nx * push; b.position.z -= nz * push; }
    }
    // people in groups chat with each other (bubbles everywhere nearby, voices only up close)
    if (this.chatT <= 0) {
      this.chatT = 2.5 + Math.random() * 3;
      const talkers = near.filter((n) => n.chatty && n.state === "idle" && Vector3.DistanceSquared(n.position, pp) < 22 * 22);
      const n = talkers[Math.floor(Math.random() * talkers.length)];
      if (n) {
        const key = CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)], line = VOICE_LINES[key];
        w.fx.speech(n.char.root, line.hi, line.en, 3.2);
        if (!n.char.busy) n.char.play("interact", { speed: 0.9 });
        if (Vector3.Distance(n.position, pp) < 14) w.audio.voice(key, isFemale(n), n.position, 16);
      }
    }
  }

  /** walk across to the facing corner of the neighbouring block */
  private crossRoad(n: Npc) {
    const span = BLOCK + ROAD;
    const options: Vector3[] = [];
    const c = this.corner(n.block, n.corner);
    const dx = n.corner === 1 || n.corner === 2 ? 1 : -1;
    const dz = n.corner >= 2 ? 1 : -1;
    for (const [ox, oz] of [[dx, 0], [0, dz]]) {
      const nb = this.w.town.blocks.find((b) => Math.abs(b.x0 - (n.block.x0 + ox * span)) < 1 && Math.abs(b.z0 - (n.block.z0 + oz * span)) < 1);
      if (nb) options.push(new Vector3(c.x + ox * (ROAD + 3), 0.18, c.z + oz * (ROAD + 3)));
    }
    if (!options.length) { n.dir *= -1; return; }
    const target = options[Math.floor(Math.random() * options.length)];
    // wait at the zebra crossing until the cars crossing our path have a red light
    const axis = Math.abs(target.x - c.x) > 1 ? "x" : "z";
    if (this.w.signals && !this.w.signals.canWalk(c, axis)) { n.state = "idle"; n.timer = 0.6 + Math.random(); n.crossWait = true; n.facing = Math.atan2(target.x - c.x, target.z - c.z); return; }
    n.crossWait = false;
    const nb = this.w.town.blocks.find((b) => target.x >= b.x0 - 0.1 && target.x <= b.x0 + BLOCK + 0.1 && target.z >= b.z0 - 0.1 && target.z <= b.z0 + BLOCK + 0.1);
    if (!nb) return;
    n.block = nb;
    // which corner of the new block is that?
    const lx = target.x - nb.x0 < BLOCK / 2, lz = target.z - nb.z0 < BLOCK / 2;
    n.corner = lz ? (lx ? 0 : 1) : (lx ? 3 : 2);
    n.target = target;
    n.state = "cross";
  }

  /** a constable/soldier fires at the player: hit chance falls with distance and when you're moving fast */
  private shoot(n: Npc, pp: Vector3, d: number) {
    const w = this.w, pl = w.player;
    const muzzle = n.position.add(new Vector3(0, 1.35, 0)).add(n.forward.scale(0.5));
    const moving = Math.min(1, pl.speed / 12);
    const p = (n.gun === "rifle" ? 0.62 : 0.45) * (1 - d / 45) * (1 - moving * 0.5);
    const hit = Math.random() < p;
    const target = pp.add(new Vector3(hit ? 0 : (Math.random() - 0.5) * 3, hit ? 1.2 : 0.4 + Math.random() * 2, hit ? 0 : (Math.random() - 0.5) * 3));
    w.fx.tracer(muzzle, target);
    w.audio.gunshot(false, n.position);
    if (hit) (pl as unknown as { damage(a: number, f: Vector3, k: number, force?: boolean): boolean }).damage(n.gun === "rifle" ? 9 : 6, n.position, 1.5, true);
  }

  private los(from: Vector3, to: Vector3) {
    const a = from.add(new Vector3(0, 1.6, 0)), b = to.add(new Vector3(0, 1.4, 0));
    const dir = b.subtract(a); const len = dir.length();
    const r = new Ray(a, dir.normalize(), len);
    const hit = Grid.current ? Grid.current.pick(r, (m) => m.isPickable && m.checkCollisions && m.name === "collider") : this.w.scene.pickWithRay(r, (m) => m.isPickable && m.checkCollisions && m.name === "collider");
    return !hit?.hit;
  }

  /** Cheat: spawn a herd of cows around a point */
  cowRain(at: Vector3) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawnCow(at.add(new Vector3(Math.cos(a) * 6, 6 + Math.random() * 6, Math.sin(a) * 6)));
    }
  }

  clearPolice() { for (const p of this.police) { p.state = "wander"; } }
}

/** Parent a weapon mesh to the right wrist bone and cancel the rig's scale. */
/** Put a weapon in the right fist using its grip (HOLDS). Returns the swing pivot (or null). */
export function attachToHand(char: Character, weapon: TransformNode | null, id: WeaponId = "lathi") {
  if (!weapon) return null;
  const wrist = char.bone("Wrist.R")[0];
  if (!wrist) return null;
  const h = HOLDS[id];
  const pivot = new TransformNode("weaponPivot", weapon.getScene());
  pivot.parent = wrist;
  wrist.computeWorldMatrix(true);
  const s = wrist.absoluteScaling;
  pivot.scaling.set(1 / s.x, 1 / s.y, 1 / s.z);
  pivot.position.set(0, 0.08 / s.y, 0);
  pivot.rotation.set(...h.rot);
  pivot.metadata = { base: [...h.rot] };
  weapon.parent = pivot;
  weapon.position.set(0, h.slide, 0);
  weapon.rotation.set(0, 0, 0);
  // the pivot goes when the weapon is disposed
  weapon.onDisposeObservable.add(() => pivot.dispose());
  return pivot;
}
