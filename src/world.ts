import type { Scene, Vector3 } from "@babylonjs/core";
import type { Audio } from "./audio";
import type { CharacterLibrary } from "./characters";
import type { Fx } from "./fx";
import type { Town } from "./world/town";
import type { Settings } from "./settings";
import type { Actor } from "./actor";

/** Shared services every system can reach. Filled in by main.ts. */
export interface World {
  scene: Scene;
  town: Town;
  audio: Audio;
  fx: Fx;
  chars: CharacterLibrary;
  settings: Settings;
  player: Actor & { money: number; inVehicle: boolean; vehiclePos(): Vector3 };
  wanted: Wanted;
  hud: { toast(msg: string, ms?: number): void; flashMoney(delta: number): void };
  spawnMoney(at: Vector3, amount: number): void;
  /** all damageable actors (npcs, police, cows) */
  actors(): Actor[];
  timeScale: number;
  cheats: { bigHeads: boolean; party: boolean };
  /** traffic lights + knockable street furniture */
  signals?: import("./signals").Signals;
}

/** GTA-style heat: 0-5 stars, decays when police lose sight of you. */
export class Wanted {
  level = 0;
  /** seconds since a cop last saw the player */
  unseen = 0;
  onChange: (lvl: number, prev: number) => void = () => {};
  locked = false; // cheat

  /** ensure at least `min` stars, optionally add `add` */
  crime(min: number, add = 0) {
    if (this.locked) return;
    const prev = this.level;
    this.level = Math.min(5, Math.max(this.level, min) + (this.level >= min ? add : 0));
    this.unseen = 0;
    if (this.level !== prev) this.onChange(this.level, prev);
  }

  set(lvl: number) {
    const prev = this.level;
    this.level = Math.max(0, Math.min(5, lvl));
    this.unseen = 0;
    if (prev !== this.level) this.onChange(this.level, prev);
  }

  /** Time needed out of sight to lose one star. */
  get coolTime() { return 9 + this.level * 5; }

  update(dt: number, seenByCop: boolean) {
    if (this.level === 0) return;
    if (seenByCop) { this.unseen = 0; return; }
    this.unseen += dt;
    if (this.unseen > this.coolTime) { this.set(this.level - 1); }
  }

  /** stars blink while police can't see you */
  get blinking() { return this.level > 0 && this.unseen > 2; }
}
