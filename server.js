// server.js — Fastify + Groq ONLY

const Fastify = require("fastify");
require("dotenv").config();

const fastify = Fastify({ logger: true });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is required");
}

/* ------------------ Utils ------------------ */

function extractResult(text) {
  if (!text) return null;

  // First line only
  let line = text.split("\n")[0].trim();

  // Remove equation-style junk
  line = line.split(/=|→|:/).pop().trim();

  // Keep emoji + words, drop leading garbage
  line = line.replace(/^[^A-Za-z\u{1F300}-\u{1FAFF}]+/gu, "");

  return line || null;
}

/* ------------------ Rate Limiting ------------------ */

const REQUEST_COOLDOWN_MS = 800;
const lastRequestByIp = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const last = lastRequestByIp.get(ip) || 0;
  if (now - last < REQUEST_COOLDOWN_MS) return true;
  lastRequestByIp.set(ip, now);
  return false;
}

/* ------------------ Cache ------------------ */

const mergeCache = {};

/* ------------------ Groq Call ------------------ */

const GROQ_MODEL = "llama-3.1-8b-instant";
const TEMPERATURE = 0.6;
const MAX_TOKENS = 50;

async function callGroq(prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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

  const key = [element1, element2]
    .sort()
    .join("+")
    .toLowerCase();

  // Cache hit
  if (mergeCache[key]) {
    return { result: mergeCache[key] };
  }

  // 🔥 Small, strong prompt
const prompt = `Combine "${element1}" and "${element2}" into ONE result.  
Output format: 🧠 ResultName  
Rules: 
one emoji at the start, 
capitalized first letter, 
NO explanations,
Spaces Between The Words,
Result Must Make Sense.`;

  try {
    const text = await callGroq(prompt);
    const result = text?.toLowerCase() === "none" ? null : text;

    mergeCache[key] = result;
    return { result };
  } catch (error) {
    request.log.error(error);
    reply.code(500);
    return {
      error: "Groq API error",
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
