// server.js — Fastify + OpenRouter free model

const Fastify = require("fastify");
require("dotenv").config();

const fastify = Fastify({ logger: true });

function extractResult(text) {
  if (!text) return null;

  // take only the first line
  let line = text.split("\n")[0].trim();

  // try parse equation-style
  line = line.split(/=|→|:/).pop().trim();

  // remove leading non-emoji/text
  line = line.replace(/^[^A-Za-z\u{1F300}-\u{1FAFF}]+/gu, "").trim();

  return line || null;
}

/* ------------------ OpenRouter ------------------ */

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  throw new Error("OPENROUTER_API_KEY is required");
}

// Free model you want to use
// Options can include models with suffix :free, e.g. "meta-llama/llama-3.3-70b-instruct:free"
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free"; 

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

/* ------------------ Cache ------------------ */

const mergeCache = {};

/* ------------------ OpenRouter Call ------------------ */

async function callOpenRouter(prompt) {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 50
    })
  });

  if (!res.ok) {
    throw new Error(`OpenRouter Error ${res.status}`);
  }

  const data = await res.json();
  return extractResult(data.choices?.[0]?.message?.content?.trim());
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

  const key = [element1, element2].sort().join("+").toLowerCase();
  if (mergeCache[key]) {
    return { result: mergeCache[key] };
  }

const prompt = `Combine "${element1}" and "${element2}" into ONE result. 
Output format: 🧠 ResultName 
Rules: one emoji, capitalized first letter, no explanations.`;

  try {
    const text = await callOpenRouter(prompt);
    const result = text?.toLowerCase() === "none" ? null : text;
    mergeCache[key] = result;
    return { result };
  } catch (error) {
    request.log.error(error);
    reply.code(500);
    return {
      error: "AI backend error",
      details: error.message
    };
  }
});

/* ------------------ Server Start ------------------ */

const PORT = process.env.PORT || 3000;
fastify.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`AI Merge API running on ${address}/merge`);
});
