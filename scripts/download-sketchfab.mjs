#!/usr/bin/env node
// Downloads approved Sketchfab models as GLB into assets/<category>/.
// Usage:
//   SKETCHFAB_API_TOKEN=xxxx node scripts/download-sketchfab.mjs picks.json
// picks.json = the JSON copied from asset-review/index.html ("Copy my picks").
// Get a token (free account): https://sketchfab.com/settings/password  -> "API Token"
import fs from 'node:fs';
import path from 'node:path';

const token = process.env.SKETCHFAB_API_TOKEN;
const picksFile = process.argv[2];
if (!token || !picksFile) {
  console.error('Usage: SKETCHFAB_API_TOKEN=xxx node scripts/download-sketchfab.mjs picks.json');
  process.exit(1);
}
const picks = JSON.parse(fs.readFileSync(picksFile, 'utf8')).filter(p => p.source === 'Sketchfab');
const dirFor = { env: 'environment', bld: 'environment/buildings', prop: 'environment/props', chr: 'characters' };
const credits = [];

for (const p of picks) {
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const outDir = path.join('assets', dirFor[p.cat] || 'misc');
  const out = path.join(outDir, `${slug}-${p.uid.slice(0, 6)}.glb`);
  fs.mkdirSync(outDir, { recursive: true });
  credits.push(`- "${p.name}" by ${p.author} (${p.license}) - ${p.url}`);
  if (fs.existsSync(out)) { console.log('skip (exists)', out); continue; }

  const r = await fetch(`https://api.sketchfab.com/v3/models/${p.uid}/download`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!r.ok) { console.error('FAILED', p.name, r.status, await r.text()); continue; }
  const links = await r.json();
  if (!links.glb?.url) { console.error('no GLB for', p.name, Object.keys(links)); continue; }
  console.log(`downloading ${p.name} (${(links.glb.size / 1e6).toFixed(1)} MB)`);
  const f = await fetch(links.glb.url);
  fs.writeFileSync(out, Buffer.from(await f.arrayBuffer()));
  console.log('  ->', out);
}

fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync('assets/CREDITS.md', `# Asset credits\n\n${credits.join('\n')}\n`);
console.log('wrote assets/CREDITS.md');
