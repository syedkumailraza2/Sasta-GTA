import { Grid } from "./grid";
import { AbstractMesh, FreeCamera, Ray, Scene, Vector3 } from "@babylonjs/core";

const MIN_PITCH = -0.55, MAX_PITCH = 1.1, SENS = 0.0025;

/** GTA-style third person chase camera with wall avoidance and a vehicle mode. */
export class ChaseCamera {
  yaw = 0;
  pitch = 0.22;
  private dist = 4.6;
  private target = new Vector3();
  private idleMouse = 0;
  sensitivity = 1;
  invertY = false;
  shake = 0;

  constructor(private scene: Scene, readonly cam: FreeCamera, private colliders: AbstractMesh[]) {}

  snapTo(pos: Vector3, yaw: number) {
    this.yaw = yaw;
    this.target.copyFrom(pos).addInPlaceFromFloats(0, 1.55, 0);
  }

  private shoulder = 0;
  /** follow: when driving, the heading the camera drifts back behind. */
  update(dt: number, focus: Vector3, mouseDX: number, mouseDY: number, opts: { dist?: number; height?: number; follow?: number; speed?: number; shoulder?: number } = {}) {
    const sens = SENS * this.sensitivity;
    this.yaw += mouseDX * sens;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + mouseDY * sens * (this.invertY ? -1 : 1)));
    if (Math.abs(mouseDX) + Math.abs(mouseDY) > 0) this.idleMouse = 0; else this.idleMouse += dt;
    if (opts.follow !== undefined && this.idleMouse > 0.8 && (opts.speed ?? 0) > 1.5) {
      let d = opts.follow - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, 2.5 * dt);
      this.pitch += (0.25 - this.pitch) * Math.min(1, 1.5 * dt);
    }
    const baseDist = opts.dist ?? 4.6, height = opts.height ?? 1.55;
    // over-the-shoulder offset while aiming a gun, so the crosshair isn't on the hero's head
    this.shoulder += ((opts.shoulder ?? 0) - this.shoulder) * Math.min(1, 6 * dt);
    const want = focus.add(new Vector3(Math.cos(this.yaw) * this.shoulder, height, -Math.sin(this.yaw) * this.shoulder));
    Vector3.LerpToRef(this.target, want, Math.min(1, 18 * dt), this.target);

    const dir = new Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    // town colliders only (grid lookup; the old colliders.includes() scan cost ~15M comparisons a frame)
    const ray = new Ray(this.target, dir, baseDist + 0.3);
    const hit = Grid.current ? Grid.current.pick(ray, (m) => m.isPickable && m.checkCollisions && m.name !== "ground")
      : this.scene.pickWithRay(ray, (m) => m.isPickable && m.checkCollisions && m.name !== "ground" && this.colliders.includes(m));
    const allowed = hit?.hit ? Math.max(0.6, hit.distance - 0.3) : baseDist;
    this.dist = allowed < this.dist ? allowed : this.dist + (allowed - this.dist) * Math.min(1, 4 * dt);

    const pos = this.target.add(dir.scale(this.dist));
    if (pos.y < 0.3) pos.y = 0.3;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      pos.addInPlaceFromFloats((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.cam.position.copyFrom(pos);
    this.cam.setTarget(this.target);
  }
}
