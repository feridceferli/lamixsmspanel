'use strict';
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny' }));

const BASE_URL = (process.env.LAMIX_API_BASE_URL || process.env.BASE_URL || 'https://panel.lamix.org/api/v1').trim().replace(/\/+$/, '');
const TOKEN = (process.env.LAMIX_API_TOKEN || '').trim();
const PORT = process.env.PORT || 3000;
const client = axios.create({ timeout: 8000, validateStatus: () => true });
let lastRangeCheck = null;

function parseRanges(body) {
  // Providers may wrap the list under ranges, data, or data.ranges.
  const candidates = [body, body?.ranges, body?.data, body?.data?.ranges, body?.result?.ranges];
  return candidates.find(Array.isArray) || null;
}

function rangeSummary(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const id = item.id ?? item.range_id ?? item.rangeId ?? '';
  const country = item.country ?? item.country_name ?? item.countryName ?? item.name ?? '';
  const rawRate = item.rate ?? item.payout;
  const rate = typeof rawRate === 'number' && Number.isFinite(rawRate) ? rawRate : null;
  // Intentionally do not return individual numbers or message contents.
  return { id: String(id).slice(0, 100), country: String(country).slice(0, 100), rate };
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/status', (req, res) => res.json({
  online: true,
  apiConfigured: Boolean(TOKEN),
  separate: true,
  lastRangeCheck
}));

app.get('/api/ranges', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!TOKEN) {
    lastRangeCheck = { ok: false, code: 'missing_token', checkedAt: new Date().toISOString() };
    return res.status(503).json({ success: false, error: 'API açarı konfiqurasiya edilməyib.', code: 'missing_token' });
  }
  try {
    const upstream = await client.get(BASE_URL + '/ranges', {
      headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' }
    });
    if (upstream.status < 200 || upstream.status >= 300) {
      const status = upstream.status;
      const code = status === 401 || status === 403 ? 'authentication_failed' : status === 429 ? 'rate_limited' : 'upstream_http_error';
      lastRangeCheck = { ok: false, code, upstreamStatus: status, checkedAt: new Date().toISOString() };
      return res.status(status === 429 ? 429 : 502).json({
        success: false, code, upstreamStatus: status,
        error: code === 'authentication_failed' ? 'API autentifikasiyası uğursuz oldu.' :
               code === 'rate_limited' ? 'API sorğu limitinə çatıb.' : 'API serveri xəta qaytardı.'
      });
    }
    const items = parseRanges(upstream.data);
    if (!items) {
      lastRangeCheck = { ok: false, code: 'unexpected_response', checkedAt: new Date().toISOString() };
      return res.status(502).json({ success: false, code: 'unexpected_response', error: 'API cavabında diapazon siyahısı tapılmadı.' });
    }
    const ranges = items.map(rangeSummary).filter(Boolean);
    lastRangeCheck = { ok: true, count: ranges.length, checkedAt: new Date().toISOString() };
    return res.json({ success: true, ranges });
  } catch (error) {
    const code = error.code === 'ECONNABORTED' ? 'timeout' : 'connection_failed';
    lastRangeCheck = { ok: false, code, checkedAt: new Date().toISOString() };
    console.error('[lamix-ranges] Upstream connectivity failure:', code);
    return res.status(502).json({ success: false, code, error: code === 'timeout' ? 'API sorğusunun vaxtı bitdi.' : 'API ilə əlaqə qurulmadı.' });
  }
});

app.listen(PORT, () => console.log('Independent LAMIX metadata panel listening'));
