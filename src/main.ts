import {
  CascadedShadowGenerator, Color3, Color4, DefaultRenderingPipeline, DirectionalLight, Engine, FreeCamera,
  HemisphericLight, ImageProcessingConfiguration, MeshBuilder, Scene, Vector3, AbstractMesh,
} from "@babylonjs/core";
import { SkyMaterial } from "@babylonjs/materials/sky";
import "@babylonjs/loaders/glTF";
import { buildTown, roadCenter, blockMin, BLOCK, BOUNDS, HALF, SHORE, N, coastline, isWater, inLandCell, outOfBounds, coastDist } from "./world/town";
import { createSea, decorateBeach } from "./world/coast";
import { VOICE_LINES } from "./voiceLines";
import { Player } from "./player";
import { Input } from "./input";
import { ChaseCamera } from "./camera";
import { Minimap, type Blip } from "./minimap";
import { Audio } from "./audio";
import { loadSettings, saveSettings } from "./settings";
import { CharacterLibrary } from "./characters";
import { Fx } from "./fx";
import { Wanted, type World } from "./world";
import { NpcManager } from "./npc";
import { VehicleLibrary } from "./vehicles";
import { TrafficManager } from "./traffic";
import { Pickups } from "./pickups";
import { Cheats, type Cheat } from "./cheats";
import { Hud, PauseMenu } from "./ui";
import { route } from "./nav";
import { WeaponWheel } from "./wheel";
import { Signals } from "./signals";
import { Kinnar, KINNAR_TINT } from "./kinnar";
import { setBikeFall } from "./player";
import { Shops } from "./shops";
import { PlayerLook, loadLook } from "./look";
import "./style.css";
import { ColliderGrid, Grid } from "./grid";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const setLoading = (msg: string, pct: number) => { $("loadingMsg").textContent = msg; $("loadingBar").style.width = `${pct}%`; };
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const TIPS = [
  "TIP: Gaay ko horn mat maaro. Woh tumse zyada local hai.",
  "TIP: E daba ke rakho: hathiyaar wheel. Belt, hockey, balla, katta… sab hai.",
  "TIP: Salon mein naya hairstyle, Fashion Point pe naye kapde. Peela marker dhoondo.",
  "TIP: Pulis ki gaadi chura sakte ho. Par kyun?",
  "TIP: Chai pi lo, health wapas aa jayegi. Science hai.",
  "TIP: Map kholo (M), click karo, aur GPS pe bharosa rakho.",
];

async function main() {
  $("loadTip").textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  const canvas = $<HTMLCanvasElement>("game");
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true }, false);
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
  window.addEventListener("resize", () => engine.resize());
  const settings = loadSettings();
  const audio = new Audio(settings);

  setLoading("Fonts aur chai ready ho rahe hain…", 3);
  await Promise.all([document.fonts.load('64px "Rozha One"', "सस्ता"), document.fonts.load('64px "Anton"', "SASTA")]).catch(() => undefined);
  await frame();

  const scene = new Scene(engine);
  scene.collisionsEnabled = true;
  scene.skipPointerMovePicking = true;
  const haze = new Color3(0.93, 0.7, 0.5);
  scene.clearColor = new Color4(haze.r, haze.g, haze.b, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0042;
  scene.fogColor = haze;
  scene.ambientColor = new Color3(0.25, 0.22, 0.2);

  const camera = new FreeCamera("cam", new Vector3(0, 30, -80), scene);
  camera.inputs.clear();
  camera.minZ = 0.1; camera.maxZ = 2600; // skybox corners sit ~1400m out
  camera.fov = 0.95;

  // ---- golden-hour lighting ----
  const sunDir = new Vector3(-0.35, -0.32, -1).normalize();
  const sun = new DirectionalLight("sun", sunDir, scene);
  sun.intensity = 3; sun.diffuse = new Color3(1, 0.78, 0.55); sun.position = sunDir.scale(-150);
  const hemi = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  hemi.intensity = 1.05; hemi.diffuse = new Color3(0.7, 0.78, 0.95); hemi.groundColor = new Color3(0.45, 0.32, 0.22); hemi.specular = Color3.Black();
  const skyMat = new SkyMaterial("skyMat", scene);
  skyMat.backFaceCulling = false; skyMat.useSunPosition = true; skyMat.sunPosition = sunDir.scale(-100);
  skyMat.turbidity = 6; skyMat.rayleigh = 2.2; skyMat.mieCoefficient = 0.004; skyMat.mieDirectionalG = 0.72; skyMat.luminance = 1.0;
  const sky = MeshBuilder.CreateBox("skyBox", { size: 1600 }, scene);
  sky.material = skyMat; sky.infiniteDistance = true; sky.applyFog = false; sky.isPickable = false;

  setLoading("Bhaukaal Nagar ki galiyan bana rahe hain…", 10);
  await frame();
  const town = buildTown(scene);
  createSea(scene, [sky]);
  town.colliders.push(...(await decorateBeach(scene)));
  Grid.current = new ColliderGrid(town.colliders);

  setLoading("Sun, shadows aur dhool…", 25);
  await frame();
  const csm = new CascadedShadowGenerator(2048, sun);
  csm.numCascades = 2; csm.shadowMaxZ = 110; csm.lambda = 0.85; csm.stabilizeCascades = true;
  csm.usePercentageCloserFiltering = true; csm.filteringQuality = CascadedShadowGenerator.QUALITY_MEDIUM;
  csm.darkness = 0.25; csm.bias = 0.003; csm.normalBias = 0.02;
  for (const m of town.meshes) csm.addShadowCaster(m);
  // dynamic things (characters, vehicles, pickups) cast shadows as they spawn
  const noShadow = /collider|actor|veh\d|splat|^ft$|^pl$|skyBox|solid|bound|ring|wires/;
  // crowds (60 skinned NPCs x 3 cascades) are too expensive to cast shadows; the player and vehicles do
  scene.onNewMeshAddedObservable.add((m: AbstractMesh) => { if (!noShadow.test(m.name)) setTimeout(() => m.isVisible && !m.metadata?.noShadow && csm.addShadowCaster(m), 0); });

  const pipeline = new DefaultRenderingPipeline("post", true, scene, [camera]);
  pipeline.fxaaEnabled = true;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.4; pipeline.imageProcessing.contrast = 1.25;
  pipeline.imageProcessing.vignetteColor = new Color4(0.25, 0.1, 0.02, 0); pipeline.imageProcessing.vignetteWeight = 2.2;
  pipeline.bloomThreshold = 0.82; pipeline.bloomWeight = 0.35; pipeline.bloomKernel = 64;
  pipeline.grain.intensity = 4; pipeline.grain.animated = true;
  pipeline.chromaticAberration.aberrationAmount = 3;
  const applyGraphics = () => {
    pipeline.bloomEnabled = settings.postFx; pipeline.grainEnabled = settings.postFx;
    pipeline.chromaticAberrationEnabled = settings.postFx; pipeline.imageProcessing.vignetteEnabled = settings.postFx;
    sun.shadowEnabled = settings.shadows;
  };
  applyGraphics();

  // ---- assets ----
  const chars = new CharacterLibrary(scene);
  const vlib = new VehicleLibrary(scene);
  let p1 = 0, p2 = 0, p3 = 0;
  const prog = () => setLoading("Log, gaadiyan aur gaayein bula rahe hain…", 30 + (p1 + p2 + p3) * 22);
  await Promise.all([
    chars.load(["player", "business", "beach", "casual", "punk", "woman1", "woman2", "cow"], (f) => { p1 = f; prog(); }),
    vlib.load((f) => { p2 = f; prog(); }),
    audio.preload((f) => { p3 = f; prog(); }, Object.keys(VOICE_LINES)),
  ]);

  setLoading("Hero tayyar ho raha hai…", 96);
  const fx = new Fx(scene);
  const hud = new Hud();
  const wanted = new Wanted();
  const pickups = new Pickups(scene);
  const input = new Input(canvas);
  const chase = new ChaseCamera(scene, camera, town.colliders);
  chase.sensitivity = settings.sensitivity; chase.invertY = settings.invertY;

  const cheatsState = { bigHeads: false, party: false };
  let player!: Player;
  let npcs!: NpcManager;
  const world = {
    scene, town, audio, fx, chars, settings,
    get player() { return player; },
    wanted,
    hud,
    spawnMoney: (at: Vector3, amount: number) => pickups.money(at, amount),
    actors: () => npcs.all,
    timeScale: 1,
    cheats: cheatsState,
  } as World;
  const playerChar = chars.spawn("player", { tint: { Skin: "#9a6236", Purple: "#5b1a2e", LightBlue: "#22385e", White: "#e9e9e9", Hair: "#120c08", Eyebrows: "#120c08" }, name: "hero" });
  player = new Player(scene, playerChar, town.spawn.clone(), world);
  player.wheel = new WeaponWheel();
  let hitStop = 0;
  player.onImpact = (shake, stop) => { chase.shake = Math.max(chase.shake, shake); hitStop = Math.max(hitStop, stop); };
  scene.onAfterAnimationsObservable.add(() => { if (state === "playing") player.lateUpdate(Math.min(engine.getDeltaTime() / 1000, 1 / 20) * world.timeScale); });
  // hairstyle + clothes (built on the bind pose, before the first frame animates the skeleton)
  const saved = loadLook();
  const playerLook = new PlayerLook(scene, playerChar);
  playerLook.apply(saved.look);
  player.aimRay = () => {
    // camera ray through the crosshair, started level with the player so nothing behind them gets hit
    const r = camera.getForwardRay(200), head = player.position.add(new Vector3(0, 1.3, 0));
    const t = Math.max(0, Vector3.Dot(head.subtract(r.origin), r.direction));
    r.origin = r.origin.add(r.direction.scale(t)); r.length = 90;
    return r;
  };
  npcs = new NpcManager(world);
  const signals = new Signals(scene);
  world.signals = signals;
  const traffic = new TrafficManager(world, vlib, npcs);
  setBikeFall((_p, v, d) => traffic.fallBike(v, d, v.lastCrash, false));
  signals.onKnock = (p, v, sp) => {
    audio.clang(p);
    if (v.driver !== "player") return;
    chase.shake = Math.max(chase.shake, Math.min(0.5, sp * 0.03));
    if (p.kind === "signal") { hud.toast("🚦💥 Signal hi uda diya! Sarkari sampatti hai bhai.", 2500); wanted.crime(1); }
    else hud.toast("💡💥 Khamba gira diya!", 1500);
  };
  traffic.init();
  // build spare bodies now (loading screen) so cops, soldiers, riders and police jeeps never stall the game later
  setLoading("Pulis aur fauj ko taiyaar kar rahe hain…", 97);
  await frame();
  npcs.prewarm([["police", 7], ["army", 6], ["casual", 3], ["punk", 3], ["business", 3], ["beach", 3], ["woman1", 3], ["woman2", 3]]);
  const poolVehicles = traffic.prewarm([["police", 3], ["suv", 2], ["scooter", 2], ["motorcycle", 2], ["auto", 2], ["car_small", 2], ["car_sedan", 1], ["taxi", 1], ["truck", 1]]);
  fx.warm();
  for (let i = 0; i < 34; i++) npcs.spawnCiv(town.spawn, 4, 50);
  npcs.spawnCow(new Vector3(roadCenter(4) + 2, 0, roadCenter(4) + 20)); // just one to start: they're rare now

  // weapon & chai pickups dotted around
  const rb = () => town.blocks[Math.floor(Math.random() * town.blocks.length)];
  for (let i = 0; i < 18; i++) { const b = rb(); pickups.chai(new Vector3(b.x0 + BLOCK - 1.5, 0.18, b.z0 + BLOCK / 2)); }
  for (let i = 0; i < 8; i++) { const b = rb(); pickups.weapon(new Vector3(b.x0 + 1.5, 0.18, b.z0 + BLOCK / 2), i % 2 ? "bat" : "lathi"); }

  const owned = new Set(saved.owned);
  const kinnar = new Kinnar(world, chars.spawn("woman2", { tint: KINNAR_TINT, name: "kinnar" }));
  const shops = new Shops(world, player, playerLook, owned, (kind, x, z, h) => { traffic.spawn(kind, new Vector3(x, 0, z), h); });
  // permanent upgrades bought earlier
  if (owned.has("nojam")) player.noJam = true;
  if (owned.has("bigmag")) { player.clipSize = 12; player.ammo = 12; }
  if (owned.has("chyawan")) { player.maxHealth = 150; player.health = 150; }
  shops.onClose = () => { chase.yaw = player.facing; if (state === "playing") input.lock(); };

  // ---- map, GPS, menu ----
  const zones = [
    { x: 29, z: 29, label: "MAIDAN" }, { x: 0, z: 200, label: "CHANDNI CHOWK" }, { x: 0, z: -200, label: "STATION ROAD" },
    { x: 180, z: 0, label: "GANDHI NAGAR" }, { x: -200, z: 0, label: "SHASTRI COLONY" }, { x: HALF + 35, z: 120, label: "JUHU BEACH" },
    { x: SHORE + 150, z: 0, label: "ARABIAN SEA" }, { x: town.helipad.x, z: town.helipad.z - 16, label: "HELIPAD" },
  ];
  const minimap = new Minimap($<HTMLCanvasElement>("minimap"), town.rects, BOUNDS.maxX * 2, zones, coastline(540));
  let routeT = 0;
  const setWaypoint = (p: { x: number; z: number } | null) => {
    // only on the island: the sea, and anything past the map edge, can't be a destination
    if (p && (isWater(p.x, p.z) || coastDist(p.x, p.z) < 2)) {
      hud.toast("🌊 Waha sirf samundar hai bhai! Waypoint island pe lagao.", 2200);
      audio.play("horn_goofy", { volume: 0.2, rate: 1.6 });
      return;
    }
    minimap.waypoint = p;
    minimap.route = p ? route(player.vehiclePos(), new Vector3(p.x, 0, p.z)) : [];
    if (p) audio.play("siren_brr", { volume: 0.15, rate: 2 });
  };
  const blips = (): Blip[] => [
    ...(kinnar.blip() ? [kinnar.blip()!] : []),
    ...shops.blips(),
    ...npcs.police.map((n) => ({ x: n.position.x, z: n.position.z, color: Math.floor(performance.now() / 250) % 2 ? "#ff3b3b" : "#3b7bff", size: 4 })),
    ...pickups.items.filter((p) => p.kind === "money").map((p) => ({ x: p.node.position.x, z: p.node.position.z, color: "#7ee081", size: 3 })),
    ...pickups.items.filter((p) => p.kind !== "money" && p.respawn === undefined).map((p) => ({ x: p.node.position.x, z: p.node.position.z, color: p.kind === "chai" ? "#ffb38a" : "#ffd166", size: 3, shape: "square" as const })),
  ];

  // ---- cheats ----
  const toggles = { slowmo: false, moon: false };
  const resetHeads = () => { for (const c of [player.char, ...npcs.all.map((n) => n.char)]) for (const h of c.bone("Head")) h.scaling.setAll(1); };
  const cheatList: Cheat[] = [
    { code: "PAISAHIPAISA", desc: "+₹1,00,000. Paisa hi paisa hoga!", run: () => { player.money += 100000; hud.flashMoney(100000); audio.say("money_follows", { force: true }); } },
    { code: "AMMAKAPYAR", desc: "Full health. Maa ke haath ka khana.", run: () => { player.health = player.maxHealth; } },
    { code: "JUGAAD", desc: "All weapons + full katta.", run: () => { player.giveAll(); player.ammo = 6; player.equip("katta"); } },
    { code: "THULLAHATAO", desc: "Bribe the thulla: ₹100, wanted level gone.", run: () => {
      // "Sahab, kuch le-de kar khatam karo" — costs a hundred
      const fee = Math.min(100, player.money);
      player.money -= fee; if (fee) hud.flashMoney(-fee);
      bribing = true; wanted.set(0); bribing = false; npcs.clearPolice();
      audio.voice("bribe", false, player.vehiclePos(), 60);
      fx.speech(player.char.root, "साहब, कुछ ले-दे कर खत्म करो!", "Sahab, kuch le-de kar khatam karo!", 3);
      return `₹${fee} ki chai-paani. Mamla rafa-dafa.`;
    } },
    { code: "BADHAI", desc: "Call the kinnar for shagun (G to pay).", run: () => { kinnar.summon(); } },
    { code: "BHAUKAAL", desc: "5 stars. Poori pulis peeche.", run: () => { wanted.set(5); } },
    { code: "AUTOWALA", desc: "Spawn an auto rickshaw.", run: () => { traffic.spawnInFront("auto", player.position, player.yaw); } },
    { code: "NETAJI", desc: "Spawn neta-ji ki SUV.", run: () => { traffic.spawnInFront("suv", player.position, player.yaw); } },
    { code: "BULLETRAJA", desc: "Spawn a Bullet motorcycle.", run: () => { traffic.spawnInFront("motorcycle", player.position, player.yaw); } },
    { code: "SCOOTYPEP", desc: "Spawn a scooty.", run: () => { traffic.spawnInFront("scooter", player.position, player.yaw); } },
    { code: "SUPERCAR", desc: "Spawn a supercar. Dhoom machale!", run: () => { traffic.spawnInFront("supercar", player.position, player.yaw); } },
    { code: "UDANKHATOLA", desc: "Spawn a helicopter.", run: () => { traffic.spawnInFront("heli", player.position.add(new Vector3(0, 0, 0)), player.yaw); } },
    { code: "GAUMATA", desc: "It's raining cows. 🐄", run: () => { npcs.cowRain(player.position); } },
    { code: "BADASIR", desc: "Big-head mode (toggle).", run: () => { cheatsState.bigHeads = !cheatsState.bigHeads; if (!cheatsState.bigHeads) resetHeads(); return `Big heads ${cheatsState.bigHeads ? "ON" : "OFF"}`; } },
    { code: "CHANDRAYAAN", desc: "Moon gravity (toggle).", run: () => { toggles.moon = !toggles.moon; player.gravityScale = toggles.moon ? 0.25 : 1; return `Chandrayaan mode ${toggles.moon ? "ON 🚀" : "OFF"}`; } },
    { code: "CHAIBREAK", desc: "Slow-motion (toggle).", run: () => { toggles.slowmo = !toggles.slowmo; world.timeScale = toggles.slowmo ? 0.4 : 1; return `Chai break ${toggles.slowmo ? "ON ☕" : "OFF"}`; } },
    { code: "AMARHOON", desc: "Invincible (toggle).", run: () => { player.invincible = !player.invincible; return `Amar ${player.invincible ? "ON" : "OFF"}`; } },
    { code: "USAINBOLT", desc: "Super-fast running (toggle).", run: () => { player.speedBoost = player.speedBoost > 1 ? 1 : 2.2; return `Speed ${player.speedBoost > 1 ? "ON ⚡" : "OFF"}`; } },
    { code: "TUNAKTUNAK", desc: "Party mode: everybody dances!", run: () => { cheatsState.party = true; audio.play("tunak_tunak", { bus: "music", volume: 1 }); setTimeout(() => (cheatsState.party = false), 12500); } },
  ];
  const cheats = new Cheats(cheatList, (c, msg) => {
    hud.toast(`🎉 CHEAT ACTIVATED: ${c.code} · ${msg}`, 4000);
    if (!["PAISAHIPAISA", "TUNAKTUNAK", "THULLAHATAO", "BADHAI"].includes(c.code)) audio.say("kaisa_laga_majak", { force: true });
  });

  const menu = new PauseMenu(minimap, settings, () => {
    saveSettings(settings); audio.applySettings(); applyGraphics();
    chase.sensitivity = settings.sensitivity; chase.invertY = settings.invertY;
  }, () => ({ x: player.vehiclePos().x, z: player.vehiclePos().z, yaw: player.inVehicle && player.vehicle ? player.vehicle.heading : player.yaw, blips: blips() }), setWaypoint, cheatList);

  // ---- wanted reactions ----
  let bribing = false; // the bribe cheat has its own line, so skip the usual "ek dum se waqt badal diya"
  wanted.onChange = (lvl, prev) => {
    if (lvl > prev) {
      if (lvl >= 5) audio.say("khel_khatam", { force: true });
      else if (lvl === 1) audio.say("iss_sajjan", { cooldown: 10 });
      if (lvl >= 2 && prev < 2) hud.toast("🚨 Pulis ki gaadi aa rahi hai!");
      if (lvl >= 4 && prev < 4) hud.toast("🔫 Ab pulis goli chalayegi! Bhaago!", 3500);
    } else if (lvl === 0 && !bribing) { audio.say("ek_dum_se_waqt", { force: true }); hud.toast("😮‍💨 Bach gaye! Wanted level khatam."); }
  };

  // ---- player hurt / death ----
  let state: "title" | "playing" | "paused" | "dead" = "title";
  let deadT = 0;
  player.onHurt = () => { hud.hurt(); chase.shake = 0.25; };
  player.onDeath = () => {
    state = "dead"; deadT = 0;
    world.timeScale = 0.35;
    document.body.classList.add("grey");
    $("hud").classList.add("hidden");
    const bill = Math.min(player.money, 100 + Math.floor(player.money * 0.1));
    $("deadSub").textContent = `Hospital ka bill: ₹${bill.toLocaleString("en-IN")}`;
    player.money -= bill;
    setTimeout(() => { $("dead").classList.remove("hidden"); audio.say("jis_raah_pe", { force: true }); }, 900);
  };
  const respawn = () => {
    $("dead").classList.add("hidden");
    document.body.classList.remove("grey");
    $("hud").classList.remove("hidden");
    world.timeScale = toggles.slowmo ? 0.4 : 1;
    wanted.set(0); npcs.clearPolice();
    const hospital = town.spawn.clone().addInPlaceFromFloats(0, 0.5, 0);
    player.respawn(hospital);
    chase.snapTo(player.position, 0);
    hud.toast("🏥 Sarkari Hospital se discharge. Ab sudhar ja.");
    state = "playing";
  };

  // ---- title screen / flow ----
  const showTitle = () => { $("title").classList.remove("hidden"); $("hud").classList.add("hidden"); };
  let audioStarted = false;
  const startTitleAudio = () => {
    if (audioStarted) return; audioStarted = true;
    audio.unlock(); audio.startTitleMusic(); $("musicHint").style.display = "none";
  };
  window.addEventListener("pointerdown", () => { if (state === "title") startTitleAudio(); });
  window.addEventListener("keydown", () => { if (state === "title") startTitleAudio(); });

  const join = () => {
    audio.unlock();
    audio.stopMusic(); audio.startAmbience();
    state = "playing";
    menu.setOpen(false);
    $("title").classList.add("hidden");
    $("hud").classList.remove("hidden");
    chase.snapTo(player.position, player.yaw);
    input.lock();
    hud.toast("WASD chalo · LMB mukka · RMB thappad · E (hold) hathiyaar wheel · F gaadi · M map");
  };
  const onTitle = () => !$("title").classList.contains("hidden");
  const pause = (tab = "map") => { state = "paused"; menu.setOpen(true, tab); if (document.pointerLockElement) document.exitPointerLock(); };
  const resume = () => {
    if (state !== "paused") return;
    menu.setOpen(false);
    if (onTitle()) { state = "title"; return; }
    state = "playing"; input.lock();
  };
  $("joinBtn").addEventListener("click", join);
  $("resumeBtn").addEventListener("click", resume);
  $("titleSettingsBtn").addEventListener("click", () => { state = "paused"; menu.setOpen(true, "settings"); });
  $("quitBtn").addEventListener("click", () => {
    if (player.inVehicle) player.exit();
    menu.setOpen(false); state = "title"; audio.stopAmbience(); audio.startTitleMusic(); showTitle();
  });
  window.addEventListener("keydown", (e) => {
    if (state === "title" && e.code === "Enter" && !menu.open) join();
    else if (state === "paused" && (e.code === "KeyM" || e.code === "Enter")) resume();
    else if (state === "playing" && e.code === "KeyM" && !shops.open) pause("map");
  });
  canvas.addEventListener("click", () => { if (state === "playing" && !input.locked && !shops.open) input.lock(); });
  document.addEventListener("pointerlockchange", () => { if (!input.locked && state === "playing" && !shops.open) pause("map"); });

  // ---- main loop ----
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const zoneOf = (x: number, z: number) => {
    if (isWater(x, z)) return "Arabian Sea";
    if (!inLandCell(x, z)) return x > HALF && Math.abs(z) < HALF ? "Juhu Beach" : "Kinara Beach";
    if (Math.abs(x - 29) < 22 && Math.abs(z - 29) < 22) return "Maidan";
    if (z > 120) return "Chandni Chowk";
    if (z < -120) return "Station Road";
    return x > 0 ? "Gandhi Nagar" : "Shastri Colony";
  };
  let lastZone = "", shotT = 0, shotIdx = 0, perfT = 0, ambT = 0, edgeT = 0;
  const SHOT_LEN = 9;

  scene.onBeforeRenderObservable.add(() => {
    const rawDt = Math.min(engine.getDeltaTime() / 1000, 1 / 20);
    // weapon wheel = bullet time; a heavy hit freezes the world for a few frames (hit-stop)
    hitStop -= rawDt;
    const dt = rawDt * world.timeScale * (player.wheel?.open ? 0.3 : 1) * (hitStop > 0 ? 0.08 : 1);
    if (state === "title" || (state === "paused" && onTitle())) {
      shotT += rawDt;
      if (shotT > SHOT_LEN) { shotT = 0; shotIdx = (shotIdx + 1) % town.shots.length; const f = $("flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
      const s = town.shots[shotIdx], t = smooth(shotT / SHOT_LEN);
      camera.position = Vector3.Lerp(s.from, s.to, t);
      camera.setTarget(Vector3.Lerp(s.lookFrom, s.lookTo, t));
      npcs.update(rawDt); traffic.update(rawDt); signals.update(rawDt, traffic.vehicles, camera.position);
      player.char.locomotion(0, 2.3, 6.4, rawDt);
      menu.render();
      fx.update(rawDt);
      input.endFrame();
      return;
    }
    if (state === "paused") { menu.render(); input.endFrame(); return; }

    const active = state === "playing" && input.locked;
    input.enabled = active;
    if (active) cheats.feed(input.typed);
    shops.update(dt, active ? input : null);
    player.update(dt, active ? input : null, chase.yaw, npcs, traffic);
    if (shops.near && !player.inVehicle && !shops.open) player.prompt = `[F] ${shops.near.name} mein jao`;
    kinnar.update(dt, active ? input : null);
    if (kinnar.prompt && !player.prompt) player.prompt = kinnar.prompt;
    npcs.update(dt);
    traffic.update(dt);
    signals.update(dt, traffic.vehicles, player.vehiclePos());
    fx.update(dt);

    // pickups
    for (const p of pickups.update(dt, player.vehiclePos(), player.inVehicle ? 2.6 : 1.3)) {
      if (p.kind === "money") {
        player.money += p.amount; hud.flashMoney(p.amount);
        if (p.amount >= 400) audio.say("money_follows", { force: true }); else audio.say("paisa_hi_paisa_hoga", { force: true });
      } else if (p.kind === "chai") { player.health = Math.min(player.maxHealth, player.health + p.amount); hud.toast("☕ Ek cutting chai! +40 health"); }
      else if (p.weapon) player.give(p.weapon);
    }

    // camera
    const v = player.vehicle;
    const focus = v ? v.groundPos : player.position;
    const look = active && !player.wheel?.open;
    if (shops.open) {
      const c = shops.cameraView();
      camera.position = Vector3.Lerp(camera.position, c.pos, Math.min(1, 5 * rawDt));
      camera.setTarget(c.target); camera.fov = c.fov;
    } else if (camera.fov !== 0.95) camera.fov = 0.95;
    if (!shops.open) chase.update(rawDt, focus, look ? input.mouseDX : 0, look ? input.mouseDY : 0,
      v ? { dist: v.cls === "heli" ? 17 : Math.max(5.5, v.spec.length * 1.6), height: v.cls === "heli" ? 4 : v.spec.height + 0.6, follow: v.heading + (v.speed < -0.5 ? Math.PI : 0), speed: Math.abs(v.speed) + (v.cls === "heli" ? 2 : 0) }
        : player.weapon === "katta" ? { dist: 3.2, shoulder: 0.75 } : {});
    // ambience follows what's around: moving vehicles and people nearby
    if ((ambT -= rawDt) <= 0) {
      ambT = 0.5;
      const cars = traffic.vehicles.filter((o) => Math.abs(o.speed) > 2 && Vector3.DistanceSquared(o.groundPos, focus) < 45 * 45).length;
      const people = npcs.all.filter((n) => !n.dead && Vector3.DistanceSquared(n.position, focus) < 22 * 22).length;
      audio.setAmbienceLevels(Math.min(1, cars / 6), Math.min(1, people / 14));
      if (outOfBounds(focus.x, focus.z, 20)) {
        if ((edgeT -= 0.5) <= 0) { edgeT = 6; hud.toast("🚧 Bas bhai! Iske aage Bhaukaal Nagar khatam. Wapas mudo.", 3000); }
      }
    }
    audio.listener.x = focus.x; audio.listener.z = focus.z; audio.listenerYaw = chase.yaw;

    // GPS
    let wpDist: number | null = null;
    if (minimap.waypoint) {
      wpDist = Math.hypot(minimap.waypoint.x - focus.x, minimap.waypoint.z - focus.z);
      if ((routeT -= rawDt) <= 0) { routeT = 0.5; minimap.route = route(focus, new Vector3(minimap.waypoint.x, 0, minimap.waypoint.z)); }
      if (wpDist < 10) { setWaypoint(null); hud.toast("📍 Pahunch gaye! Destination reached."); }
    }
    minimap.draw(focus.x, focus.z, chase.yaw, v ? v.heading : player.yaw, blips());
    const z = zoneOf(focus.x, focus.z);
    if (z !== lastZone) { lastZone = z; hud.zone(z); }
    hud.update({
      money: player.money, health: player.health * 100 / player.maxHealth, armor: player.armor, weapon: player.weapon, stars: wanted.level, blink: wanted.blinking,
      speedKmh: v ? Math.abs(v.speed) * 3.6 : null, prompt: player.prompt, wpDist, running: player.speed > 4,
      ammo: player.weapon === "katta" ? (player.reloadT > 0 ? "RELOAD" : `${player.ammo}/${player.clipSize}`) : "",
      drive: v ? { cls: v.cls, name: v.label, indicator: v.indicator, blinkOn: Math.floor(performance.now() / 333) % 2 === 0, altitude: v.altitude } : null,
    }, rawDt);
    const ch = $("crosshair");
    ch.classList.toggle("hidden", player.weapon !== "katta" || !!v || player.dead || !!shops.open);
    ch.classList.toggle("hit", player.hitMarker > 0);

    if (state === "dead" && (deadT += rawDt) > 7) respawn();
    // adaptive crowd: as many pedestrians as the machine can comfortably draw (28-60)
    if ((perfT += rawDt) > 2) {
      perfT = 0;
      const f = engine.getFps();
      if (f < 42 && npcs.civTarget > 28) npcs.civTarget -= 4;
      else if (f > 55 && npcs.civTarget < 48) npcs.civTarget += 4;
    }
    input.endFrame();
  });

  await scene.whenReadyAsync(); // compiles every shader in use (incl. the prewarmed vehicles above)
  scene.render(); poolVehicles();
  engine.runRenderLoop(() => scene.render());
  $("loading").classList.add("gone");
  showTitle();
  (window as unknown as { __game: unknown }).__game = { scene, player, town, shops, playerLook, signals, kinnar, chase, join, input, engine, csm, npcs, traffic, wanted, pickups, audio, world, cheats, setWaypoint, minimap, menu };
}

main().catch((e) => {
  console.error(e);
  const m = document.getElementById("loadingMsg");
  if (m) m.textContent = "Kuch toh gadbad hai: " + (e?.message ?? e);
});
