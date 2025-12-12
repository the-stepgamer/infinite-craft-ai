// server.js - CommonJS version (works perfectly on Render.com)

const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config(); // Loads .env file

const app = express();
app.use(express.json());

// API key from .env (add this file to your repo, but .gitignore it if key is sensitive)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

app.post('/merge', async (req, res) => {
  const { element1, element2 } = req.body;

  if (!element1 || !element2) {
    return res.status(400).json({ error: "element1 and element2 are required" });
  }

  const prompt = `
    You are an expert in fantasy alchemy and elemental combination games.
    When the player combines "${element1}" and "${element2}", what single new element should be created?
    Examples:
    - Water + Fire → Steam
    - Earth + Water → Mud
    - Fire + Air → Smoke
    Reply with ONLY the name of the resulting element (one word or compound word), or exactly "None" if no combination makes sense.
    Result:
  `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    if (text.toLowerCase() === 'none') {
      return res.json({ result: null });
    }

    res.json({ result: text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Gemini API error", details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Merge API running on http://localhost:${PORT}/merge`);
});
