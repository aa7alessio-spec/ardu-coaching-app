// /api/health.js – diagnostic KV
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

module.exports = async (req, res) => {
  const out = {
    kv_url_present: Boolean(KV_URL),
    kv_token_present: Boolean(KV_TOKEN),
    can_set: null,
    can_get: null,
    error: null
  };
  try {
    if (!KV_URL || !KV_TOKEN) throw new Error("KV env vars manquantes");
    const r1 = await fetch(`${KV_URL}/set/__ardu_test__`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ value: JSON.stringify({ ok:true, t: Date.now() }) })
    });
    out.can_set = r1.ok;
    const r2 = await fetch(`${KV_URL}/get/__ardu_test__`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    out.can_get = r2.ok;
  } catch (e) {
    out.error = String(e?.message || e);
  }
  res.status(200).json(out);
};
