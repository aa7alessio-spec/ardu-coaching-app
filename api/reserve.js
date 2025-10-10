// api/reserve.js — stockage en MÉMOIRE + SMS coach (et cliente en option)

const SLOTS = (global.__SLOTS__ ||= []);

// Twilio (notification au coach + confirmation cliente optionnelle)
const twilio = require('twilio');
const TW_SID   = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM  = process.env.TWILIO_PHONE_NUMBER;
const COACH_PHONE = process.env.COACH_PHONE;          // ex: +324...
const SEND_CLIENT_CONFIRMATION = process.env.SEND_CLIENT_CONFIRMATION === '1';

module.exports = async (req, res) => {
  if (req.method !== 'POST') { 
    res.setHeader('Allow','POST'); 
    return res.status(405).json({ message:'Méthode non autorisée' }); 
  }

  try {
    const { slotId, name, phone } = req.body || {};
    if (!slotId || !name || !phone) {
      return res.status(400).json({ message:'Champs manquants' });
    }

    const idx = SLOTS.findIndex(s => s.id === slotId);
    if (idx === -1) return res.status(404).json({ message:'Créneau introuvable' });

    const s = SLOTS[idx];
    const left = s.capacity - (s.booked || 0);
    if (left <= 0) return res.status(409).json({ message:'Ce créneau est complet' });

    // Enregistrer la réservation
    s.booked = (s.booked || 0) + 1;
    s.attendees = s.attendees || [];
    s.attendees.push({ name, phone });
    SLOTS[idx] = s;

    // SMS vers le coach (optionnel)
    const canCoachSms = TW_SID && TW_TOKEN && TW_FROM && COACH_PHONE;
    if (canCoachSms) {
      try {
        const client = twilio(TW_SID, TW_TOKEN);
        const when = new Date(s.datetime).toLocaleString('fr-BE', { dateStyle:'medium', timeStyle:'short' });
        await client.messages.create({
          from: TW_FROM,
          to: COACH_PHONE,
          body: `Ardu Coaching: ${name} (${phone}) a réservé "${s.theme}" (${s.type}) le ${when}. Restant: ${s.capacity - s.booked}`
        });
      } catch (e) {
        console.error('Twilio coach SMS error:', e?.message || e);
      }
    }

    // SMS de confirmation à la cliente (optionnel)
    if (SEND_CLIENT_CONFIRMATION && TW_SID && TW_TOKEN && TW_FROM) {
      try {
        const client = twilio(TW_SID, TW_TOKEN);
        await client.messages.create({
          from: TW_FROM,
          to: phone,
          body: `Merci ${name}! Ta réservation pour "${s.theme}" (${s.type}) est confirmée.`
        });
      } catch (e) {
        console.error('Twilio client SMS error:', e?.message || e);
      }
    }

    return res.status(200).json({ message:'Réservation enregistrée' });
  } catch (e) {
    console.error('API /api/reserve error:', e);
    return res.status(500).json({ message:'Erreur serveur (reserve)' });
  }
};
