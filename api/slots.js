// api/slots.js — KV si présent, sinon mémoire (fallback)
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// --- Fallback mémoire (ne persiste pas entre redéploiements) ---
let MEM_SLOTS = []; // [{id,theme,type,datetime,capacity,booked,attendees:[]}]

function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// Wrappers stockage: KV si configuré, sinon mémoire
async function getSlots() {
  if (KV_URL && KV_TOKEN) {
    const r = await fetch(`${KV_URL}/get/slots`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    if (!r.ok) throw new Error(`KV get failed: ${r.status} ${r.statusText}`);
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : [];
  } else {
    return MEM_SLOTS;
  }
}

async function setSlots(slots) {
  if (KV_URL && KV_TOKEN) {
    const r = await fetch(`${KV_URL}/set/slots`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type':'application/json'
      },
      body: JSON.stringify({ value: JSON.stringify(slots) })
    });
    if (!r.ok) throw new Error(`KV set failed: ${r.status} ${r.statusText}`);
  } else {
    MEM_SLOTS = slots;
  }
}

const twilio = require('twilio');
const TW_SID   = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM  = process.env.TWILIO_PHONE_NUMBER;
const CLIENT_NUMBERS = (process.env.CLIENT_NUMBERS || '').split(',').map(s=>s.trim()).filter(Boolean);

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const slots = await getSlots();
      slots.sort((a,b)=> new Date(a.datetime) - new Date(b.datetime));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ slots });
    }

    if (req.method === 'POST') {
      const { theme, type, datetime, capacity, broadcastMessage } = req.body || {};
      if (!datetime || !capacity) {
        return res.status(400).json({ message: 'Champs manquants (datetime, capacity).' });
      }

      const slots = await getSlots();
      const slot = {
        id: uid(),
        theme: theme || 'Séance Ardu Coaching',
        type:  type  || 'individuel',
        // on accepte datetime-local ("YYYY-MM-DDTHH:mm") ou ISO
        datetime,
        capacity: Number(capacity),
        booked: 0,
        attendees: []
      };
      slots.push(slot);
      await setSlots(slots);

      // SMS broadcast facultatif
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
      const slots = await getSlots();
      const next = slots.filter(s => s.id !== id);
      await setSlots(next);
      return res.status(200).json({ message: 'Créneau supprimé' });
    }

    res.setHeader('Allow','GET,POST,DELETE');
    return res.status(405).json({ message:'Méthode non autorisée' });
  } catch (e) {
    console.error('API /api/slots error:', e);
    return res.status(500).json({ message:'Erreur serveur', error: String(e?.message || e) });
  }
};
