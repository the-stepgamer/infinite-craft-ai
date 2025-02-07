const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Use DeepSeek API key (replace with your actual key or set it in env variables)
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'YOUR_DEEPSEEK_API_KEY_HERE';

// DeepSeek API Endpoint
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

// Function to generate merged element using DeepSeek API
async function generateMergedElement(element1, element2) {
  const prompt = `Merge the elements [${element1} + ${element2}] to create a logical result.

1 - Capitalize the first letters of the result.
2 - Add spaces between words if needed.
3 - Return only the result with a maximum of 2 words.
4 - Optionally include an emoji that represents the result.
5 - Do not include any extra text beyond the result and emoji.

Examples:
[Fire + Water] → Steam 🌫️
[Stone + Wood] → Axe 🪓
[Metal + Heat] → Molten Metal 🔥
[Plant + Water] → Growth 🌱

Now, merge: [${element1} + ${element2}].`;

  try {
    console.log('Sending API request with prompt:', prompt);

    // Make a POST request to DeepSeek's API
    const response = await axios.post(
      DEEPSEEK_ENDPOINT,
      {
        model: 'deepseek-chat', // You can change this to 'deepseek-coder' if needed
        messages: [
          {
            role: 'system',
            content: 'You are DeepSeek, an AI that logically merges elements.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 10,
        temperature: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('API Response:', response.data);

    if (!response.data.choices || response.data.choices.length === 0) {
      throw new Error('No choices found in the API response');
    }

    const mergedElement = response.data.choices[0].message.content.trim();
    return mergedElement;
  } catch (error) {
    console.error(
      'Error response:',
      error.response ? error.response.data : error.message
    );
    throw new Error('Failed to generate AI result');
  }
}

// Define a POST endpoint for merging elements
app.post('/merge', async (req, res) => {
  const { element1, element2 } = req.body;

  try {
    const result = await generateMergedElement(element1, element2);
    res.json({ success: true, mergedElement: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to merge elements with AI',
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

