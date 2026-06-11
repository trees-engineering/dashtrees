'use strict'
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, ImageRun, Header, Footer, ExternalHyperlink,
  AlignmentType, WidthType, BorderStyle, ShadingType, LevelFormat,
  UnderlineType, VerticalAlign, TableLayoutType,
} = require('docx')
const fs = require('fs')
const path = require('path')

// ── CLI ──────────────────────────────────────────────────────────────────────
const configPath = process.argv[2]
const outputPath = process.argv[3]
if (!configPath || !outputPath) {
  console.error('Usage: node build_dossier.js <config.json> <output.docx>')
  process.exit(1)
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))

// ── Brand ────────────────────────────────────────────────────────────────────
const BLUE   = '01195B'
const GOLD   = '9E690B'
const GREEN  = '1A7F3E'
const AMBER  = 'B45309'
const WHITE  = 'FFFFFF'
const BODY   = '222222'
const GRAY   = '555555'
const DIV    = 'CCCCCC'
const ALT    = 'F2F2F2'   // alternate table row
const GOLDBG = 'F7F2E8'   // light gold tint (presented-by band, quotes)
const FONT   = 'Arial'
const W      = 9360       // content width dxa (12240 - 1440 - 1440)

// ── Primitive helpers ─────────────────────────────────────────────────────────
// NOTE on Google Docs compatibility: this builder deliberately sticks to
// constructs that survive the .docx → Google Docs import cleanly:
//   - tables with explicit DXA widths and simple single borders
//   - cell shading, standard bullet numbering, hyperlinks, headers/footers
// It deliberately AVOIDS: paragraph borders (dropped by Google Docs), emoji
// glyphs (inconsistent rendering), floating/anchored images, text boxes,
// and multi-section layouts. Keep it that way when editing.

function run(text, { bold = false, italic = false, color = BODY, size = 22, underline, caps = false } = {}) {
  const opts = { text, font: { name: FONT }, bold, italics: italic, color, size, allCaps: caps }
  if (underline) opts.underline = { type: UnderlineType.SINGLE, color }
  return new TextRun(opts)
}

function para(children, { before = 0, after = 0, align, indent, keepNext, keepLines, numbering } = {}) {
  const props = { children: [].concat(children), spacing: { before, after } }
  if (align)     props.alignment  = align
  if (indent)    props.indent     = indent
  if (keepNext)  props.keepNext   = true
  if (keepLines) props.keepLines  = true
  if (numbering) props.numbering  = numbering
  return new Paragraph(props)
}

const noB = () => {
  const n = { style: BorderStyle.NONE, size: 0, color: WHITE }
  return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n }
}

const divB = (c = DIV) => {
  const s = { style: BorderStyle.SINGLE, size: 6, color: c }
  return { top: s, bottom: s, left: s, right: s }
}

function tc(children, { width = W, fill = WHITE, borders, margins, vAlign = VerticalAlign.CENTER } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill, color: 'auto', val: ShadingType.CLEAR },
    borders: borders || noB(),
    margins: margins || { top: 120, left: 160, bottom: 120, right: 160 },
    verticalAlign: vAlign,
    children: [].concat(children),
  })
}

// CRITICAL for Google Docs: every table must declare an explicit column grid
// (columnWidths) + FIXED layout. Word infers the grid from cell widths;
// Google Docs does NOT — without a grid it collapses columns to minimum
// width and text renders one character per line.
function tbl(columnWidths, rows, { borders } = {}) {
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    borders: borders || noB(),
    rows,
  })
}

function tbl1(rows) {
  return tbl([W], rows)
}

const spacer = (after = 120) => para([run('', { size: 2 })], { after })

// Section header: blue band, white text — survives Google Docs perfectly
// and gives much stronger visual structure than a colored heading line.
function sectionBand(text) {
  return tbl1([new TableRow({
    tableHeader: true,
    children: [tc(
      [para([run(text, { bold: true, color: WHITE, size: 24, caps: true })])],
      { fill: BLUE, margins: { top: 90, left: 200, bottom: 90, right: 200 } }
    )],
  })])
}

// Gold variant for the qualification interview
function goldBand(text) {
  return tbl1([new TableRow({
    tableHeader: true,
    children: [tc(
      [para([run(text, { bold: true, color: WHITE, size: 24, caps: true })])],
      { fill: GOLD, margins: { top: 90, left: 200, bottom: 90, right: 200 } }
    )],
  })])
}

const hyperlink = (url, label, opts = {}) => new ExternalHyperlink({
  link: url,
  children: [run(label, { color: opts.color || BLUE, size: opts.size || 20, underline: true, bold: opts.bold || false })],
})

// ── Logo ──────────────────────────────────────────────────────────────────────
const logoPath = path.join(__dirname, 'assets', 'trees_logo.jpg')
const logoData = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null

// Read the JPEG's true pixel dimensions (SOF marker) so the logo always
// renders at its native aspect ratio — never squashed, whatever logo file
// is dropped into assets/.
function jpegSize(buf) {
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue }
    const marker = buf[i + 1]
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}
const LOGO_DISPLAY_WIDTH = 190 // px in the document header
const logoDims = (() => {
  if (!logoData) return null
  const s = jpegSize(logoData) || { width: 1, height: 1 }
  return { width: LOGO_DISPLAY_WIDTH, height: Math.round(LOGO_DISPLAY_WIDTH * s.height / s.width) }
})()

// ── Numbering refs ────────────────────────────────────────────────────────────
const BULLET = 'pitch-bullets'

// ── Section builders ──────────────────────────────────────────────────────────

// Candidate name + position next to the logo.
function headerTable() {
  const name = cfg.candidate.full_name || cfg.candidate.initials
  const logoCell = tc(
    [para(logoData
      ? [new ImageRun({ data: logoData, type: 'jpg', transformation: logoDims })]
      : [run('')],
    {})],
    { width: 3100 }
  )
  const titleCell = tc(
    [
      para([run(name, { bold: true, color: BLUE, size: 40 })]),
      para([run(cfg.candidate.position, { color: GRAY, size: 26 })], { before: 40 }),
    ],
    { width: 6260, vAlign: VerticalAlign.CENTER }
  )
  return tbl([3100, 6260], [new TableRow({ children: [logoCell, titleCell] })])
}

// "Presented by" banner — the recruiter's identity, straight from their
// DashTrees profile. The client must see in one glance who owns this
// candidate and how to reach them. Light gold tint + gold left accent.
function presentedByBanner() {
  const c = cfg.contact
  const items = []
  if (c.email)        items.push(hyperlink('mailto:' + c.email, c.email))
  if (c.linkedin)     items.push(hyperlink(c.linkedin, 'LinkedIn'))
  if (c.booking_link) items.push(hyperlink(c.booking_link, 'Book a call', { color: GOLD, bold: true }))
  const lineChildren = []
  items.forEach((it, i) => { if (i > 0) lineChildren.push(run('   |   ', { color: DIV, size: 20 })); lineChildren.push(it) })

  return tbl([W], [new TableRow({
      children: [tc(
        [
          para([run('PRESENTED BY', { bold: true, color: GOLD, size: 16 })], { after: 40 }),
          para([
            run(c.name, { bold: true, color: BLUE, size: 24 }),
            run(c.role ? '   —   ' + c.role : '', { color: GRAY, size: 22 }),
          ], { after: 60 }),
          para(lineChildren, {}),
        ],
        {
          fill: GOLDBG,
          borders: {
            top:    { style: BorderStyle.NONE,   size: 0,  color: WHITE },
            bottom: { style: BorderStyle.NONE,   size: 0,  color: WHITE },
            right:  { style: BorderStyle.NONE,   size: 0,  color: WHITE },
            left:   { style: BorderStyle.SINGLE, size: 24, color: GOLD  },
          },
          margins: { top: 140, left: 220, bottom: 140, right: 200 },
          vAlign: VerticalAlign.CENTER,
        }
      )],
    })])
}

// Mission: blue band + clean label/value grid.
function missionSection() {
  const fields = [
    ['Client',             cfg.mission.client],
    ['Position',           cfg.mission.position_sought],
    ['Mission ref.',       cfg.mission.mission_ref],
    ['Contract type',      cfg.mission.contract_type],
    ['Start date',         cfg.mission.start_date],
    ['Duration',           cfg.mission.duration],
    ['Location',           cfg.mission.location],
    ['Day rate / package', cfg.mission.day_rate],
  ].filter(([, v]) => v)
  const rows = fields.map(([label, value], i) =>
    new TableRow({
      cantSplit: true,
      children: [
        tc([para([run(label, { bold: true, color: BLUE, size: 21 })])],
          { width: 2400, fill: i % 2 === 0 ? WHITE : ALT, borders: divB(), vAlign: VerticalAlign.TOP }),
        tc([para([run(value, { size: 22 })])],
          { width: 6960, fill: i % 2 === 0 ? WHITE : ALT, borders: divB(), vAlign: VerticalAlign.TOP }),
      ],
    })
  )
  return [
    sectionBand('The mission'),
    tbl([2400, 6960], rows, { borders: divB() }),
  ]
}

function availabilityBadge() {
  const confirmed = !cfg.availability || cfg.availability.confirmed !== false
  const fill = confirmed ? GREEN : AMBER
  const text = confirmed
    ? `AVAILABILITY CONFIRMED  —  from ${cfg.mission.start_date || 'TBC'}`
    : 'AVAILABILITY TO BE CONFIRMED'
  return tbl1([
    new TableRow({ children: [
      tc([para([run(text, { bold: true, color: WHITE, size: 23 })], { align: AlignmentType.CENTER })],
        { fill, margins: { top: 110, left: 160, bottom: 110, right: 160 } }),
    ]}),
  ])
}

function pitchSection() {
  const name = (cfg.candidate.full_name || 'this profile').toUpperCase()
  return [
    sectionBand(`Why ${name} for ${cfg.mission.client.toUpperCase()}?`),
    spacer(60),
    ...cfg.pitch.reasons.map(reason =>
      para([run(reason, { size: 22 })], { before: 80, after: 80, numbering: { reference: BULLET, level: 0 } })
    ),
  ]
}

function matchTable() {
  const hdr = new TableRow({
    tableHeader: true,
    children: [
      tc([para([run('Your needs',    { bold: true, color: WHITE, size: 22 })])],
        { width: 4680, fill: BLUE, borders: divB() }),
      tc([para([run('The candidate', { bold: true, color: WHITE, size: 22 })])],
        { width: 4680, fill: BLUE, borders: divB() }),
    ],
  })
  const dataRows = cfg.match.map((row, i) => {
    const fill = i % 2 === 0 ? WHITE : ALT
    return new TableRow({
      cantSplit: true,
      children: [
        tc([para([run(row.need,   { size: 22 })])],
          { width: 4680, fill, borders: divB(), vAlign: VerticalAlign.TOP }),
        tc([para([run(row.answer, { size: 22 })])],
          { width: 4680, fill, borders: divB(), vAlign: VerticalAlign.TOP }),
      ],
    })
  })
  return tbl([4680, 4680], [hdr, ...dataRows], { borders: divB() })
}

// Verbatim quote rendered as a one-cell table (NOT a paragraph border —
// Google Docs drops paragraph borders, tables survive).
function quoteBlock(quote) {
  return tbl([W], [new TableRow({
      children: [tc(
        [para([run(quote, { italic: true, size: 22, color: BODY })])],
        {
          fill: GOLDBG,
          borders: {
            top:    { style: BorderStyle.NONE,   size: 0,  color: WHITE },
            bottom: { style: BorderStyle.NONE,   size: 0,  color: WHITE },
            right:  { style: BorderStyle.NONE,   size: 0,  color: WHITE },
            left:   { style: BorderStyle.SINGLE, size: 24, color: GOLD  },
          },
          margins: { top: 100, left: 220, bottom: 100, right: 200 },
        }
      )],
    })])
}

function qualSection() {
  if (!cfg.qualification) return []
  const q = cfg.qualification
  const goldHead = (label, before = 60, after = 60) =>
    para([run(label, { bold: true, color: GOLD, size: 22 })], { before, after, keepNext: true })

  const blocks = [
    spacer(160),
    goldBand('Qualification interview'),
    para([run(
      `Date: ${q.date}   |   Interviewer: ${q.interviewer}   |   Duration: ${q.duration_min} min`,
      { italic: true, color: GRAY, size: 20 }
    )], { before: 120, after: 120 }),
    goldHead('Motivation', 60, 60),
    para([run(q.motivation, { size: 22 })], { after: 140 }),
    goldHead("In the candidate's own words", 120, 80),
  ]
  q.verbatim.forEach((quote, i) => {
    if (i > 0) blocks.push(spacer(40))
    blocks.push(quoteBlock(quote))
  })
  blocks.push(
    goldHead('Observed signals', 200, 60),
    ...q.soft_skills.map(s =>
      para([run(s, { size: 22 })], { before: 40, after: 40, numbering: { reference: BULLET, level: 0 } })
    ),
    goldHead('Recruiter notes', 160, 60),
    para([run(q.notes, { size: 22 })], { after: 120 }),
  )
  return blocks
}

// Optional professional summary distilled from the CV.
function summarySection() {
  if (!cfg.profile_summary) return []
  return [
    spacer(160),
    sectionBand('Profile summary'),
    spacer(60),
    para([run(cfg.profile_summary, { size: 22 })], { after: 80 }),
  ]
}

function skillsTable() {
  const rows = [
    ['Sectors',           cfg.skills.sectors],
    ['Key skills',        cfg.skills.key_skills],
    ['Codes & standards', cfg.skills.codes],
    ['Software',          cfg.skills.software],
    ['Languages',         cfg.skills.languages],
  ]
    .filter(([, v]) => v && v.length)
    .map(([label, vals], i) =>
      new TableRow({
        cantSplit: true,
        children: [
          tc([para([run(label, { bold: true, color: BLUE, size: 21 })])],
            { width: 2400, fill: i % 2 === 0 ? WHITE : ALT, borders: divB(), vAlign: VerticalAlign.TOP }),
          tc([para([run(vals.join('  |  '), { size: 22 })])],
            { width: 6960, fill: i % 2 === 0 ? WHITE : ALT, borders: divB(), vAlign: VerticalAlign.TOP }),
        ],
      })
    )
  return tbl([2400, 6960], rows, { borders: divB() })
}

// Certifications — important in energy staffing (HUET, BOSIET, PMP, etc.).
// Renders only if present in the config.
function certificationsSection() {
  if (!cfg.certifications || !cfg.certifications.length) return []
  return [
    spacer(160),
    sectionBand('Certifications & trainings'),
    spacer(60),
    ...cfg.certifications.map(cert =>
      para([
        run((cert.year ? cert.year + '   ' : ''), { bold: true, color: GOLD, size: 22 }),
        run(cert.name, { bold: true, size: 22 }),
        run(cert.issuer ? '   —   ' + cert.issuer : '', { color: GRAY, size: 22 }),
        run(cert.expiry ? '   (valid to ' + cert.expiry + ')' : '', { italic: true, color: GRAY, size: 21 }),
      ], { before: 50, after: 50 })
    ),
  ]
}

function educationSection() {
  return cfg.education.map(edu =>
    para([
      run(edu.period + '   ', { bold: true, color: GOLD, size: 22 }),
      run(edu.degree, { bold: true, size: 22 }),
      run('   —   ' + edu.school, { color: GRAY, size: 22 }),
    ], { before: 60, after: 60 })
  )
}

function experienceSection() {
  const blocks = []
  cfg.experience.forEach((exp, i) => {
    blocks.push(
      para([run(exp.title, { bold: true, color: BLUE, size: 24 })],
        { before: i === 0 ? 0 : 240, after: 50, keepNext: true }),
      para([
        run(exp.company, { bold: true, size: 22 }),
        run('   |   ' + (exp.duration || ''), { color: GRAY, size: 22 }),
        run('   |   ' + (exp.period || ''),   { color: GRAY, size: 22 }),
      ], { after: 100, keepNext: true }),
      para([run('Context', { bold: true, color: GOLD, size: 21 })], { before: 60, after: 40, keepNext: true }),
      para([run(exp.context, { size: 22 })], { after: 80 }),
      para([run('Actions', { bold: true, color: GOLD, size: 21 })], { before: 60, after: 40, keepNext: true }),
      ...exp.actions.map(a =>
        para([run(a, { size: 22 })], { before: 30, after: 30, numbering: { reference: BULLET, level: 0 } })
      ),
      para([run('Technical environment', { bold: true, color: GOLD, size: 21 })], { before: 80, after: 40, keepNext: true }),
      para([run(exp.environment, { italic: true, color: GRAY, size: 21 })], { after: 120 }),
    )
  })
  return blocks
}

// Anything from the CV that fits nowhere else (awards, publications,
// volunteering, patents...) — the "use ALL the CV" guarantee.
function additionalSection() {
  if (!cfg.additional || !cfg.additional.length) return []
  return [
    spacer(160),
    sectionBand('Additional information'),
    spacer(60),
    ...cfg.additional.map(item =>
      para([run(item, { size: 22 })], { before: 40, after: 40, numbering: { reference: BULLET, level: 0 } })
    ),
  ]
}

function nextStepsSection() {
  const c = cfg.contact
  const blocks = []
  if (c.about) {
    blocks.push(para([
      run(`About ${c.name}${c.role ? ', ' + c.role : ''}.  `, { bold: true, color: BLUE, size: 22 }),
      run(c.about, { italic: true, color: GRAY, size: 22 }),
    ], { after: 120 }))
  }
  blocks.push(
    para([run(
      `If the profile matches your needs, the simplest next step is a 30-minute call with ${c.name} to align on timing, scope and onboarding logistics.`,
      { size: 22 }
    )], { after: 120 }),
    new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [new ExternalHyperlink({
        link: c.booking_link,
        children: [run(`Book a call with ${c.name}`, { bold: true, color: GOLD, size: 24, underline: true })],
      })],
    }),
  )
  return blocks
}

function docHeader() {
  const name = cfg.candidate.full_name || cfg.candidate.initials
  return new Header({ children: [
    para([run(
      `${name}  |  ${cfg.candidate.position}  |  for ${cfg.mission.client}`,
      { italic: true, color: GRAY, size: 20 }
    )]),
  ]})
}

function docFooter() {
  const c = cfg.contact
  const sep = () => run('   |   ', { size: 16, color: GRAY })
  const link = (url, label) => new ExternalHyperlink({
    link: url, children: [run(label, { size: 16, color: GRAY, underline: true })],
  })
  const line = [run(c.name, { size: 16, color: GRAY, bold: true })]
  if (c.role)         line.push(sep(), run(c.role, { size: 16, color: GRAY }))
  if (c.email)        line.push(sep(), run(c.email, { size: 16, color: GRAY }))
  if (c.linkedin)     line.push(sep(), link(c.linkedin, 'LinkedIn'))
  if (c.booking_link) line.push(sep(), link(c.booking_link, 'Book a call'))
  return new Footer({ children: [
    para(line, { after: 40 }),
    para([run('Block C, Level 27, Unit 3A, KL Trillion, Jalan Tun Razak, Kuala Lumpur 50400, Malaysia',
      { size: 14, color: GRAY })], { after: 20 }),
    para([run('Trees Engineering Sdn. Bhd.  |  Trade Reg. No. 202001041675 (1397996-T)',
      { size: 14, color: GRAY })]),
  ]})
}

// ── Assemble ──────────────────────────────────────────────────────────────────

async function build() {
  const children = [
    headerTable(),
    spacer(140),
    presentedByBanner(),
    spacer(200),
    ...missionSection(),
    spacer(120),
    availabilityBadge(),
    spacer(200),
    ...pitchSection(),
    spacer(160),
    sectionBand('Fit with your requirements'),
    matchTable(),
    ...qualSection(),
    ...summarySection(),
    spacer(160),
    sectionBand('Skills'),
    skillsTable(),
    ...certificationsSection(),
    spacer(160),
    sectionBand('Education'),
    spacer(60),
    ...educationSection(),
    spacer(160),
    sectionBand('Experience'),
    spacer(80),
    ...experienceSection(),
    ...additionalSection(),
    spacer(160),
    sectionBand('Next steps'),
    spacer(80),
    ...nextStepsSection(),
  ]

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: BULLET,
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: {
              run:       { font: { name: FONT }, size: 22, color: BODY },
              paragraph: { indent: { left: 360, hanging: 180 } },
            },
          }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size:   { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 2160, left: 1440, header: 720, footer: 720 },
        },
      },
      headers: { default: docHeader() },
      footers: { default: docFooter() },
      children,
    }],
  })

  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(outputPath, buf)
  console.log('Written:', outputPath)
}

build().catch(err => { console.error(err.message); process.exit(1) })
