// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProviderError,
  callJson,
  describeProviderError,
  extractJson,
  resolveAiConfig,
  toPublicConfig,
} from "./council-models.server";

describe("resolveAiConfig", () => {
  it("reports nothing configured without API keys", () => {
    const config = resolveAiConfig({});
    expect(config.defaultProvider).toBeNull();
    expect(config.providers).toEqual({});
  });

  it("uses the first configured provider by default, with default models and URLs", () => {
    const config = resolveAiConfig({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" });
    expect(config.defaultProvider).toBe("anthropic");
    expect(config.providers.anthropic?.baseUrl).toBe("https://api.anthropic.com");
    expect(config.providers.google?.baseUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai",
    );
    expect(config.providers.openai).toBeUndefined();
  });

  it("honours model, base URL and default-provider overrides", () => {
    const config = resolveAiConfig({
      OPENAI_API_KEY: "o",
      OPENAI_MODEL: "my-model",
      OPENAI_BASE_URL: "http://localhost:11434/v1/",
      GOOGLE_API_KEY: "g",
      QUORUM_DEFAULT_PROVIDER: "Google",
    });
    expect(config.defaultProvider).toBe("google");
    expect(config.providers.openai).toEqual({
      apiKey: "o",
      model: "my-model",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(config.issues).toEqual([]);
  });

  it("flags bad settings instead of throwing", () => {
    const config = resolveAiConfig({
      OPENAI_API_KEY: "o",
      OPENAI_BASE_URL: "not a url",
      ANTHROPIC_API_KEY: "a",
      QUORUM_DEFAULT_PROVIDER: "google",
      QUORUM_TIMEOUT_MS: "5",
    });
    expect(config.providers.openai).toBeUndefined();
    expect(config.defaultProvider).toBe("anthropic");
    expect(config.timeoutMs).toBe(120_000);
    expect(config.issues).toHaveLength(3);
  });

  it("never exposes keys or URLs in the public config", () => {
    const pub = toPublicConfig(
      resolveAiConfig({ OPENAI_API_KEY: "sk-secret", OPENAI_BASE_URL: "https://proxy.example/v1" }),
    );
    expect(pub).toEqual({
      defaultProvider: "openai",
      models: { openai: "gpt-6-astra" },
      issues: [],
    });
    expect(JSON.stringify(pub)).not.toContain("sk-secret");
    expect(JSON.stringify(pub)).not.toContain("proxy.example");
  });
});

describe("extractJson", () => {
  it("tolerates code fences and prose", () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("throws a ProviderError when there is no JSON", () => {
    expect(() => extractJson("no json here")).toThrow(ProviderError);
  });
});

describe("callJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  const request = { system: "sys", user: "usr", schema: { type: "object" }, name: "board_report" };
  const mockFetch = (status: number, body: unknown) => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  const sent = (fetchMock: ReturnType<typeof mockFetch>) => {
    const [url, init] = fetchMock.mock.calls[0]!;
    return {
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    };
  };

  it("calls OpenAI Chat Completions with a strict JSON schema", async () => {
    const fetchMock = mockFetch(200, { choices: [{ message: { content: '{"ok":true}' } }] });
    const config = resolveAiConfig({ OPENAI_API_KEY: "sk-test" });
    await expect(callJson(config, "openai", request)).resolves.toEqual({ ok: true });
    const { url, headers, body } = sent(fetchMock);
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(headers["authorization"]).toBe("Bearer sk-test");
    expect(body.response_format.json_schema).toMatchObject({ name: "board_report", strict: true });
  });

  it("calls the Anthropic Messages API with the schema in the system prompt", async () => {
    const fetchMock = mockFetch(200, {
      content: [{ type: "text", text: '{"ok":1}' }],
      stop_reason: "end_turn",
    });
    const config = resolveAiConfig({ ANTHROPIC_API_KEY: "ak", ANTHROPIC_MODEL: "claude-test" });
    await expect(callJson(config, "anthropic", request)).resolves.toEqual({ ok: 1 });
    const { url, headers, body } = sent(fetchMock);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe("ak");
    expect(headers["anthropic-version"]).toBeTruthy();
    expect(body.model).toBe("claude-test");
    expect(body.system).toContain("JSON Schema");
  });

  it("calls Gemini through its OpenAI-compatible endpoint", async () => {
    const fetchMock = mockFetch(200, {
      choices: [{ message: { content: '```json\n{"g":2}\n```' } }],
    });
    const config = resolveAiConfig({ GEMINI_API_KEY: "gk" });
    await expect(callJson(config, "google", request)).resolves.toEqual({ g: 2 });
    const { url, body } = sent(fetchMock);
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(body.response_format).toBeUndefined();
  });

  it.each([
    [401, { error: { message: "bad key" } }, "auth"],
    [429, { error: { message: "slow down", code: "rate_limit_exceeded" } }, "rate_limit"],
    [429, { error: { message: "no money", code: "insufficient_quota" } }, "quota"],
    [529, { error: { type: "overloaded_error" } }, "rate_limit"],
    [500, { error: { message: "boom" } }, "http"],
  ] as const)("maps HTTP %i to a %s error", async (status, body, kind) => {
    mockFetch(status, body);
    const config = resolveAiConfig({ OPENAI_API_KEY: "sk-test" });
    await expect(callJson(config, "openai", request)).rejects.toMatchObject({ kind, status });
  });

  it("treats refusals as refusal errors", async () => {
    mockFetch(200, { choices: [{ message: { content: null, refusal: "no" } }] });
    const config = resolveAiConfig({ OPENAI_API_KEY: "sk-test" });
    await expect(callJson(config, "openai", request)).rejects.toMatchObject({ kind: "refusal" });
  });

  it("refuses to call an unconfigured provider", async () => {
    await expect(callJson(resolveAiConfig({}), "openai", request)).rejects.toMatchObject({
      kind: "config",
    });
  });
});

describe("describeProviderError", () => {
  it("returns user-safe messages without provider details", () => {
    const message = describeProviderError(
      new ProviderError("auth", "openai", "openai returned HTTP 401: Incorrect API key sk-****"),
    );
    expect(message).toContain("API key");
    expect(message).not.toContain("sk-");
    expect(describeProviderError(new Error("anything"))).toContain("couldn't be read");
  });
});
