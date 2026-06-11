import fs from 'node:fs';
import path from 'node:path';
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, ImageRun, Header, Footer, ExternalHyperlink,
  AlignmentType, WidthType, BorderStyle, ShadingType, LevelFormat,
  UnderlineType, VerticalAlign, TableLayoutType,
} from 'docx';

export interface DossierConfig {
  candidate: { full_name?: string; initials: string; position: string };
  mission: {
    client: string;
    position_sought: string;
    mission_ref?: string;
    contract_type?: string;
    start_date?: string;
    duration?: string;
    location?: string;
    day_rate?: string;
  };
  availability?: { confirmed?: boolean };
  pitch: { reasons: string[] };
  match: { need: string; answer: string }[];
  qualification?: {
    date: string;
    interviewer: string;
    duration_min: number;
    motivation: string;
    verbatim: string[];
    soft_skills: string[];
    notes: string;
  };
  profile_summary?: string;
  skills: {
    sectors?: string[];
    key_skills?: string[];
    codes?: string[];
    software?: string[];
    languages?: string[];
  };
  certifications?: { year?: string; name: string; issuer?: string; expiry?: string }[];
  education: { period: string; degree: string; school: string }[];
  experience: {
    title: string;
    company: string;
    duration: string;
    period: string;
    context: string;
    actions: string[];
    environment: string;
  }[];
  additional?: string[];
  contact: {
    name: string;
    role: string;
    email: string;
    booking_link: string;
    linkedin?: string;
    about?: string;
  };
}

/** When `tailored` is false the JD-specific sections (mission, availability,
 *  pitch, needs↔candidate matrix) are omitted — the output is a clean CV. */
export interface BuildOptions {
  tailored?: boolean;
}

// NOTE on Google Docs compatibility: this builder sticks to constructs that
// survive the .docx → Google Docs import cleanly: tables with explicit DXA
// widths + a FIXED column grid, cell shading, standard bullet numbering,
// hyperlinks, headers/footers. It AVOIDS: paragraph borders (dropped by Google
// Docs), emoji glyphs (inconsistent rendering), floating/anchored images, text
// boxes, multi-section layouts. Keep it that way when editing.

const BLUE   = '01195B';
const GOLD   = '9E690B';
const GREEN  = '1A7F3E';
const AMBER  = 'B45309';
const WHITE  = 'FFFFFF';
const BODY   = '222222';
const GRAY   = '555555';
const DIV    = 'CCCCCC';
const ALT    = 'F2F2F2';
const GOLDBG = 'F7F2E8'; // light gold tint (presented-by band, quotes)
const FONT   = 'Arial';
const W      = 9360;     // content width dxa (12240 - 1440 - 1440)

interface RunOpts { bold?: boolean; italic?: boolean; color?: string; size?: number; underline?: boolean; caps?: boolean }
function run(text: string, opts: RunOpts = {}): TextRun {
  const { bold = false, italic = false, color = BODY, size = 22, underline, caps = false } = opts;
  return new TextRun({
    text, font: { name: FONT }, bold, italics: italic, color, size, allCaps: caps,
    ...(underline ? { underline: { type: UnderlineType.SINGLE, color } } : {}),
  });
}

interface ParaOpts {
  before?: number; after?: number;
  align?: typeof AlignmentType[keyof typeof AlignmentType];
  indent?: { left?: number; hanging?: number };
  keepNext?: boolean; keepLines?: boolean;
  numbering?: { reference: string; level: number };
}
type ParaChild = TextRun | ExternalHyperlink | ImageRun;
function para(children: ParaChild | ParaChild[], opts: ParaOpts = {}): Paragraph {
  const { before = 0, after = 0, align, indent, keepNext, keepLines, numbering } = opts;
  return new Paragraph({
    children: ([] as ParaChild[]).concat(children),
    spacing: { before, after },
    ...(align ? { alignment: align } : {}),
    ...(indent ? { indent } : {}),
    ...(keepNext ? { keepNext: true } : {}),
    ...(keepLines ? { keepLines: true } : {}),
    ...(numbering ? { numbering } : {}),
  });
}

function noBorders() {
  const n = { style: BorderStyle.NONE, size: 0, color: WHITE };
  return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n };
}
function divBorders(c = DIV) {
  const s = { style: BorderStyle.SINGLE, size: 6, color: c };
  return { top: s, bottom: s, left: s, right: s };
}
// Gold left-accent border (presented-by band, quote blocks) — a CELL border,
// not a paragraph border, so Google Docs keeps it.
function leftAccent(color = GOLD) {
  return {
    top:    { style: BorderStyle.NONE,   size: 0,  color: WHITE },
    bottom: { style: BorderStyle.NONE,   size: 0,  color: WHITE },
    right:  { style: BorderStyle.NONE,   size: 0,  color: WHITE },
    left:   { style: BorderStyle.SINGLE, size: 24, color },
  };
}

interface CellOpts {
  width?: number;
  fill?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  borders?: any;
  margins?: { top: number; left: number; bottom: number; right: number };
  vAlign?: 'top' | 'center' | 'bottom';
}
function tc(children: Paragraph | Paragraph[], opts: CellOpts = {}): TableCell {
  const { width = W, fill = WHITE, borders, margins, vAlign = VerticalAlign.CENTER } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill, color: 'auto', type: ShadingType.CLEAR },
    borders: borders ?? noBorders(),
    margins: margins ?? { top: 120, left: 160, bottom: 120, right: 160 },
    verticalAlign: vAlign,
    children: ([] as Paragraph[]).concat(children),
  });
}

// CRITICAL for Google Docs: every table must declare an explicit column grid
// (columnWidths) + FIXED layout. Word infers the grid from cell widths; Google
// Docs does NOT — without a grid it collapses columns to one char per line.
function tbl(columnWidths: number[], rows: TableRow[], opts: { borders?: ReturnType<typeof divBorders> } = {}): Table {
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    borders: opts.borders ?? noBorders(),
    rows,
  });
}
function tbl1(rows: TableRow[]): Table {
  return tbl([W], rows);
}

function spacer(after = 120): Paragraph {
  return para([run('')], { after });
}

// Section header: blue full-width band, white caps text — survives Google Docs
// and gives stronger structure than a coloured heading line.
function sectionBand(text: string): Table {
  return tbl1([new TableRow({
    tableHeader: true,
    children: [tc(
      [para([run(text, { bold: true, color: WHITE, size: 24, caps: true })])],
      { fill: BLUE, margins: { top: 90, left: 200, bottom: 90, right: 200 } }
    )],
  })]);
}
function goldBand(text: string): Table {
  return tbl1([new TableRow({
    tableHeader: true,
    children: [tc(
      [para([run(text, { bold: true, color: WHITE, size: 24, caps: true })])],
      { fill: GOLD, margins: { top: 90, left: 200, bottom: 90, right: 200 } }
    )],
  })]);
}

interface LinkOpts { color?: string; size?: number; bold?: boolean }
function hyperlink(url: string, label: string, opts: LinkOpts = {}): ExternalHyperlink {
  return new ExternalHyperlink({
    link: url,
    children: [run(label, { color: opts.color ?? BLUE, size: opts.size ?? 20, underline: true, bold: opts.bold ?? false })],
  });
}

const BULLET = 'pitch-bullets';

// ── Logo (native aspect ratio) ──────────────────────────────────────────────
function tryReadLogo(): { data: Buffer; type: 'jpg' | 'png' } | null {
  const candidates: { p: string; t: 'jpg' | 'png' }[] = [
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo_square.jpg'), t: 'jpg' },
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo_square.jpeg'), t: 'jpg' },
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo.jpeg'), t: 'jpg' },
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo.jpg'), t: 'jpg' },
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo.png'), t: 'png' },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.p)) return { data: fs.readFileSync(c.p), type: c.t };
  }
  return null;
}
// Read a JPEG's true pixel size (SOF marker) so the logo keeps its aspect ratio.
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
const LOGO_DISPLAY_WIDTH = 160;
function logoDims(logo: { data: Buffer; type: 'jpg' | 'png' }): { width: number; height: number } {
  const s = (logo.type === 'jpg' ? jpegSize(logo.data) : null) ?? { width: 5, height: 2 };
  return { width: LOGO_DISPLAY_WIDTH, height: Math.round(LOGO_DISPLAY_WIDTH * s.height / s.width) };
}

// ── Section builders ────────────────────────────────────────────────────────

function headerTable(cfg: DossierConfig): Table {
  const name = cfg.candidate.full_name || cfg.candidate.initials;
  const logo = tryReadLogo();
  const logoCell = tc(
    [para(logo
      ? [new ImageRun({ data: logo.data, type: logo.type, transformation: logoDims(logo) })]
      : [run('')],
    {})],
    { width: 3100 }
  );
  const titleCell = tc(
    [
      para([run(name, { bold: true, color: BLUE, size: 40 })]),
      para([run(cfg.candidate.position, { color: GRAY, size: 26 })], { before: 40 }),
    ],
    { width: 6260 }
  );
  return tbl([3100, 6260], [new TableRow({ children: [logoCell, titleCell] })]);
}

// "Presented by" banner — the recruiter's identity from their DashTrees profile.
function presentedByBanner(cfg: DossierConfig): Table {
  const c = cfg.contact;
  const items: ExternalHyperlink[] = [];
  if (c.email)        items.push(hyperlink('mailto:' + c.email, c.email));
  if (c.linkedin)     items.push(hyperlink(c.linkedin, 'LinkedIn'));
  if (c.booking_link) items.push(hyperlink(c.booking_link, 'Book a call', { color: GOLD, bold: true }));
  const lineChildren: ParaChild[] = [];
  items.forEach((it, i) => {
    if (i > 0) lineChildren.push(run('   |   ', { color: DIV, size: 20 }));
    lineChildren.push(it);
  });

  return tbl1([new TableRow({
    children: [tc(
      [
        para([run('PRESENTED BY', { bold: true, color: GOLD, size: 16 })], { after: 40 }),
        para([
          run(c.name, { bold: true, color: BLUE, size: 24 }),
          run(c.role ? '   —   ' + c.role : '', { color: GRAY, size: 22 }),
        ], { after: 60 }),
        para(lineChildren.length ? lineChildren : [run('')], {}),
      ],
      {
        fill: GOLDBG,
        borders: leftAccent(GOLD),
        margins: { top: 140, left: 220, bottom: 140, right: 200 },
      }
    )],
  })]);
}

function missionSection(cfg: DossierConfig): (Paragraph | Table)[] {
  const fields: [string, string | undefined][] = [
    ['Client',             cfg.mission.client],
    ['Position',           cfg.mission.position_sought],
    ['Mission ref.',       cfg.mission.mission_ref],
    ['Contract type',      cfg.mission.contract_type],
    ['Start date',         cfg.mission.start_date],
    ['Duration',           cfg.mission.duration],
    ['Location',           cfg.mission.location],
    ['Day rate / package', cfg.mission.day_rate],
  ];
  const rows = fields
    .filter((e): e is [string, string] => Boolean(e[1] && e[1] !== '—'))
    .map(([label, value], i) =>
      new TableRow({
        cantSplit: true,
        children: [
          tc([para([run(label, { bold: true, color: BLUE, size: 21 })])],
            { width: 2400, fill: i % 2 === 0 ? WHITE : ALT, borders: divBorders(), vAlign: VerticalAlign.TOP }),
          tc([para([run(value, { size: 22 })])],
            { width: 6960, fill: i % 2 === 0 ? WHITE : ALT, borders: divBorders(), vAlign: VerticalAlign.TOP }),
        ],
      })
    );
  return [
    sectionBand('The mission'),
    tbl([2400, 6960], rows, { borders: divBorders() }),
  ];
}

function availabilityBadge(cfg: DossierConfig): Table {
  const confirmed = !cfg.availability || cfg.availability.confirmed !== false;
  const fill = confirmed ? GREEN : AMBER;
  const start = cfg.mission.start_date && cfg.mission.start_date !== '—' ? cfg.mission.start_date : 'TBC';
  const text = confirmed
    ? `AVAILABILITY CONFIRMED  —  from ${start}`
    : 'AVAILABILITY TO BE CONFIRMED';
  return tbl1([
    new TableRow({ children: [
      tc([para([run(text, { bold: true, color: WHITE, size: 23 })], { align: AlignmentType.CENTER })],
        { fill, margins: { top: 110, left: 160, bottom: 110, right: 160 } }),
    ]}),
  ]);
}

function pitchSection(cfg: DossierConfig): (Paragraph | Table)[] {
  const name = (cfg.candidate.full_name || 'this profile').toUpperCase();
  return [
    sectionBand(`Why ${name} for ${cfg.mission.client.toUpperCase()}?`),
    spacer(60),
    ...cfg.pitch.reasons.map(reason =>
      para([run(reason, { size: 22 })], { before: 80, after: 80, numbering: { reference: BULLET, level: 0 } })
    ),
  ];
}

function matchTable(cfg: DossierConfig): Table {
  const hdr = new TableRow({
    tableHeader: true,
    children: [
      tc([para([run('Your needs',    { bold: true, color: WHITE, size: 22 })])],
        { width: 4680, fill: BLUE, borders: divBorders() }),
      tc([para([run('The candidate', { bold: true, color: WHITE, size: 22 })])],
        { width: 4680, fill: BLUE, borders: divBorders() }),
    ],
  });
  const dataRows = cfg.match.map((row, i) => {
    const fill = i % 2 === 0 ? WHITE : ALT;
    return new TableRow({
      cantSplit: true,
      children: [
        tc([para([run(row.need,   { size: 22 })])],
          { width: 4680, fill, borders: divBorders(), vAlign: VerticalAlign.TOP }),
        tc([para([run(row.answer, { size: 22 })])],
          { width: 4680, fill, borders: divBorders(), vAlign: VerticalAlign.TOP }),
      ],
    });
  });
  return tbl([4680, 4680], [hdr, ...dataRows], { borders: divBorders() });
}

// Verbatim quote as a one-cell shaded table (NOT a paragraph border — Google
// Docs drops paragraph borders; cell borders survive).
function quoteBlock(quote: string): Table {
  return tbl1([new TableRow({
    children: [tc(
      [para([run(quote, { italic: true, size: 22, color: BODY })])],
      { fill: GOLDBG, borders: leftAccent(GOLD), margins: { top: 100, left: 220, bottom: 100, right: 200 } }
    )],
  })]);
}

function qualSection(cfg: DossierConfig): (Paragraph | Table)[] {
  if (!cfg.qualification) return [];
  const q = cfg.qualification;
  const goldHead = (label: string, before = 60, after = 60) =>
    para([run(label, { bold: true, color: GOLD, size: 22 })], { before, after, keepNext: true });

  const blocks: (Paragraph | Table)[] = [
    spacer(160),
    goldBand('Qualification interview'),
    para([run(
      `Date: ${q.date}   |   Interviewer: ${q.interviewer}   |   Duration: ${q.duration_min} min`,
      { italic: true, color: GRAY, size: 20 }
    )], { before: 120, after: 120 }),
    goldHead('Motivation', 60, 60),
    para([run(q.motivation, { size: 22 })], { after: 140 }),
    goldHead("In the candidate's own words", 120, 80),
  ];
  q.verbatim.forEach((quote, i) => {
    if (i > 0) blocks.push(spacer(40));
    blocks.push(quoteBlock(quote));
  });
  blocks.push(
    goldHead('Observed signals', 200, 60),
    ...q.soft_skills.map(s =>
      para([run(s, { size: 22 })], { before: 40, after: 40, numbering: { reference: BULLET, level: 0 } })
    ),
    goldHead('Recruiter notes', 160, 60),
    para([run(q.notes, { size: 22 })], { after: 120 }),
  );
  return blocks;
}

function summarySection(cfg: DossierConfig): (Paragraph | Table)[] {
  if (!cfg.profile_summary) return [];
  return [
    spacer(160),
    sectionBand('Profile summary'),
    spacer(60),
    para([run(cfg.profile_summary, { size: 22 })], { after: 80 }),
  ];
}

function skillsTable(cfg: DossierConfig): Table {
  const rows = ([
    ['Sectors',           cfg.skills.sectors],
    ['Key skills',        cfg.skills.key_skills],
    ['Codes & standards', cfg.skills.codes],
    ['Software',          cfg.skills.software],
    ['Languages',         cfg.skills.languages],
  ] as [string, string[] | undefined][])
    .filter((e): e is [string, string[]] => Boolean(e[1] && e[1].length))
    .map(([label, vals], i) =>
      new TableRow({
        cantSplit: true,
        children: [
          tc([para([run(label, { bold: true, color: BLUE, size: 21 })])],
            { width: 2400, fill: i % 2 === 0 ? WHITE : ALT, borders: divBorders(), vAlign: VerticalAlign.TOP }),
          tc([para([run(vals.join('  |  '), { size: 22 })])],
            { width: 6960, fill: i % 2 === 0 ? WHITE : ALT, borders: divBorders(), vAlign: VerticalAlign.TOP }),
        ],
      })
    );
  return tbl([2400, 6960], rows, { borders: divBorders() });
}

function certificationsSection(cfg: DossierConfig): (Paragraph | Table)[] {
  if (!cfg.certifications || !cfg.certifications.length) return [];
  return [
    spacer(160),
    sectionBand('Certifications & trainings'),
    spacer(60),
    ...cfg.certifications.map(cert =>
      para([
        run(cert.year ? cert.year + '   ' : '', { bold: true, color: GOLD, size: 22 }),
        run(cert.name, { bold: true, size: 22 }),
        run(cert.issuer ? '   —   ' + cert.issuer : '', { color: GRAY, size: 22 }),
        run(cert.expiry ? '   (valid to ' + cert.expiry + ')' : '', { italic: true, color: GRAY, size: 21 }),
      ], { before: 50, after: 50 })
    ),
  ];
}

function educationSection(cfg: DossierConfig): Paragraph[] {
  return cfg.education.map(edu =>
    para([
      run(edu.period + '   ', { bold: true, color: GOLD, size: 22 }),
      run(edu.degree, { bold: true, size: 22 }),
      run('   —   ' + edu.school, { color: GRAY, size: 22 }),
    ], { before: 60, after: 60 })
  );
}

function experienceSection(cfg: DossierConfig): Paragraph[] {
  const blocks: Paragraph[] = [];
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
    );
  });
  return blocks;
}

function additionalSection(cfg: DossierConfig): (Paragraph | Table)[] {
  if (!cfg.additional || !cfg.additional.length) return [];
  return [
    spacer(160),
    sectionBand('Additional information'),
    spacer(60),
    ...cfg.additional.map(item =>
      para([run(item, { size: 22 })], { before: 40, after: 40, numbering: { reference: BULLET, level: 0 } })
    ),
  ];
}

function nextStepsSection(cfg: DossierConfig): Paragraph[] {
  const c = cfg.contact;
  const blocks: Paragraph[] = [];
  if (c.about) {
    blocks.push(para([
      run(`About ${c.name}${c.role ? ', ' + c.role : ''}.  `, { bold: true, color: BLUE, size: 22 }),
      run(c.about, { italic: true, color: GRAY, size: 22 }),
    ], { after: 120 }));
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
  );
  return blocks;
}

function docHeader(cfg: DossierConfig): Header {
  const name = cfg.candidate.full_name || cfg.candidate.initials;
  return new Header({ children: [
    para([run(
      `${name}  |  ${cfg.candidate.position}  |  for ${cfg.mission.client}`,
      { italic: true, color: GRAY, size: 20 }
    )]),
  ]});
}

function docFooter(cfg: DossierConfig): Footer {
  const c = cfg.contact;
  const sep = () => run('   |   ', { size: 16, color: GRAY });
  const link = (url: string, label: string) => new ExternalHyperlink({
    link: url, children: [run(label, { size: 16, color: GRAY, underline: true })],
  });
  const line: ParaChild[] = [run(c.name, { size: 16, color: GRAY, bold: true })];
  if (c.role)         line.push(sep(), run(c.role, { size: 16, color: GRAY }));
  if (c.email)        line.push(sep(), run(c.email, { size: 16, color: GRAY }));
  if (c.linkedin)     line.push(sep(), link(c.linkedin, 'LinkedIn'));
  if (c.booking_link) line.push(sep(), link(c.booking_link, 'Book a call'));
  return new Footer({ children: [
    para(line, { after: 40 }),
    para([run('Block C, Level 27, Unit 3A, KL Trillion, Jalan Tun Razak, Kuala Lumpur 50400, Malaysia',
      { size: 14, color: GRAY })], { after: 20 }),
    para([run('Trees Engineering Sdn. Bhd.  |  Trade Reg. No. 202001041675 (1397996-T)',
      { size: 14, color: GRAY })]),
  ]});
}

export async function generateDossierBuffer(cfg: DossierConfig, opts: BuildOptions = {}): Promise<Buffer> {
  const tailored = opts.tailored !== false;

  const children: (Paragraph | Table)[] = [
    headerTable(cfg),
    spacer(140),
    presentedByBanner(cfg),
    spacer(200),
  ];

  if (tailored) {
    children.push(
      ...missionSection(cfg),
      spacer(120),
      availabilityBadge(cfg),
      spacer(200),
      ...pitchSection(cfg),
      spacer(160),
      sectionBand('Fit with your requirements'),
      matchTable(cfg),
    );
  }

  children.push(
    ...qualSection(cfg),
    ...summarySection(cfg),
    spacer(160),
    sectionBand('Skills'),
    skillsTable(cfg),
    ...certificationsSection(cfg),
    spacer(160),
    sectionBand('Education'),
    spacer(60),
    ...educationSection(cfg),
    spacer(160),
    sectionBand('Experience'),
    spacer(80),
    ...experienceSection(cfg),
    ...additionalSection(cfg),
    spacer(160),
    sectionBand('Next steps'),
    spacer(80),
    ...nextStepsSection(cfg),
  );

  const doc = new Document({
    numbering: {
      config: [{
        reference: BULLET,
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: {
            run:       { font: FONT, size: 22, color: BODY },
            paragraph: { indent: { left: 360, hanging: 180 } },
          },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size:   { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 2160, left: 1440, header: 720, footer: 720 },
        },
      },
      headers: { default: docHeader(cfg) },
      footers: { default: docFooter(cfg) },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}
