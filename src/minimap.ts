import type { Vector3 } from "@babylonjs/core";
import type { MapRect } from "./world/town";

const PX = 1.5; // pixels per metre on the baked map
const PAD = 20;

export type Blip = { x: number; z: number; color: string; size?: number; shape?: "dot" | "square"; icon?: string; label?: string };

/** GTA-style rotating radar + full-screen map, both baked once from the town layout. */
export class Minimap {
  private baked: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private half: number;
  route: Vector3[] = [];
  waypoint: { x: number; z: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, rects: MapRect[], size: number, private names: { x: number; z: number; label: string }[] = [], coast: { x: number; z: number }[] = []) {
    this.ctx = canvas.getContext("2d")!;
    this.half = size / 2;
    const b = document.createElement("canvas");
    b.width = b.height = Math.ceil((size + PAD * 2) * PX);
    const c = b.getContext("2d")!;
    c.fillStyle = "#2b6f8f"; // sea
    c.fillRect(0, 0, b.width, b.height);
    const draw = (r: MapRect, col: string) => {
      c.fillStyle = col;
      c.fillRect(this.mx(r.minX), this.my(r.maxZ), (r.maxX - r.minX) * PX, (r.maxZ - r.minZ) * PX);
    };
    // the island: shallow-water halo, then the beach outline
    if (coast.length) {
      const poly = (grow: number) => { c.beginPath(); coast.forEach((p, i) => { const r = Math.hypot(p.x, p.z), k = (r + grow) / r; (i ? c.lineTo : c.moveTo).call(c, this.mx(p.x * k), this.my(p.z * k)); }); c.closePath(); };
      poly(18); c.fillStyle = "#3f8fa8"; c.fill();
      poly(0); c.fillStyle = "#d8c08c"; c.fill();
    }
    for (const r of rects) if (r.kind === "road") draw(r, "#3d3f45");
    for (const r of rects) if (r.kind === "sand") draw(r, "#d8c08c");
    for (const r of rects) if (r.kind === "jetty") draw(r, "#8a6440");
    for (const r of rects) if (r.kind === "block") draw(r, "#7b7468");
    for (const r of rects) if (r.kind === "maidan" || r.kind === "park") draw(r, "#7f9b4a");
    for (const r of rects) if (r.kind === "building") draw(r, "#c9c0b0");
    // dashed lane markings
    c.strokeStyle = "rgba(255,255,255,0.25)"; c.setLineDash([6, 8]); c.lineWidth = 1;
    this.baked = b;
  }

  private mx(x: number) { return (x + this.half + PAD) * PX; }
  private my(z: number) { return (this.half + PAD - z) * PX; }

  /** Rotating radar in the HUD. */
  draw(px: number, pz: number, camYaw: number, playerYaw: number, blips: Blip[] = []) {
    const { ctx, canvas } = this;
    const W = canvas.width, R = W / 2;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 4, 0, Math.PI * 2); ctx.clip();
    ctx.translate(R, R);
    ctx.rotate(-camYaw);
    const zoom = 1.2;
    ctx.scale(zoom, zoom);
    ctx.translate(-this.mx(px), -this.my(pz));
    ctx.drawImage(this.baked, 0, 0);
    // GPS route
    if (this.route.length > 1) {
      ctx.strokeStyle = "#c04cff"; ctx.lineWidth = 7 / zoom; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      this.route.forEach((p, i) => (i ? ctx.lineTo(this.mx(p.x), this.my(p.z)) : ctx.moveTo(this.mx(p.x), this.my(p.z))));
      ctx.stroke();
    }
    for (const b of blips) {
      if (b.icon) { this.iconAt(ctx, this.mx(b.x), this.my(b.z), b, 1 / zoom, camYaw); continue; }
      ctx.fillStyle = b.color; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
      const s = (b.size ?? 4) / zoom;
      ctx.beginPath();
      if (b.shape === "square") ctx.rect(this.mx(b.x) - s, this.my(b.z) - s, s * 2, s * 2); else ctx.arc(this.mx(b.x), this.my(b.z), s, 0, 7);
      ctx.fill(); ctx.stroke();
    }
    if (this.waypoint) this.pin(ctx, this.mx(this.waypoint.x), this.my(this.waypoint.z), 1 / zoom, camYaw);
    ctx.restore();
    // ring
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.beginPath(); ctx.arc(R, R, R - 4, 0, Math.PI * 2); ctx.stroke();
    // north marker
    const n = -camYaw - Math.PI / 2;
    ctx.fillStyle = "#fff"; ctx.font = "bold 16px Anton, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("N", R + Math.cos(n) * (R - 16), R + Math.sin(n) * (R - 16));
    // player arrow
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(playerYaw - camYaw);
    this.arrow(ctx, 1);
    ctx.restore();
  }

  /** round badge with an emoji (kept upright on the rotating radar), optionally with a name under it */
  private iconAt(ctx: CanvasRenderingContext2D, x: number, y: number, b: Blip, s: number, unrotate: number, withLabel = false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(unrotate); ctx.scale(s, s);
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fillStyle = "rgba(15,15,20,.9)"; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = b.color; ctx.stroke();
    ctx.font = "13px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(b.icon!, 0, 1);
    if (withLabel && b.label) {
      ctx.font = "bold 11px Anton, sans-serif"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.fillStyle = b.color;
      ctx.strokeText(b.label, 0, 22); ctx.fillText(b.label, 0, 22);
    }
    ctx.restore();
  }

  private arrow(ctx: CanvasRenderingContext2D, s: number) {
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -11 * s); ctx.lineTo(8 * s, 9 * s); ctx.lineTo(0, 4 * s); ctx.lineTo(-8 * s, 9 * s); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  private pin(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, unrotate = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(unrotate); ctx.scale(s, s);
    ctx.fillStyle = "#c04cff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-12, -14, -10, -28, 0, -28); ctx.bezierCurveTo(10, -28, 12, -14, 0, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -19, 4, 0, 7); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- full map (pause menu)
  private view = { cx: 0, cz: 0, zoom: 1.7 };

  /** Draw the whole town into `c`, Google-Maps style with a "you are here" dot. */
  drawFull(c: HTMLCanvasElement, px: number, pz: number, yaw: number, blips: Blip[] = []) {
    const ctx = c.getContext("2d")!;
    const W = c.width, H = c.height;
    ctx.fillStyle = "#1d1e22"; ctx.fillRect(0, 0, W, H);
    const fit = Math.min(W, H) / this.baked.width;
    const s = fit * this.view.zoom;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(s, s);
    ctx.translate(-this.mx(this.view.cx), -this.my(this.view.cz));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.baked, 0, 0);
    // place names
    ctx.font = `bold ${14 / s}px Anton, sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 3 / s;
    for (const nm of this.names) { ctx.strokeText(nm.label, this.mx(nm.x), this.my(nm.z)); ctx.fillText(nm.label, this.mx(nm.x), this.my(nm.z)); }
    if (this.route.length > 1) {
      ctx.strokeStyle = "#c04cff"; ctx.lineWidth = 6 / s; ctx.lineJoin = "round"; ctx.beginPath();
      this.route.forEach((p, i) => (i ? ctx.lineTo(this.mx(p.x), this.my(p.z)) : ctx.moveTo(this.mx(p.x), this.my(p.z))));
      ctx.stroke();
    }
    for (const b of blips) {
      if (b.icon) { this.iconAt(ctx, this.mx(b.x), this.my(b.z), b, 1.25 / s, 0, true); continue; }
      ctx.fillStyle = b.color; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5 / s;
      ctx.beginPath(); ctx.arc(this.mx(b.x), this.my(b.z), ((b.size ?? 4) + 1) / s, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (this.waypoint) this.pin(ctx, this.mx(this.waypoint.x), this.my(this.waypoint.z), 1.2 / s);
    // you-are-here: pulsing blue dot with heading cone
    const t = performance.now() / 1000;
    const x = this.mx(px), y = this.my(pz);
    ctx.fillStyle = "rgba(66,133,244,0.25)";
    ctx.beginPath(); ctx.arc(x, y, (14 + Math.sin(t * 3) * 4) / s, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(yaw);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 34 / s); g.addColorStop(0, "rgba(66,133,244,0.6)"); g.addColorStop(1, "rgba(66,133,244,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 34 / s, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#4285f4"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3 / s;
    ctx.beginPath(); ctx.arc(x, y, 7 / s, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** canvas pixel -> world xz for click-to-waypoint */
  screenToWorld(c: HTMLCanvasElement, sx: number, sy: number) {
    const fit = Math.min(c.width, c.height) / this.baked.width;
    const s = fit * this.view.zoom;
    const bx = (sx - c.width / 2) / s + this.mx(this.view.cx);
    const by = (sy - c.height / 2) / s + this.my(this.view.cz);
    return { x: bx / PX - this.half - PAD, z: this.half + PAD - by / PX };
  }

  zoomBy(f: number) { this.view.zoom = Math.max(1, Math.min(5, this.view.zoom * f)); }
  pan(dx: number, dz: number) { this.view.cx += dx; this.view.cz += dz; }
  centerOn(x: number, z: number) { this.view.cx = x; this.view.cz = z; }
  get zoom() { return this.view.zoom; }
}
