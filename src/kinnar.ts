import { Vector3 } from "@babylonjs/core";
import { Actor } from "./actor";
import type { Character } from "./characters";
import type { World } from "./world";
import type { Input } from "./input";
import { BLOCK, groundAt, isWater } from "./world/town";

/** bright saree colours on the woman2 rig */
export const KINNAR_TINT = { Red: "#e91e63", LimeGreen: "#00a86b", Gold: "#ffc107", Brown: "#120c08", Skin: "#a0662f", Hair: "#120c08", Hair_Brown: "#120c08", Eyebrows: "#120c08" };
const SHAGUN = 50;

/**
 * Now and then a kinnar comes up to you on the street, claps, dances and asks for shagun ("Paise la, main tere
 * waaste naachi!"). Pay (G) and you get her blessing (+health); walk off or ignore her and she calls you kanjoos.
 * She isn't part of the crowd system, so she can't be beaten up, shot or run over.
 */
export class Kinnar {
  private actor: Actor | null = null;
  private state: "away" | "approach" | "dance" | "leave" = "away";
  private t = 0;
  /** first visit comes fairly soon, then every few minutes */
  private nextVisit = 25 + Math.random() * 15;
  private clapT = 0;
  private twirl = 0;
  private asked = 0;
  private leaveTo = new Vector3();
  prompt = "";

  constructor(private w: World, private char: Character) {
    char.setVisible(false);
  }

  /** pink dot on the radar while she's around */
  blip() { return this.state !== "away" && this.actor ? { x: this.actor.position.x, z: this.actor.position.z, color: "#ff4fa3", size: 4 } : null; }

  /** cheat / testing: come right now */
  summon() { if (this.state === "away") this.nextVisit = 0; }

  private spawnPoint(pp: Vector3) {
    // a footpath corner 12-25 m away
    const blocks = this.w.town.blocks;
    for (let i = 0; i < 40; i++) {
      const b = blocks[Math.floor(Math.random() * blocks.length)];
      const c = [[1.5, 1.5], [BLOCK - 1.5, 1.5], [BLOCK - 1.5, BLOCK - 1.5], [1.5, BLOCK - 1.5]][Math.floor(Math.random() * 4)];
      const p = new Vector3(b.x0 + c[0], 0, b.z0 + c[1]);
      const d = Vector3.Distance(p, pp);
      if (d > 12 && d < 25 && !isWater(p.x, p.z)) return p;
    }
    return null;
  }

  update(dt: number, input: Input | null) {
    const w = this.w, pl = w.player as unknown as { position: Vector3; inVehicle: boolean; dead: boolean; money: number; health: number; maxHealth: number; frozen?: boolean; vehicle: { speed: number; cls: string; doorPoint(s: number): Vector3 } | null };
    this.prompt = "";
    // on foot, or sitting in a car/auto that's stopped (red light, jam): she comes to the window
    const veh = pl.inVehicle ? pl.vehicle : null;
    const reachable = !pl.dead && !pl.frozen && w.wanted.level === 0 && (!veh || (Math.abs(veh.speed) < 1.5 && veh.cls !== "heli" && veh.cls !== "boat"));
    const target = veh ? veh.doorPoint(-1) : pl.position;
    if (this.state === "away") {
      this.nextVisit -= dt;
      if (this.nextVisit > 0 || !reachable) return;
      const at = this.spawnPoint(target);
      if (!at) { this.nextVisit = 5; return; }
      if (!this.actor) this.actor = new Actor(w.scene, this.char, at.add(new Vector3(0, groundAt(at.x, at.z) + 0.3, 0)));
      else { this.actor.position.copyFrom(at.add(new Vector3(0, groundAt(at.x, at.z) + 0.3, 0))); this.actor.vel.setAll(0); }
      this.char.setVisible(true); this.char.reset();
      this.state = "approach"; this.t = 0; this.asked = 0;
      w.audio.play("sfx_slap", { at, volume: 0.6, rate: 1.7 }); // a loud clap to announce herself
      w.hud.toast("👏 Taali ki awaaz… koi shagun maangne aa raha hai!", 3000);
      return;
    }
    const a = this.actor!;
    const to = target.subtract(a.position); to.y = 0;
    const d = to.length();
    this.t += dt;
    let wish = Vector3.Zero(), speed = 0;
    switch (this.state) {
      case "approach":
        if (!reachable || this.t > 25) { this.leave(false); break; }
        if (d > 1.8) { speed = d > 6 ? 3.2 : 2.2; wish = to.normalize().scale(speed); }
        else { this.state = "dance"; this.t = 0; this.say("kinnar_1", "पैसे ला, मैं तेरे वास्ते नाची!", "Paise la, main tere waaste naachi!"); }
        break;
      case "dance": {
        a.turnTowards(Math.atan2(to.x, to.z), dt, 8);
        // stay close: follow a little if the player shuffles away
        if (d > 2.6) wish = to.normalize().scale(2.2);
        // dance: alternate gestures, sway and the odd twirl, clapping on the beat
        if (!this.char.busy) this.char.play(Math.random() < 0.5 ? "wave" : "interact", { speed: 1.5 + Math.random() * 0.4 });
        this.twirl = (this.t % 4) > 3.4 ? (this.t % 4 - 3.4) / 0.6 * Math.PI * 2 : 0;
        this.char.root.rotation.z = Math.sin(this.t * 6) * 0.08;
        this.char.root.position.y = Math.abs(Math.sin(this.t * 6)) * 0.06;
        if ((this.clapT -= dt) <= 0) { this.clapT = 0.5; w.audio.play("sfx_slap", { at: a.position, volume: 0.35, rate: 1.9 + Math.random() * 0.2 }); }
        this.prompt = `[G] ₹${SHAGUN} shagun do`;
        if (input?.pressed("KeyG")) {
          if (pl.money >= SHAGUN) {
            pl.money -= SHAGUN; w.hud.flashMoney(-SHAGUN);
            pl.health = Math.min(pl.maxHealth, pl.health + 25);
            this.say("kinnar_bless", "जीता रह बेटा, खुश रह!", "Jeeta reh beta, khush reh!");
            w.hud.toast("🙏 Dua mil gayi! +25 health", 2500);
            this.leave(true);
          } else { w.hud.toast("💸 Jeb khaali hai bhai…", 1500); this.leave(false); }
          break;
        }
        if (this.t > 8 && this.asked === 0) { this.asked = 1; this.say("kinnar_2", "अरे हीरो, शगुन तो दे जा!", "Arre hero, shagun toh de ja!"); }
        if (this.t > 16 || d > 12 || !reachable) this.leave(false);
        break;
      }
      case "leave": {
        const away = this.leaveTo.subtract(a.position); away.y = 0;
        if (away.length() < 1 || this.t > 12 || Vector3.Distance(a.position, pl.position) > 40) { this.state = "away"; this.char.setVisible(false); this.nextVisit = 60 + Math.random() * 60; a.position.y = -50; break; }
        speed = 2.4; wish = away.normalize().scale(speed);
        break;
      }
    }
    if (this.state === "away") return;
    if (this.state !== "dance") { this.char.root.rotation.z = 0; this.char.root.position.y = 0; }
    a.step(dt, wish, 8, this.state !== "dance");
    if (this.state === "dance") this.char.root.rotation.y = a.facing + this.twirl; // step() resets the yaw
    this.char.locomotion(a.speed, 2.3, 6.4, dt);
  }

  private say(key: string, hi: string, en: string) {
    const a = this.actor!;
    this.w.audio.voice(key, true, a.position, 30);
    this.w.fx.speech(this.char.root, hi, en, 3);
  }

  private leave(paid: boolean) {
    const a = this.actor!;
    if (!paid) this.say("kinnar_kanjoos", "हाय हाय! कंजूस कहीं का!", "Haaye haaye! Kanjoos kahin ka!");
    this.state = "leave"; this.t = 0;
    this.char.root.rotation.z = 0; this.char.root.position.y = 0;
    const away = a.position.subtract(this.w.player.position); away.y = 0;
    this.leaveTo = a.position.add((away.lengthSquared() > 0.01 ? away.normalize() : new Vector3(1, 0, 0)).scale(20));
  }
}
