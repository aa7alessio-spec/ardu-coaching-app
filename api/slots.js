// api/slots.js — stockage en MÉMOIRE (temporaire, pour débloquer)
let SLOTS = []; // [{id, theme, type, datetime, capacity, booked, attendees:[]}]

function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const out = [...SLOTS].sort((a,b)=> new Date(a.datetime) - new Date(b.datetime));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ slots: out });
    }

    if (req.method === 'POST') {
      const { theme, type, datetime, capacity, broadcastMessage } = req.body || {};
      if (!datetime || !capacity) {
        return res.status(400).json({ message: 'Champs manquants (datetime, capacity).' });
      }
      const slot = {
        id: uid(),
        theme: theme || 'Séance Ardu Coaching',
        type:  type  || 'individuel',
        datetime, // accepte "YYYY-MM-DDTHH:mm" ou ISO
        capacity: Number(capacity),
        booked: 0,
        attendees: []
      };
      SLOTS.push(slot);
      return res.status(200).json({ message: 'Créneau publié', slot });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ message: 'ID requis' });
      SLOTS = SLOTS.filter(s => s.id !== id);
      return res.status(200).json({ message: 'Créneau supprimé' });
    }

    res.setHeader('Allow','GET,POST,DELETE');
    return res.status(405).json({ message:'Méthode non autorisée' });
  } catch (e) {
    console.error('API /api/slots error:', e);
    return res.status(500).json({ message:'Erreur serveur (slots)' });
  }
};
