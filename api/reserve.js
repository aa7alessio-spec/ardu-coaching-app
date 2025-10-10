// api/reserve.js — utilise Vercel KV si dispo, sinon mémoire
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

let MEM_SLOTS = [];

async function getSlots() {
  if (KV_URL && KV_TOKEN) {
    const r = await fetch(`${KV_URL}/get/slots`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    if (!r.ok) throw new Error(`KV get failed: ${r.status}`);
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
    if (!r.ok) throw new Error(`KV set failed: ${r.status}`);
  } else {
    MEM_SLOTS = slots;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { 
    res.setHeader('Allow','POST'); 
    return res.status(405).json({ message:'Méthode non autorisée' }); 
  }

  try {
    const { slotId, name, phone } = req.body || {};
    if (!slotId || !name || !phone) return res.status(400).json({ message:'Champs manquants' });

    const slots = await getSlots();
    const idx = slots.findIndex(s => s.id === slotId);
    if (idx === -1) return res.status(404).json({ message:'Créneau introuvable' });

    const s = slots[idx];
    const left = s.capacity - (s.booked || 0);
    if (left <= 0) return res.status(409).json({ message:'Ce créneau est complet' });

    s.booked = (s.booked || 0) + 1;
    s.attendees = s.attendees || [];
    s.attendees.push({ name, phone });
    slots[idx] = s;
    await setSlots(slots);

    return res.status(200).json({ message:'Réservation enregistrée' });
  } catch (e) {
    console.error('API /api/reserve error:', e);
    return res.status(500).json({ message:'Erreur serveur', error: String(e?.message || e) });
  }
};
