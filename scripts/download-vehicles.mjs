#!/usr/bin/env node
// Downloads the realistic Indian vehicle models (CC-BY, Sketchfab) into public/assets/vehicles/real/.
// The game picks them up automatically on the next reload (falls back to low-poly models if missing).
//
//   SKETCHFAB_API_TOKEN=xxxx node scripts/download-vehicles.mjs
//
// Free token: sign in at sketchfab.com -> Settings -> Password & API -> "API Token".
import fs from "node:fs";
import path from "node:path";

const MODELS = [
  { out: "auto_delhi", uid: "5775d012693741008acff9dad410e92d", name: "Autorikshaw - Indian Tuk Tuk", author: "bhagathartworks" },
  { out: "auto_mumbai", uid: "44776bcb34e04c1a8b9c18a70376304e", name: "Auto Rickshaw", author: "rSquare" },
  { out: "wagonr", uid: "71112627f42342099ff95b59e7532663", name: "2013 Suzuki WagonR", author: "BHP3D" },
  { out: "honda_city", uid: "75671276d4da476294202a5dc050a99e", name: "Honda City 2017", author: "dewa" },
  { out: "bolero", uid: "9f1e594c45e24012b50992bbfeeecda0", name: "Bolero", author: "Waseem Kadri" },
  { out: "ambassador", uid: "a84ef7126b2b43adb7b4b28a4d42e5fb", name: "Hindustan Ambassador", author: "rSquare" },
  { out: "police_jeep", uid: "60ece47d1a6b48fab121b26706a9bae2", name: "Indian Police Jeep", author: "koltesoham" },
  { out: "tata_truck", uid: "be4e08a68a0441f8a41619c3abd73a3a", name: "TATA 2515", author: "danieljorge435" },
  { out: "pulsar", uid: "36d04d99171e4d59b540c25d8650dbd5", name: "pulsar 135 ls", author: "e-restrepo1114" },
  { out: "scooter", uid: "2205f4e69bc64df3aab03c71ab9d7492", name: "Vino", author: "minghauLoh" },
  // ---- spec 04: supercars, water vehicles, helicopter, cows, beach props ----
  { out: "super_ferrari", uid: "e83da098149746b5a3ba6f1661645b09", name: "Ferrari 288 GTO", author: "Randomness" },
  { out: "super_koenigsegg", uid: "b4e5a4c5fa5d4d45acd6715d3325254f", name: "Koenigsegg One:1", author: "iSteven" },
  { out: "super_mclaren", uid: "d805bec04cf5407fa7c036c20c726d39", name: "Free McLaren P1 GTR", author: "ALIEEEN" },
  { out: "super_porsche", uid: "de1ffd344c41481892511f7fd332c136", name: "Porsche 911 (930) Turbo 1975", author: "Lexyc16" },
  { out: "super_lambo", uid: "57b4d2fb00b54f80b9370fb117a67aeb", name: "Lamborghini Aventador SV POLICE DUBAI", author: "SDC PERFORMANCE" },
  { out: "boat_riva", uid: "9d5716a2ab6645b9a1452f1d6b0372ef", name: "Riva aquarama lamborghini", author: "Anton Kovalev" },
  { out: "boat_fisher", uid: "385b039e95754dca8d8c045ed0c515cf", name: "Fisher boat", author: "Batuhan13" },
  { out: "jetski", uid: "37a2348f02da472d98310fd5621307c6", name: "Kawasaki 310XUltra Jet Ski", author: "XOIAL" },
  { out: "helicopter", uid: "ec30f802c6ac43a8843948fbadb674d2", name: "EC 135", author: "GRIP420" },
  { out: "../../animals/cow_farm", uid: "0e780cb5ab6d457198ded7d4e191a03e", name: "Farm Cow Animated Dairy cattle", author: "Rukh3D" },
  { out: "../../animals/cow_zebu", uid: "8de29dda35fb4b4296a60908c9ff97c4", name: "Zebu Bull", author: "Mily" },
  { out: "../../props/palm", uid: "26e787f2ff2e4c0fb004c3b0210805a3", name: "Coconut Palm", author: "evolveduk" },
  { out: "../../props/umbrella", uid: "1014ad7c8a4c4aa8ba5e88fc6151aa4f", name: "Beach Umbrella", author: "stealth86" },
  { out: "../../props/lifeguard", uid: "2f147eeb428847f7b06244026db6c07e", name: "Lifeguard Tower", author: "Sololopenko" },
];

const token = process.env.SKETCHFAB_API_TOKEN;
if (!token) {
  console.error("Set SKETCHFAB_API_TOKEN (free: sketchfab.com -> Settings -> Password & API).");
  process.exit(1);
}
const dir = path.join("public", "assets", "vehicles", "real");
fs.mkdirSync(dir, { recursive: true });

let ok = 0;
for (const m of MODELS) {
  const out = path.join(dir, `${m.out}.glb`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out)) { console.log("✓ already have", m.out); ok++; continue; }
  const r = await fetch(`https://api.sketchfab.com/v3/models/${m.uid}/download`, { headers: { Authorization: `Token ${token}` } });
  if (!r.ok) { console.error(`✗ ${m.name}: ${r.status} ${await r.text()}`); continue; }
  const links = await r.json();
  if (!links.glb?.url) { console.error(`✗ ${m.name}: no GLB export (${Object.keys(links).join(", ")})`); continue; }
  process.stdout.write(`↓ ${m.name} (${(links.glb.size / 1e6).toFixed(1)} MB)… `);
  const f = await fetch(links.glb.url);
  fs.writeFileSync(out, Buffer.from(await f.arrayBuffer()));
  console.log("done");
  ok++;
}

// credits (CC-BY requires attribution)
const credits = path.join("public", "assets", "CREDITS.md");
const block = ["<!-- realistic-vehicles -->", "## Realistic models (Sketchfab, CC Attribution 4.0 / Free Standard)", "| File | Model | Author |", "|---|---|---|",
  ...MODELS.map((m) => `| ${path.posix.normalize(`vehicles/real/${m.out}.glb`)} | [${m.name}](https://sketchfab.com/3d-models/${m.uid}) | ${m.author} |`), "<!-- /realistic-vehicles -->"].join("\n");
let txt = fs.existsSync(credits) ? fs.readFileSync(credits, "utf8") : "# Asset credits\n";
txt = txt.includes("<!-- realistic-vehicles -->") ? txt.replace(/<!-- realistic-vehicles -->[\s\S]*<!-- \/realistic-vehicles -->/, block) : `${txt.trimEnd()}\n\n${block}\n`;
fs.writeFileSync(credits, txt);
console.log(`\n${ok}/${MODELS.length} models ready in ${dir}. Reload the game.`);
