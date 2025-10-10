// api/slots.js — Persistance: KV si dispo sinon mémoire + SMS (Twilio) + réservation via PATCH

// ====== Stockage (KV si présent) ======
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
let MEM_SLOTS = (global.__SLOTS__ ||= []); // fallback mémoire partagé

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
    global.__SLOTS__ = MEM_SLOTS;
  }
}

function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ====== Twilio (SMS) ======
const twilio = require('twilio');
const TW_SID   = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM  = process.env.TWILIO_PHONE_NUMBER;
const COACH_PHONE = process.env.COACH_PHONE;
const SEND_CLIENT_CONFIRMATION = process.env.SEND_CLIENT_CONFIRMATION === '1';
const CLIENT_NUMBERS = (process.env.CLIENT_NUMBERS || '').split(',').map(s=>s.trim()).filter(Boolean);

module.exports = async (req, res) => {
  try {
    // -------- GET : liste des créneaux (futurs) --------
    if (req.method === 'GET') {
      const slots = await getSlots();
      const now = Date.now();
      const out = (slots || [])
        .filter(s => {
          const t = new Date(s.datetime).getTime();
          return isFinite(t) && t >= now;
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
      const slots = await getSlots();
      const slot = {
        id: uid(),
        theme: theme || 'Séance Ardu Coaching',
        type:  type  || 'individuel',
        datetime, // "YYYY-MM-DDTHH:mm" ou ISO
        capacity: Number(capacity),
        booked: 0,
        attendees: [],
      };
      slots.push(slot);
      await setSlots(slots);

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

      const slots = await getSlots();
      const idx = (slots || []).findIndex(s => s.id === slotId);
      if (idx === -1) return res.status(404).json({ message:'Créneau introuvable' });

      const s = slots[idx];
      const left = s.capacity - (s.booked || 0);
      if (left <= 0) return res.status(409).json({ message:'Ce créneau est complet' });

      s.booked = (s.booked || 0) + 1;
      s.attendees = s.attendees || [];
      s.attendees.push({ name, phone });
      slots[idx] = s;
      await setSlots(slots);

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
      const slots = await getSlots();
      const next = (slots || []).filter(s => s.id !== id);
      await setSlots(next);
      return res.status(200).json({ message: 'Créneau supprimé' });
    }

    res.setHeader('Allow', 'GET,POST,PATCH,DELETE');
    return res.status(405).json({ message: 'Méthode non autorisée' });
  } catch (e) {
    console.error('API /api/slots error:', e);
    return res.status(500).json({ message:'Erreur serveur (slots)', error: String(e?.message || e) });
  }
};
