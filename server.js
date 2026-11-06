const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình Supabase
const SUPABASE_URL = 'https://wxygtmfttyidwnhjdwdw.supabase.co/functions/v1/';
const APIKEY = 'sb_publishable_ax3nIoOvnP1E0qafE_e7kg_2hA3ATbT';

// Lấy mã PIN từ biến môi trường (Mặc định là 12345678 nếu chưa cài)
const ADMIN_PIN = process.env.ADMIN_PIN || '12345678';

// Kết nối Redis
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// Lưu session admin tạm thời trên RAM
const adminSessions = new Set();

app.use(cors());
app.use(express.json());

// Hàm sinh token (chữ hoa, thường, số)
function generateSecureToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'use-';
  const bytes = crypto.randomBytes(60);
  for (let i = 0; i < 60; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// Middleware kiểm tra Admin
function requireAdmin(req, res, next) {
  const sessionToken = req.headers['x-admin-token'];
  if (!sessionToken || !adminSessions.has(sessionToken)) {
    return res.status(401).json({ success: false, error: 'Phiên đăng nhập hết hạn. Vui lòng thử lại.' });
  }
  next();
}

// ==========================================
// API ADMIN
// ==========================================

// 1. Đăng nhập bằng PIN
app.post('/admin/login', (req, res) => {
  const { pin } = req.body;
  if (pin === ADMIN_PIN) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    adminSessions.add(sessionToken);
    // Session tự hủy sau 2 tiếng
    setTimeout(() => adminSessions.delete(sessionToken), 2 * 60 * 60 * 1000);
    return res.json({ success: true, token: sessionToken });
  }
  return res.status(403).json({ success: false, error: 'Mã PIN không chính xác.' });
});

// 2. Tạo Token (Trả về file txt)
app.post('/admin/generate', requireAdmin, async (req, res) => {
  const { count } = req.body;
  const num = parseInt(count, 10);
  
  if (isNaN(num) || num <= 0 || num > 1000) {
    return res.status(400).json({ success: false, error: 'Số lượng không hợp lệ (từ 1 đến 1000).' });
  }

  try {
    const tokens = [];
    for (let i = 0; i < num; i++) {
      const token = generateSecureToken();
      tokens.push(token);
      // Lưu vào Redis: Key là token, Value là "1", Hết hạn sau 30 ngày
      await redis.set(token, '1', 'EX', 30 * 24 * 60 * 60);
    }

    const fileContent = tokens.join('\n');
    res.setHeader('Content-Disposition', `attachment; filename="tokens_${num}.txt"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(fileContent);
  } catch (error) {
    console.error('Lỗi tạo token:', error);
    return res.status(500).json({ success: false, error: 'Lỗi server.' });
  }
});

// ==========================================
// API NGƯỜI DÙNG (PROXY)
// ==========================================

app.post('/proxy/:functionName', async (req, res) => {
  const { functionName } = req.params;
  const { accessToken, ...supabasePayload } = req.body;

  if (!accessToken) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập Access Token.' });
  }

  // Dùng GETDEL: Lấy token và xóa luôn khỏi Redis (Đảm bảo dùng 1 lần)
  let tokenValue;
  try {
    tokenValue = await redis.getdel(accessToken);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Lỗi kết nối Database.' });
  }

  if (!tokenValue) {
    return res.status(403).json({ success: false, error: 'Token không hợp lệ hoặc đã được sử dụng.' });
  }

  // Token hợp lệ -> Gọi Supabase
  const targetUrl = `${SUPABASE_URL}${functionName}`;
  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': APIKEY,
        'Authorization': 'Bearer ' + APIKEY
      },
      body: JSON.stringify(supabasePayload)
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    console.error(`Lỗi Proxy:`, error);
    res.status(500).json({ success: false, error: 'Lỗi kết nối máy chủ gốc.' });
  }
});

// Phục vụ giao diện tĩnh
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server đang chạy tại port ${PORT}`);
});
