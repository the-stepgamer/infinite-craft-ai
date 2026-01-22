// server.js - Fastify + OpenAI (3 keys, cooldown, gpt-4o-mini only)

const Fastify = require("fastify");
const OpenAI = require("openai");
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

// Create one client per key
const clients = apiKeys.map(key => new OpenAI({ apiKey: key }));

/* ------------------ Key Cooldown System ------------------ */

const KEY_COOLDOWN_MS = 30_000; // 30 seconds

const keyPool = clients.map(client => ({
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

  return null; // all keys cooling down
}

/* ------------------ Global Rate Limiting ------------------ */

const REQUEST_COOLDOWN_MS = 800; // ~1 req/sec per IP
const requestCooldown = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const last = requestCooldown.get(ip) || 0;

  if (now - last < REQUEST_COOLDOWN_MS) {
    return true;
  }

  requestCooldown.set(ip, now);
  return false;
}

/* ------------------ Model Config ------------------ */

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.45;
const MAX_TOKENS = 32;

/* ------------------ Cache ------------------ */

const mergeCache = {};

/* ------------------ Safe Generate Logic ------------------ */

async function tryGenerate(prompt) {
  let lastError;

  for (let i = 0; i < keyPool.length; i++) {
    const entry = getNextClient();
    if (!entry) break;

    try {
      const completion = await entry.client.chat.completions.create({
        model: MODEL,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }]
      });

      const text = completion.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty model response");

      return text; // ✅ SUCCESS
    } catch (err) {
      lastError = err;

      // Cooldown key on rate limit or server error
      if (err.status === 429 || err.status >= 500) {
        entry.cooldownUntil = Date.now() + KEY_COOLDOWN_MS;
      }
    }
  }

  throw new Error(
    `All OpenAI keys unavailable. Last error: ${lastError?.message}`
  );
}

/* ------------------ Routes ------------------ */

fastify.post("/merge", async (request, reply) => {
  const { element1, element2 } = request.body || {};

  if (!element1 || !element2) {
    reply.code(400);
    return { error: "element1 and element2 are required" };
  }

  // Global traffic smoothing
  if (rateLimited(request.ip)) {
    reply.code(429);
    return { error: "Too many requests" };
  }

  const key = [element1, element2]
    .sort()
    .join("+")
    .toLowerCase();

  // Cache hit
  if (mergeCache[key]) {
    return { result: mergeCache[key] };
  }

  const prompt = `
Combine two elements into ONE clear, logical result.
Interpret the elements conceptually if needed.

Rules:
- Return ONE result only
- Capitalize words
- Start with an emoji
- Result Must Be A Dictionary Word
- No explanations

Examples:
Fire + Water → Steam 🌫️
Stone + Wood → Axe 🪓

Combine:
${element1} + ${element2}
`;

  try {
    const text = await tryGenerate(prompt);
    const result = text.toLowerCase() === "none" ? null : text;

    mergeCache[key] = result;
    return { result };
  } catch (error) {
    request.log.error(error);
    reply.code(500);
    return {
      error: "OpenAI API error",
      details: error.message
    };
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

