// server.js - Fastify + Gemini (official contents format)

const Fastify = require('fastify');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const fastify = Fastify({
  logger: true
});

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Models in fallback order
const models = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];

// Simple in-memory cache
const mergeCache = {};
const temp = 0.5;

async function tryGenerate(prompt, retries = 3) {
  for (const modelName of models) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: temp,
        maxOutputTokens: 50
      }
      // safetySettings can be added here if needed
    });

    for (let attempt = 1; attempt <= retries; attempt++) {
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

        return text;
      } catch (err) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500 * attempt));
          continue;
        }
        throw err;
      }
    }
  }

  throw new Error("All Gemini models failed after retries");
}

fastify.post('/merge', async (request, reply) => {
  const { element1, element2 } = request.body || {};

  if (!element1 || !element2) {
    reply.code(400);
    return { error: "element1 and element2 are required" };
  }

  const key = [element1, element2].sort().join("+").toLowerCase();
  if (mergeCache[key]) {
    return { result: mergeCache[key] };
  }

  const prompt = `
Merge the elements [${element1} + ${element2}] to create a logical result.

Rules:
1. Capitalize the first letters of the result.
2. Add spaces between words if needed.
3. ALWAYS include exactly ONE emoji that represents the result.
4. The final output MUST end with the emoji.
5. Return ONLY the result and emoji.

Examples:
[Fire + Water] → Steam 🌫️
[Stone + Wood] → Axe 🪓
[Metal + Heat] → Molten Metal 🔥
[Plant + Water] → Growth 🌱

Now merge:
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

const PORT = process.env.PORT || 3000;

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`AI Merge API running on ${address}/merge`);
});
