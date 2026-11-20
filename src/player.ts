import { track } from "./analytics";
import { Grid } from "./grid";
import { Color3, MeshBuilder, Ray, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { Actor } from "./actor";
import type { Character } from "./characters";
import type { Input } from "./input";
import { WEAPONS, WEAPON_ORDER, HOLDS, BeltRope, swingCurve, buildWeaponMesh, type Attack, type WeaponId } from "./weapons";
import { refreshChain } from "./characters";
import type { WeaponWheel } from "./wheel";
import { attachToHand, type NpcManager, type Npc } from "./npc";
import { Vehicle } from "./vehicles";
import { isWater, coastDist, clampToBounds, groundAt } from "./world/town";
import type { TrafficManager } from "./traffic";
import type { World } from "./world";

/** hook set by the traffic manager: knock the player's bike over */
let traffic_fall: (p: Player, v: Vehicle, dir: Vector3) => void = () => {};
export const setBikeFall = (f: typeof traffic_fall) => { traffic_fall = f; };
const WALK = 2.3, RUN = 6.4, JUMP_V = 7.8;
const ORDER = WEAPON_ORDER;

export class Player extends Actor {
  money = 500;
  weapon: WeaponId = "fists";
  owned = new Set<WeaponId>(WEAPON_ORDER);
  /** katta rounds in the clip (reserve is unlimited: it's sasta, not realistic) */
  ammo = 6;
  /** upgrades from the hathiyaar bhandar / medical store */
  clipSize = 6;
  noJam = false;
  armor = 0;
  reloadT = 0;
  private gunCd = 0;
  wheel: WeaponWheel | null = null;
  /** ray from the camera through the crosshair (set by the game) */
  aimRay: () => Ray = () => new Ray(this.position, this.forward, 50);
  /** true for a moment after a katta round hits someone (crosshair turns red) */
  hitMarker = 0;
  /** frozen while in a shop */
  frozen = false;
  vehicle: Vehicle | null = null;
  private weaponMesh: TransformNode | null = null;
  private pivot: TransformNode | null = null;
  private rope: BeltRope | null = null;
  private swing: { t: number; dur: number; imp: number } | null = null;
  private recoil = 0;
  /** game feel hooks: camera shake amount, hit-stop seconds */
  onImpact: (shake: number, hitStop: number) => void = () => {};
  private jumpBuffer = 0;
  private pending: { t: number; atk: Attack } | null = null;
  private attackCd = 0;
  private sinceHurt = 99;
  private engine: { update(v: number, throttle?: number): void; stop(): void } | null = null;
  invincible = false;
  speedBoost = 1;
  onDeath: () => void = () => {};
  onHurt: (amount: number) => void = () => {};
  /** set by game for the HUD prompt */
  prompt = "";

  constructor(scene: Scene, char: Character, spawn: Vector3, private w: World) {
    super(scene, char, spawn, { health: 100 });
  }

  vehiclePos() { return this.vehicle ? this.vehicle.groundPos : this.position; }

  // ----------------------------------------------------------------- weapons
  equip(id: WeaponId) {
    if (!this.owned.has(id) || this.weapon === id) return;
    this.weapon = id;
    this.weaponMesh?.dispose(); this.weaponMesh = null; this.pivot = null;
    this.rope?.dispose(); this.rope = null;
    this.swing = null;
    if (id === "belt") this.rope = new BeltRope(this.scene, this.position.add(new Vector3(0, 1, 0)));
    else { this.weaponMesh = buildWeaponMesh(this.scene, id); this.pivot = attachToHand(this.char, this.weaponMesh, id); }
    this.w.hud.toast(`${WEAPONS[id].icon} ${WEAPONS[id].name} · ${WEAPONS[id].hi}`, 1500);
  }
  give(id: WeaponId) { this.owned.add(id); this.equip(id); }

  reload() {
    if (this.reloadT > 0 || this.ammo === this.clipSize) return;
    this.reloadT = WEAPONS.katta.gun!.reload;
    this.w.hud.toast("🔄 Reload… goliyan bhar rahe hain", 1200);
  }

  private shoot(npcs: NpcManager, camYaw: number) {
    const g = WEAPONS.katta.gun!;
    if (this.gunCd > 0 || this.reloadT > 0) return;
    if (this.ammo <= 0) { this.reload(); return; }
    this.facing = camYaw; this.char.root.rotation.y = camYaw;
    if (!this.noJam && Math.random() < g.jam) { this.w.audio.gunshot(true); this.gunCd = 0.7; this.w.hud.toast("😬 Katta atak gaya! Phir se dabao", 900); return; }
    this.ammo--; this.gunCd = g.cooldown;
    this.w.audio.gunshot(false);
    this.recoil = 0.12;
    this.onImpact(0.06, 0);
    const ray = this.aimRay();
    // first wall / car / ground the round would hit
    const wall = Grid.current ? Grid.current.pick(ray, (m) => m.isPickable && m.checkCollisions, Vehicle.bodies) : this.scene.pickWithRay(ray, (m) => m.isPickable && m.checkCollisions && m.isEnabled());
    const maxT = wall?.hit ? wall.distance : ray.length;
    let best: Npc | null = null, bt = maxT;
    for (const n of npcs.all) {
      if (n.dead) continue;
      const c = n.position.add(new Vector3(0, n.role === "cow" ? 0.8 : 1.0, 0)).subtract(ray.origin);
      const t = Vector3.Dot(c, ray.direction);
      if (t < 0 || t > bt) continue;
      const perp = c.subtract(ray.direction.scale(t)).length();
      // generous aim assist: within the body, or within ~4 degrees of the crosshair
      if (perp < (n.role === "cow" ? 0.8 : 0.5) || (t < 30 && perp / t < 0.07)) { bt = t; best = n; }
    }
    const end = ray.origin.add(ray.direction.scale(bt));
    this.tracer(end);
    if (best) {
      npcs.hit(best, g.damage * (this.w.cheats.party ? 0 : 1), this.position, 6);
      this.w.fx.floatText(best.dead ? "THAAIN!" : "DHAAIN!", best.position.add(new Vector3(0, 2.1, 0)), "#ff5252", 0.9, 0.8);
      this.hitMarker = 0.15;
    }
    // gunfire in public: instant attention
    this.w.wanted.crime(2);
    npcs.panic(this.position, 35);
    if (this.ammo === 0) this.reload();
  }

  private flashMat: StandardMaterial | null = null;
  /** muzzle flash + bullet streak */
  private tracer(to: Vector3) {
    const muzzle = this.weaponMesh?.getChildTransformNodes(false, (n) => n.name === "muzzle")[0];
    const from = muzzle ? muzzle.getAbsolutePosition().clone() : this.position.add(new Vector3(0, 1.3, 0)).add(this.forward.scale(0.5));
    if (!this.flashMat) { this.flashMat = new StandardMaterial("muzzleFlash", this.scene); this.flashMat.emissiveColor = new Color3(1, 0.75, 0.3); this.flashMat.disableLighting = true; }
    const flash = MeshBuilder.CreateSphere("ft", { diameter: 0.22, segments: 4 }, this.scene);
    flash.material = this.flashMat; flash.position.copyFrom(from); flash.isPickable = false;
    const line = MeshBuilder.CreateLines("ft", { points: [from, to] }, this.scene);
    line.color = new Color3(1, 0.9, 0.6); line.isPickable = false;
    setTimeout(() => { flash.dispose(); line.dispose(); }, 70);
  }
  giveAll() { ORDER.forEach((id) => this.owned.add(id)); }

  private attack(atk: Attack) {
    if (this.attackCd > 0 || this.char.busy) return;
    const dur = this.char.play(atk.anim, { speed: atk.speed });
    this.attackCd = dur * 0.85;
    this.pending = { t: dur * atk.impact, atk };
    this.swing = { t: 0, dur, imp: atk.impact };
    this.w.audio.whoosh(atk.heavy);
  }

  private resolveHit(atk: Attack, npcs: NpcManager) {
    const f = this.forward;
    const h = HOLDS[this.weapon];
    // step into the blow: heavier weapons carry you further
    if (h.lunge) { this.vel.x += f.x * h.lunge; this.vel.z += f.z * h.lunge; }
    if (this.rope) this.rope.whip(f.add(new Vector3(0, 0.3, 0)), 28);
    let best: Npc | null = null, bd = Infinity;
    for (const n of npcs.all) {
      if (n.dead) continue;
      const d = n.position.subtract(this.position); d.y = 0;
      const dist = d.length();
      const reach = atk.range + (n.role === "cow" ? 0.6 : 0);
      if (dist > reach || dist < 1e-3) continue;
      if (Vector3.Dot(d.scale(1 / dist), f) < 0.35) continue;
      if (dist < bd) { bd = dist; best = n; }
    }
    if (!best) return;
    npcs.hit(best, atk.damage * (this.w.cheats.party ? 0 : 1), this.position, atk.knock);
    // a proper bat/hockey shot lifts them off their feet
    if (h.launch && best.role !== "cow") { best.vel.y = Math.max(best.vel.y, h.launch * (best.dead ? 1.3 : 0.6)); best.vel.x += f.x * h.launch; best.vel.z += f.z * h.launch; }
    this.onImpact(h.shake ?? 0.1, h.hitStop ?? 0.04);
    this.w.audio.play(atk.sound, { volume: 0.9, rate: 0.9 + Math.random() * 0.2 });
    this.w.fx.floatText(atk.label, best.position.add(new Vector3(0, 2.1, 0)), "#ffd166", 0.9, 0.8);
  }

  // ----------------------------------------------------------------- damage
  /** `force`: bullets reach you even inside a vehicle (and don't knock the car around) */
  override damage(amount: number, from: Vector3, knock = 3, force = false) {
    if (this.dead || this.invincible || (this.inVehicle && !force)) return false;
    if (this.inVehicle) {
      this.sinceHurt = 0; this.onHurt(amount);
      if (this.armor > 0) { const soak = Math.min(this.armor, amount * 0.7); this.armor -= soak; amount -= soak; }
      this.health -= amount;
      if (this.health <= 0) {
        this.health = 0.5; this.forceExit(new Vector3(1, 0, 0));
        const killed = super.damage(1, from, 0);
        if (killed) { this.pending = null; this.onDeath(); }
        return killed;
      }
      return false;
    }
    // bulletproof jacket soaks most of it
    if (this.armor > 0) { const soak = Math.min(this.armor, amount * 0.7); this.armor -= soak; amount -= soak; }
    this.sinceHurt = 0;
    this.onHurt(amount);
    if (Math.random() < 0.35) this.w.audio.play("sfx_ouch", { volume: 0.5 });
    if (!this.char.busy || Math.random() < 0.5) this.char.play(Math.random() < 0.5 ? "hit" : "hit2", { speed: 1.4 });
    const killed = super.damage(amount, from, knock);
    if (killed) { this.pending = null; this.onDeath(); }
    return killed;
  }

  respawn(at: Vector3) {
    this.dead = false; this.char.reset(); this.health = this.maxHealth;
    this.position.copyFrom(at); this.vel.setAll(0); this.stunned = 0;
  }

  // ----------------------------------------------------------------- vehicles
  enter(v: Vehicle, traffic: TrafficManager) {
    track("vehicle_enter", { kind: v.kind });
    traffic.takeOver(v);
    v.pickUp();
    this.vehicle = v; this.inVehicle = true;
    this.weaponMesh?.setEnabled(false); this.rope?.setEnabled(false);
    if (v.cls === "bike" || v.kind === "jetski") {
      // sit on it, visibly
      this.char.root.parent = v.body;
      this.char.root.rotation.set(0, 0, 0);
      this.char.root.position.set(0, -v.spec.height / 2 + (v.kind === "jetski" ? 0.45 : v.kind === "scooter" ? 0.08 : 0.28), v.kind === "scooter" ? -0.1 : -0.15);
      this.char.pose(v.forward, v.kind === "scooter");
    } else this.char.setVisible(false);
    this.collider.position.copyFrom(v.groundPos);
    this.engine = this.w.audio.engine(v.kind);
    if (v.kind === "supercar") this.w.audio.play("supercar_rev", { volume: 0.8 });
    if (v.cls === "heli") this.loopSnd = this.w.audio.loop("heli_loop", 0.5);
    if (v.kind === "jetski") this.loopSnd = this.w.audio.loop("jetski", 0.25);
    this.w.hud.toast(`${v.cls === "heli" ? "🚁" : v.cls === "boat" ? "🚤" : "🚗"} ${v.label} · ${v.spec.hi}`, 2500);
  }
  private swimWarnT = 0;
  private loopSnd: { stop(): void; setVolume(v: number): void } | null = null;

  exit() {
    const v = this.vehicle;
    if (!v) return;
    if (v.cls === "heli" && v.altitude > 1.5) { this.w.hud.toast("🪂 Hawa mein utroge? Pehle land karo (SHIFT)!", 2000); return; }
    if (v.cls === "boat") {
      // only step off next to the jetty or the beach
      const dry = [v.doorPoint(-1), v.doorPoint(1), v.groundPos.add(v.forward.scale(v.spec.length / 2 + 1))].find((p) => !Vehicle.isWater(p.x, p.z));
      if (!dry) { this.w.hud.toast("🌊 Tairna nahi aata! Jetty ya kinare ke paas utro.", 2200); return; }
    }
    if (this.char.riding) { this.char.unpose(); this.char.root.parent = this.collider; this.char.root.position.set(0, 0, 0); }
    v.setIndicator("off"); if (v.indicator !== "off") v.setIndicator("off");
    this.loopSnd?.stop(); this.loopSnd = null;
    // try the left door first (we drive on the left!), then right, then roof
    let out = v.doorPoint(-1);
    for (const p of [v.doorPoint(-1), v.doorPoint(1), v.groundPos.add(v.forward.scale(v.spec.length / 2 + 1))]) {
      if (Vehicle.isWater(p.x, p.z)) continue;
      const blocked = this.w.town.colliders.some((c) => c.name === "collider" && c.getBoundingInfo().boundingBox.intersectsPoint(p.add(new Vector3(0, 1, 0))));
      if (!blocked) { out = p; break; }
    }
    v.driver = "none"; v.speed *= 0.3;
    this.vehicle = null; this.inVehicle = false;
    this.position.copyFrom(out.add(new Vector3(0, 0.3, 0)));
    this.vel.setAll(0);
    this.facing = v.heading;
    this.char.setVisible(true); this.weaponMesh?.setEnabled(true); this.rope?.setEnabled(true);
    this.engine?.stop(); this.engine = null;
  }

  /** knocked off a two-wheeler: lands beside it, hurt by the impact */
  thrownOff(dir: Vector3, speed: number) {
    if (!this.vehicle) return;
    this.forceExit(dir);
    this.w.hud.toast("🤕 Gir gaye! Helmet pehna karo.", 2000);
    this.damage(Math.min(60, speed * 2.2), this.position.subtract(dir), Math.min(9, speed * 0.5));
  }

  /** get out right now, wherever the vehicle is (crash, death) */
  forceExit(dir: Vector3) {
    const v = this.vehicle;
    if (!v) return;
    if (this.char.riding) { this.char.unpose(); this.char.root.parent = this.collider; this.char.root.position.set(0, 0, 0); }
    this.loopSnd?.stop(); this.loopSnd = null;
    this.engine?.stop(); this.engine = null;
    v.driver = "none";
    this.vehicle = null; this.inVehicle = false;
    this.position.copyFrom(v.groundPos.add(dir.scale(1.4)).add(new Vector3(0, 0.4, 0)));
    this.vel.setAll(0);
    this.char.setVisible(true); this.weaponMesh?.setEnabled(true); this.rope?.setEnabled(true);
    v.setIndicator("off");
    if (v.cls === "heli") this.position.y = Math.max(this.position.y, v.position.y - 1);
  }

  // ----------------------------------------------------------------- per-frame
  update(dt: number, input: Input | null, camYaw: number, npcs: NpcManager, traffic: TrafficManager) {
    this.attackCd -= dt;
    this.gunCd -= dt;
    this.hitMarker -= dt;
    if (this.reloadT > 0 && (this.reloadT -= dt) <= 0) { this.reloadT = 0; this.ammo = this.clipSize; this.w.audio.gunshot(true); }
    if (this.wheel?.open && (this.dead || this.inVehicle || !input)) this.wheel.close();
    this.sinceHurt += dt;
    if (!this.dead && this.sinceHurt > 6 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 5 * dt);
    this.prompt = "";

    if (this.inVehicle && this.vehicle) return this.updateDriving(dt, input);

    // weapon swing overlay (wind-up -> whip through -> settle)
    if (this.swing) {
      this.swing.t += dt;
      const sw = HOLDS[this.weapon].swing, k = this.swing.t / this.swing.dur;
      if (this.pivot && sw) {
        const base = this.pivot.metadata.base as number[], a = swingCurve(k, this.swing.imp, sw.windup, sw.follow);
        this.pivot.rotation.set(base[0] + (sw.axis === "x" ? a : 0), base[1], base[2] + (sw.axis === "z" ? a : 0));
      }
      if (k >= 1) this.swing = null;
    }
    // pending strike lands mid-animation
    if (this.pending && (this.pending.t -= dt) <= 0) { const a = this.pending.atk; this.pending = null; this.resolveHit(a, npcs); }

    let mx = 0, mz = 0, running = false;
    if (input && !this.dead && !this.frozen) {
      mz = (input.down("KeyW") || input.down("ArrowUp") ? 1 : 0) - (input.down("KeyS") || input.down("ArrowDown") ? 1 : 0);
      mx = (input.down("KeyD") || input.down("ArrowRight") ? 1 : 0) - (input.down("KeyA") || input.down("ArrowLeft") ? 1 : 0);
      running = input.down("ShiftLeft") || input.down("ShiftRight");
      if (input.pressed("Space")) this.jumpBuffer = 0.15;
      // weapons: hold E for the wheel
      const wpn = WEAPONS[this.weapon];
      if (this.wheel) {
        if (input.pressed("KeyE") && !this.wheel.open) this.wheel.show(this.weapon, this.owned);
        if (this.wheel.open) {
          this.wheel.move(input.mouseDX, input.mouseDY, this.owned);
          if (!input.down("KeyE")) this.equip(this.wheel.close());
        }
      }
      if (!this.wheel?.open) {
        if (input.clicked(0)) { if (wpn.gun) this.shoot(npcs, camYaw); else this.attack(wpn.primary); }
        else if (wpn.gun && input.mouse(0) && this.gunCd <= 0 && this.ammo > 0) this.shoot(npcs, camYaw); // hold to keep firing
        if (input.clicked(2)) this.attack(wpn.secondary ?? WEAPONS.fists.secondary!);
        if (input.pressed("KeyR") && wpn.gun) this.reload();
      }
      for (let i = 0; i < ORDER.length; i++) if (input.pressed(`Digit${i + 1}`)) this.equip(ORDER[i]);
      if (input.wheel) {
        const owned = ORDER.filter((id) => this.owned.has(id));
        const idx = owned.indexOf(this.weapon);
        this.equip(owned[(idx + input.wheel + owned.length) % owned.length]);
      }
      // vehicles
      const near = traffic.nearestEnterable(this.position);
      if (near) {
        this.prompt = `[F] ${near.label} mein baitho`;
        if (input.pressed("KeyF")) { this.enter(near, traffic); return; }
      }
    }
    const fwd = new Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new Vector3(fwd.z, 0, -fwd.x);
    const wish = fwd.scale(mz).addInPlace(right.scale(mx));
    if (wish.lengthSquared() > 0.001) wish.normalize().scaleInPlace((running ? RUN : WALK) * this.speedBoost);
    if (this.char.busy && !this.dead) wish.scaleInPlace(0.25);

    this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0 && this.sinceGrounded < 0.12 && !this.dead) {
      this.vel.y = JUMP_V * (this.gravityScale < 1 ? 1.4 : 1);
      this.grounded = false; this.sinceGrounded = 1; this.jumpBuffer = 0;
    }
    this.step(dt, this.dead ? Vector3.Zero() : wish, 14);
    // knee-deep wading only: the sea is for boats
    const cd = coastDist(this.position.x, this.position.z);
    if ((isWater(this.position.x, this.position.z) && cd < -9) || clampToBounds(this.position, 4)) {
      // push back towards the beach, along the radial direction
      const r = Math.hypot(this.position.x, this.position.z), k = Math.max(0, (r + Math.min(cd, 0) + 9) / r);
      if (cd < -9) { this.position.x *= k; this.position.z *= k; }
      if ((this.swimWarnT -= dt) <= 0) { this.swimWarnT = 4; this.w.hud.toast("🌊 Aage gehra paani hai! Boat ya jet ski lo (jetty pe).", 2500); }
    }
    this.char.locomotion(this.speed, WALK, RUN, dt, !this.grounded && this.sinceGrounded > 0.08);
    // lean into the run
    this.char.root.rotation.x = !this.grounded ? -0.05 : Math.min(0.1, (this.speed / RUN) * 0.08);
    if (this.w.cheats.bigHeads) for (const h of this.char.bone("Head")) h.scaling.setAll(2.4);
  }

  /** after the skeleton animated this frame: aim the gun arm, simulate the belt */
  lateUpdate(dt: number) {
    if (this.inVehicle || this.dead) return;
    this.recoil = Math.max(0, this.recoil - dt);
    if (this.weapon === "katta" && !this.frozen) {
      const d = this.aimRay().direction.clone();
      d.y += this.recoil * 3; // kick
      this.char.aimBone("UpperArm.R", "LowerArm.R", d, 1, false);
      this.char.aimBone("LowerArm.R", "Wrist.R", d, 1, false);
    }
    if (this.rope) {
      const wrist = this.char.bone("Wrist.R")[0];
      if (!wrist) return;
      refreshChain(wrist);
      const hand = wrist.getAbsolutePosition();
      this.rope.update(Math.min(dt, 1 / 30), hand, groundAt(hand.x, hand.z));
    }
  }

  private updateDriving(dt: number, input: Input | null) {
    const v = this.vehicle!;
    const c = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    if (input) {
      c.throttle = input.down("KeyW") || input.down("ArrowUp") ? 1 : 0;
      c.brake = input.down("KeyS") || input.down("ArrowDown") ? 1 : 0;
      c.steer = (input.down("KeyD") || input.down("ArrowRight") ? 1 : 0) - (input.down("KeyA") || input.down("ArrowLeft") ? 1 : 0);
      c.handbrake = input.down("Space");
      if (input.pressed("KeyH") && v.cls !== "heli") this.w.audio.horn(v, { volume: 0.9 });
      if (v.cls !== "heli" && v.cls !== "boat") {
        if (input.pressed("KeyQ")) v.setIndicator("left");
        if (input.pressed("KeyE")) v.setIndicator("right");
        if (input.pressed("KeyX")) v.setIndicator("hazard");
      }
      if (input.pressed("KeyF") && Math.abs(v.speed) < 6) { this.exit(); if (!this.inVehicle) return; }
    }
    if (v.updateIndicators(dt)) this.w.audio.tick(true);
    if (v.cls === "heli") {
      const fc = { lift: 0, forward: 0, yaw: 0 };
      if (input) {
        fc.lift = (input.down("Space") ? 1 : 0) - (input.down("ShiftLeft") || input.down("ShiftRight") ? 1 : 0);
        fc.forward = (input.down("KeyW") || input.down("ArrowUp") ? 1 : 0) - (input.down("KeyS") || input.down("ArrowDown") ? 0.5 : 0);
        fc.yaw = (input.down("KeyD") || input.down("ArrowRight") ? 1 : 0) - (input.down("KeyA") || input.down("ArrowLeft") ? 1 : 0);
      }
      v.fly(dt, fc, true);
      this.loopSnd?.setVolume(0.25 + v.rotorSpin * 0.45);
    } else v.drive(dt, c);
    if (v.lastCrash > 10 && v.cls === "bike") { const d = v.forward.scale(Math.sign(v.speed) || 1); traffic_fall(this, v, d); v.lastCrash = 0; return; }
    if (v.lastCrash > 0) {
      if (v.lastCrash > 8) { this.w.audio.play("sfx_knockout", { volume: 0.5, duration: 0.7, rate: 0.8 }); this.w.hud.toast("💥 DHADAAM!", 900); }
      else this.w.audio.play("sfx_punch", { volume: 0.4, rate: 0.6 });
      v.lastCrash = 0;
    }
    this.engine?.update(Math.min(1, Math.abs(v.speed) / v.spec.maxSpeed), v.cls === "heli" ? 0.5 : Math.max(c.throttle, c.brake * (v.speed < 0 ? 1 : 0)));
    this.collider.position.copyFrom(v.groundPos);
    this.facing = v.heading;
    this.speed = Math.abs(v.speed);
  }
}
