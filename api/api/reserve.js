// Réservation : décrémente la capacité, SMS au coach + confirmation à la cliente (optionnel)
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key){
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` }});
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}
async function kvSet(key, value){
  return fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ value: JSON.stringify(value) })
  });
}

const twilio = require('twilio');
const TW_SID = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM = process.env.TWILIO_PHONE_NUMBER;
const COACH_PHONE = process.env.COACH_PHONE; // ton numéro (ex +324...)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message:'Méthode non autorisée' });
  try {
    const { slotId, name, phone } = req.body || {};
    if (!slotId || !name || !phone) return res.status(400).json({ message:'Champs manquants' });

    const slots = await kvGet('slots') || [];
    const idx = slots.findIndex(s => s.id === slotId);
    if (idx === -1) return res.status(404).json({ message:'Créneau introuvable' });

    const s = slots[idx];
    const left = s.capacity - (s.booked||0);
    if (left <= 0) return res.status(409).json({ message:'Ce créneau est complet' });

    s.booked = (s.booked||0) + 1;
    slots[idx] = s;
    await kvSet('slots', slots);

    // SMS vers le coach
    if (TW_SID && TW_TOKEN && TW_FROM && COACH_PHONE) {
      const client = twilio(TW_SID, TW_TOKEN);
      const when = new Date(s.datetime).toLocaleString('fr-BE', { dateStyle:'medium', timeStyle:'short' });
      await client.messages.create({
        from: TW_FROM,
        to: COACH_PHONE,
        body: `Ardu Coaching: ${name} (${phone}) a réservé "${s.theme}" (${s.type}) le ${when}. Restant: ${s.capacity - s.booked}`
      }).catch(()=>{});
      // Confirmation à la cliente (optionnelle)
      if (process.env.SEND_CLIENT_CONFIRMATION === '1') {
        await client.messages.create({
          from: TW_FROM,
          to: phone,
          body: `Merci ${name}! Réservation confirmée pour "${s.theme}" (${s.type}).`
        }).catch(()=>{});
      }
    }

    return res.status(200).json({ message:'Réservation enregistrée' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message:'Erreur serveur' });
  }
};
