import OpenAI from 'openai';
import { supabase } from './db.js';

// ---------------------------------------------------------------------------
// Thin OpenAI shim. Replaces Treelance's full llm/ stack (providers, cache,
// spend-guard, deepseek) with a single-provider wrapper that preserves the
// call signatures the ported matching + dossier code depends on.
// ---------------------------------------------------------------------------

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmOverride {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[llm] OPENAI_API_KEY not set — LLM calls return mock responses');
    return null;
  }
  client = new OpenAI({ apiKey });
  return client;
}

function sanitizeForApi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
}

// A neutral JSON blob so a missing key degrades gracefully instead of crashing.
const MOCK_RESPONSE = JSON.stringify({
  score: 50,
  reasoning: 'Mock response — OPENAI_API_KEY not configured',
  skill_score: 50,
  experience_score: 50,
});

// ---------------------------------------------------------------------------
// Prompt access — Supabase-backed, with a short in-memory TTL cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;
const promptCache = new Map<string, { text: string; ts: number }>();

export async function getPrompt(key: string): Promise<string> {
  const cached = promptCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.text;

  if (!supabase) return '';
  const { data, error } = await supabase
    .from('_prompts')
    .select('text')
    .eq('key', key)
    .single();

  if (error || !data) {
    console.warn(`[llm] Prompt not found: ${key}`);
    return '';
  }
  promptCache.set(key, { text: data.text, ts: Date.now() });
  return data.text;
}

// ---------------------------------------------------------------------------
// Chat completions
// ---------------------------------------------------------------------------

export async function callLlm(
  prompt: string,
  options: {
    maxTokens?: number;
    useCache?: boolean;
    temperature?: number;
    model?: string;
    operation?: string;
    provider?: string;
  } = {},
): Promise<LlmResponse> {
  const { maxTokens = 4096, temperature = 0.5, model } = options;
  const c = getClient();
  if (!c) return { text: MOCK_RESPONSE, inputTokens: 0, outputTokens: 0 };

  try {
    const response = await c.chat.completions.create({
      model: model ?? MODEL,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: sanitizeForApi(prompt) }],
    });
    return {
      text: response.choices[0]?.message?.content ?? '',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    console.warn('[llm] callLlm failed:', (err as Error).message);
    return { text: MOCK_RESPONSE, inputTokens: 0, outputTokens: 0 };
  }
}

export async function callLlmWithMessages(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    maxTokens?: number;
    jsonMode?: boolean;
    temperature?: number;
    operation?: string;
    provider?: string;
  } = {},
): Promise<LlmResponse> {
  const { maxTokens = 4096, jsonMode = false, temperature = 0.5 } = options;
  const c = getClient();
  if (!c) return { text: '{}', inputTokens: 0, outputTokens: 0 };

  try {
    const response = await c.chat.completions.create({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      messages: messages.map(m => ({ role: m.role, content: sanitizeForApi(m.content) })),
    });
    return {
      text: response.choices[0]?.message?.content ?? '',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    console.warn('[llm] callLlmWithMessages failed:', (err as Error).message);
    return { text: '{}', inputTokens: 0, outputTokens: 0 };
  }
}

export async function callLlmWithVision(
  systemPrompt: string,
  userPrompt: string,
  file: { fileData: string; filename: string; mimeType?: string },
  options: { maxTokens?: number; temperature?: number; operation?: string } = {},
): Promise<LlmResponse> {
  const { maxTokens = 4096, temperature = 0 } = options;
  const c = getClient();
  if (!c) return { text: '', inputTokens: 0, outputTokens: 0 };

  const mime = file.mimeType ?? 'application/pdf';
  const response = await c.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'file', file: { file_data: `data:${mime};base64,${file.fileData}`, filename: file.filename } },
        ] as never,
      },
    ],
  });
  return {
    text: response.choices[0]?.message?.content ?? '',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

/** One-shot call against a custom key + base URL. Kept for scorer's llmOverride path. */
export async function callLlmWithModelOverride(
  prompt: string,
  options: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
  override: LlmOverride,
): Promise<LlmResponse> {
  const { maxTokens = 2048, temperature = 0, timeoutMs = 30_000 } = options;
  const overrideClient = new OpenAI({ apiKey: override.apiKey, baseURL: override.baseUrl, timeout: timeoutMs });
  const response = await overrideClient.chat.completions.create({
    model: override.model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: sanitizeForApi(prompt) }],
  });
  return {
    text: response.choices[0]?.message?.content ?? '',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}
