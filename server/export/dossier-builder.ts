import fs from 'node:fs';
import path from 'node:path';
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, ImageRun, Header, Footer, ExternalHyperlink,
  AlignmentType, WidthType, BorderStyle, ShadingType, LevelFormat,
  UnderlineType, VerticalAlign,
} from 'docx';

export interface DossierConfig {
  candidate: { initials: string; position: string };
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
  skills: {
    sectors?: string[];
    key_skills?: string[];
    codes?: string[];
    software?: string[];
    languages?: string[];
  };
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
  contact: {
    name: string;
    role: string;
    email: string;
    booking_link: string;
  };
}

/** When `tailored` is false the JD-specific sections (pitch, needs↔candidate
 *  matrix, mission detail) are omitted — the output is a clean candidate CV. */
export interface BuildOptions {
  tailored?: boolean;
}

const BLUE  = '01195B';
const GOLD  = '9E690B';
const GREEN = '1A7F3E';
const AMBER = 'B45309';
const WHITE = 'FFFFFF';
const BODY  = '222222';
const GRAY  = '555555';
const DIV   = 'CCCCCC';
const ALT   = 'F2F2F2';
const FONT  = 'Arial';
const W     = 9360;

interface RunOpts { bold?: boolean; italic?: boolean; color?: string; size?: number; underline?: boolean }
function run(text: string, opts: RunOpts = {}): TextRun {
  const { bold = false, italic = false, color = BODY, size = 22, underline } = opts;
  return new TextRun({
    text, font: { name: FONT }, bold, italics: italic, color, size,
    ...(underline ? { underline: { type: UnderlineType.SINGLE, color } } : {}),
  });
}

interface ParaOpts {
  before?: number; after?: number;
  align?: typeof AlignmentType[keyof typeof AlignmentType];
  indent?: { left?: number; hanging?: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  border?: any;
  keepNext?: boolean; keepLines?: boolean;
  numbering?: { reference: string; level: number };
}
function para(children: TextRun | ExternalHyperlink | ImageRun | (TextRun | ExternalHyperlink | ImageRun)[], opts: ParaOpts = {}): Paragraph {
  const { before = 0, after = 0, align, indent, border, keepNext, keepLines, numbering } = opts;
  return new Paragraph({
    children: ([] as (TextRun | ExternalHyperlink | ImageRun)[]).concat(children),
    spacing: { before, after },
    ...(align ? { alignment: align } : {}),
    ...(indent ? { indent } : {}),
    ...(border ? { border } : {}),
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
function singleColTable(rows: TableRow[]): Table {
  return new Table({ width: { size: W, type: WidthType.DXA }, borders: noBorders(), rows });
}
function spacer(after = 120): Paragraph {
  return para([run('')], { after });
}
function sectionHead(text: string, before = 320, after = 160): Paragraph {
  return para([run(text, { bold: true, color: BLUE, size: 26 })], { before, after, keepNext: true, keepLines: true });
}

const BULLET = 'pitch-bullets';
const SIGNAL = 'action-bullets';

function tryReadLogo(): { data: Buffer; type: 'jpg' | 'png' } | null {
  const candidates = [
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo_square.jpg'), t: 'jpg' as const },
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo_square.jpeg'), t: 'jpg' as const },
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo.jpeg'), t: 'jpg' as const },
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo.jpg'), t: 'jpg' as const },
    { p: path.resolve(process.cwd(), 'public', 'Trees_logo.png'), t: 'png' as const },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.p)) return { data: fs.readFileSync(c.p), type: c.t };
  }
  return null;
}

function headerTable(cfg: DossierConfig): Table {
  const logo = tryReadLogo();
  const logoCell = tc(
    [para(logo
      ? [new ImageRun({ data: logo.data, type: logo.type, transformation: { width: 110, height: 44 } })]
      : [run('')],
    {})],
    { width: 2400 }
  );
  const titleCell = tc(
    [
      para([run(cfg.candidate.initials, { bold: true, color: BLUE, size: 44 })]),
      para([run(cfg.candidate.position, { color: GRAY, size: 26 })]),
    ],
    { width: 6960 }
  );
  return new Table({
    width: { size: W, type: WidthType.DXA }, borders: noBorders(),
    rows: [new TableRow({ children: [logoCell, titleCell] })],
  });
}

function missionTable(cfg: DossierConfig): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [tc(
      [para([run('🎯  MISSION', { bold: true, color: WHITE, size: 28 })], { align: AlignmentType.LEFT })],
      { fill: BLUE }
    )],
  });
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
  const fieldRows = fields
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) =>
      new TableRow({
        cantSplit: true,
        children: [tc(
          [para([
            run(label + '  ', { bold: true, color: BLUE, size: 22 }),
            run(value, { size: 22 }),
          ])],
          {
            borders: {
              top:    { style: BorderStyle.NONE,   size: 0, color: WHITE },
              left:   { style: BorderStyle.NONE,   size: 0, color: WHITE },
              right:  { style: BorderStyle.NONE,   size: 0, color: WHITE },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: DIV   },
            },
            margins: { top: 100, left: 200, bottom: 100, right: 200 },
          }
        )],
      })
    );
  return singleColTable([headerRow, ...fieldRows]);
}

function availabilityBadge(cfg: DossierConfig): Table {
  const confirmed = !cfg.availability || cfg.availability.confirmed !== false;
  const fill = confirmed ? GREEN : AMBER;
  const text = confirmed
    ? `✅  AVAILABILITY CONFIRMED  —  from ${cfg.mission.start_date || 'TBC'}`
    : '⚠️  AVAILABILITY TO BE CONFIRMED';
  return singleColTable([
    new TableRow({ children: [
      tc([para([run(text, { bold: true, color: WHITE, size: 24 })], { align: AlignmentType.CENTER })], { fill }),
    ]}),
  ]);
}

function pitchSection(cfg: DossierConfig): Paragraph[] {
  return [
    para([run(`WHY THIS PROFILE FOR ${cfg.mission.client.toUpperCase()}?`, { bold: true, color: BLUE, size: 26 })],
      { before: 240, after: 160 }),
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
        { width: 4680, fill: BLUE, borders: divBorders(), margins: { top: 120, left: 160, bottom: 120, right: 160 } }),
      tc([para([run('The candidate', { bold: true, color: WHITE, size: 22 })])],
        { width: 4680, fill: BLUE, borders: divBorders(), margins: { top: 120, left: 160, bottom: 120, right: 160 } }),
    ],
  });
  const dataRows = cfg.match.map((row, i) => {
    const fill = i % 2 === 0 ? WHITE : ALT;
    return new TableRow({
      cantSplit: true,
      children: [
        tc([para([run(row.need,   { size: 22 })])],
          { width: 4680, fill, borders: divBorders(), vAlign: VerticalAlign.TOP, margins: { top: 120, left: 160, bottom: 120, right: 160 } }),
        tc([para([run(row.answer, { size: 22 })])],
          { width: 4680, fill, borders: divBorders(), vAlign: VerticalAlign.TOP, margins: { top: 120, left: 160, bottom: 120, right: 160 } }),
      ],
    });
  });
  return new Table({ width: { size: W, type: WidthType.DXA }, borders: divBorders(), rows: [hdr, ...dataRows] });
}

function qualSection(cfg: DossierConfig): (Paragraph | Table)[] {
  if (!cfg.qualification) return [];
  const q = cfg.qualification;
  const goldHead = (label: string, before = 60, after = 60) =>
    para([run(label, { bold: true, color: GOLD, size: 22 })], { before, after });

  return [
    singleColTable([new TableRow({ children: [
      tc([para([run('✨  QUALIFICATION INTERVIEW', { bold: true, color: WHITE, size: 26 })])], { fill: GOLD }),
    ]})]),
    para([run(
      `Date: ${q.date}   •   Interviewer: ${q.interviewer}   •   Duration: ${q.duration_min} min`,
      { italic: true, color: GRAY, size: 20 }
    )], { before: 120, after: 120 }),
    goldHead('Motivation', 60, 60),
    para([run(q.motivation, { size: 22 })], { after: 120 }),
    goldHead("In the candidate's own words", 120, 60),
    ...q.verbatim.map(quote =>
      para([run(quote, { italic: true, size: 22 })], {
        before: 60, after: 60,
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 8 } },
      })
    ),
    goldHead('Observed signals', 160, 60),
    ...q.soft_skills.map(s =>
      para([run(s, { size: 22 })], { before: 40, after: 40, numbering: { reference: SIGNAL, level: 0 } })
    ),
    goldHead('Recruiter notes', 160, 60),
    para([run(q.notes, { size: 22 })], { after: 120 }),
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
    .filter((entry): entry is [string, string[]] => Boolean(entry[1] && entry[1].length))
    .map(([label, vals]) =>
      new TableRow({
        cantSplit: true,
        children: [
          tc([para([run(label,              { bold: true, color: WHITE, size: 22 })])],
            { width: 2400, fill: BLUE, borders: divBorders(), margins: { top: 120, left: 160, bottom: 120, right: 160 } }),
          tc([para([run(vals.join('  •  '), { size: 22 })])],
            { width: 6960, borders: divBorders(), margins: { top: 120, left: 160, bottom: 120, right: 160 } }),
        ],
      })
    );
  return new Table({ width: { size: W, type: WidthType.DXA }, borders: divBorders(), rows });
}

function educationSection(cfg: DossierConfig): Paragraph[] {
  return cfg.education.map(edu =>
    para([
      run(edu.period + '   •   ',  { bold: true, color: GOLD, size: 22 }),
      run(edu.degree,              { bold: true, size: 22 }),
      run('   •   ' + edu.school, { color: GRAY, size: 22 }),
    ], { before: 60, after: 60 })
  );
}

function experienceSection(cfg: DossierConfig): Paragraph[] {
  const blocks: Paragraph[] = [];
  cfg.experience.forEach((exp, i) => {
    blocks.push(
      para([run(exp.title, { bold: true, color: BLUE, size: 24 })],
        { before: i === 0 ? 0 : 200, after: 60, keepNext: true }),
      para([
        run('For ',           { color: GRAY, size: 22 }),
        run(exp.company,      { bold: true,  size: 22 }),
        run('   •   During ', { color: GRAY, size: 22 }),
        run(exp.duration,     {              size: 22 }),
        run('   •   ',        { color: GRAY, size: 22 }),
        run(exp.period,       {              size: 22 }),
      ], { after: 100 }),
      para([run('Context',              { bold: true, color: GOLD, size: 21 })], { before: 60, after: 40 }),
      para([run(exp.context,            { size: 22 })], { after: 80 }),
      para([run('Actions',              { bold: true, color: GOLD, size: 21 })], { before: 60, after: 40 }),
      ...exp.actions.map(a =>
        para([run(a, { size: 22 })], { before: 30, after: 30, numbering: { reference: SIGNAL, level: 0 } })
      ),
      para([run('Technical environment', { bold: true, color: GOLD, size: 21 })], { before: 80, after: 40 }),
      para([run(exp.environment,          { italic: true, color: GRAY, size: 21 })], { after: 120 }),
    );
  });
  return blocks;
}

function nextStepsSection(cfg: DossierConfig): Paragraph[] {
  return [
    para([run(
      `If the profile matches your needs, the simplest next step is a 30-minute call with ${cfg.contact.name} to align on timing, scope and onboarding logistics.`,
      { size: 22 }
    )], { after: 120 }),
    new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [new ExternalHyperlink({
        link: cfg.contact.booking_link,
        children: [run(`📅  Book a call with ${cfg.contact.name}`, { bold: true, color: GOLD, size: 24, underline: true })],
      })],
    }),
  ];
}

function docHeader(cfg: DossierConfig): Header {
  return new Header({ children: [
    para([run(
      `${cfg.candidate.initials}  •  ${cfg.candidate.position}  •  for ${cfg.mission.client}`,
      { italic: true, color: GRAY, size: 20 }
    )]),
  ]});
}

function docFooter(cfg: DossierConfig): Footer {
  const c = cfg.contact;
  return new Footer({ children: [
    para([run(`${c.name}  •  ${c.role}  ✉ ${c.email}  📅 Book a call`,
      { size: 16, color: GRAY })], { after: 40 }),
    para([run('Block C, Level 27, Unit 3A, KL Trillion, Jalan Tun Razak, Kuala Lumpur 50400, Malaysia',
      { size: 14, color: GRAY })], { after: 20 }),
    para([run('Trees Engineering Sdn. Bhd.  •  Trade Reg. No. 202001041675 (1397996-T)',
      { size: 14, color: GRAY })]),
  ]});
}

export async function generateDossierBuffer(cfg: DossierConfig, opts: BuildOptions = {}): Promise<Buffer> {
  const tailored = opts.tailored !== false;

  const children: (Paragraph | Table)[] = [
    headerTable(cfg),
    spacer(200),
  ];

  if (tailored) {
    children.push(
      missionTable(cfg),
      spacer(120),
      availabilityBadge(cfg),
      ...pitchSection(cfg),
      para([run('FIT WITH YOUR REQUIREMENTS', { bold: true, color: BLUE, size: 26 })],
        { before: 280, after: 160, keepNext: true, keepLines: true }),
      matchTable(cfg),
    );
  } else {
    children.push(availabilityBadge(cfg));
  }

  children.push(
    ...qualSection(cfg),
    sectionHead('SKILLS'),
    skillsTable(cfg),
    sectionHead('EDUCATION'),
    ...educationSection(cfg),
    sectionHead('EXPERIENCE'),
    ...experienceSection(cfg),
    sectionHead('NEXT STEPS', 320, 160),
    ...nextStepsSection(cfg),
  );

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: BULLET,
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '—',
            alignment: AlignmentType.LEFT,
            style: {
              run:       { font: FONT, size: 22, color: BODY },
              paragraph: { indent: { left: 360, hanging: 180 } },
            },
          }],
        },
        {
          reference: SIGNAL,
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
      headers: { default: docHeader(cfg) },
      footers: { default: docFooter(cfg) },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}
