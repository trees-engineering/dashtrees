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
}

const CONTACT = {
  name: 'Quentin Cloarec',
  role: 'Founder & CEO, Trees Engineering',
  email: 'quentin@trees-engineering.com',
  booking_link: 'https://calendar.app.google/HLfcvtmSVVJjtb7n7',
};

const SYSTEM_PROMPT = `You are an analyst at Trees Engineering, an APAC technical-staffing agency. Your job is to produce a TARGETED candidate dossier matching a specific candidate to a specific client mission.

You will receive:
- CLIENT_JD — the client's job description (may be empty if not tailoring)
- CANDIDATE_CV — the candidate's CV text
- TRANSCRIPT (optional) — a pre-screening interview transcript between Trees Engineering and the candidate
- CLIENT_NAME, POSITION_TITLE — confirmed by the user

Your output is a STRICT JSON object matching this schema. Output ONLY the JSON, no prose.

{
  "candidate": { "initials": string, "position": string },
  "mission": {
    "client": string, "position_sought": string,
    "mission_ref": string, "contract_type": string,
    "start_date": string, "duration": string,
    "location": string, "day_rate": string
  },
  "availability": { "confirmed": boolean },
  "pitch": { "reasons": string[] },              // 3 to 5 sharp arguments
  "match": [ { "need": string, "answer": string } ],  // 4 to 6 rows
  "qualification": {                             // OMIT entirely if TRANSCRIPT not provided
    "date": string, "interviewer": "Quentin Cloarec",
    "duration_min": number,
    "motivation": string,                        // 2-3 sentences
    "verbatim": string[],                        // up to 4 polished candidate quotes
    "soft_skills": string[],                     // 3-5 FACTUAL observations
    "notes": string
  },
  "skills": {
    "sectors": string[], "key_skills": string[], "codes": string[],
    "software": string[], "languages": string[]
  },
  "education": [ { "period": string, "degree": string, "school": string } ],
  "experience": [
    {
      "title": string, "company": string,
      "duration": string, "period": string,
      "context": string,                         // 1-2 sentences
      "actions": string[],                       // 3-6 bullets
      "environment": string                      // tools + standards line
    }
  ]
}

STRICT RULES:
- NEVER invent a skill, certification, project, duration, or quote not present in CV or TRANSCRIPT. If a field is not derivable, use "—".
- Pitch reasons: each must NAME THE CLIENT and cite a precise fact from the CV or transcript. Order most-differentiating first.
- Match matrix: left column = the requirement near-verbatim from the JD. Right column = short, factual, dated answer.
- If CLIENT_JD is empty: still output the schema, but use "—" for mission detail fields, leave "pitch.reasons" and "match" as empty arrays.
- If TRANSCRIPT is provided: include "qualification". Quotes must be polished English in double quotes, fillers stripped. Soft_skills must be observations not adjectives.
- If TRANSCRIPT is NOT provided: OMIT the "qualification" key entirely.
- Candidate initials: 2-4 characters with periods, e.g. "J.D." or "A.B.C.".
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
    input.cvText.slice(0, 16000) || '(no CV text available)',
  ];
  if (input.transcript && input.transcript.trim()) {
    parts.push('', '=== TRANSCRIPT ===', input.transcript.slice(0, 16000));
  }
  if (input.talentName) {
    parts.push('', `HINT (display name, only to derive initials if CV has none): ${input.talentName}`);
  }
  return parts.join('\n');
}

export async function generateDossierConfig(input: BuildInputs): Promise<DossierConfig> {
  const { text } = await callLlmWithMessages(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserMessage(input) },
    ],
    { jsonMode: true, temperature: 0.3, maxTokens: 4096, operation: 'dossier_generation' },
  );

  const parsed = JSON.parse(text) as Partial<DossierConfig>;

  // Stamp the contact block — never trust the LLM with addresses / booking links.
  parsed.contact = { ...CONTACT };

  // Defensive defaults — the builder needs these to render.
  parsed.candidate ??= { initials: '—', position: input.positionTitle };
  parsed.mission   ??= { client: input.clientName, position_sought: input.positionTitle };
  parsed.pitch     ??= { reasons: [] };
  parsed.match     ??= [];
  parsed.skills    ??= {};
  parsed.education ??= [];
  parsed.experience ??= [];

  return parsed as DossierConfig;
}
