// server.js - CommonJS version (works perfectly on Render.com)

const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config(); // Loads .env file

const app = express();
app.use(express.json());

// API key from .env (add this file to your repo, but .gitignore it if key is sensitive)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

app.post('/merge', async (req, res) => {
  const { element1, element2 } = req.body;

  if (!element1 || !element2) {
    return res.status(400).json({ error: "element1 and element2 are required" });
  }

 const prompt = `Merge the elements [${element1} + ${element2}] to create a logical result.1 - Capitalize the first letters of the result.2 - Add spaces between words if needed.3 - Return only the result with a maximum of 2 words.4 - Optionally include an emoji that represents the result.5 - Do not include any extra text beyond the result and emoji.Examples:[Fire + Water] → Steam 🌫️[Stone + Wood] → Axe 🪓[Metal + Heat] → Molten Metal 🔥[Plant + Water] → Growth 🌱Now, merge: [${element1} + ${element2}].`;

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
