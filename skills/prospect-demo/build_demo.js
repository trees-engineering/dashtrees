#!/usr/bin/env node
/* ============================================================================
 * build_demo.js — generate a branded, standalone ATS demo for a prospect.
 *
 *   node build_demo.js <config.json> [output.html]
 *
 * The config drives a single self-contained HTML file (no backend, no build).
 * The logo is embedded as a base64 data-URI so the output is truly portable —
 * you can email it, drop it on Notion, or host it anywhere.
 *
 * Config shape (all but clientName optional — sensible defaults applied):
 * {
 *   "clientName": "Acme Energy",
 *   "clientUrl":  "https://acme.com",
 *   "contactName":"Jane Doe",
 *   "logo":       "./acme.png" | "https://acme.com/logo.png" | "data:image/...",
 *   "primary":    "#1b6cff",            // one colour — shades derived from it
 *   "theme": { "primary":"", "primaryDark":"", "primaryLight":"", "accent":"" },
 *   "poweredBy":  "Treelance · Trees OS",
 *   "output":     "Demo_Acme.html"
 * }
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TEMPLATE = path.join(__dirname, 'template', 'demo.template.html');
const TREELANCE_LOGO = path.join(__dirname, 'assets', 'treelance_logo.png');

/* ---- hex helpers (derive a palette from a single primary) ---------------- */
function hexToRgb(h){
  h = h.replace('#','').trim();
  if (h.length === 3) h = h.split('').map(c=>c+c).join('');
  return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
}
function rgbToHex(r,g,b){
  const c=v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
  return '#'+c(r)+c(g)+c(b);
}
function mix(hex, target, amt){ // amt 0..1 toward target ([r,g,b])
  const a=hexToRgb(hex);
  return rgbToHex(...a.map((v,i)=>v+(target[i]-v)*amt));
}
const darken  = (h,a=.18)=>mix(h,[0,0,0],a);
const lighten = (h,a=.30)=>mix(h,[255,255,255],a);

function derivePalette(cfg){
  // explicit theme wins; otherwise derive from `primary`; otherwise default.
  const def = {primary:'#4888f8',primaryDark:'#2f6fe0',primaryLight:'#6ea8fa',accent:'#48c8f8'};
  const t = Object.assign({}, def, cfg.theme || {});
  if (cfg.primary){
    t.primary = cfg.primary;
    if(!cfg.theme?.primaryDark)  t.primaryDark  = darken(cfg.primary,.18);
    if(!cfg.theme?.primaryLight) t.primaryLight = lighten(cfg.primary,.28);
    if(!cfg.theme?.accent)       t.accent       = lighten(cfg.primary,.18);
  }
  return t;
}

/* ---- logo → data URI ----------------------------------------------------- */
const MIME = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.gif':'image/gif','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};

async function embedLogo(logo, baseDir){
  if(!logo) return '';
  if(logo.startsWith('data:')) return logo;            // already inlined
  if(/^https?:\/\//.test(logo)){
    try{
      const res = await fetch(logo);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || guessMime(logo);
      return `data:${ct};base64,${buf.toString('base64')}`;
    }catch(e){
      console.warn(`⚠  Could not fetch logo (${e.message}). Falling back to initials mark.`);
      return '';
    }
  }
  // local file — resolve relative to the config file's folder
  const p = path.isAbsolute(logo) ? logo : path.resolve(baseDir, logo);
  if(!fs.existsSync(p)){
    console.warn(`⚠  Logo file not found: ${p}. Falling back to initials mark.`);
    return '';
  }
  const buf = fs.readFileSync(p);
  return `data:${guessMime(p)};base64,${buf.toString('base64')}`;
}
function guessMime(p){ return MIME[path.extname(p).toLowerCase()] || 'image/png'; }

/* ---- main ---------------------------------------------------------------- */
async function main(){
  const [,, cfgPath, outArg] = process.argv;
  if(!cfgPath){
    console.error('Usage: node build_demo.js <config.json> [output.html]');
    process.exit(1);
  }
  const cfgAbs = path.resolve(cfgPath);
  const cfg = JSON.parse(fs.readFileSync(cfgAbs,'utf8'));
  if(!cfg.clientName){ console.error('✗ config.clientName is required'); process.exit(1); }

  const theme = derivePalette(cfg);
  const logoData = await embedLogo(cfg.logo, path.dirname(cfgAbs));

  // Treelance logo is constant — embed the bundled (downscaled) asset so the
  // output is fully standalone. Allow an override via cfg.treelanceLogo.
  const treelanceLogo = cfg.treelanceLogo
    ? await embedLogo(cfg.treelanceLogo, path.dirname(cfgAbs))
    : `data:image/png;base64,${fs.readFileSync(TREELANCE_LOGO).toString('base64')}`;

  const runtimeConfig = {
    clientName       : cfg.clientName,
    clientUrl        : cfg.clientUrl  || '#',
    contactName      : cfg.contactName || 'Account Manager',
    logo             : logoData,
    treelanceLogo,
    treelanceWhatsapp: cfg.treelanceWhatsapp || 'http://wa.me/60122421849',
    bookingLink      : cfg.bookingLink  || 'https://calendar.app.google/HLfcvtmSVVJjtb7n7',
    contactEmail     : cfg.contactEmail || 'quentin@trees-engineering.com',
    proof            : cfg.proof || ['Trusted by energy teams like TOTALEnergies','35,000+ professionals sourced','5 years building AI recruitment'],
    font             : cfg.font || null,
    data             : cfg.data || null,
    theme
  };

  let html = fs.readFileSync(TEMPLATE,'utf8');

  // 1) replace the CONFIG block between the markers
  const block = `/*CONFIG_START*/\nwindow.DEMO_CONFIG = ${JSON.stringify(runtimeConfig,null,2)};\n/*CONFIG_END*/`;
  html = html.replace(/\/\*CONFIG_START\*\/[\s\S]*?\/\*CONFIG_END\*\//, ()=>block);

  // 2) replace bare __CLIENT_NAME__ placeholders that live outside the config
  //    (title tag, hero copy fallbacks) so the file reads right even before JS runs.
  html = html.split('__CLIENT_NAME__').join(escapeHtml(cfg.clientName));

  const out = path.resolve(outArg || cfg.output || `Demo_${slug(cfg.clientName)}.html`);
  fs.writeFileSync(out, html);

  console.log(`✓ Branded demo generated`);
  console.log(`  Client : ${cfg.clientName}`);
  console.log(`  Primary: ${theme.primary}  (dark ${theme.primaryDark} / light ${theme.primaryLight} / accent ${theme.accent})`);
  console.log(`  Logo   : ${logoData ? 'embedded ('+Math.round(logoData.length/1024)+' KB)' : 'initials fallback'}`);
  console.log(`  Output : ${out}`);

  // Optional: deploy straight to Vercel when requested (cfg.deploy or --deploy).
  // The .html is always written first, so a deploy failure never loses the build.
  if (cfg.deploy || process.argv.includes('--deploy')) {
    const project = cfg.projectName || `${slug(cfg.clientName).toLowerCase()}-demo`;
    const deployScript = path.join(__dirname, 'deploy_vercel.sh');
    console.log(`\n→ Deploying to Vercel as "${project}"…`);
    try {
      const result = execFileSync('bash', [deployScript, out, project],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      process.stdout.write(result);
    } catch (e) {
      console.warn('⚠  Deploy step failed — the .html is still generated, deploy it manually.');
      if (e.stdout) process.stdout.write(e.stdout);
      if (e.stderr) process.stderr.write(e.stderr);
    }
  }
}
function slug(s){ return s.replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,''); }
function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

main().catch(e=>{ console.error(e); process.exit(1); });
