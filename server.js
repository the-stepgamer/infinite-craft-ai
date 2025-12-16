// server.js - OpenAI with fallback models

const express = require('express');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Models in fallback order
const models = [
  "gpt-4o-mini", // fast + cheap
  "gpt-4.1-mini"
];

// Simple in-memory cache
const mergeCache = {};

async function tryGenerate(prompt, retries = 3) {
  for (const model of models) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await client.responses.create({
          model,
          input: prompt
        });

        const text = response.output_text?.trim();
        if (!text) throw new Error("Empty response");

        return text;
      } catch (err) {
        if ((err.status === 429 || err.status === 503) && attempt < retries) {
          // exponential backoff
          await new Promise(r => setTimeout(r, 500 * attempt));
          continue;
        }
        throw err;
      }
    }
  }
  throw new Error("All models failed after retries");
}

app.post('/merge', async (req, res) => {
  const { element1, element2 } = req.body;

  if (!element1 || !element2) {
    return res.status(400).json({ error: "element1 and element2 are required" });
  }

  const key = [element1, element2].sort().join("+").toLowerCase();
  if (mergeCache[key]) {
    return res.json({ result: mergeCache[key] });
  }

  const prompt = `
Merge the elements [${element1} + ${element2}] to create a logical result.

Rules:
1. Capitalize the first letters of the result.
2. Add spaces between words if needed.
3. Maximum of 2 words.
4. Optionally include one emoji that represents the result.
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
    res.json({ result });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "OpenAI API error",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Merge API running on http://localhost:${PORT}/merge`);
});

