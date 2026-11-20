import { Grid } from "./grid";
import { Mesh, MeshBuilder, Ray, Scene, Vector3 } from "@babylonjs/core";
import type { Character } from "./characters";

export const GRAVITY = 24;

let nextId = 1;

/** Anything that walks: player, pedestrians, police, cows. */
export class Actor {
  readonly id = nextId++;
  readonly collider: Mesh;
  vel = new Vector3();
  facing = 0;
  grounded = false;
  sinceGrounded = 0;
  speed = 0;
  health: number;
  maxHealth: number;
  dead = false;
  /** seconds remaining of stagger/knockback during which input/AI is ignored */
  stunned = 0;
  gravityScale = 1;
  inVehicle = false;

  constructor(
    protected scene: Scene,
    public char: Character,
    spawn: Vector3,
    opts: { radius?: number; halfHeight?: number; health?: number } = {},
  ) {
    const r = opts.radius ?? 0.32, hh = opts.halfHeight ?? 0.88;
    this.collider = MeshBuilder.CreateBox(`actor${this.id}`, { size: 0.1 }, scene);
    this.collider.isVisible = false;
    this.collider.isPickable = false;
    this.collider.checkCollisions = false;
    this.collider.ellipsoid = new Vector3(r, hh, r);
    this.collider.ellipsoidOffset = new Vector3(0, hh, 0);
    this.collider.position.copyFrom(spawn);
    this.collider.metadata = { actor: this };
    char.root.parent = this.collider;
    this.health = this.maxHealth = opts.health ?? 100;
  }

  get position() { return this.collider.position; }
  get yaw() { return this.facing; }
  get forward() { return new Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  /**
   * Integrate one step: wish = desired horizontal velocity (m/s). Collides with the town via Babylon's
   * ellipsoid sweep; `extraBlockers` lets us cheaply add actor-vs-actor pushes.
   */
  step(dt: number, wish: Vector3, accel: number, turnToMove = true) {
    if (this.inVehicle) return;
    const a = Math.min(1, (this.grounded ? accel : accel * 0.35) * dt);
    if (this.stunned > 0) { this.stunned -= dt; }
    else {
      this.vel.x += (wish.x - this.vel.x) * a;
      this.vel.z += (wish.z - this.vel.z) * a;
    }
    this.sinceGrounded = this.grounded ? 0 : this.sinceGrounded + dt;
    this.vel.y -= GRAVITY * this.gravityScale * dt;
    const before = this.collider.position.clone();
    const disp = this.vel.scale(dt);
    this.collider.moveWithCollisions(disp);
    const moved = this.collider.position.subtract(before);
    let onGround = this.vel.y <= 0 && moved.y > disp.y + 1e-4;
    if (!onGround && this.vel.y <= 0 && this.collider.position.y < 0.5) {
      // cheap fallback: we know the ground plane is at 0 / kerbs at 0.18
      onGround = this.collider.position.y <= 0.2;
    } else if (!onGround && this.vel.y <= 0) {
      const ray = new Ray(this.collider.position.add(new Vector3(0, 0.3, 0)), Vector3.Down(), 0.38);
      onGround = Grid.current ? Grid.current.pick(ray, (m) => m.checkCollisions && m.isPickable).hit : !!this.scene.pickWithRay(ray, (m) => m.checkCollisions && m.isPickable)?.hit;
    }
    this.grounded = onGround;
    if (onGround) this.vel.y = Math.max(this.vel.y, -1);
    if (this.vel.y > 0 && moved.y < disp.y * 0.5) this.vel.y = 0;
    if (this.stunned > 0 && onGround) { this.vel.x *= 0.9; this.vel.z *= 0.9; }
    const hs = Math.hypot(moved.x, moved.z) / Math.max(dt, 1e-4);
    this.speed += (hs - this.speed) * Math.min(1, 10 * dt);
    if (this.collider.position.y < -20) this.collider.position.set(0, 2, -29);

    if (turnToMove && wish.lengthSquared() > 0.01 && this.stunned <= 0) this.turnTowards(Math.atan2(wish.x, wish.z), dt, 12);
    this.collider.rotation.y = 0;
    this.char.root.rotation.y = this.facing;
  }

  /** Collision-free kinematic step for far-away walkers (big CPU saving with crowds). */
  stepCheap(dt: number, wish: Vector3) {
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, 6 * dt);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, 6 * dt);
    this.vel.y = 0;
    this.collider.position.x += this.vel.x * dt;
    this.collider.position.z += this.vel.z * dt;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.grounded = true;
    if (wish.lengthSquared() > 0.01) this.turnTowards(Math.atan2(wish.x, wish.z), dt, 12);
    this.char.root.rotation.y = this.facing;
  }

  turnTowards(yaw: number, dt: number, rate = 10) {
    let d = yaw - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, rate * dt);
  }

  /** Apply damage. Returns true if this hit killed. */
  damage(amount: number, from: Vector3, knock = 3): boolean {
    if (this.dead) return false;
    this.health -= amount;
    const dir = this.position.subtract(from); dir.y = 0;
    if (dir.lengthSquared() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    this.vel.x = dir.x * knock; this.vel.z = dir.z * knock; this.vel.y = Math.min(4, knock * 0.4);
    this.stunned = Math.min(0.6, 0.15 + knock * 0.05);
    if (this.health <= 0) {
      this.health = 0;
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.dead = true;
    this.char.dead = true;
    this.char.play("death", { hold: true });
  }

  dispose() {
    this.char.dispose();
    this.collider.dispose();
  }
}
