type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  temperature?: number;
  max_tokens?: number;
};

function getProvider() {
  return String(process.env.LLM_PROVIDER ?? "ollama").trim().toLowerCase();
}

function mustEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
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
  const baseUrl = mustEnv("LLM_BASE_URL"); // e.g. http://localhost:8000/v1
  const apiKey = String(process.env.LLM_API_KEY ?? "").trim();
  const model = mustEnv("LLM_MODEL");

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

