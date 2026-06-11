import { callLlmWithMessages } from '../llm.js';
import type { DossierConfig } from './dossier-builder.js';

export interface BuildInputs {
  /** Candidate display name — used only to derive initials when CV has no clear name. */
  talentName?: string | null;
  /** Raw CV text from _cv_extractions.raw_cv_text. */
  cvText: string;
  /** Raw JD text from _role.raw_jd_text (empty when not tailoring to the JD). */
  jdText: string;
  /** Optional pre-screening interview transcript. */
  transcript?: string | null;
  /** Client name (role.hiring_company, or a fallback). */
  clientName: string;
  /** Position title to mirror in the dossier header. */
  positionTitle: string;
  /** Contact block, sourced from the exporting recruiter's profile. Falls back
   *  to FOUNDER_CONTACT (per-field) when omitted or blank. */
  contact?: DossierConfig['contact'];
}

/** Company fallback contact (founder) — used for any recruiter-profile field
 *  that's blank, or when no recruiter could be resolved. */
export const FOUNDER_CONTACT = {
  name: 'Quentin Cloarec',
  role: 'Founder & CEO, Trees Engineering',
  email: 'quentin@trees-engineering.com',
  linkedin: 'https://www.linkedin.com/in/quentincloarec',
  booking_link: 'https://calendar.app.google/HLfcvtmSVVJjtb7n7',
};

const SYSTEM_PROMPT = `You are an analyst at Trees Engineering, an APAC technical-staffing agency. You produce a client-facing candidate dossier (a "Trees CV") that REPLACES the candidate's original CV in front of the client — so it must carry ALL the candidate's professional information, while matching the candidate to a specific client mission when a JD is provided.

You will receive:
- CLIENT_JD — the client's job description (may be empty if not tailoring)
- CANDIDATE_CV — the candidate's CV text
- TRANSCRIPT (optional) — a pre-screening interview transcript between Trees Engineering and the candidate
- CLIENT_NAME, POSITION_TITLE — confirmed by the user

Your output is a STRICT JSON object matching this schema. Output ONLY the JSON, no prose. Omit any key marked OPTIONAL entirely when you have nothing for it (never emit an empty block).

{
  "candidate": { "full_name": string, "initials": string, "position": string },
  "mission": {
    "client": string, "position_sought": string,
    "mission_ref": string, "contract_type": string,
    "start_date": string, "duration": string,
    "location": string, "day_rate": string
  },
  "availability": { "confirmed": boolean },
  "pitch": { "reasons": string[] },              // 3 to 5 sharp arguments
  "match": [ { "need": string, "answer": string } ],  // 4 to 6 rows
  "qualification": {                             // OPTIONAL — OMIT entirely if no TRANSCRIPT
    "date": string, "interviewer": string,
    "duration_min": number,
    "motivation": string,                        // 2-3 sentences
    "verbatim": string[],                        // up to 4 polished candidate quotes
    "soft_skills": string[],                     // 3-5 FACTUAL observations
    "notes": string
  },
  "profile_summary": string,                     // OPTIONAL — only if the CV has a summary; 3-4 lines, omit otherwise
  "skills": {
    "sectors": string[], "key_skills": string[], "codes": string[],
    "software": string[], "languages": string[]
  },
  "certifications": [                            // OPTIONAL — omit entirely if none in the CV
    { "year": string, "name": string, "issuer": string, "expiry": string }
  ],
  "education": [ { "period": string, "degree": string, "school": string } ],
  "experience": [
    {
      "title": string, "company": string,
      "duration": string, "period": string,
      "context": string,                         // 1-2 sentences
      "actions": string[],                       // 3-6 bullets
      "environment": string                      // tools + standards line
    }
  ],
  "additional": string[]                         // OPTIONAL — awards, publications, patents, volunteering; omit if none
}

STRICT RULES:
- COMPLETENESS: use ALL the professional content of the CANDIDATE_CV — every position (even short ones, in "experience"), every certification, every degree, every language, every award/publication/patent. Anything that fits no standard section goes in "additional". The dossier must never omit something the original CV showed.
- PRIVACY — strip the candidate's private data: NEVER output the candidate's email, phone, home address, date of birth, photo, marital status, ID/passport numbers, or REFERENCES (names/contacts of former managers). The recruiter is the client's only contact channel. A reference's factual content may inform a pitch argument, but the person's name and contact never appear.
- NEVER invent a skill, certification, project, duration, or quote not present in the CV or TRANSCRIPT. If a field is not derivable, use "—".
- candidate.full_name = the candidate's real full name from the CV. candidate.initials = 2-4 chars with periods derived from it (e.g. "J.D.").
- Pitch reasons: each must NAME THE CLIENT and cite a precise fact from the CV or transcript. Order most-differentiating first.
- Match matrix: left column = the requirement near-verbatim from the JD. Right column = short, factual, dated answer.
- If CLIENT_JD is empty: produce a plain CV — use "—" for mission detail fields and leave "pitch.reasons" and "match" as empty arrays.
- If TRANSCRIPT is provided: include "qualification" (quotes polished, fillers stripped; soft_skills are observations not adjectives). Otherwise OMIT "qualification".
- mission.start_date / duration / day_rate: only fill if explicitly in JD; otherwise "—".
- mission.client must be CLIENT_NAME verbatim. mission.position_sought must be POSITION_TITLE verbatim.
- Output ONLY the JSON object. No markdown fence, no commentary.`;

function buildUserMessage(input: BuildInputs): string {
  const parts: string[] = [
    `CLIENT_NAME: ${input.clientName}`,
    `POSITION_TITLE: ${input.positionTitle}`,
    '',
    '=== CLIENT_JD ===',
    input.jdText.slice(0, 12000) || '(no JD text — produce a generic candidate profile)',
    '',
    '=== CANDIDATE_CV ===',
    // Generous cap: the dossier must reproduce EVERY role, so the whole CV needs
    // to reach the model (gpt-4o-mini has a 128k context — room to spare).
    input.cvText.slice(0, 40000) || '(no CV text available)',
  ];
  if (input.transcript && input.transcript.trim()) {
    parts.push('', '=== TRANSCRIPT ===', input.transcript.slice(0, 16000));
  }
  if (input.talentName) {
    parts.push('', `HINT (candidate display name — use to confirm full_name / initials if the CV is unclear): ${input.talentName}`);
  }
  return parts.join('\n');
}

export async function generateDossierConfig(input: BuildInputs): Promise<DossierConfig> {
  const { text } = await callLlmWithMessages(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserMessage(input) },
    ],
    // 8192 out: a full-career dossier JSON (every role + actions, skills, certs,
    // qualification) overflows 4096 and would otherwise be truncated mid-array.
    { jsonMode: true, temperature: 0.3, maxTokens: 8192, operation: 'dossier_generation' },
  );

  const parsed = JSON.parse(text) as Partial<DossierConfig>;

  // Stamp the contact block server-side — never trust the LLM with names /
  // emails / booking links. Sourced from the recruiter's profile when provided.
  const contact = input.contact ?? { ...FOUNDER_CONTACT };
  parsed.contact = contact;

  // Defensive defaults — the builder needs these to render.
  parsed.candidate ??= { full_name: input.talentName ?? '—', initials: '—', position: input.positionTitle };
  parsed.mission   ??= { client: input.clientName, position_sought: input.positionTitle };
  parsed.pitch     ??= { reasons: [] };
  parsed.match     ??= [];
  parsed.skills    ??= {};
  parsed.education ??= [];
  parsed.experience ??= [];

  // The qualification interview is conducted by the exporting recruiter — stamp
  // their name rather than trusting the model to know who interviewed.
  if (parsed.qualification) parsed.qualification.interviewer = contact.name;

  return parsed as DossierConfig;
}
