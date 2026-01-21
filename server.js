// server.js - Fastify + OpenAI (API key failover)

const Fastify = require('fastify');
const OpenAI = require('openai');
require('dotenv').config();

const fastify = Fastify({ logger: true });

/* ------------------ OpenAI API Keys ------------------ */

const apiKeys = process.env.OPENAI_API_KEYS
  ?.split(',')
  .map(k => k.trim())
  .filter(Boolean);

if (!apiKeys || apiKeys.length === 0) {
  throw new Error("OPENAI_API_KEYS is missing or empty");
}

// One client per key
const clients = apiKeys.map(
  key => new OpenAI({ apiKey: key })
);

/* ------------------ Models & Config ------------------ */

const models = [
  "gpt-4o-mini",
  "gpt-4o"
];

const temp = 0.5;

// Simple in-memory cache
const mergeCache = {};

/* ------------------ OpenAI Failover Logic ------------------ */

async function tryGenerate(prompt) {
  let lastError;

  for (let keyIndex = 0; keyIndex < clients.length; keyIndex++) {
    const client = clients[keyIndex];

    for (const modelName of models) {
      // Retry SAME key/model on empty output
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const completion = await client.chat.completions.create({
            model: modelName,
            temperature: temp,
            max_tokens: 80,
            messages: [
              { role: "user", content: prompt }
            ]
          });

          const text = completion.choices?.[0]?.message?.content?.trim();

          if (!text) {
            lastError = new Error("Empty response");
            await new Promise(r => setTimeout(r, 150 * attempt));
            continue;
          }

          return text; // ✅ success
        } catch (err) {
          lastError = err;
          break; // rotate key or model
        }
      }
    }
  }

  throw new Error(
    `All OpenAI API keys failed. Last error: ${lastError?.message}`
  );
}

/* ------------------ Routes ------------------ */

fastify.post('/merge', async (request, reply) => {
  const { element1, element2 } = request.body || {};

  if (!element1 || !element2) {
    reply.code(400);
    return { error: "element1 and element2 are required" };
  }

  const key = [element1, element2]
    .sort()
    .join("+")
    .toLowerCase();

  if (mergeCache[key]) {
    return { result: mergeCache[key] };
  }

  const prompt = `
You are combining two elements into a single, logical result.

The result should feel natural, intuitive, and commonly understandable.
Interpret the elements conceptually if needed, but avoid random or abstract outcomes.

Rules:
1. Return ONE clear result name.
2. Capitalize the first letter of each word.
3. Add spaces between words if needed.
4. Include an emoji that clearly represents the result (Maximum Of 5 Emojis).
5. The emoji MUST be the starter character.
6. Return ONLY the result name and emoji. No explanations or json formats. Just the result.

Examples:
[Fire + Water] → Steam 🌫️
[Stone + Wood] → Axe 🪓
[Metal + Heat] → Molten Metal 🔥
[Plant + Water] → Growth 🌱

Now combine:
[${element1} + ${element2}]
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

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`AI Merge API running on ${address}/merge`);
});
