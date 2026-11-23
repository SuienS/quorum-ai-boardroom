/**
 * Server-only AI provider layer.
 *
 * Talks to each provider's HTTP API directly with `fetch` (no SDKs), so it runs on Node.js,
 * Cloudflare Workers and any other Nitro target. API keys are read from the server environment
 * and never leave this module.
 *
 * - OpenAI (or any OpenAI-compatible endpoint): Chat Completions with a strict JSON schema.
 * - Google Gemini: Gemini's OpenAI-compatible Chat Completions endpoint, prompted for JSON.
 * - Anthropic: Messages API, prompted for JSON.
 *
 * Model output is untrusted: callers must pass it through `normalizeBoardResult`.
 */
import type { Provider, PublicAiConfig } from "./council";

export const PROVIDER_IDS: readonly Provider[] = ["openai", "anthropic", "google"];

export interface ProviderSettings {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface AiConfig {
  /** Providers that have an API key configured. */
  providers: Partial<Record<Provider, ProviderSettings>>;
  /** Runs single-provider boards, the synthesis step and per-seat fallback. Null when nothing is configured. */
  defaultProvider: Provider | null;
  timeoutMs: number;
  /** Configuration problems worth showing to the operator. Never includes keys or URLs. */
  issues: string[];
}

type Env = Record<string, string | undefined>;

const PROVIDER_ENV: Record<
  Provider,
  { keyVars: string[]; modelVar: string; baseUrlVar: string; model: string; baseUrl: string }
> = {
  openai: {
    keyVars: ["OPENAI_API_KEY"],
    modelVar: "OPENAI_MODEL",
    baseUrlVar: "OPENAI_BASE_URL",
    model: "gpt-6-astra",
    baseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    keyVars: ["ANTHROPIC_API_KEY"],
    modelVar: "ANTHROPIC_MODEL",
    baseUrlVar: "ANTHROPIC_BASE_URL",
    model: "claude-sonnet-5-5",
    baseUrl: "https://api.anthropic.com",
  },
  google: {
    keyVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    modelVar: "GEMINI_MODEL",
    baseUrlVar: "GEMINI_BASE_URL",
    model: "gemini-3.8-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
};

const DEFAULT_TIMEOUT_MS = 120_000;
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MAX_TOKENS = 8192;

const read = (env: Env, name: string) => env[name]?.trim() || undefined;

function validBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** Read provider keys, models and options from the environment. Never throws. */
export function resolveAiConfig(env: Env = process.env): AiConfig {
  const providers: AiConfig["providers"] = {};
  const issues: string[] = [];

  for (const id of PROVIDER_IDS) {
    const spec = PROVIDER_ENV[id];
    const apiKey = spec.keyVars.map((name) => read(env, name)).find(Boolean);
    if (!apiKey) continue;
    const baseUrl = validBaseUrl(read(env, spec.baseUrlVar) ?? spec.baseUrl);
    if (!baseUrl) {
      issues.push(`${spec.baseUrlVar} is not a valid http(s) URL, so ${id} is disabled.`);
      continue;
    }
    providers[id] = { apiKey, baseUrl, model: read(env, spec.modelVar) ?? spec.model };
  }

  const configured = PROVIDER_IDS.filter((id) => providers[id]);
  const requested = read(env, "QUORUM_DEFAULT_PROVIDER")?.toLowerCase();
  let defaultProvider: Provider | null = configured[0] ?? null;
  if (requested) {
    if (configured.includes(requested as Provider)) defaultProvider = requested as Provider;
    else
      issues.push(
        `QUORUM_DEFAULT_PROVIDER="${requested.slice(0, 20)}" is not a configured provider; using ${defaultProvider ?? "none"}.`,
      );
  }

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const rawTimeout = read(env, "QUORUM_TIMEOUT_MS");
  if (rawTimeout) {
    const parsed = Number(rawTimeout);
    if (Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 600_000) timeoutMs = parsed;
    else issues.push("QUORUM_TIMEOUT_MS must be an integer between 1000 and 600000; using 120000.");
  }

  return { providers, defaultProvider, timeoutMs, issues };
}

/** The subset of the configuration that is safe to send to the browser. */
export function toPublicConfig(config: AiConfig): PublicAiConfig {
  const models: PublicAiConfig["models"] = {};
  for (const id of PROVIDER_IDS) {
    const settings = config.providers[id];
    if (settings) models[id] = settings.model;
  }
  return { defaultProvider: config.defaultProvider, models, issues: config.issues };
}

export type ProviderErrorKind =
  | "config"
  | "auth"
  | "quota"
  | "rate_limit"
  | "refusal"
  | "timeout"
  | "network"
  | "http"
  | "invalid_output";

export class ProviderError extends Error {
  override name = "ProviderError";
  constructor(
    readonly kind: ProviderErrorKind,
    readonly provider: Provider | null,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** A message that is safe to show to end users. Details stay in the server log. */
export function describeProviderError(error: unknown): string {
  const kind = error instanceof ProviderError ? error.kind : undefined;
  switch (kind) {
    case "config":
      return "No AI provider is configured on the server. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY and restart.";
    case "auth":
      return "The AI provider rejected the server's API key. Check the key configured for this deployment.";
    case "quota":
      return "The AI provider account is out of credits or quota. Check billing for the configured API key.";
    case "rate_limit":
      return "The council is busy right now. Wait a moment and try again.";
    case "refusal":
      return "The council declined to review this decision. Try rephrasing it.";
    case "timeout":
      return "The council took too long to respond. Please try again.";
    case "network":
    case "http":
      return "The council couldn't be reached. Please try again.";
    default:
      return "The council's report couldn't be read. Please try again.";
  }
}

/** Pull the first JSON object out of model text (tolerates code fences / prose). */
export function extractJson(text: string): unknown {
  const a = text.indexOf("{"),
    b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new ProviderError("invalid_output", null, "No JSON in model output");
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    throw new ProviderError("invalid_output", null, "Model output is not valid JSON");
  }
}

export interface JsonRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  /** Schema name, used by OpenAI structured outputs. */
  name: string;
}

/** One JSON-returning call on the chosen provider. */
export async function callJson(
  config: AiConfig,
  provider: Provider,
  request: JsonRequest,
): Promise<unknown> {
  const settings = config.providers[provider];
  if (!settings) throw new ProviderError("config", provider, `${provider} is not configured`);
  const signal = AbortSignal.timeout(config.timeoutMs);
  const text =
    provider === "anthropic"
      ? await anthropicText(settings, request, signal)
      : await chatCompletionText(provider, settings, request, signal, provider === "openai");
  return extractJson(text);
}

const withSchemaPrompt = (system: string, schema: Record<string, unknown>) =>
  `${system}\n\nRespond with ONLY a JSON object matching this JSON Schema, no prose:\n${JSON.stringify(schema)}`;

async function chatCompletionText(
  provider: Provider,
  settings: ProviderSettings,
  request: JsonRequest,
  signal: AbortSignal,
  strictSchema: boolean,
): Promise<string> {
  const body = {
    model: settings.model,
    messages: [
      {
        role: "system",
        content: strictSchema ? request.system : withSchemaPrompt(request.system, request.schema),
      },
      { role: "user", content: request.user },
    ],
    ...(strictSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: request.name, strict: true, schema: request.schema },
          },
        }
      : {}),
  };
  const json = (await postJson(
    provider,
    `${settings.baseUrl}/chat/completions`,
    { authorization: `Bearer ${settings.apiKey}` },
    body,
    signal,
  )) as {
    choices?: {
      finish_reason?: string;
      message?: { content?: unknown; refusal?: unknown };
    }[];
  };
  const choice = json.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === "content_filter") {
    throw new ProviderError("refusal", provider, `${provider} refused the request`);
  }
  const content = choice?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("")
        : "";
  if (!text.trim())
    throw new ProviderError("invalid_output", provider, `${provider} returned no text`);
  return text;
}

async function anthropicText(
  settings: ProviderSettings,
  request: JsonRequest,
  signal: AbortSignal,
): Promise<string> {
  const json = (await postJson(
    "anthropic",
    `${settings.baseUrl}/v1/messages`,
    { "x-api-key": settings.apiKey, "anthropic-version": ANTHROPIC_VERSION },
    {
      model: settings.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: withSchemaPrompt(request.system, request.schema),
      messages: [{ role: "user", content: request.user }],
    },
    signal,
  )) as { stop_reason?: string; content?: { type?: string; text?: string }[] };
  if (json.stop_reason === "refusal") {
    throw new ProviderError("refusal", "anthropic", "anthropic refused the request");
  }
  const text = (json.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("");
  if (!text.trim())
    throw new ProviderError("invalid_output", "anthropic", "anthropic returned no text");
  return text;
}

async function postJson(
  provider: Provider,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
      // Never follow redirects: they could forward the API key header to another host.
      redirect: "manual",
    });
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ProviderError("timeout", provider, `${provider} request timed out`);
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProviderError("network", provider, `${provider} request failed: ${reason}`);
  }

  const raw = await response.text();
  let json: unknown = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    /* handled below */
  }

  if (!response.ok) {
    const detail = errorDetail(json) ?? raw.slice(0, 200);
    throw new ProviderError(
      classifyStatus(response.status, json),
      provider,
      `${provider} returned HTTP ${response.status}: ${detail}`,
      response.status,
    );
  }
  if (json === null || typeof json !== "object") {
    throw new ProviderError("invalid_output", provider, `${provider} returned a non-JSON response`);
  }
  return json;
}

function errorBody(json: unknown): Record<string, unknown> | undefined {
  // Gemini's OpenAI-compatible endpoint sometimes wraps the error in an array.
  const root = Array.isArray(json) ? json[0] : json;
  if (!root || typeof root !== "object") return undefined;
  const error = (root as { error?: unknown }).error;
  return error && typeof error === "object" ? (error as Record<string, unknown>) : undefined;
}

function errorDetail(json: unknown): string | undefined {
  const message = errorBody(json)?.["message"];
  return typeof message === "string" ? message.slice(0, 300) : undefined;
}

function classifyStatus(status: number, json: unknown): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota";
  if (status === 429) {
    const error = errorBody(json);
    const code = error?.["code"] ?? error?.["type"];
    return code === "insufficient_quota" ? "quota" : "rate_limit";
  }
  if (status === 529 || status === 503) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  return "http";
}
