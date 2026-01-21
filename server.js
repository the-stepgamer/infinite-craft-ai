// server.js - Fastify + Gemini (API key failover)

const Fastify = require('fastify');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const fastify = Fastify({
  logger: true
});

/* ------------------ Gemini API Keys ------------------ */

const apiKeys = process.env.GEMINI_API_KEYS
  ?.split(',')
  .map(k => k.trim())
  .filter(Boolean);

if (!apiKeys || apiKeys.length === 0) {
  throw new Error("GEMINI_API_KEYS is missing or empty");
}

// One client per key (ordered)
const clients = apiKeys.map(key => new GoogleGenerativeAI(key));

/* ------------------ Models & Config ------------------ */

const models = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];

const temp = 0.5;

// Simple in-memory cache
const mergeCache = {};

/* ------------------ Gemini Failover Logic ------------------ */

async function tryGenerate(prompt) {
  let lastError;

  for (let keyIndex = 0; keyIndex < clients.length; keyIndex++) {
    const genAI = clients[keyIndex];

    for (const modelName of models) {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: temp,
          maxOutputTokens: 50
        }
      });

      try {
        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ]
        });

        const text = result.response.text()?.trim();
        if (!text) throw new Error("Empty response");

        return text; // ✅ success, stop everything
      } catch (err) {
        lastError = err;

        fastify.log.warn(
          `[Gemini failover] Key ${keyIndex + 1}/${clients.length} failed (${modelName}): ${err.message}`
        );

        // Immediately switch API key
        break;
      }
    }
  }

  throw new Error(
    `All Gemini API keys failed. Last error: ${lastError?.message}`
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
4. Include EXACTLY ONE emoji that clearly represents the result.
5. The emoji MUST be the final character.
6. Return ONLY the result name and emoji. No explanations.

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
      error: "Gemini API error",
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
