export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid request' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Gemini API key not configured' });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const systemPrompt = `You are a helpful AI assistant in a student study tracker app called StudyTrack. Help with questions, DSA, web dev, study tips, and drafting emails. Be concise and friendly. Today: ${today}`;

  const geminiContents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 800, temperature: 0.7 }
        })
      }
    );

    let data;
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid response from Gemini: ' + text.slice(0, 200) });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) return res.status(500).json({ error: 'No response from Gemini. Try again.' });

    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: 'Agent error: ' + err.message });
  }
}
