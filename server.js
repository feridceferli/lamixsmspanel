const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const BASE_URL = (process.env.LAMIX_API_BASE_URL || process.env.BASE_URL || 'https://panel.lamix.org/api/v1').trim().replace(/\/+$/, '');
const TOKEN = process.env.LAMIX_API_TOKEN || '';
const PORT = process.env.PORT || 3000;
app.get('/health', (req, res) => res.json({status: 'ok'}));
app.get('/api/status', (req, res) => res.json({online: true, apiConfigured: Boolean(TOKEN), separate: true}));
app.get('/api/ranges', async (req, res) => {
  if (!TOKEN) return res.status(503).json({success:false,error:'LAMIX_API_TOKEN is not configured'});
  try {
    const response = await axios.get(BASE_URL + '/ranges', {headers:{Authorization:'Bearer ' + TOKEN},timeout:7000});
    const ranges = Array.isArray(response.data) ? response.data : (response.data.ranges || []);
    const summary = ranges.map(r => ({id: String(r.id || ''), country: String(r.country || r.name || ''), rate: typeof r.rate === 'number' ? r.rate : null}));
    res.json({success:true,ranges:summary});
  } catch(err) {
    res.status(502).json({success:false,error:'Upstream ranges unavailable'});
  }
});
app.listen(PORT, () => console.log('Independent LAMIX service started'));
