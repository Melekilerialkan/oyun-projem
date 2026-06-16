const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const JWT_SECRET = "megoz_lina_fura_gizli_anahtar_2026";

const dbPath = path.join(__dirname, 'veritabani.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("SQL Bağlantı Hatası:", err.message);
    else console.log("SQLite Güvenli Çok Oyunculu Veritabanı Aktif! 🚀");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS kullanicilar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad TEXT NOT NULL,
        soyad TEXT NOT NULL,
        kullanici_adi TEXT UNIQUE NOT NULL,
        sifre TEXT NOT NULL,
        arac TEXT DEFAULT 'Çevre Savaşçısı',
        skor INTEGER DEFAULT 0
    )`);
});

function basHarfleriBuyut(str) {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

app.post('/api/auth/kayit', async (req, res) => {
    const { ad, soyad, kullanici_adi, sifre } = req.body;
    const temizAd = basHarfleriBuyut(ad.trim());
    const temizSoyad = basHarfleriBuyut(soyad.trim());
    const temizKullaniciAdi = kullanici_adi.trim().toLowerCase();

    try {
        const hashSifre = await bcrypt.hash(sifre, 10);
        db.run(`INSERT INTO kullanicilar (ad, soyad, kullanici_adi, sifre) VALUES (?, ?, ?, ?)`,
        [temizAd, temizSoyad, temizKullaniciAdi, hashSifre], function(err) {
            if (err) return res.status(400).json({ error: "Bu kullanıcı adı zaten kapılmış!" });
            res.json({ success: true, message: "Kayıt başarıyla tamamlandı!" });
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/giris', (req, res) => {
    const { kullanici_adi, sifre } = req.body;
    const temizKullaniciAdi = kullanici_adi.trim().toLowerCase();

    db.get(`SELECT * FROM kullanicilar WHERE kullanici_adi = ?`, [temizKullaniciAdi], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: "Kullanıcı adı veya şifre hatalı!" });
        const sifreDogru = await bcrypt.compare(sifre, user.sifre);
        if (!sifreDogru) return res.status(400).json({ error: "Şifre uyuşmuyor!" });
        
        const token = jwt.sign({ id: user.id, kullanici_adi: user.kullanici_adi }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, ad: user.ad, soyad: user.soyad, kullanici_adi: user.kullanici_adi });
    });
});

app.get('/api/leaderboard', (req, res) => {
    db.all(`SELECT ad, soyad, skor FROM kullanicilar ORDER BY skor DESC LIMIT 10`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ leaderboard: rows });
    });
});

app.post('/api/skor-kaydet', (req, res) => {
    const { kullanici_adi, skor } = req.body;
    db.run(`UPDATE kullanicilar SET skor = MAX(skor, ?) WHERE kullanici_adi = ?`, [skor, kullanici_adi], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/kullanici-kontrol', (req, res) => {
    const { ad, soyad } = req.body;
    db.get(`SELECT * FROM kullanicilar WHERE LOWER(ad) = ? AND LOWER(soyad) = ?`, 
    [ad.toLowerCase(), soyad.toLowerCase()], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ kullanici: row || null });
    });
});

app.post('/api/kullanici-kaydet', (req, res) => {
    const { ad, soyad, arac } = req.body;
    db.run(`UPDATE kullanicilar SET arac = ? WHERE LOWER(ad) = ? AND LOWER(soyad) = ?`,
    [arac, ad.toLowerCase(), soyad.toLowerCase()], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const bekleyenOyuncular = {}; 

io.on('connection', (socket) => {
    socket.on('havuza-grid', (data) => {
        const { ad, soyad, mahalle, arac, renk, lazerRenk, boyut, kullanici_adi } = data;
        socket.mahalle = mahalle;
        socket.oyuncuBilgi = { ad, soyad, arac, renk, lazerRenk, boyut, kullanici_adi };

        const bekleyenOyuncuId = bekleyenOyuncular[mahalle];

        if (bekleyenOyuncuId && bekleyenOyuncuId !== socket.id) {
            const odaId = `room_${mahalle}_${Date.now()}`;
            delete bekleyenOyuncular[mahalle];

            socket.join(odaId);
            const bekleyenSocket = io.sockets.sockets.get(bekleyenOyuncuId);
            if (bekleyenSocket) bekleyenSocket.join(odaId);

            io.to(bekleyenOyuncuId).emit('match-bulundu', { odaId, rol: "player1", rakip: socket.oyuncuBilgi });
            socket.emit('match-bulundu', { odaId, rol: "player2", rakip: bekleyenSocket?.oyuncuBilgi });
        } else {
            bekleyenOyuncular[mahalle] = socket.id;
        }
    });

    socket.on('aksiyon-verisi', (data) => {
        socket.to(data.odaId).emit('rakip-aksiyon', data);
    });

    socket.on('nesne-uretildi', (data) => {
        socket.to(data.odaId).emit('nesne-olustur-lokal', data);
    });

    socket.on('kutuyu-yedim', (data) => {
        socket.to(data.odaId).emit('kutuyu-sil-lokal', data);
    });

    socket.on('dusmani-vurdum', (data) => {
        socket.to(data.odaId).emit('dusmani-sil-lokal', data);
    });

    socket.on('dusman-ates-etti', (data) => {
        socket.to(data.odaId).emit('dusman-ates-etti-lokal', data);
    });

    socket.on('ben-kazandim', (data) => {
        socket.to(data.odaId).emit('oda-bitti-sen-kaybettin', data);
    });

    socket.on('ben-elendim', (data) => {
        socket.to(data.odaId).emit('oda-bitti-rakip-elendi', data);
    });

    socket.on('disconnect', () => {
        Object.keys(bekleyenOyuncular).forEach(m => {
            if(bekleyenOyuncular[m] === socket.id) delete bekleyenOyuncular[m];
        });
    });
});

// BURASI DEĞİŞTİ: Artık Render'ın verdiği portu dinleyecek
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu port ${PORT} üzerinde aktif!`);
});