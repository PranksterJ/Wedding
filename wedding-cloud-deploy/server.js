const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3200;
const PUBLIC_DIR = path.join(__dirname, 'web-preview');
const DB_FILE = path.join(__dirname, 'database', 'song_requests.json');

// 保证数据库文件存在
function initDB() {
  if (!fs.existsSync(path.dirname(DB_FILE))) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const defaultData = [
      {
        id: "req_001",
        songKey: "今天你要嫁给我_陶喆 / 蔡依林",
        songTitle: "今天你要嫁给我",
        artist: "陶喆 / 蔡依林",
        guestInfo: "伴郎团",
        remark: "最经典的婚礼合唱曲！祝黄怡❤金纬百年好合，永结同心！",
        requestCount: 8,
        status: "selected",
        createdAt: Date.now() - 3600000 * 5
      },
      {
        id: "req_002",
        songKey: "告白气球_周杰伦",
        songTitle: "告白气球",
        artist: "周杰伦",
        guestInfo: "新娘大学室友",
        remark: "晚宴敬酒环节放这首超甜！",
        requestCount: 6,
        status: "public",
        createdAt: Date.now() - 3600000 * 4
      },
      {
        id: "req_003",
        songKey: "最重要的决定_范玮琪",
        songTitle: "最重要的决定",
        artist: "范玮琪",
        guestInfo: "表姐李琳",
        remark: "你是我最重要的决定~ 祝新婚快乐！",
        requestCount: 4,
        status: "selected",
        createdAt: Date.now() - 3600000 * 3
      },
      {
        id: "req_004",
        songKey: "小幸运_田馥甄",
        songTitle: "小幸运",
        artist: "田馥甄",
        guestInfo: "高中同桌王同学",
        remark: "遇见你们就是最大的幸运！",
        requestCount: 3,
        status: "public",
        createdAt: Date.now() - 3600000 * 2
      },
      {
        id: "req_005",
        songKey: "最浪漫的事_赵咏华",
        songTitle: "最浪漫的事",
        artist: "赵咏华",
        guestInfo: "二叔全家",
        remark: "我能想到最浪漫的事，就是和你一起慢慢变老",
        requestCount: 2,
        status: "played",
        createdAt: Date.now() - 3600000 * 1
      }
    ];
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
  }
}
initDB();

function readSongs() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    // 兼容原云开发格式和标准格式
    return data.map(item => ({
      id: item.id || item._id || ('req_' + Date.now()),
      songKey: item.songKey || `${(item.songTitle||'').toLowerCase()}_${(item.artist||'').toLowerCase()}`,
      songTitle: item.songTitle || '',
      artist: item.artist || '',
      guestInfo: item.guestInfo || item.guestName || '',
      remark: item.remark || '',
      requestCount: item.requestCount || 1,
      status: item.status || 'public',
      createdAt: typeof item.createdAt === 'object' && item.createdAt.$date ? new Date(item.createdAt.$date).getTime() : (item.createdAt || Date.now())
    }));
  } catch (e) {
    console.error('读取数据库失败:', e);
    return [];
  }
}

function writeSongs(songs) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(songs, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('写入数据库失败:', e);
    return false;
  }
}

// 自动检测本机 Wi-Fi / 局域网物理 IP 地址
function getLocalIP() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    if (/VMware|Virtual|Loopback|FlClash|vEthernet/i.test(name)) continue;
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (/WLAN|Wi-Fi|无线|以太网|Ethernet/i.test(name)) {
          return net.address;
        }
        candidates.push(net.address);
      }
    }
  }
  return candidates[0] || '127.0.0.1';
}

const currentIP = getLocalIP();
const networkUrl = `http://${currentIP}:${PORT}`;

// 自动生成局域网测试二维码
try {
  const QRCode = require('qrcode');
  const qrPath = path.join(PUBLIC_DIR, 'mobile-qr.png');
  QRCode.toFile(qrPath, networkUrl, {
    width: 380,
    margin: 2,
    color: { dark: '#2C1D11', light: '#FAF7F2' }
  }, () => {});
} catch (e) {}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // 跨域支持 (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  let reqPath = req.url.split('?')[0];

  // ================= 1. API 接口区域 =================
  
  // GET /api/songs - 获取所有歌曲列表
  if (reqPath === '/api/songs' && req.method === 'GET') {
    const songs = readSongs();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 0, data: songs }));
    return;
  }

  // POST /api/songs - 宾客提交点歌 / +1 喜欢
  if (reqPath === '/api/songs' && req.method === 'POST') {
    const payload = await parseBody(req);
    const { title, artist, remark, guestInfo, action, songKey } = payload;
    let songs = readSongs();

    if (action === 'upvote' && songKey) {
      // 宾客 +1 点赞
      const target = songs.find(s => s.songKey === songKey);
      if (target) {
        target.requestCount = (target.requestCount || 1) + 1;
        writeSongs(songs);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ code: 0, message: '点播+1成功', data: target }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 404, message: '未找到歌曲' }));
      return;
    }

    // 新增点歌
    if (!title || !artist || !guestInfo) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ code: 400, message: '歌曲名称、歌手和您的信息为必填项' }));
      return;
    }

    const key = `${title.toLowerCase().trim()}_${artist.toLowerCase().trim()}`;
    const existingIndex = songs.findIndex(s => s.songKey === key);

    if (existingIndex > -1) {
      songs[existingIndex].requestCount = (songs[existingIndex].requestCount || 1) + 1;
      if (remark && !songs[existingIndex].remark) {
        songs[existingIndex].remark = remark;
      }
      if (guestInfo && !songs[existingIndex].guestInfo) {
        songs[existingIndex].guestInfo = guestInfo;
      }
    } else {
      songs.unshift({
        id: "req_" + Date.now(),
        songKey: key,
        songTitle: title.trim(),
        artist: artist.trim(),
        remark: (remark || '').trim(),
        guestInfo: guestInfo.trim(),
        requestCount: 1,
        status: "public",
        createdAt: Date.now()
      });
    }

    writeSongs(songs);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 0, message: '点歌成功', data: songs }));
    return;
  }

  // POST /api/admin/action - 管理员更改状态 (选入、已播放、隐藏等)
  if (reqPath === '/api/admin/action' && req.method === 'POST') {
    const payload = await parseBody(req);
    const { passcode, songKey, status } = payload;

    if (passcode !== '19951998') {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ code: 401, message: '管理密码错误' }));
      return;
    }

    let songs = readSongs();
    const item = songs.find(s => s.songKey === songKey);
    if (item) {
      item.status = status;
      writeSongs(songs);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ code: 0, message: '更新成功', data: songs }));
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 404, message: '歌曲不存在' }));
    return;
  }

  // ================= 2. 静态页面与二维码 =================

  if (reqPath === '/qr') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>黄怡 ❤ 金纬 · 婚礼点歌扫码预览</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; background: #FAF6EE; color: #2C1D11; padding: 40px 20px; }
    .card { max-width: 420px; margin: 0 auto; background: #fff; padding: 32px 24px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); border: 1.5px solid #E5D5BA; }
    h2 { margin: 0 0 8px 0; color: #7F2D3C; }
    p { margin: 6px 0; color: #665; font-size: 14px; }
    img { width: 260px; height: 260px; border-radius: 12px; margin: 18px 0; border: 1px solid #E5D5BA; }
    .url { font-weight: bold; color: #7F2D3C; word-break: break-all; background: #FAF6EE; padding: 8px 12px; border-radius: 8px; font-size: 13px; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="card">
    <h2>💍 黄怡 ❤ 金纬 · 婚礼点歌</h2>
    <p>微信扫码直接进入专属点歌系统：</p>
    <img src="/mobile-qr.png?v=${Date.now()}" alt="扫码进入点歌系统" />
    <div class="url">${networkUrl}</div>
  </div>
</body>
</html>`);
    return;
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, reqPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not Found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`💍 婚礼点歌公网/局域网服务已就绪 (Wedding Song Server):`);
  console.log(`- 运行端口 (Port):   ${PORT}`);
  console.log(`- 本地访问 (Local):  http://127.0.0.1:${PORT}`);
  console.log(`- 局域网访问 (LAN):  ${networkUrl}`);
  console.log(`- 数据保存路径:       ${DB_FILE}`);
  console.log(`====================================================`);
});
