---
name: trees-cv
description: |
  Generate a TARGETED Trees Engineering Candidate Dossier ("Trees CV") matching a candidate
  to a specific client mission. NOT a generic CV — a client-facing dossier proving
  profile ↔ requirement fit up front: Presented-by recruiter banner, Mission box, Confirmed
  Availability, Why this candidate for {CLIENT}, Needs ↔ Candidate matrix, and a
  Qualification Interview synthesized from the pre-meeting transcript if available — then
  the candidate's full background (Skills / Certifications / Education / Experience).
  Output is .docx only, Google Docs-safe, recruiter contact + booking link on every page.

  Trigger when Quentin or Trees staff say: "generate the dossier", "Trees CV",
  "dossier for [client]", "tailored dossier", "candidate brief", "client dossier",
  "match this candidate to the JD", "prepare the CV for [client]", or provide a JD + CV
  (± transcript) asking for a client-ready package. Produces ENGLISH dossiers.
---

# trees-cv — Targeted Candidate Dossier ("Trees CV")

This skill takes as input:
- a **client JD**
- a **candidate CV / résumé**
- (optional but strongly recommended) a **transcript of the pre-screening interview**
  between Trees Engineering and the candidate

and produces a **.docx dossier** in Trees Engineering format.

**Who uses it and why:** Trees staff run this skill to get a **ready draft** that they
review and edit before sending to the client. The output must therefore be complete and
client-presentable on first generation, but staff always get the last word — suggest
edits, don't gatekeep.

**What the client must see at a glance when they open the document:**
1. Who is presenting the candidate (the recruiter — name, position, email, LinkedIn,
   booking link) — top of page 1
2. Their own job clearly restated (the Mission box)
3. Why this candidate fits (pitch + matrix)
4. What the candidate said in the qualification interview (if transcribed)
Only then the full background.

**STATUS — manual for now.** Inputs (JD / CV / transcript) and the recruiter's contact
details are supplied by hand each run while we iterate on the dossier design. The recruiter
block mirrors the **DashTrees dashboard → Profile tab** fields exactly, so wiring it to the
database later is a drop-in swap (no schema change to this skill).

**IMPORTANT — Output format rule:** The final deliverable is **.docx ONLY**. Do NOT produce
PDF outputs, do NOT convert to PDF "for preview". Quentin's standing preference is no PDF
deliverables from this skill.

**IMPORTANT — Google Docs compatibility:** Trees staff often upload the .docx to Google
Docs. The builder (`build_dossier.js`) only uses constructs that survive the Google Docs
import: simple tables, cell shading, standard bullets, hyperlinks, headers/footers. When
editing the builder, NEVER add: paragraph borders (silently dropped by Google Docs), emoji
glyphs (inconsistent rendering), floating/anchored images, text boxes, or multiple document
sections. **Every table MUST declare `columnWidths` + `layout: TableLayoutType.FIXED`**
(use the `tbl()` helper) — Word infers the column grid from cell widths but Google Docs
does not, and without an explicit grid it collapses columns to one character per line.

## Outputs

A file named `Dossier_<CandidateName>_<CLIENT>.docx` saved to the folder Quentin (or the
staff member) requests — default the skill's parent working folder.

Structure of the generated document:

1. **Header** — Trees logo + candidate **full name** + position applied for
2. **PRESENTED BY banner** (gold-tinted band) — recruiter Name, Position, Email, LinkedIn,
   Booking link (all from the DashTrees profile)
3. **THE MISSION** (dark blue band + grid) — Client, position, mission ref, contract type,
   start date, duration, location, day rate / salary
4. **AVAILABILITY CONFIRMED** (green band) or **TO BE CONFIRMED** (amber band)
5. **WHY {CANDIDATE} FOR {CLIENT}?** — 3 to 5 sharp arguments
6. **FIT WITH YOUR REQUIREMENTS** — 2-column matrix: Your needs ↔ The candidate
7. **QUALIFICATION INTERVIEW** (gold band — ONLY if a transcript was provided) —
   motivation, verbatim quotes, observed signals, recruiter notes
8. **PROFILE SUMMARY** (optional) — if the CV has a summary/profile paragraph
9. **SKILLS** — sectors, key skills, codes & standards, software, languages
10. **CERTIFICATIONS & TRAININGS** (if any in the CV) — HUET, BOSIET, PMP, etc.
11. **EDUCATION** — chronology (period • degree • school)
12. **EXPERIENCE** — every position from the CV: company / duration / period + Context +
    Actions + Technical environment
13. **ADDITIONAL INFORMATION** (if any) — awards, publications, patents, volunteering
14. **NEXT STEPS** — CTA with the recruiter's booking link
15. **Footer** — recruiter contact + booking on every page + Trees Engineering registered
    address + trade reg. number

## Step by step — what Claude MUST do

### 1. Gather the inputs

The **JD**, **CV**, and **transcript** can each arrive as a **PDF, .docx, Google Doc, or
pasted text**. Read them like this (manual for now — no extra dependencies):

- **PDF** — read it directly with the Read tool (it parses PDFs natively).
- **Google Doc** — if a Drive integration is available, open it by URL / file id and read the
  text; otherwise ask the user to **paste the text** or **File → Download → PDF** and drop
  the PDF in.
- **.docx** — the Read tool can't parse .docx binaries. Ask the user to **paste the text**,
  or **Save As → PDF / .txt** and provide that.
- **Plain paste** — always fine.

Then ask the user (via ask_user_input_v0 when sensible) for:
- Any **mission** fields missing from the JD:
  - `start_date` (most important — it's the first thing the client checks)
  - `duration`
  - `day_rate` (or salary range)
  - `availability.confirmed` (default `true`)
- The **recruiter profile** for the Presented-by banner and footer — see next subsection.

#### Recruiter profile (the `contact` block)

The dossier's Presented-by banner + footer come from the recruiter's **DashTrees →
Profile tab**. For now, paste these fields by hand (later this auto-loads from the database
by login email). The mapping is 1:1 with the `_recruiters` columns:

| DashTrees Profile field | Dossier `contact.*` | Notes                                  |
|-------------------------|---------------------|----------------------------------------|
| Name                    | `name`              | required                               |
| Position                | `role`              | e.g. "Senior Recruiter" / "Founder & CEO" |
| Email (Google login)    | `email`             | rendered as a mailto link in the banner |
| LinkedIn                | `linkedin`          | rendered as a real link                |
| Booking link            | `booking_link`      | the "Book a call" CTA + banner + footer |
| About                   | `about`             | short bio, shown to the client in NEXT STEPS |

`whatsapp` is **not** a profile field — omit it (the footer renders only the fields present).
If `about` is omitted, the recruiter intro line is simply skipped.

### 2. Analyse and match (the intellectual core)

#### 2a. Extract the client's requirements from the JD
- Technical skills required (software, codes, standards)
- Minimum experience demanded (years, sectors)
- Soft skills mentioned
- Operational constraints (language, mobility, certifications, work permit, offshore-ready,
  HUET, BOSIET, etc.)
- Start date and duration

#### 2b. Extract EVERYTHING from the CV — completeness rule

**Use ALL the professional information in the original CV.** The dossier replaces the CV
in front of the client, so nothing professionally relevant may be lost: every position
(even short ones — they go in `experience` too), every certification, every degree, every
language, every publication / award / patent. If something fits no standard section, put
it in `additional`. A client comparing the dossier to the original CV later must never
discover something the dossier omitted.

**EXCEPT the candidate's private data — strip it deliberately.** NEVER carry over to the
dossier: the candidate's email, phone number, home address, date of birth, photo, marital
status, identity card / passport numbers, or **references** (names and contacts of former
managers). Two reasons: candidate privacy, and the client must come through Trees — the
recruiter is the only contact channel in the document. If the CV's references contain a
useful fact ("reference from Shell project director"), it can inform a pitch argument,
but the person's name and contact never appear.

Then, for each JD requirement, identify the mission / project / certification in the CV
that evidences it. Quantify where possible (12 years offshore, 4 LNG projects, 3 brownfield
revamps). Anchor in the Malaysian / APAC / Middle East / Energy context whenever the JD
points there (PETRONAS, ENEOS, Shell, ExxonMobil, BHP, ADNOC, Saudi Aramco, etc.).

#### 2c. If a transcript is provided — treat it as the gold material
The transcript is usually the RICHEST source — far richer than the CV. Claude must extract:

- **Motivation**: why this candidate wants THIS mission specifically (not generalities).
  Look for the candidate's own phrasing about interest in the sector, client, project,
  or geography. Rewrite cleanly in 2–3 sentences.
- **Verbatim quotes (max 4)**: literal quotes from the candidate that sound professional
  and illuminate a key point (skill, vision, defining experience). Format: "quoted phrase
  in English double quotes". Strip fillers, hesitations, slang. Implicit consent is
  assumed — this is standard practice for a serious staffing agency.
- **Soft skills / observed signals**: 3–5 FACTUAL observations (not vague adjectives).
  Example: "Structured project descriptions in STAR format" — NOT "Good communicator".
- **Recruiter notes**: client-relevant flags — constraints (mobility, minimum salary,
  notice period, family situation impacting relocation), points of vigilance, or
  differentiators not visible on the CV.

**Also use the transcript to ENRICH the pitch arguments**: a transcript fact ("worked with
their Bintulu operations team in 2022") makes a much stronger argument than a generic CV
skill.

#### 2d. Write 3–5 pitch arguments (`pitch.reasons`)
- Each argument must name the client + reference a precise fact (CV or transcript)
- Order: from the most differentiating to the most standard
- Style: committed sentence, NOT a keyword list
- Avoid generalities. Always cite the project / company / quote that proves it.

#### 2e. Build the `match` matrix (5 rows ideal)
- Left column: client requirement as it appears in the JD (near-verbatim)
- Right column: candidate's answer — short, factual, dated where possible

#### 2f. Fill the background sections from the CV — without inventing anything
- `profile_summary` — only if the CV has a summary; rewrite it tight (3–4 lines max)
- `skills`, `certifications`, `education`, `experience`, `additional` — exhaustive per
  rule 2b

### 3. Build the JSON config

Expected format (see `examples/example_config.json`). Optional blocks — omit entirely
when empty (never leave an empty block, it would render an empty section):
`qualification`, `profile_summary`, `certifications`, `additional`.

```json
{
  "candidate": { "full_name": "John Doe", "initials": "J.D.", "position": "Senior Process Engineer" },
  "mission": {
    "client": "ENEOS Xplora Malaysia",
    "position_sought": "Senior Process Engineer — Brownfield Optimization",
    "mission_ref": "TRE-2026-014",
    "contract_type": "Contract, full-time",
    "start_date": "01 June 2026",
    "duration": "12 months, renewable",
    "location": "Kuala Lumpur, with offshore rotations (Layang field)",
    "day_rate": "MYR 1,800 / day"
  },
  "availability": { "confirmed": true },
  "pitch": { "reasons": ["...3 to 5 arguments..."] },
  "match": [ { "need": "...", "answer": "..." } ],
  "qualification": {
    "date": "12/05/2026", "interviewer": "Quentin Cloarec", "duration_min": 45,
    "motivation": "...", "verbatim": ["\"...\""],
    "soft_skills": ["..."], "notes": "..."
  },
  "profile_summary": "Optional 3–4 line distillation of the CV's own summary.",
  "skills": {
    "sectors": ["..."], "key_skills": ["..."], "codes": ["..."],
    "software": ["..."], "languages": ["..."]
  },
  "certifications": [
    { "year": "2023", "name": "BOSIET with EBS", "issuer": "OPITO", "expiry": "2027" }
  ],
  "education": [ { "period": "2010 – 2013", "degree": "...", "school": "..." } ],
  "experience": [
    { "title": "...", "company": "...", "duration": "...", "period": "...",
      "context": "...", "actions": ["..."], "environment": "..." }
  ],
  "additional": ["Awards, publications, patents, volunteering — anything left over from the CV"],
  "contact": {
    "name": "Quentin Cloarec", "role": "Founder & CEO",
    "email": "quentin@trees-engineering.com",
    "linkedin": "https://www.linkedin.com/in/quentincloarec",
    "booking_link": "https://calendar.app.google/HLfcvtmSVVJjtb7n7",
    "about": "Founder of Trees Engineering, placing senior engineers across APAC energy projects."
  },
  "output": { "filename": "Dossier_JohnDoe_ENEOS.docx" }
}
```

### 4. Save the JSON and run the builder

```bash
SKILL_DIR="/path/to/trees-cv"   # the folder containing this skill
cd "$SKILL_DIR"

# First time on this machine only:
# npm install docx

# Run the builder
node "$SKILL_DIR/build_dossier.js" \
  /path/to/config.json \
  /path/to/Dossier_CandidateName_CLIENT.docx
```

### 5. Validate and deliver

- Open the `.docx` to eyeball visual quality (or extract text to spot-check content
  if running in a sandbox)
- **Privacy check**: search the generated text for the candidate's email, phone number,
  and any referee names from the original CV — none may appear
- **Completeness check**: every position, certification and degree in the original CV
  appears in the dossier
- Present the `.docx` to the staff member, reminding them this is a **draft to review
  and edit before sending**
- Suggest 1–2 sensible refinements (e.g. "I'd add a row on offshore certifications to
  the matrix if you have the HUET date")

**Do NOT generate a PDF preview. .docx only.**

## Strict rules

- **NEVER invent** a skill, certification, duration, project, or quote that is absent
  from the CV / transcript. If something is missing, put `"—"` or ask.
- **Use ALL the professional content of the CV** (completeness rule 2b) — but **NEVER
  the candidate's private data**: email, phone, home address, DOB, photo, ID numbers,
  references. The recruiter is the only contact channel in the document.
- **Candidate is identified by full name** in the dossier (header, pitch heading,
  page header). Keep `initials` in the config for backward compatibility.
- **Always write the client name in UPPERCASE** in the heading "WHY {CANDIDATE} FOR
  {CLIENT}?".
- **Always include the start date** in the availability badge.
- **Max 5 arguments** in the pitch.
- **Verbatim quotes**: max 4, polished, in clean English, between English double quotes `"`.
- **Soft skills**: factual observations, no vague adjectives.
- **Footer** must always contain the recruiter's contact (from their DashTrees profile) +
  booking link + Trees Engineering registered address + trade reg.
- **No PDF output.** .docx only. This is a non-negotiable user preference.
- **Google Docs-safe only**: no emojis, no paragraph borders, no text boxes, no floating
  images, single document section (see the compatibility note at the top).
- **Brand colours**: dark blue `#01195b` for mission band & section bands, brown gold
  `#9e690b` for the presented-by / qualification bands & accents, white background.

## Files in this folder

- `SKILL.md` — this file (instructions for Claude)
- `build_dossier.js` — the Node.js builder (only dependency: `docx`)
- `assets/trees_logo.jpg` — Trees Engineering square logo
- `examples/example_config.json` — full example: John Doe × ENEOS Xplora Malaysia + transcript
- `examples/example_output.docx` — sample output
- `package.json` / `package-lock.json` — npm manifest (run `npm install` once per machine)
