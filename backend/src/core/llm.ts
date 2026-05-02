type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  temperature?: number;
  max_tokens?: number;
  response_format?: "json_object";
};

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
  return { content, model };
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
  return { content, model };
}

export async function llmChat(messages: ChatMessage[], opts: ChatOptions = {}) {
  const provider = getProvider();
  if (provider === "ollama") return await chatOllama(messages, opts);
  if (provider === "openai") return await chatOpenAICompatible(messages, opts);
  throw new Error(`unknown_llm_provider ${provider}`);
}

