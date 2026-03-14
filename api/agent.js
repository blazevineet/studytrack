export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid request' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Gemini API key not configured' });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const systemPrompt = `You are a personal AI agent assistant built into a student's study tracker app called StudyTrack.

You help with:
1. Answering questions and explaining topics clearly
2. Researching and summarizing information
3. Helping with DSA problems and web development topics
4. Writing emails the user can copy and send
5. Planning study schedules and giving study tips

Be concise, friendly, and mobile-friendly in your responses.
Use bullet points and bold text (**like this**) where helpful.
Today: ${today}`;

  const geminiContents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flashgenerateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: 'Agent error: ' + err.message });
  }
}
