import { WEAPONS, WEAPON_ORDER, type WeaponId } from "./weapons";

/** GTA-style weapon wheel: hold E, flick the mouse towards a weapon, release E to equip. */
export class WeaponWheel {
  open = false;
  private el = document.getElementById("wheel")!;
  private items: HTMLElement[] = [];
  private vx = 0;
  private vy = 0;
  selected: WeaponId = "fists";

  constructor() {
    const n = WEAPON_ORDER.length;
    WEAPON_ORDER.forEach((id, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const d = document.createElement("div");
      d.className = "wItem";
      d.style.left = `${50 + Math.cos(a) * 36}%`; d.style.top = `${50 + Math.sin(a) * 36}%`;
      d.innerHTML = `<span class="wIcon">${WEAPONS[id].icon}</span><span class="wName"></span><span class="wHi"></span>`;
      d.querySelector(".wName")!.textContent = WEAPONS[id].name.toUpperCase();
      d.querySelector(".wHi")!.textContent = WEAPONS[id].hi;
      this.el.querySelector(".wheelItems")!.append(d);
      this.items.push(d);
    });
  }

  show(current: WeaponId, owned: Set<WeaponId>) {
    this.open = true; this.vx = this.vy = 0; this.selected = current;
    this.items.forEach((d, i) => d.classList.toggle("locked", !owned.has(WEAPON_ORDER[i])));
    this.el.classList.remove("hidden");
    this.highlight();
  }

  /** feed raw mouse motion while open */
  move(dx: number, dy: number, owned: Set<WeaponId>) {
    this.vx = Math.max(-120, Math.min(120, this.vx + dx));
    this.vy = Math.max(-120, Math.min(120, this.vy + dy));
    if (Math.hypot(this.vx, this.vy) < 30) return;
    const n = WEAPON_ORDER.length;
    let a = Math.atan2(this.vy, this.vx) + Math.PI / 2; // 0 = up, clockwise
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const id = WEAPON_ORDER[Math.round(a / ((Math.PI * 2) / n)) % n];
    if (owned.has(id)) this.selected = id;
    this.highlight();
  }

  private highlight() {
    this.items.forEach((d, i) => d.classList.toggle("on", WEAPON_ORDER[i] === this.selected));
    const w = WEAPONS[this.selected];
    this.el.querySelector(".wheelCenter")!.textContent = `${w.icon} ${w.name}`;
  }

  close() { this.open = false; this.el.classList.add("hidden"); return this.selected; }
}
