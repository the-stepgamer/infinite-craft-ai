// server.js - Fastify + OpenAI (3 keys, cooldown) + Groq fallback

const Fastify = require("fastify");
require("dotenv").config();

const fastify = Fastify({ logger: true });

/* ------------------ OpenAI API Keys ------------------ */

const apiKeys = process.env.OPENAI_API_KEYS
  ?.split(",")
  .map(k => k.trim())
  .filter(Boolean);

if (!apiKeys || apiKeys.length === 0) {
  throw new Error("OPENAI_API_KEYS is missing or empty");
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is required");
}

// Create one OpenAI client per key
const OpenAI = require("openai");
const openaiClients = apiKeys.map(key => new OpenAI({ apiKey: key }));

/* ------------------ Key Cooldown System ------------------ */

const KEY_COOLDOWN_MS = 30_000;
const keyPool = openaiClients.map(client => ({
  client,
  cooldownUntil: 0
}));
let keyIndex = 0;

function getNextClient() {
  const now = Date.now();
  for (let i = 0; i < keyPool.length; i++) {
    keyIndex = (keyIndex + 1) % keyPool.length;
    const entry = keyPool[keyIndex];
    if (entry.cooldownUntil <= now) {
      return entry;
    }
  }
  return null;
}

/* ------------------ Global Rate Limiting ------------------ */

const REQUEST_COOLDOWN_MS = 800;
const requestCooldown = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const last = requestCooldown.get(ip) || 0;
  if (now - last < REQUEST_COOLDOWN_MS) return true;
  requestCooldown.set(ip, now);
  return false;
}

/* ------------------ Model Config ------------------ */

const MODEL = "gpt-4o-mini";
const GROQ_MODEL = "llama-3.1-8b-instant";
const TEMPERATURE = 0.6;
const MAX_TOKENS = 50;

/* ------------------ Cache ------------------ */

const mergeCache = {};

/* ------------------ Safe OpenAI Generate Logic ------------------ */

async function tryOpenAI(prompt) {
  let lastError;
  for (let i = 0; i < keyPool.length; i++) {
    const entry = getNextClient();
    if (!entry) break;

    try {
      const response = await entry.client.chat.completions.create({
        model: MODEL,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }]
      });

      const text = response.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty model response");

      return text;
    } catch (err) {
      lastError = err;
      if (err.status === 429 || err.status >= 500) {
        entry.cooldownUntil = Date.now() + KEY_COOLDOWN_MS;
      }
    }
  }
  throw new Error(`OpenAI unavailable. Last error: ${lastError?.message}`);
}

/* ------------------ Groq Fallback ------------------ */

async function tryGroq(prompt) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS
    })
  });

  if (!res.ok) {
    throw new Error(`Groq Error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim();
}

/* ------------------ /merge Endpoint ------------------ */

fastify.post("/merge", async (request, reply) => {
  const { element1, element2 } = request.body || {};

  if (!element1 || !element2) {
    reply.code(400);
    return { error: "element1 and element2 are required" };
  }

  if (rateLimited(request.ip)) {
    reply.code(429);
    return { error: "Too many requests" };
  }

  const key = [element1, element2]
    .sort()
    .join("+")
    .toLowerCase();

  if (mergeCache[key]) {
    return { result: mergeCache[key] };
  }

 const prompt = `You are combining two elements into ONE final result.

OUTPUT RULES (STRICT):
- Output MUST be ONLY the final result name.
- ONE short noun or noun phrase only.
- NO equations, arrows, or operators (+, →, =).
- NO explanations, descriptions, or extra text.
- Start with an emoji (max 3).
- Capitalize First Letter of Each Word.

These are INVALID outputs:
Water + Turbulence → Wave
Earth + Fire = Mud
Result: Mud
🔥 Mud (from Earth and Fire)

These are VALID outputs:
🌊 Wave
🪨 Mud
🔤 Letter
🌫️ Steam
🌗 Twilight

Now combine:
${element1} + ${element2}
`;

  try {
    const text = await tryOpenAI(prompt);
    const result = text.toLowerCase() === "none" ? null : text;
    mergeCache[key] = result;
    return { result };
  } catch {
    try {
      const groqText = await tryGroq(prompt);
      const result = groqText.toLowerCase() === "none" ? null : groqText;
      mergeCache[key] = result;
      return { result };
    } catch (fallbackError) {
      request.log.error(fallbackError);
      reply.code(500);
      return {
        error: "AI backend error",
        details: fallbackError.message
      };
    }
  }
});

/* ------------------ Server ------------------ */

const PORT = process.env.PORT || 3000;
fastify.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`AI Merge API running on ${address}/merge`);
});
