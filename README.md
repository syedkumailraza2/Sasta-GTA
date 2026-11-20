# Sasta GTA: Bhaukaal Nagar

An Indian-town open-world game built with Babylon.js.

```bash
npm install
npm run dev        # game:          http://localhost:5173
                   # asset preview: http://localhost:5173/asset-review/
```

## Controls
| Key | Action |
|---|---|
| WASD / arrows | walk, or drive when in a vehicle |
| Shift | run |
| Space | jump, or handbrake when driving |
| Mouse | look |
| LMB | punch / swing the current weapon |
| RMB | slap (thappad) |
| E (hold) | weapon wheel: move the mouse towards a weapon, release E (time slows while it's open) |
| 1-6 / scroll | fists, belt, lathi, hockey stick, cricket bat, katta. Each is held and swung its own way: the belt dangles and whips (rope physics), the lathi chops, the hockey stick sweeps low, the bat winds up and launches people, the katta arm aims at the crosshair. Heavy hits lunge forward, shake the camera and briefly freeze time |
| LMB with katta | fire (hold for repeat) · R reload · 6-round clip, jams now and then · gunfire = 2 stars |
| F at a yellow marker | enter a shop (10 on the island, 2 of each, shown with icon + name on the map): ✂️ barber (hairstyles, hair colour) · 👕 clothes (hoodies, pants, chashma, cap, gold chain) · 🔫 hathiyaar bhandar (katta ammo, no-jam servicing, 12-round magazine, bulletproof jacket) · 💊 medical store (health, Chyawanprash = max health 150) · 🛵 Sasta Motors (buy a scooty, auto, Bullet, taxi, SUV, supercar or helicopter; it's parked outside) |
| F | enter / exit vehicle (steals it if someone is driving) |
| H | horn: every vehicle kind has its own (auto "pee-pee", Maruti "meep-meep", taxi "pom-pom-pom", SUV, supercar chord, bike, scooty, police, boat); each truck keeps its own desi musical horn |
| Q / E / X | left / right indicator, hazards (while driving) |
| Helicopter | Space up · Shift down · W/S forward/back · A/D turn · F exits only once landed |
| Boats & jet skis | from the jetty at Juhu Beach · F exits only next to the jetty or shore |
| M | map: click to set a waypoint (GPS route shows on the radar), right-click to clear |
| Esc | pause: Map / Settings (volumes, sensitivity, invert Y, shadows, post-FX) / Cheats / Controls |

## Gameplay
- **Combat:** hits cause blood spatter and hit text. People flee, or fight back if they're brave. Knocked-out people drop ₹ notes; collecting them plays "paisa hi paisa hoga" (₹400+ plays "money follows").
- **Wanted level (1-5 stars):** hitting people adds stars. Police on foot with lathis show up from 1 star, police cars from 3. Stars decay once the cops lose sight of you; the stars blink while that's happening.
- **Vehicles:** auto rickshaw, Maruti, sedan, SUV, kaali-peeli taxi, police car, truck, Bullet and scooty. Traffic drives on the left, stops for you and honks.
- **Cows:** they headbutt you if you hit them, and they're invincible.
- **Death:** "GHEE KHATAM" with "jis raah pe tum chal rahe ho…". You respawn at the Sarkari Hospital, minus the bill.
- **Pickups:** chai restores 40 health. Lathi and bat pickups appear on the map.

## World
An irregular island: the town grid is carved by a noisy coastline (peninsulas, a sandy spit, coves), wrapped in sloping beaches, with Juhu Beach (food stalls, palms, lifeguard towers), a jetty with speedboats and jet skis, a helipad, and the Arabian Sea all around. You can sail about 260 m out before the edge of the map pushes you back, and the helicopter has a ceiling. Waypoints can only be set on the island. Junctions where 3+ roads meet have traffic lights: traffic queues at red, pedestrians wait at the zebra until the crossing traffic is stopped. Traffic lights and street lamps can be knocked flat by any vehicle (taking out a signal is worth 1 star). Two-wheelers fall over when hit hard enough (riders get thrown, including you), and every vehicle kind has its own engine sound with gears and throttle; nearby traffic is audible as it passes.

About 30-40 s into play, then every 1-2 minutes, a kinnar walks up (or comes to your window when you are stopped in a vehicle, e.g. at a red light), claps and dances in front of you asking for shagun ("Paise la, main tere waaste naachi!"). Press G to give ₹50 and get her blessing (+25 health); ignore her or walk off and she calls you kanjoos.

Wanted levels escalate: 1★ one or two constables with lathis, 2★ a police jeep, 3★ more cops and jeeps, 4★ cops open fire with pistols, 5★ the army (rifles, Fauji jeeps) plus a police helicopter that circles you with a spotlight and a door gunner. Barber shops and clothes shops show as blue/pink squares on the map; purchases and your look are saved in the browser. People talk to each other (Hindi speech bubbles + voice), react in Hindi when you bump into them, and ride bikes. Touch a cow and you get 4 stars.

## Cheats (type while playing)
`SUPERCAR` `UDANKHATOLA` `PAISAHIPAISA` `AMMAKAPYAR` `JUGAAD` `THULLAHATAO` (bribe: costs ₹100, "Sahab, kuch le-de kar jaane do!") `BADHAI` (call the kinnar) `BHAUKAAL` `AUTOWALA` `NETAJI` `BULLETRAJA` `SCOOTYPEP` `GAUMATA` `BADASIR` `CHANDRAYAAN` `CHAIBREAK` `AMARHOON` `USAINBOLT` `TUNAKTUNAK`

## Code map
| File | What |
|---|---|
| `src/main.ts` | boot, game states, loop, cheats list |
| `src/world/town.ts` | procedural town, colliders, parking spots, ground height |
| `src/characters.ts` | loads Quaternius rigs, spawns tinted instances, animation blending |
| `src/actor.ts` / `player.ts` / `npc.ts` | movement + health / player combat & driving / pedestrians, police, cows |
| `src/vehicles.ts` / `traffic.ts` | vehicle models + arcade physics + procedural auto / parked, traffic AI, police cars |
| `src/weapons.ts`, `fx.ts`, `pickups.ts` | weapon meshes & stats, blood & floating text, ₹/chai/weapon pickups |
| `src/nav.ts`, `minimap.ts`, `ui.ts` | road-graph A* & lanes, radar + full map, HUD & pause menu |
| `src/audio.ts` | clips, meme voice lines, procedural desi title music & city ambience |

See `public/assets/CREDITS.md` for asset licences. The meme sound clips are copyrighted: they're fine for a private build, but replace them before publishing.

## Deploying (Vercel)

Framework preset **Vite**, build `npm run build`, output `dist`.

Environment variables (Project → Settings → Environment Variables), both optional:

| Variable | What it does |
|---|---|
| `VITE_GA_MEASUREMENT_ID` | Google Analytics 4 ID (`G-…`). Without it no analytics script is loaded. |
| `VITE_SITE_URL` | Your custom domain, e.g. `https://sastagta.in`. If unset, the Vercel production domain is used for canonical / Open Graph / sitemap URLs. |

SEO: title/description, Open Graph + Twitter cards (`public/og-image.jpg`), JSON-LD `VideoGame` schema, web manifest + icons, and `robots.txt` / `sitemap.xml` generated at build time (see `vite.config.ts`).

Analytics events: `game_loaded` (load time), `game_start`, `vehicle_enter` (kind), `shop_purchase` (shop, item, price), `cheat_used` (code), `wanted_level` (3★/5★), `player_death`, `kinnar_shagun`.
