// server.js - Node.js + Express backend using Google Gemini AI
// Run with:
//   npm init -y
//   npm install express google-generativeai dotenv
//   node server.js

import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config(); // Put your key in a .env file

const app = express();
app.use(express.json());

// Your Gemini API key (never commit this to git!)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_KEY_HERE");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

