import { track } from "./analytics";
import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import type { ShopKind, ShopSpot } from "./world/town";
import type { VehicleKind } from "./vehicles";
import type { World } from "./world";
import type { Player } from "./player";
import type { Input } from "./input";
import { EXTRAS, HAIRSTYLES, HAIR_COLORS, PANTS, TOPS, saveLook, type Look, type PlayerLook } from "./look";

const $ = (id: string) => document.getElementById(id)!;
/** per shop type: names (en/hi), board colour, map/marker icon */
export const SHOP_INFO: Record<ShopKind, { names: [string, string][]; bg: string; icon: string; tag: string; color: string; greet: string }> = {
  barber: { names: [["SALMAN HAIR SALOON", "सलमान हेयर सलून"], ["ROYAL CUTTING POINT", "रॉयल कटिंग"]], bg: "#0d47a1", icon: "✂️", tag: "SALOON", color: "#4fc3f7", greet: "💈 Aao bhai, baitho! Kaisa cut chahiye?" },
  clothes: { names: [["FASHION POINT", "फ़ैशन पॉइंट"], ["BOMBAY KAPDA GHAR", "बॉम्बे कपड़ा घर"]], bg: "#ad1457", icon: "👕", tag: "KAPDE", color: "#f48fb1", greet: "👕 Aao saab! Naya maal aaya hai." },
  gun: { names: [["HATHIYAAR BHANDAR", "हथियार भंडार"], ["MUNNA ARMS & AMMO", "मुन्ना आर्म्स"]], bg: "#37474f", icon: "🔫", tag: "HATHIYAAR", color: "#ff8a65", greet: "🔫 Shhh… dheere bolo. Kya chahiye?" },
  medical: { names: [["SHARMA MEDICAL STORE", "शर्मा मेडिकल"], ["JAN AUSHADHI KENDRA", "जन औषधि केंद्र"]], bg: "#2e7d32", icon: "💊", tag: "DAWAI", color: "#81c784", greet: "💊 Kya hua beta? Phir se maar khaake aaye?" },
  motors: { names: [["SASTA MOTORS", "सस्ता मोटर्स"], ["BHAUKAAL AUTO DEALS", "भौकाल ऑटो डील्स"]], bg: "#e65100", icon: "🛵", tag: "GAADI", color: "#ffb74d", greet: "🛵 Aao! Ekdum first-hand maal, second-hand daam mein." },
};

type Item = {
  key: string; name: string; price: number; swatch?: string;
  /** look items: preview on click, keep after buying */
  set?: (l: Look) => Look; on?: (l: Look) => boolean;
  /** everything else: done on purchase. `once` = permanent upgrade. Return a toast, or false if it can't be bought now */
  act?: () => string | false; once?: boolean;
};

/** Walk-in barber shops and clothes shops: step into the yellow marker, press F. */
export class Shops {
  open: (ShopSpot & { name: string }) | null = null;
  near: (ShopSpot & { name: string }) | null = null;
  private spots: (ShopSpot & { name: string; marker: TransformNode })[] = [];
  private committed: Look;
  private preview: Look;
  private tab = 0;
  private sel: Item | null = null;
  private poles: Mesh[] = [];
  private t = 0;
  private cooldown = 0;
  onClose: () => void = () => {};

  constructor(private w: World, private player: Player, private look: PlayerLook, private owned: Set<string>, private spawnVehicle: (kind: VehicleKind, x: number, z: number, heading: number) => void) {
    this.committed = { ...look.current };
    this.preview = { ...look.current };
    const scene = w.scene;
    const corona = new StandardMaterial("shopCorona", scene);
    corona.emissiveColor = new Color3(1, 0.8, 0.1); corona.disableLighting = true; corona.alpha = 0.35; corona.backFaceCulling = false;
    const count: Record<string, number> = {};
    for (const s of w.town.shops) {
      const info = SHOP_INFO[s.kind];
      const k = count[s.kind] = (count[s.kind] ?? -1) + 1;
      const [en, hi] = info.names[k % info.names.length];
      const n = { x: Math.sin(s.rot), z: Math.cos(s.rot) }, t = { x: Math.cos(s.rot), z: -Math.sin(s.rot) };
      // marker: GTA-style glowing cylinder
      const marker = new TransformNode("shopMarker", scene);
      marker.position.set(s.x, 0.2, s.z);
      const cyl = MeshBuilder.CreateCylinder("shopCyl", { height: 0.9, diameter: 1.5, tessellation: 24, cap: Mesh.NO_CAP }, scene);
      cyl.material = corona; cyl.parent = marker; cyl.position.y = 0.45; cyl.isPickable = false;
      const icon = MeshBuilder.CreatePlane("shopIcon", { width: 1.6, height: 0.8 }, scene);
      icon.material = this.label(`${info.icon} ${info.tag}`, info.color);
      icon.billboardMode = Mesh.BILLBOARDMODE_ALL; icon.parent = marker; icon.position.y = 2.1; icon.isPickable = false;
      // big shop board over the door
      const face = { x: s.x - n.x * 1.4, z: s.z - n.z * 1.4 };
      const board = MeshBuilder.CreatePlane("shopBoard", { width: 7.6, height: 1.15 }, scene);
      board.material = this.board(en, hi, info.bg);
      board.position.set(face.x + n.x * 0.32, 3.1, face.z + n.z * 0.32); board.rotation.y = s.rot + Math.PI; board.isPickable = false;
      if (s.kind === "barber") {
        const pole = MeshBuilder.CreateCylinder("barberPole", { height: 1.2, diameter: 0.22, tessellation: 16 }, scene);
        pole.material = this.poleMat(); pole.position.set(face.x + n.x * 0.4 + t.x * 2.6, 2.0, face.z + n.z * 0.4 + t.z * 2.6); pole.isPickable = false;
        this.poles.push(pole);
      }
      this.spots.push({ ...s, name: en, marker });
    }
    $("shopExit").addEventListener("click", () => this.close());
    $("shopBuy").addEventListener("click", () => this.buy());
    window.addEventListener("keydown", (e) => { if (this.open && (e.code === "Escape" || e.code === "Backspace")) this.close(); if (this.open && e.code === "Enter") this.buy(); });
  }

  private label(text: string, color: string) {
    const t = new DynamicTexture("shopLbl", { width: 512, height: 256 }, this.w.scene, true);
    const c = t.getContext() as unknown as CanvasRenderingContext2D;
    c.clearRect(0, 0, 512, 256); c.font = "bold 92px Anton, Impact, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = 14; c.strokeStyle = "#000"; c.strokeText(text, 256, 128); c.fillStyle = color; c.fillText(text, 256, 128);
    t.update(); t.hasAlpha = true;
    const m = new StandardMaterial("shopLblM", this.w.scene); m.diffuseTexture = t; m.useAlphaFromDiffuseTexture = true; m.emissiveColor = Color3.White(); m.disableLighting = true;
    return m;
  }
  private board(en: string, hi: string, bg: string) {
    const t = new DynamicTexture("shopBoardT", { width: 1024, height: 160 }, this.w.scene, true);
    const c = t.getContext() as unknown as CanvasRenderingContext2D;
    c.fillStyle = bg; c.fillRect(0, 0, 1024, 160); c.strokeStyle = "#ffd54f"; c.lineWidth = 8; c.strokeRect(6, 6, 1012, 148);
    c.fillStyle = "#fff"; c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "bold 70px Anton, Impact, sans-serif"; c.fillText(en, 30, 84);
    c.textAlign = "right"; c.fillStyle = "#ffeb3b"; c.font = '56px "Rozha One", serif'; c.fillText(hi, 1000, 88);
    t.update();
    const m = new StandardMaterial("shopBoardM", this.w.scene); m.diffuseTexture = t; m.emissiveColor = new Color3(0.45, 0.45, 0.45);
    return m;
  }
  private pole: StandardMaterial | null = null;
  private poleMat() {
    if (this.pole) return this.pole;
    const t = new DynamicTexture("poleT", { width: 128, height: 256 }, this.w.scene, true);
    const c = t.getContext() as unknown as CanvasRenderingContext2D;
    c.fillStyle = "#fff"; c.fillRect(0, 0, 128, 256);
    for (let i = -4; i < 12; i++) { c.fillStyle = i % 2 ? "#d32f2f" : "#1565c0"; c.beginPath(); c.moveTo(0, i * 32); c.lineTo(128, i * 32 + 64); c.lineTo(128, i * 32 + 80); c.lineTo(0, i * 32 + 16); c.fill(); }
    t.update();
    this.pole = new StandardMaterial("poleM", this.w.scene); this.pole.diffuseTexture = t; this.pole.emissiveColor = new Color3(0.3, 0.3, 0.3);
    return this.pole;
  }

  blips() { return this.spots.map((s) => ({ x: s.x, z: s.z, color: SHOP_INFO[s.kind].color, size: 5, icon: SHOP_INFO[s.kind].icon, label: s.name })); }

  /** call before the player update: handles walking into a marker */
  update(dt: number, input: Input | null) {
    this.t += dt; this.cooldown -= dt;
    for (const p of this.poles) p.rotation.y += dt * 2.5;
    for (const s of this.spots) s.marker.position.y = 0.2 + Math.sin(this.t * 2) * 0.05;
    if (this.open) return;
    this.near = null;
    const pl = this.player;
    if (pl.inVehicle || pl.dead || this.cooldown > 0) return;
    for (const s of this.spots) if (Math.hypot(pl.position.x - s.x, pl.position.z - s.z) < 1.1) this.near = s;
    if (this.near && input?.pressed("KeyF")) this.enter(this.near);
  }

  private tabs(): { title: string; items: Item[] }[] {
    if (!this.open) return [];
    const pl = this.player, w = this.w;
    switch (this.open.kind) {
      case "barber": return [
        { title: "HAIRSTYLE", items: HAIRSTYLES.map((h) => ({ key: `hair:${h.id}`, name: `${h.name} · ${h.hi}`, price: h.price, set: (l: Look) => ({ ...l, hair: h.id }), on: (l: Look) => l.hair === h.id })) },
        { title: "RANG", items: HAIR_COLORS.map((h) => ({ key: `hc:${h.id}`, name: h.name, price: h.price, swatch: h.id, set: (l: Look) => ({ ...l, hairColor: h.id }), on: (l: Look) => l.hairColor === h.id })) },
      ];
      case "clothes": return [
        { title: "HOODIE", items: TOPS.map((h) => ({ key: `top:${h.id}`, name: h.name, price: h.price, swatch: h.id, set: (l: Look) => ({ ...l, top: h.id }), on: (l: Look) => l.top === h.id })) },
        { title: "PANT", items: PANTS.map((h) => ({ key: `pants:${h.id}`, name: h.name, price: h.price, swatch: h.id, set: (l: Look) => ({ ...l, pants: h.id }), on: (l: Look) => l.pants === h.id })) },
        { title: "EXTRAS", items: EXTRAS.map((h) => ({ key: `x:${h.id}`, name: h.name, price: h.price, set: (l: Look) => ({ ...l, [h.id]: !l[h.id] }), on: (l: Look) => !!l[h.id] })) },
      ];
      case "gun": return [
        { title: "KATTA", items: [
          { key: "ammo", name: `Goliyan bharo (${pl.clipSize} round)`, price: 50, act: () => pl.ammo >= pl.clipSize ? false : ((pl.ammo = pl.clipSize), "🔫 Katta full!") },
          { key: "nojam", name: "Katta servicing (kabhi nahi atkega)", price: 1500, once: true, act: () => ((pl.noJam = true), "🔧 Ab katta makkhan chalega.") },
          { key: "bigmag", name: "Bada magazine (12 goli)", price: 3000, once: true, act: () => ((pl.clipSize = 12), (pl.ammo = 12), "📦 12 goli ka magazine!") },
        ] },
        { title: "SURAKSHA", items: [
          { key: "armor", name: "Bulletproof jacket (armour 100)", price: 800, act: () => pl.armor >= 100 ? false : ((pl.armor = 100), "🦺 Jacket pehen li. Ab aao pulis!") },
          { key: "allweap", name: "Saare hathiyaar (belt, lathi, hockey, balla)", price: 0, act: () => { pl.giveAll(); return "🏏 Sab tumhara hai, bhai."; } },
        ] },
      ];
      case "medical": return [
        { title: "DAWAI", items: [
          { key: "pudin", name: "Pudin Hara (+10)", price: 20, act: () => this.heal(10, "🌿 Pet theek, mood theek.") },
          { key: "crocin", name: "Crocin + Band-aid (+35)", price: 60, act: () => this.heal(35, "🩹 Patti lag gayi.") },
          { key: "drip", name: "Glucose drip (full health)", price: 200, act: () => this.heal(999, "💉 Ekdum fresh!") },
          { key: "chyawan", name: "Chyawanprash (max health 150)", price: 2500, once: true, act: () => { pl.maxHealth = 150; pl.health = 150; return "💪 Rozana do chammach. Max health 150!"; } },
        ] },
      ];
      case "motors": {
        const veh = (key: VehicleKind, name: string, price: number): Item => ({ key: `veh:${key}`, name, price, act: () => { this.deliver(key); return `🔑 ${name} bahar khadi hai. Chaabi lo!`; } });
        return [{ title: "GAADIYAN", items: [veh("scooter", "Scooty", 800), veh("auto", "Auto Rickshaw", 1500), veh("motorcycle", "Bullet", 2500), veh("taxi", "Kaali-Peeli Taxi", 3000), veh("suv", "Neta-ji SUV", 7000), veh("supercar", "Supercar", 40000), veh("heli", "Helicopter", 100000)] }];
      }
    }
    void w;
    return [];
  }
  private heal(n: number, msg: string): string | false {
    const pl = this.player;
    if (pl.health >= pl.maxHealth) return false;
    pl.health = Math.min(pl.maxHealth, pl.health + n);
    return msg;
  }
  /** park the purchase on the road in front of the showroom */
  private deliver(kind: VehicleKind) {
    const s = this.open!;
    const n = { x: Math.sin(s.rot), z: Math.cos(s.rot) };
    this.spawnVehicle(kind, s.x + n.x * 4.8, s.z + n.z * 4.8, s.rot + Math.PI / 2);
  }
  private isOwned(it: Item) { return it.set ? it.price === 0 || this.owned.has(it.key) : !!it.once && this.owned.has(it.key); }

  private enter(s: ShopSpot & { name: string }) {
    this.open = s; this.tab = 0; this.sel = null;
    this.committed = { ...this.look.current }; this.preview = { ...this.committed };
    const pl = this.player;
    pl.frozen = true; pl.position.x = s.x; pl.position.z = s.z; pl.vel.setAll(0); pl.facing = s.rot; pl.char.root.rotation.y = s.rot;
    if (document.pointerLockElement) document.exitPointerLock();
    $("shopTitle").textContent = s.name;
    $("shop").classList.remove("hidden");
    $("hud").classList.add("shopping");
    for (const o of this.spots) o.marker.setEnabled(false);
    this.w.audio.play("sfx_slap", { volume: 0.3, rate: 1.8 });
    this.w.hud.toast(SHOP_INFO[s.kind].greet, 2500);
    this.render();
  }

  close() {
    if (!this.open) return;
    const s = this.open;
    this.look.apply(this.committed); // try-ons you didn't buy go back on the rack
    this.open = null; this.near = null; this.cooldown = 1.2;
    $("shop").classList.add("hidden");
    $("hud").classList.remove("shopping");
    for (const o of this.spots) o.marker.setEnabled(true);
    const pl = this.player;
    pl.frozen = false; pl.position.x = s.x + Math.sin(s.rot) * 1.4; pl.position.z = s.z + Math.cos(s.rot) * 1.4;
    this.onClose();
  }

  /** camera close-up while shopping: in front of the hero, looking back at them */
  cameraView() {
    const s = this.open!, barber = s.kind === "barber";
    // stay on the footpath side of the kerb (electric poles stand on the kerb line)
    const d = barber ? 1.25 : 1.45, side = barber ? 0.3 : 0.5, p = this.player.position;
    return { pos: new Vector3(p.x + Math.sin(s.rot) * d + Math.cos(s.rot) * side, p.y + (barber ? 1.62 : 1.2), p.z + Math.cos(s.rot) * d - Math.sin(s.rot) * side), target: new Vector3(p.x, p.y + (barber ? 1.52 : 0.92), p.z), fov: barber ? 0.8 : 1.35 };
  }

  private render() {
    const tabs = this.tabs();
    $("shopMoney").textContent = `₹${this.player.money.toLocaleString("en-IN")}`;
    const tb = $("shopTabs"); tb.innerHTML = "";
    tabs.forEach((t, i) => { const b = document.createElement("button"); b.className = `tab${i === this.tab ? " on" : ""}`; b.textContent = t.title; b.onclick = () => { this.tab = i; this.sel = null; this.render(); }; tb.append(b); });
    const list = $("shopList"); list.innerHTML = "";
    for (const it of tabs[this.tab].items) {
      const row = document.createElement("div");
      const on = it.on ? it.on(this.preview) : this.isOwned(it);
      row.className = `shopItem${on ? " on" : ""}${this.sel?.key === it.key ? " sel" : ""}`;
      const sw = document.createElement("span"); sw.className = "sw"; if (it.swatch) sw.style.background = it.swatch; else sw.textContent = on ? "✔" : "";
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = it.name;
      const pr = document.createElement("span"); pr.className = "pr";
      pr.textContent = this.isOwned(it) ? (it.on ? (it.on(this.committed) ? "PEHNA HAI" : "APNA HAI") : "LE LIYA") : it.price ? `₹${it.price.toLocaleString("en-IN")}` : "FREE";
      row.append(sw, nm, pr);
      row.onclick = () => { this.sel = it; if (it.set) { this.preview = it.set(this.committed); this.look.apply(this.preview); } this.render(); };
      list.append(row);
    }
    const b = $("shopBuy") as HTMLButtonElement;
    if (!this.sel) { b.textContent = "CHUNO (select)"; b.disabled = true; }
    else if (!this.sel.set && this.isOwned(this.sel)) { b.disabled = true; b.textContent = "LE LIYA ✔"; }
    else { b.disabled = false; b.textContent = this.sel.set && this.isOwned(this.sel) ? "PEHNO ✔" : `KHARIDO · ₹${this.sel.price.toLocaleString("en-IN")}`; }
  }

  private buy() {
    const it = this.sel;
    if (!it || !this.open) return;
    const pl = this.player;
    if (!this.isOwned(it)) {
      if (pl.money < it.price) {
        this.w.hud.toast(`💸 Paise nahi hain bhai! ₹${(it.price - pl.money).toLocaleString("en-IN")} aur chahiye.`, 2500);
        this.w.audio.say("aayein", { force: true });
        return;
      }
    } else if (!it.set) return;
    let msg: string | false = "";
    if (it.act) {
      msg = it.act();
      if (msg === false) { this.w.hud.toast("🙅 Abhi zaroorat nahi hai (already full).", 1800); return; }
    }
    if (!this.isOwned(it) && it.price) { pl.money -= it.price; this.w.hud.flashMoney(-it.price); track("shop_purchase", { shop: this.open.kind, item: it.key, price: it.price }); }
    if (it.set || it.once) this.owned.add(it.key);
    if (it.set) {
      this.committed = it.set(this.committed); this.preview = { ...this.committed };
      this.look.apply(this.committed);
      msg = this.open.kind === "barber" ? "😎 Naya look! Poora mohalla dekh raha hai." : "🕺 Ekdum hero lag rahe ho!";
    }
    saveLook(this.committed, this.owned);
    if (it.price) this.w.audio.play("paisa_hi_paisa", { volume: 0.5, duration: 1.4 });
    this.w.hud.toast(msg || "✔", 2200);
    this.sel = it.set ? null : it;
    if (it.key.startsWith("veh:")) { this.close(); return; }
    this.render();
  }

}
