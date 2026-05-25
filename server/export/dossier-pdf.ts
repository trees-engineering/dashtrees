import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { PDFDocument as LibPDFDocument } from 'pdf-lib';
import type { DossierConfig } from './dossier-builder.js';
import type { BuildOptions } from './dossier-builder.js';

// PDF renderer for the same DossierConfig the docx builder consumes.
// Native PDF via pdfkit — no DOCX→PDF conversion, no headless browser.

const BLUE  = '#01195b';
const GOLD  = '#9e690b';
const GREEN = '#1a7f3e';
const AMBER = '#b45309';
const INK   = '#222222';
const GRAY  = '#555555';
const LINE  = '#cccccc';
const ALT   = '#f2f2f2';

type Doc = InstanceType<typeof PDFDocument>;

function logoPath(): string | null {
  const candidates = ['Trees_logo.jpeg', 'Trees_logo.jpg', 'Trees_logo_square.jpg', 'Trees_logo.png'];
  for (const f of candidates) {
    const p = path.resolve(process.cwd(), 'public', f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function generateDossierPdf(cfg: DossierConfig, opts: BuildOptions = {}): Promise<Buffer> {
  const tailored = opts.tailored !== false;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ml = doc.page.margins.left;
    const mr = doc.page.margins.right;
    const cw = doc.page.width - ml - mr;
    const bottomLimit = () => doc.page.height - 64;

    function ensureSpace(needed: number) {
      if (doc.y + needed > bottomLimit()) doc.addPage();
    }

    function sectionHead(label: string) {
      ensureSpace(40);
      doc.moveDown(0.6);
      const y = doc.y;
      doc.rect(ml, y + 4, 14, 2).fill(GOLD);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(BLUE);
      doc.text(label, ml + 22, y);
      doc.moveDown(0.3);
      doc.x = ml;
    }

    function bodyText(text: string, color = INK, size = 9.5) {
      doc.font('Helvetica').fontSize(size).fillColor(color);
      doc.text(text || '—', ml, doc.y, { width: cw, lineGap: 1.5 });
    }

    function bullets(items: string[], marker = '•') {
      doc.font('Helvetica').fontSize(9.5).fillColor(INK);
      for (const item of items) {
        ensureSpace(16);
        const y = doc.y;
        doc.text(marker, ml, y, { width: 12 });
        doc.text(item, ml + 14, y, { width: cw - 14, lineGap: 1.5 });
      }
    }

    // ── Header ───────────────────────────────────────────────────────────────
    const lp = logoPath();
    let textX = ml;
    if (lp) {
      try { doc.image(lp, ml, 40, { width: 84 }); textX = ml + 96; } catch { /* logo unreadable */ }
    }
    doc.font('Helvetica-Bold').fontSize(26).fillColor(BLUE);
    doc.text(cfg.candidate.initials || '—', textX, 42);
    doc.font('Helvetica').fontSize(11).fillColor(GRAY);
    doc.text(cfg.candidate.position || '', textX, doc.y);
    doc.moveTo(ml, 96).lineTo(doc.page.width - mr, 96).lineWidth(1.5).strokeColor(BLUE).stroke();
    doc.x = ml;
    doc.y = 108;

    // ── Mission box (tailored only) ──────────────────────────────────────────
    if (tailored) {
      const allFields: Array<[string, string | undefined]> = [
        ['Client', cfg.mission.client],
        ['Position', cfg.mission.position_sought],
        ['Mission ref.', cfg.mission.mission_ref],
        ['Contract type', cfg.mission.contract_type],
        ['Start date', cfg.mission.start_date],
        ['Duration', cfg.mission.duration],
        ['Location', cfg.mission.location],
        ['Day rate / package', cfg.mission.day_rate],
      ];
      const fields = allFields.filter((e): e is [string, string] => Boolean(e[1] && e[1] !== '—'));

      const boxTop = doc.y;
      const headerH = 22;
      const rowH = 16;
      const boxH = headerH + fields.length * rowH + 8;
      doc.rect(ml, boxTop, cw, headerH).fill(BLUE);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff');
      doc.text('MISSION', ml + 10, boxTop + 6);
      doc.rect(ml, boxTop + headerH, cw, boxH - headerH).fillAndStroke('#ffffff', LINE);
      let fy = boxTop + headerH + 6;
      for (const [label, value] of fields) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLUE);
        doc.text(label, ml + 10, fy, { width: 120, continued: false });
        doc.font('Helvetica').fontSize(8.5).fillColor(INK);
        doc.text(value, ml + 134, fy, { width: cw - 144 });
        fy += rowH;
      }
      doc.y = boxTop + boxH + 8;
      doc.x = ml;
    }

    // ── Availability badge ───────────────────────────────────────────────────
    {
      const confirmed = !cfg.availability || cfg.availability.confirmed !== false;
      const label = confirmed
        ? `AVAILABILITY CONFIRMED  —  from ${cfg.mission.start_date && cfg.mission.start_date !== '—' ? cfg.mission.start_date : 'TBC'}`
        : 'AVAILABILITY TO BE CONFIRMED';
      ensureSpace(28);
      const y = doc.y;
      doc.rect(ml, y, cw, 20).fill(confirmed ? GREEN : AMBER);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
      doc.text(label, ml, y + 6, { width: cw, align: 'center' });
      doc.y = y + 28;
      doc.x = ml;
    }

    // ── Pitch (tailored only) ────────────────────────────────────────────────
    if (tailored && cfg.pitch.reasons.length) {
      sectionHead(`WHY THIS PROFILE FOR ${cfg.mission.client.toUpperCase()}?`);
      bullets(cfg.pitch.reasons, '—');
    }

    // ── Match matrix (tailored only) ─────────────────────────────────────────
    if (tailored && cfg.match.length) {
      sectionHead('FIT WITH YOUR REQUIREMENTS');
      const colW = cw / 2;
      doc.font('Helvetica').fontSize(9);
      for (let i = 0; i < cfg.match.length; i++) {
        const row = cfg.match[i];
        const hNeed = doc.heightOfString(row.need, { width: colW - 16 });
        const hAns = doc.heightOfString(row.answer, { width: colW - 16 });
        const rowH = Math.max(hNeed, hAns) + 12;
        ensureSpace(rowH);
        const y = doc.y;
        if (i % 2 === 1) doc.rect(ml, y, cw, rowH).fill(ALT);
        doc.rect(ml, y, cw, rowH).strokeColor(LINE).lineWidth(0.5).stroke();
        doc.moveTo(ml + colW, y).lineTo(ml + colW, y + rowH).strokeColor(LINE).stroke();
        doc.font('Helvetica').fontSize(9).fillColor(INK);
        doc.text(row.need, ml + 8, y + 6, { width: colW - 16 });
        doc.text(row.answer, ml + colW + 8, y + 6, { width: colW - 16 });
        doc.y = y + rowH;
      }
      doc.x = ml;
    }

    // ── Qualification interview ──────────────────────────────────────────────
    if (cfg.qualification) {
      const q = cfg.qualification;
      ensureSpace(40);
      doc.moveDown(0.6);
      const y = doc.y;
      doc.rect(ml, y, cw, 20).fill(GOLD);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff');
      doc.text('QUALIFICATION INTERVIEW', ml + 10, y + 6);
      doc.y = y + 26;
      doc.x = ml;
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(GRAY);
      doc.text(`Date: ${q.date}   •   Interviewer: ${q.interviewer}   •   Duration: ${q.duration_min} min`, ml, doc.y, { width: cw });
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD);
      doc.text('Motivation', ml, doc.y);
      bodyText(q.motivation);
      if (q.verbatim.length) {
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD);
        doc.text("In the candidate's own words", ml, doc.y);
        doc.font('Helvetica-Oblique').fontSize(9).fillColor(INK);
        for (const quote of q.verbatim) {
          ensureSpace(16);
          doc.text(quote, ml + 12, doc.y, { width: cw - 12, lineGap: 1.5 });
        }
      }
      if (q.soft_skills.length) {
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD);
        doc.text('Observed signals', ml, doc.y);
        bullets(q.soft_skills);
      }
      if (q.notes) {
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD);
        doc.text('Recruiter notes', ml, doc.y);
        bodyText(q.notes);
      }
    }

    // ── Skills ───────────────────────────────────────────────────────────────
    {
      const skillRows: [string, string[] | undefined][] = [
        ['Sectors', cfg.skills.sectors],
        ['Key skills', cfg.skills.key_skills],
        ['Codes & standards', cfg.skills.codes],
        ['Software', cfg.skills.software],
        ['Languages', cfg.skills.languages],
      ];
      const present = skillRows.filter((e): e is [string, string[]] => Boolean(e[1] && e[1].length));
      if (present.length) {
        sectionHead('SKILLS');
        for (const [label, vals] of present) {
          ensureSpace(16);
          const y = doc.y;
          doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE);
          doc.text(label, ml, y, { width: 120 });
          doc.font('Helvetica').fontSize(9).fillColor(INK);
          doc.text(vals.join('  •  '), ml + 130, y, { width: cw - 130, lineGap: 1.5 });
        }
      }
    }

    // ── Education ────────────────────────────────────────────────────────────
    if (cfg.education.length) {
      sectionHead('EDUCATION');
      for (const edu of cfg.education) {
        ensureSpace(16);
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD);
        doc.text(`${edu.period}   `, ml, y, { continued: true });
        doc.fillColor(INK).text(`${edu.degree}  `, { continued: true });
        doc.font('Helvetica').fillColor(GRAY).text(edu.school);
      }
    }

    // ── Experience ───────────────────────────────────────────────────────────
    if (cfg.experience.length) {
      sectionHead('EXPERIENCE');
      for (const exp of cfg.experience) {
        ensureSpace(60);
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(11).fillColor(BLUE);
        doc.text(exp.title, ml, doc.y, { width: cw });
        doc.font('Helvetica').fontSize(8.5).fillColor(GRAY);
        doc.text(`For ${exp.company}   •   During ${exp.duration}   •   ${exp.period}`, ml, doc.y, { width: cw });
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GOLD);
        doc.text('Context', ml, doc.y);
        bodyText(exp.context);
        if (exp.actions.length) {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GOLD);
          doc.text('Actions', ml, doc.y);
          bullets(exp.actions);
        }
        if (exp.environment) {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GOLD);
          doc.text('Technical environment', ml, doc.y);
          doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRAY);
          doc.text(exp.environment, ml, doc.y, { width: cw, lineGap: 1.5 });
        }
      }
    }

    // ── Next steps ───────────────────────────────────────────────────────────
    sectionHead('NEXT STEPS');
    bodyText(`If the profile matches your needs, the simplest next step is a 30-minute call with ${cfg.contact.name} to align on timing, scope and onboarding logistics.`);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GOLD);
    doc.text(`Book a call with ${cfg.contact.name}`, ml, doc.y, {
      width: cw,
      link: cfg.contact.booking_link,
      underline: true,
    });

    // ── Footer on every page ─────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 40;
      doc.moveTo(ml, fy).lineTo(doc.page.width - mr, fy).lineWidth(1).strokeColor(BLUE).stroke();
      doc.font('Helvetica').fontSize(6.5).fillColor(GRAY);
      doc.text(`${cfg.contact.name} · ${cfg.contact.role} · ${cfg.contact.email}`, ml, fy + 5, { width: cw * 0.7 });
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor(GOLD);
      doc.text(`Trees Engineering · Page ${i - range.start + 1} of ${range.count}`, ml, fy + 5, { width: cw, align: 'right' });
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
  });
}

/** Concatenate PDF buffers. Non-PDF / unreadable buffers are skipped. */
export async function mergePdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
  const merged = await LibPDFDocument.create();
  for (const buf of pdfBuffers) {
    try {
      const src = await LibPDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    } catch {
      // skip un-loadable buffers (e.g. an original CV stored as DOCX)
    }
  }
  return Buffer.from(await merged.save());
}
