---
name: prospect-demo
description: |
  Generate a branded, standalone AI-ATS / HR dashboard DEMO for a Trees OS / Treelance
  prospect. Output is a single self-contained .html file (no backend, no build) re-skinned to
  the PROSPECT's own logo, colours and name — showing an AI recruitment dashboard "powered by
  Treelance, on Trees OS". It demonstrates the Treelance value loop: source while you sleep →
  match when you post → prequalify candidates on WhatsApp → introduce → deploy. Includes a
  landing/hero, Post-a-Job flow, a Candidate Database module (connect Google Drive / SharePoint
  or upload CVs → parsed by Treelance), AI Matches with the Treelance process explained,
  Introductions with email previews, a live-database Reports view, and a Talent Taxonomy view.
  All driven by realistic Malaysia/Indonesia mock data so it runs anywhere.

  Trigger when Quentin or Trees staff say: "build a demo for [client]", "make a prospect
  dashboard", "branded ATS demo", "HR dashboard for [client]", "demo Treelance for [prospect]",
  "create the dashtrees demo for [X]", "sales demo for [company]", or provide a client name +
  logo + website and ask for a tailored recruitment dashboard to show a prospect.
---

# prospect-demo — Branded AI-ATS Demo for a Prospect

Produces a **single self-contained HTML file** that looks like the prospect's own AI
recruitment dashboard, **powered by Treelance, running on Trees OS**. It's a sales/demo
artifact, not a real product instance: all data is realistic mock data baked into the file, so
it opens with a double-click, needs no server, and can be emailed, dropped in Notion, or hosted
on any static host. It's the demo companion to **DashTrees** (the real ATS in this repo).

## ⚠️ Branding rules — read first
- **Ask the user for the PROSPECT's branding on EVERY run.** Never reuse a previous client's
  details and **never** bake in the Trees Engineering / Trees OS logo as the dashboard's brand.
  The prospect's logo + name lead the UI.
- **Treelance is the "powered by" / infrastructure layer**, never the headline. The Treelance
  logo is bundled (`assets/treelance_logo.png`) and embedded automatically — you don't ask for
  it. The product line is **Trees OS** (the sidebar subtitle), with **Treelance** as the
  infrastructure/recruiter.
- If you don't have the prospect's logo, the builder draws a clean initials chip — that's fine.

## What the prospect sees
1. **Landing — a full persuasion page** (problem → proof → solution → compliance → CTA), not
   just a hero. It leads with the prospect's pain ("Your candidate database is fast asleep",
   anchored on their pool size), shows a live product preview, a proof strip, a 3-card problem
   section ("graveyard database / never know who's available / hiring abroad takes months"), a
   4-step solution (reactivate → keep live on WhatsApp → match → prequalify & deploy), a "Built
   to stay legal" taxonomy/compliance band, and **Book a 15-min call** as the primary CTA
   (booking link) with "Enter the live demo" secondary and "Visit Trees OS" as a text link. A
   clarifier line ("built for {Client} by Trees OS") removes the "is this our own tool?"
   confusion. Footer explains Trees OS (platform) vs Treelance (the AI recruiter) + contact.
2. **Home** — welcome, quick actions (Post a job · Reactivate database · Talk to Treelance);
   stat cards: Open Roles, **Candidates in pool (35,393)**, **Available candidates**,
   Introductions; recent roles.
3. **Post a Job** — title, location, contract type (**Duration shown only for Contract/
   Freelance**), seniority, start date, **Nationality / work authorization**, **Certifications
   required** (not generic skills), description → AI-matching animation → Matches.
4. **Candidate Database** — "Reactivate your database" by connecting **Google Drive** or
   **SharePoint** (paste a folder link) or **uploading CVs**, then a parse pipeline
   (Connecting → Scanning → **Parsing in Treelance** → Enriching → Indexed). Rows show
   nationality, certs, source and availability.
5. **Matches** — a "How Treelance works" flow (Sources → **Prequalifies on WhatsApp** →
   Notifies you → You approve → intro). Each card: score ring + Skills&certs/Experience bars;
   status = **Prequalified / Awaiting your approval / Introduced**; expanded view shows the
   **Treelance WhatsApp prequal note**. "Approve introduction" opens a modal explaining the
   process and **previews the email Treelance sends on the company's behalf** proposing a
   WhatsApp chat.
6. **Introductions** — introduced candidates with **introduction date** + **Preview email**.
7. **Reports · Live database** — pool size, available now, **talked to Treelance (30d)**, open
   roles; availability breakdown (now / 1mo / 2mo / 3+) and profile composition (engineer,
   designer, offshore crew, HSE, inspection…). (No "avg time to match" / "candidates matched".)
8. **Talent Taxonomy** — the database structured by taxonomy with a completeness gauge:
   discipline, seniority, **work authorization (legal)**, certification coverage — framed as
   "taxonomy is what Treelance helps you build to make matching accurate and hiring compliant".

Mock data is **Malaysia / Indonesia** energy & engineering talent by default.

## Inputs to gather (ask the user every run)
Required:
- **Client name** — the prospect company (e.g. "PETRONAS Talent"). Used everywhere + filename.
- **Company link** — their website URL (the hero "Visit {Client}" button).
- **Logo** — a file path, an image URL, or a `data:` URI of the PROSPECT's logo. Embedded as
  base64 so the output stays standalone. If only a website is given, offer to fetch the logo
  from it (see below). Never substitute the Trees logo.
- **Contact name** — the client-side contact shown in the header avatar + "Welcome back, {first}".

Optional (sensible defaults if omitted):
- **Brand colour** (`primary`, a hex) — the whole palette is derived from this one colour.
  Pick one matching the prospect's brand; default cobalt `#4888f8`.
- **Booking link** (`bookingLink`) + **contact email** (`contactEmail`) — used by the landing's
  "Book a 15-min call" CTA and footer. Default to Quentin's calendar / Trees Engineering email.
- **Proof points** (`proof`, array of 3 short strings) — the landing proof strip. Default:
  "Trusted by energy teams like Total", "35,000+ professionals sourced", "5 years building AI
  recruitment". Override per prospect if you have stronger, true references.
- **Deploy live?** — if the user wants a shareable URL, ask whether to deploy to Vercel
  (`deploy: true`) and what project name / subdomain to use (`projectName`). See "Deploying
  the demo live" below. Requires the one-time Vercel token setup.

### Getting the logo & colour from just a website
- Try the site's Open Graph image or a high-res favicon (e.g. `https://logo.clearbit.com/<domain>`,
  the `og:image`, or `<site>/favicon.ico`). Pass that URL as `logo` — the builder fetches and
  embeds it; on failure it falls back to an initials chip.
- Eyeball the logo/site to choose a `primary` hex. Confirm logo + colour with the user.

## Step by step
### 1. Gather the four required inputs (AskUserQuestion is good here).
### 2. Write the config JSON (logo file paths resolve relative to the config file):
```json
{
  "clientName": "PETRONAS Talent",
  "clientUrl":  "https://www.petronas.com",
  "contactName":"Nurul Haslina",
  "logo":       "https://logo.clearbit.com/petronas.com",
  "primary":    "#00a19c",
  "output":     "Demo_Petronas.html"
}
```
Notes:
- `logo` accepts a local path, an `http(s)` URL, or a `data:` URI. Omit → initials mark.
- Give `primary` (one hex) and dark/light/accent are derived. To override, pass a full
  `theme` block: `"theme": { "primary":"", "primaryDark":"", "primaryLight":"", "accent":"" }`.
- The **Treelance logo is embedded automatically** from `assets/treelance_logo.png`; only set
  `treelanceLogo` to override it.
- `output` is optional; defaults to `Demo_<ClientName>.html`.

### 3. Run the builder (pure Node 18+, no `npm install`):
```bash
SKILL_DIR="/path/to/skills/prospect-demo"
node "$SKILL_DIR/build_demo.js" /path/to/config.json /path/to/Demo_Client.html
```
It prints the resolved palette and whether the prospect logo embedded.

### 4. Verify, then deliver
- Open the `.html` and click through: Enter → Post a Job (toggle contract to see Duration) →
  Candidate Database (connect Drive/SharePoint, upload) → Matches (expand a card → Approve →
  see the email) → Introductions → Reports → Talent Taxonomy. Confirm the prospect's logo,
  colours and name are right and the Trees logo appears nowhere as the brand.
- Hand over the file. Remind the user it's a self-contained demo they can send/host, and that
  "connected to your database on Treelance Infrastructure" is the pitch — data is illustrative.

## Deploying the demo live (Vercel)

The demo is a single static `.html`, so Vercel hosts it as-is. There are two ways:

**A) One step — generate AND deploy (preferred).** Add `"deploy": true` to the config and the
builder deploys right after writing the file, printing the live URL. Set `"projectName"` to
control the Vercel project / subdomain (re-deploying to the same name updates the same URL):

```json
{ "clientName": "Enviros", "primary": "#138a5e",
  "deploy": true, "projectName": "demoenvirostreelance" }
```
```bash
node "$SKILL_DIR/build_demo.js" config.json Demo_Enviros.html
# → ✓ Branded demo generated … → Deploying to Vercel … → ✓ Live: https://demoenvirostreelance.vercel.app
```
You can also pass `--deploy` on the command line instead of putting it in the config.

**B) Deploy an existing .html separately:**

```bash
"$SKILL_DIR/deploy_vercel.sh" /path/to/Demo_Client.html [project-name]
```

Both stage the file as `index.html`, run the official Vercel CLI via `npx`, and print the
live production URL.

**Auth — one-time setup by the user.** The script needs a Vercel access token, found via:
1. `$VERCEL_TOKEN` environment variable, or
2. `~/.config/trees/vercel-token` (a file containing only the token).

Create one at <https://vercel.com/account/tokens> (scope: the user's account). Store it once
(e.g. `mkdir -p ~/.config/trees && pbpaste > ~/.config/trees/vercel-token`) and thereafter
Claude can deploy any demo by running the helper. Never commit the token to the repo.

To redeploy after regenerating a demo, just run the helper again with the same project name —
it pushes a new production build to the same URL. For a custom domain, add it in the Vercel
project → Settings → Domains.

## Customising the mock data (optional)
Defaults to Malaysia/Indonesia energy/engineering. For another sector/geography, edit the
arrays near the top of the `<script>` in the generated file (or in
`template/demo.template.html` before generating): `FIRST`/`LAST`, `TITLES`/`DISC`, `LOCS`,
`NATS`, `CERTS`, `SKILLS`, `DB.roles`, and the `POOL` aggregates. Keep it light — it's a demo.

## Files in this folder
- `SKILL.md` — this file
- `build_demo.js` — generator (embeds prospect + Treelance logos, derives palette, injects config)
- `deploy_vercel.sh` — non-interactive Vercel deploy helper (reads token from env / token file)
- `template/demo.template.html` — the self-contained dashboard (theme via CSS vars; config block
  between `/*CONFIG_START*/` … `/*CONFIG_END*/`)
- `assets/treelance_logo.png` — bundled Treelance logo (256px, embedded at build time)
- `package.json` — marks the folder CommonJS so the builder runs inside this ESM repo
- `examples/example_config.json`, `examples/Demo_Petronas.html` — worked example + sample output

## Strict rules
- **One standalone .html file.** No external assets, no backend, no build. Both logos embedded
  (base64) so it works offline / when emailed.
- **Brand to the PROSPECT every run.** Their logo + name lead. Treelance = infrastructure /
  "powered by"; the OS is **Trees OS**. Never use the Trees logo as the dashboard brand.
- **Mock data only** — never wire to real candidate data.
- **Derive the palette from one `primary`** unless a full `theme` is supplied.
- **Confirm logo + colour** with the user before treating the demo as final.
