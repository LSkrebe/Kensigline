type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  temperature?: number;
  max_tokens?: number;
  response_format?: "json_object";
  /** Optional label for usage logs (pipeline name). */
  log_context?: string;
};

export type LlmChatResult = {
  content: string;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function normalizeUsage(raw: any): LlmChatResult["usage"] {
  if (!raw) return undefined;
  const prompt_tokens = Number(raw.prompt_tokens ?? raw.prompt_eval_count);
  const completion_tokens = Number(raw.completion_tokens ?? raw.eval_count);
  const total_tokens = Number(raw.total_tokens);
  const usage: NonNullable<LlmChatResult["usage"]> = {};
  if (Number.isFinite(prompt_tokens)) usage.prompt_tokens = prompt_tokens;
  if (Number.isFinite(completion_tokens)) usage.completion_tokens = completion_tokens;
  if (Number.isFinite(total_tokens)) usage.total_tokens = total_tokens;
  else if (usage.prompt_tokens != null && usage.completion_tokens != null) {
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
  }
  return Object.keys(usage).length ? usage : undefined;
}

function logLlmUsage(args: {
  model: string;
  messages: ChatMessage[];
  usage?: LlmChatResult["usage"];
  log_context?: string;
}) {
  if (String(process.env.LLM_LOG_USAGE ?? "1").trim() === "0") return;
  const inputChars = args.messages.reduce((n, m) => n + String(m.content ?? "").length, 0);
  console.info(
    "[llm]",
    JSON.stringify({
      context: args.log_context ?? null,
      model: args.model,
      input_chars: inputChars,
      prompt_tokens: args.usage?.prompt_tokens ?? null,
      completion_tokens: args.usage?.completion_tokens ?? null,
      total_tokens: args.usage?.total_tokens ?? null,
    }),
  );
}

function getProvider() {
  return String(process.env.LLM_PROVIDER ?? "openai").trim().toLowerCase();
}

function mustEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function getApiKey() {
  // Support a few common names so env setup is forgiving.
  return (
    String(process.env.LLM_API_KEY ?? "").trim() ||
    String(process.env.OPENAI_API_KEY ?? "").trim() ||
    String(process.env.OPENAPI_SECRET_KEY ?? "").trim()
  );
}

async function chatOllama(messages: ChatMessage[], opts: ChatOptions) {
  const baseUrl = String(process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").trim();
  const model = String(process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct").trim();

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages,
      options: {
        temperature: opts.temperature ?? 0,
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`ollama_chat_failed ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as any;
  const content = String(json?.message?.content ?? "");
  const resolvedModel = String(json?.model ?? model);
  const usage = normalizeUsage({
    prompt_eval_count: json?.prompt_eval_count,
    eval_count: json?.eval_count,
  });
  return { content, model: resolvedModel, usage };
}

async function chatOpenAICompatible(messages: ChatMessage[], opts: ChatOptions) {
  const baseUrl = String(process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").trim(); // e.g. http://localhost:8000/v1
  const apiKey = getApiKey();
  const model = String(process.env.LLM_MODEL ?? "gpt-4o-mini").trim();
  if (!apiKey) throw new Error("LLM_API_KEY (or OPENAI_API_KEY / OPENAPI_SECRET_KEY) is required");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.max_tokens ?? 1400,
      messages,
      ...(opts.response_format ? { response_format: { type: opts.response_format } } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`llm_chat_failed ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as any;
  const content = String(json?.choices?.[0]?.message?.content ?? "");
  const resolvedModel = String(json?.model ?? model);
  const usage = normalizeUsage(json?.usage);
  return { content, model: resolvedModel, usage };
}

export async function llmChat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<LlmChatResult> {
  const provider = getProvider();
  const result =
    provider === "ollama"
      ? await chatOllama(messages, opts)
      : provider === "openai"
        ? await chatOpenAICompatible(messages, opts)
        : null;
  if (!result) throw new Error(`unknown_llm_provider ${provider}`);
  logLlmUsage({
    model: result.model,
    messages,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(opts.log_context ? { log_context: opts.log_context } : {}),
  });
  return {
    content: result.content,
    model: result.model,
    ...(result.usage ? { usage: result.usage } : {}),
  };
}

