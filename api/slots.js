// api/slots.js — mémoire + SMS (Twilio) + réservation via PATCH

function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// --- Mémoire partagée (même instance) ---
const SLOTS = (global.__SLOTS__ ||= []); // [{id, theme, type, datetime, capacity, booked, attendees:[]}]

// --- Twilio ---
const twilio = require('twilio');
const TW_SID   = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM  = process.env.TWILIO_PHONE_NUMBER;
const COACH_PHONE = process.env.COACH_PHONE;
const SEND_CLIENT_CONFIRMATION = process.env.SEND_CLIENT_CONFIRMATION === '1';
const CLIENT_NUMBERS = (process.env.CLIENT_NUMBERS || '')
  .split(',').map(s=>s.trim()).filter(Boolean);

module.exports = async (req, res) => {
  try {
    // -------- GET : liste des créneaux (futurs) --------
    if (req.method === 'GET') {
      const now = Date.now();
      const out = [...SLOTS]
        .filter(s => {
          const t = new Date(s.datetime).getTime();
          return isFinite(t) && t >= now; // n'afficher que les futurs
        })
        .sort((a,b)=> new Date(a.datetime) - new Date(b.datetime));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ slots: out });
    }

    // -------- POST : publier un créneau --------
    if (req.method === 'POST') {
      const { theme, type, datetime, capacity, broadcastMessage } = req.body || {};
      if (!datetime || !capacity) {
        return res.status(400).json({ message: 'Champs manquants (datetime, capacity).' });
      }

      const slot = {
        id: uid(),
        theme: theme || 'Séance Ardu Coaching',
        type:  type  || 'individuel',
        datetime, // accepte "YYYY-MM-DDTHH:mm" (input datetime-local) ou ISO
        capacity: Number(capacity),
        booked: 0,
        attendees: [],
      };
      SLOTS.push(slot);

      // SMS broadcast aux clientes (optionnel)
      const msg = (broadcastMessage || '').trim();
      if (TW_SID && TW_TOKEN && TW_FROM && CLIENT_NUMBERS.length && msg) {
        try {
          const client = twilio(TW_SID, TW_TOKEN);
          await Promise.allSettled(
            CLIENT_NUMBERS.map(n => client.messages.create({ from: TW_FROM, to: n, body: msg }))
          );
        } catch (e) {
          console.error('Twilio broadcast error:', e?.message || e);
        }
      }

      return res.status(200).json({ message: 'Créneau publié', slot });
    }

    // -------- PATCH : réserver un créneau --------
    if (req.method === 'PATCH') {
      const { action, slotId, name, phone } = req.body || {};
      if (action !== 'reserve') return res.status(400).json({ message:'Action invalide' });
      if (!slotId || !name || !phone) return res.status(400).json({ message:'Champs manquants' });

      const idx = SLOTS.findIndex(s => s.id === slotId);
      if (idx === -1) return res.status(404).json({ message:'Créneau introuvable' });

      const s = SLOTS[idx];
      const left = s.capacity - (s.booked || 0);
      if (left <= 0) return res.status(409).json({ message:'Ce créneau est complet' });

      s.booked = (s.booked || 0) + 1;
      s.attendees = s.attendees || [];
      s.attendees.push({ name, phone });
      SLOTS[idx] = s;

      // SMS coach + cliente (optionnels)
      if (TW_SID && TW_TOKEN && TW_FROM) {
        try {
          const client = twilio(TW_SID, TW_TOKEN);
          // Coach
          if (COACH_PHONE) {
            const when = new Date(s.datetime).toLocaleString('fr-BE', { dateStyle:'medium', timeStyle:'short' });
            await client.messages.create({
              from: TW_FROM, to: COACH_PHONE,
              body: `Ardu Coaching: ${name} (${phone}) a réservé "${s.theme}" (${s.type}) le ${when}. Restant: ${s.capacity - s.booked}`
            }).catch(()=>{});
          }
          // Cliente
          if (SEND_CLIENT_CONFIRMATION) {
            await client.messages.create({
              from: TW_FROM, to: phone,
              body: `Merci ${name}! Ta réservation pour "${s.theme}" (${s.type}) est confirmée.`
            }).catch(()=>{});
          }
        } catch (e) {
          console.error('Twilio reserve SMS error:', e?.message || e);
        }
      }

      return res.status(200).json({ message:'Réservation enregistrée' });
    }

    // -------- DELETE : supprimer un créneau --------
    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ message: 'ID requis' });
      const idx = SLOTS.findIndex(s => s.id === id);
      if (idx === -1) return res.status(404).json({ message: 'Introuvable' });
      SLOTS.splice(idx, 1);
      return res.status(200).json({ message: 'Créneau supprimé' });
    }

    res.setHeader('Allow', 'GET,POST,PATCH,DELETE');
    return res.status(405).json({ message: 'Méthode non autorisée' });
  } catch (e) {
    console.error('API /api/slots error:', e);
    return res.status(500).json({ message: 'Erreur serveur (slots)' });
  }
};
