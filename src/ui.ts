import type { Settings } from "./settings";
import type { Minimap, Blip } from "./minimap";
import type { Cheat } from "./cheats";
import { WEAPONS, type WeaponId } from "./weapons";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private toastTimer = 0;
  private moneyShown = 0;
  private deltaTimer = 0;
  private hurtTimer = 0;

  toast(msg: string, ms = 3500) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => t.classList.remove("show"), ms);
  }

  flashMoney(delta: number) {
    const el = $("moneyDelta");
    el.textContent = `${delta >= 0 ? "+" : "-"}₹${Math.abs(delta).toLocaleString("en-IN")}`;
    el.classList.toggle("neg", delta < 0);
    el.classList.add("show");
    clearTimeout(this.deltaTimer); this.deltaTimer = window.setTimeout(() => el.classList.remove("show"), 1800);
  }

  hurt() {
    const h = $("hurt"); h.classList.add("on");
    clearTimeout(this.hurtTimer); this.hurtTimer = window.setTimeout(() => h.classList.remove("on"), 120);
  }

  zone(name: string) { const el = $("zone"); el.textContent = name; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }

  private lastHelp = "";
  update(s: { money: number; health: number; armor?: number; weapon: WeaponId; stars: number; blink: boolean; speedKmh: number | null; prompt: string; wpDist: number | null; running: boolean; ammo?: string; drive?: { cls: string; name: string; indicator: string; blinkOn: boolean; altitude?: number } | null }, dt: number) {
    const dh = $("driveHelp"), ind = $("indicators");
    if (s.drive) {
      const k = (key: string, label: string) => `<div><kbd>${key}</kbd>${label}</div>`;
      const help = `<b>${s.drive.name}</b>` + (s.drive.cls === "heli"
        ? k("SPACE", "upar") + k("SHIFT", "neeche") + k("W / S", "aage / peeche") + k("A / D", "ghoomo") + k("F", "utro (zameen pe)") + `<div>Altitude: ${Math.round(s.drive.altitude ?? 0)} m</div>`
        : s.drive.cls === "boat"
          ? k("W / S", "aage / peeche") + k("A / D", "ghoomo") + k("H", "horn") + k("F", "utro (jetty pe)")
          : k("H", "horn") + k("Q", "◀ indicator") + k("E", "▶ indicator") + k("X", "hazard") + k("SPACE", "handbrake") + k("F", "utro"));
      if (help !== this.lastHelp) { dh.innerHTML = help; this.lastHelp = help; }
      dh.classList.remove("hidden");
      const showInd = s.drive.cls !== "heli" && s.drive.cls !== "boat";
      ind.classList.toggle("hidden", !showInd);
      const L = s.drive.indicator === "left" || s.drive.indicator === "hazard", R = s.drive.indicator === "right" || s.drive.indicator === "hazard";
      $("indL").classList.toggle("on", L && s.drive.blinkOn); $("indR").classList.toggle("on", R && s.drive.blinkOn);
    } else { dh.classList.add("hidden"); ind.classList.add("hidden"); this.lastHelp = ""; }
    // money ticks up like GTA
    this.moneyShown += (s.money - this.moneyShown) * Math.min(1, 8 * dt);
    if (Math.abs(s.money - this.moneyShown) < 1) this.moneyShown = s.money;
    $("money").textContent = String(Math.round(this.moneyShown)).padStart(8, "0");
    const ar = $("armorFill"); ar.style.width = `${Math.max(0, s.armor ?? 0)}%`; ar.parentElement!.classList.toggle("hidden", !(s.armor && s.armor > 0));
    const hp = $("hpFill"); hp.style.width = `${Math.max(0, s.health)}%`; hp.classList.toggle("low", s.health < 30);
    const w = WEAPONS[s.weapon]; $("weaponIcon").textContent = w.icon; $("weaponName").textContent = w.name.toUpperCase() + (s.ammo ? ` · ${s.ammo}` : "");
    const stars = $("stars"); stars.classList.toggle("blink", s.blink);
    stars.querySelectorAll("span").forEach((el, i) => el.classList.toggle("on", i < s.stars));
    $("speed").textContent = s.speedKmh !== null ? `${Math.round(s.speedKmh)} km/h` : s.running ? "BHAAG!" : "";
    const p = $("prompt"); p.textContent = s.prompt; p.classList.toggle("show", !!s.prompt);
    $("wpDist").textContent = s.wpDist !== null ? `📍 ${s.wpDist < 1000 ? Math.round(s.wpDist) + " m" : (s.wpDist / 1000).toFixed(1) + " km"}` : "";
  }
}

/** Pause menu with Map / Settings / Cheats / Controls tabs. */
export class PauseMenu {
  private tab = "map";
  private drag: { x: number; y: number; moved: boolean } | null = null;
  open = false;
  private big = $<HTMLCanvasElement>("bigmap");

  constructor(
    private map: Minimap,
    private settings: Settings,
    private onSettings: () => void,
    private getPlayer: () => { x: number; z: number; yaw: number; blips: Blip[] },
    private onWaypoint: (p: { x: number; z: number } | null) => void,
    cheats: Cheat[],
  ) {
    document.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) => b.addEventListener("click", () => this.show(b.dataset.tab!)));
    this.buildSettings();
    $("cheatList").innerHTML = cheats.map((c) => `<div class="cheat"><code>${c.code}</code><div></div></div>`).join("");
    $("cheatList").querySelectorAll(".cheat div").forEach((d, i) => (d.textContent = cheats[i].desc));
    // map interactions
    const big = this.big;
    big.addEventListener("mousedown", (e) => { this.drag = { x: e.clientX, y: e.clientY, moved: false }; });
    window.addEventListener("mousemove", (e) => {
      if (!this.drag || !this.open) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      if (this.drag.moved) {
        const a = this.map.screenToWorld(big, 0, 0), b = this.map.screenToWorld(big, dx * devicePixelRatio, dy * devicePixelRatio);
        this.map.pan(a.x - b.x, a.z - b.z);
        this.drag.x = e.clientX; this.drag.y = e.clientY;
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (!this.drag || !this.open) { this.drag = null; return; }
      const wasDrag = this.drag.moved; this.drag = null;
      if (wasDrag || e.target !== big) return;
      const r = big.getBoundingClientRect();
      if (e.button === 2) { this.onWaypoint(null); return; }
      const p = this.map.screenToWorld(big, (e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio);
      this.onWaypoint(p);
    });
    big.addEventListener("contextmenu", (e) => e.preventDefault());
    big.addEventListener("wheel", (e) => { e.preventDefault(); this.map.zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
    window.addEventListener("keydown", (e) => { if (this.open && e.code === "KeyC") { const p = this.getPlayer(); this.map.centerOn(p.x, p.z); } });
  }

  show(tab: string) {
    this.tab = tab;
    document.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    document.querySelectorAll(".tabBody").forEach((el) => el.classList.toggle("hidden", el.id !== `tab-${tab}`));
    if (tab === "map") { const p = this.getPlayer(); this.map.centerOn(p.x, p.z); }
  }

  setOpen(v: boolean, tab = "map") {
    this.open = v;
    $("pause").classList.toggle("hidden", !v);
    if (v) this.show(tab);
  }

  /** call every frame while open */
  render() {
    if (!this.open || this.tab !== "map") return;
    const c = this.big, r = c.getBoundingClientRect();
    const w = Math.floor(r.width * devicePixelRatio), h = Math.floor(r.height * devicePixelRatio);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const p = this.getPlayer();
    this.map.drawFull(c, p.x, p.z, p.yaw, p.blips);
  }

  private buildSettings() {
    const g = $("settingsGrid");
    const s = this.settings;
    const rows: (["sec", string] | ["range", keyof Settings, string, number, number, number] | ["check", keyof Settings, string])[] = [
      ["sec", "AUDIO"],
      ["range", "master", "Master volume", 0, 1, 0.05],
      ["range", "music", "Music (title)", 0, 1, 0.05],
      ["range", "sfx", "Sound effects", 0, 1, 0.05],
      ["range", "voice", "Desi dialogues", 0, 1, 0.05],
      ["range", "ambience", "City noise", 0, 1, 0.05],
      ["sec", "CONTROLS"],
      ["range", "sensitivity", "Mouse sensitivity", 0.2, 3, 0.1],
      ["check", "invertY", "Invert mouse Y"],
      ["sec", "GRAPHICS"],
      ["check", "shadows", "Shadows"],
      ["check", "postFx", "Bloom / grain / vignette"],
    ];
    for (const r of rows) {
      if (r[0] === "sec") { const d = document.createElement("div"); d.className = "sec"; d.textContent = r[1]; g.append(d); continue; }
      const label = document.createElement("label"); label.textContent = r[2];
      const out = document.createElement("output");
      const input = document.createElement("input");
      if (r[0] === "range") {
        const [, key, , min, max, step] = r;
        input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step);
        input.value = String(s[key]);
        const fmt = () => (out.textContent = key === "sensitivity" ? `${Number(input.value).toFixed(1)}x` : `${Math.round(Number(input.value) * 100)}`);
        fmt();
        input.addEventListener("input", () => { (s as Record<string, unknown>)[key] = Number(input.value); fmt(); this.onSettings(); });
      } else {
        const [, key] = r;
        input.type = "checkbox"; input.checked = !!s[key];
        input.addEventListener("change", () => { (s as Record<string, unknown>)[key] = input.checked; this.onSettings(); });
      }
      g.append(label, input, out);
    }
  }
}
