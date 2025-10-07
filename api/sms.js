
// api/sms.js - Vercel Serverless Function (CommonJS)
const twilio = require('twilio');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { to, message } = req.body || {};
    if (!to || !message) {
      res.status(400).send('Missing to or message');
      return;
    }

    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    await client.messages.create({
      to,
      from: process.env.TWILIO_FROM,
      body: message,
    });

    res.status(200).send('OK');
  } catch (e) {
    res.status(500).send(e.message || 'Server error');
  }
};
