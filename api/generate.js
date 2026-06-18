/* ============================================================
   Vercel serverless function — proxies Claude so the API key never
   reaches the browser. Set ANTHROPIC_API_KEY in the Vercel project
   env. Model: claude-sonnet-4-6 (handoff §7.1).
   ============================================================ */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante (variable d\'environnement Vercel).' });
  }
  const { prompt, max_tokens } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt requis' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();
    if (data.error) return res.status(502).json({ error: data.error.message || 'Erreur API Claude' });
    const text = (data.content || []).map((b) => b.text || '').join('');
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
