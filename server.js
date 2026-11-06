const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = 'https://wxygtmfttyidwnhjdwdw.supabase.co/functions/v1/';
const APIKEY = 'sb_publishable_ax3nIoOvnP1E0qafE_e7kg_2hA3ATbT';

app.use(cors());
app.use(express.json());

// Phục vụ các file tĩnh trong thư mục 'public' (bao gồm index.html)
app.use(express.static(path.join(__dirname, 'public')));

// API Proxy
app.post('/proxy/:functionName', async (req, res) => {
  const { functionName } = req.params;
  const targetUrl = `${SUPABASE_URL}${functionName}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': APIKEY,
        'Authorization': 'Bearer ' + APIKEY
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.text();
    // Giữ nguyên status code từ Supabase trả về
    res.status(response.status).send(data);
  } catch (error) {
    console.error(`[Proxy Error] ${functionName}:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server Full-Stack đang chạy tại port ${PORT}`);
});
