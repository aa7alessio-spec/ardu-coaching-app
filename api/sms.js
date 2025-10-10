const twilio = require('twilio');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { to, message } = req.body || {};
    if (!to || !message) return res.status(400).send('Missing to or message');

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      body: message,
    });

    res.status(200).send('OK');
  } catch (e) {
    res.status(500).send(e.message || 'Server error');
  }
};
