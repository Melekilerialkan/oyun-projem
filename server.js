const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
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

// PostgreSQL Bağlantısı
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_aiYC7jZvTc1y@ep-solitary-resonance-ainnhwf8.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false }
});
pool.connect((err) => {
    if (err) console.error("PostgreSQL Bağlantı Hatası:", err.stack);
    else {
        console.log("PostgreSQL Güvenli Çok Oyunculu Veritabanı Aktif! 🚀");
        pool.query(`CREATE TABLE IF NOT EXISTS kullanicilar (
            id SERIAL PRIMARY KEY,
            ad VARCHAR(100) NOT NULL,
            soyad VARCHAR(100) NOT NULL,
            kullanici_adi VARCHAR(50) UNIQUE NOT NULL,
            sifre VARCHAR(255) NOT NULL,
            arac VARCHAR(50) DEFAULT 'Çevre Savaşçısı',
            skor INTEGER DEFAULT 0
        )`);
    }
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
        await pool.query(
            `INSERT INTO kullanicilar (ad, soyad, kullanici_adi, sifre, arac) VALUES ($1, $2, $3, $4, $5)`,
            [temizAd, temizSoyad, temizKullaniciAdi, hashSifre, temizKullaniciAdi]
        );
        res.json({ success: true, message: "Kayıt başarıyla tamamlandı!" });
    } catch (e) { 
        res.status(400).json({ error: "Bu kullanıcı adı zaten kapılmış veya bir hata oluştu!" }); 
    }
});

app.post('/api/auth/giris', async (req, res) => {
    const { kullanici_adi, sifre } = req.body;
    const temizKullaniciAdi = kullanici_adi.trim().toLowerCase();

    try {
        const { rows } = await pool.query(`SELECT * FROM kullanicilar WHERE kullanici_adi = $1`, [temizKullaniciAdi]);
        if (rows.length === 0) return res.status(400).json({ error: "Kullanıcı adı veya şifre hatalı!" });
        
        const user = rows[0];
        const sifreDogru = await bcrypt.compare(sifre, user.sifre);
        if (!sifreDogru) return res.status(400).json({ error: "Şifre uyuşmuyor!" });
        
        const token = jwt.sign({ id: user.id, kullanici_adi: user.kullanici_adi }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, ad: user.ad, soyad: user.soyad, kullanici_adi: user.kullanici_adi, arac: user.arac });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT ad, soyad, skor FROM kullanicilar ORDER BY skor DESC LIMIT 10`);
        res.json({ leaderboard: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/skor-kaydet', async (req, res) => {
    const { kullanici_adi, skor } = req.body;
    try {
        await pool.query(`UPDATE kullanicilar SET skor = GREATEST(skor, $1) WHERE kullanici_adi = $2`, [skor, kullanici_adi]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/kullanici-kaydet', async (req, res) => {
    const { ad, soyad, arac } = req.body;
    try {
        await pool.query(`UPDATE kullanicilar SET arac = $1 WHERE LOWER(ad) = $2 AND LOWER(soyad) = $3`, [arac, ad.toLowerCase(), soyad.toLowerCase()]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu port ${PORT} üzerinde aktif!`);
});