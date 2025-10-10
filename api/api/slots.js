// Liste / création / suppression de créneaux (Vercel KV via REST)
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key){
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : [];
}
async function kvSet(key, value){
  return fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ value: JSON.stringify(value) })
  });
}

function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

const twilio = require('twilio');
const TW_SID   = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM  = process.env.TWILIO_PHONE_NUMBER;
const CLIENT_NUMBERS = (process.env.CLIENT_NUMBERS || '').split(',').map(s=>s.trim()).filter(Boolean);

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const slots = await kvGet('slots');
      slots.sort((a,b)=> new Date(a.datetime) - new Date(b.datetime));
      return res.status(200).json({ slots });
    }

    if (req.method === 'POST') {
      const { theme, type, datetime, capacity, broadcastMessage } = req.body || {};
      if (!datetime || !capacity) return res.status(400).json({ message: 'Champs manquants.' });

      const slots = await kvGet('slots');
      const slot = {
        id: uid(),
        theme: theme || 'Séance Ardu Coaching',
        type:  type  || 'individuel',
        datetime,
        capacity: Number(capacity),
        booked: 0,
        attendees: []
      };
      slots.push(slot);
      await kvSet('slots', slots);

      // SMS aux clientes (optionnel)
      if (TW_SID && TW_TOKEN && TW_FROM && CLIENT_NUMBERS.length && broadcastMessage) {
        const client = twilio(TW_SID, TW_TOKEN);
        await Promise.allSettled(
          CLIENT_NUMBERS.map(n => client.messages.create({ from: TW_FROM, to: n, body: broadcastMessage }))
        );
      }

      return res.status(200).json({ message: 'Créneau publié', slot });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ message: 'ID requis' });

      const slots = await kvGet('slots');
      const next = slots.filter(s => s.id !== id);
      await kvSet('slots', next);
      return res.status(200).json({ message: 'Créneau supprimé' });
    }

    res.setHeader('Allow','GET,POST,DELETE');
    return res.status(405).json({ message:'Méthode non autorisée' });
  } catch (e) {
    console.error('API /api/slots error:', e);
    return res.status(500).json({ message:'Erreur serveur' });
  }
};
