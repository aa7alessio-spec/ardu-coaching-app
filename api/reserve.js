// api/reserve.js — stockage en MÉMOIRE (temporaire)
let SLOTS = global.__SLOTS__ || [];
if (!global.__SLOTS__) { global.__SLOTS__ = SLOTS; }

// NOTE: pour rester simple ici, on va référencer les mêmes données
// que dans slots.js. Si ça ne suit pas, copie/colle aussi la logique
// mémoire directement (ci-dessous on garde l'approche la plus simple).

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ message:'Méthode non autorisée' }); }

  try {
    const { slotId, name, phone } = req.body || {};
    if (!slotId || !name || !phone) return res.status(400).json({ message:'Champs manquants' });

    // Comme SLOTS est aussi utilisé dans slots.js, on va le chercher via GET local
    // (pour rester robuste si Vercel isole les modules). Sinon, on garde un fallback basique.
    let slots;
    try {
      // On appelle notre propre endpoint GET pour récupérer SLOTS courants
      const base = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
      const r = await fetch(`${base}/api/slots`, { cache: 'no-store' });
      const j = await r.json();
      slots = j.slots || [];
    } catch { slots = SLOTS; }

    const idx = slots.findIndex(s => s.id === slotId);
    if (idx === -1) return res.status(404).json({ message:'Créneau introuvable' });

    const s = slots[idx];
    const left = s.capacity - (s.booked || 0);
    if (left <= 0) return res.status(409).json({ message:'Ce créneau est complet' });

    s.booked = (s.booked || 0) + 1;
    s.attendees = s.attendees || [];
    s.attendees.push({ name, phone });
    slots[idx] = s;

    // Miroir local (au cas où)
    SLOTS = slots;
    global.__SLOTS__ = SLOTS;

    return res.status(200).json({ message:'Réservation enregistrée' });
  } catch (e) {
    console.error('API /api/reserve error:', e);
    return res.status(500).json({ message:'Erreur serveur (reserve)' });
  }
};

