const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const winScreen = document.getElementById('win-screen');
const borderFlash = document.getElementById('border-flash');

const hudClearedCount = document.getElementById('hud-cleared-count');
const hudScore = document.getElementById('hud-score');
const hudHp = document.getElementById('hud-hp');
const hudBoundary = document.getElementById('hud-boundary');
const hudTruckName = document.getElementById('hud-truck-name');

const questDesc = document.getElementById('quest-desc');
const questProgress = document.getElementById('quest-progress');

let map = null;
let currentTileLayer = null;
let playerMarker;
let rakipMarker = null;
let stationMarker;
let playerCoords = [];
let stationCoords = [];

let currentKullaniciAdi = "";
let currentAdSoyad = "";
let truckName = "Çevre Savaşçısı";
let selectedMahalle = "";
let remainingMahalles = [];
let currentMode = "offline";
let aktifTema = "dark";

let truckColor = "#ff85a2";
let truckSize = "normal";
let laserColor = "#1e90ff";

let socket = null;
let aktifOdaId = null;
let benimRolum = "player1";
let rakipBilgi = null;

let gameActive = false;
let score = 0;
let generalScore = 0;
let collectedBoxesCount = 0;
let totalDeliveredBoxes = 0;

// YENİ KAPASİTE VE HEDEF 15 OLDU
const maxBoxCapacity = 15;
const targetDeliveryGoal = 15;

let lives = 3;
let clearedMahalles = [];

const keys = { w: false, a: false, s: false, d: false };
let enemies = [];
let playerBullets = [];
let enemyBullets = [];
let boxes = [];

let standStillTimer = null;
let targetCollectingBoxId = null;

let loopInterval, spawnInterval, shootInterval, boxSpawnInterval;
let bayrampasaMahalleSinirlari = {};
let frames = 0;

const icons = {
    ecoHouse: L.icon({ iconUrl: 'assets/eco-house-removebg-preview.png', iconSize: [50, 50], iconAnchor: [25, 25] }),
    glassBottle: L.icon({ iconUrl: 'assets/glass-bottle-removebg-preview.png', iconSize: [30, 30], iconAnchor: [15, 15] }),
    glassContainer1: L.icon({ iconUrl: 'assets/glass-container__1_-removebg-preview.png', iconSize: [32, 32], iconAnchor: [16, 16] }),
    paper: L.icon({ iconUrl: 'assets/paper-removebg-preview.png', iconSize: [30, 30], iconAnchor: [15, 15] }),
    bootle: L.icon({ iconUrl: 'assets/bootle-removebg-preview.png', iconSize: [30, 30], iconAnchor: [15, 15] })
};

window.addEventListener('keydown', e => {
    let k = e.key.toLowerCase();
    if (["arrowup", "w"].includes(k)) keys.w = true;
    if (["arrowdown", "s"].includes(k)) keys.s = true;
    if (["arrowleft", "a"].includes(k)) keys.a = true;
    if (["arrowright", "d"].includes(k)) keys.d = true;
});
window.addEventListener('keyup', e => {
    let k = e.key.toLowerCase();
    if (["arrowup", "w"].includes(k)) keys.w = false;
    if (["arrowdown", "s"].includes(k)) keys.s = false;
    if (["arrowleft", "a"].includes(k)) keys.a = false;
    if (["arrowright", "d"].includes(k)) keys.d = false;
});

window.onload = function () {
    loadGlobalLeaderboard();

    fetch('db.json')
        .then(response => {
            if (!response.ok) throw new Error("JSON dosyası bulunamadı!");
            return response.json();
        })
        .then(data => {
            bayrampasaMahalleSinirlari = data.bayrampasaMahalleSinirlari || data;

            const select = document.getElementById('select-mahalle');
            if (select) {
                select.innerHTML = "";
                Object.keys(bayrampasaMahalleSinirlari).forEach(m => {
                    let opt = document.createElement('option');
                    opt.value = m;
                    opt.innerText = m + " Mahallesi";
                    select.appendChild(opt);
                });
            }
            if (select) selectedMahalle = select.value;
            remainingMahalles = Object.keys(bayrampasaMahalleSinirlari);
            updateGaragePreview();
        })
        .catch(error => console.error("Veritabanı senkronizasyon hatası:", error));
};

function toggleOyunTemasi() {
    const btn = document.getElementById('theme-toggle-btn');
    if (aktifTema === "dark") {
        aktifTema = "light";
        document.body.className = "light-theme";
        btn.innerText = "🌙 Koyu Tema";
        if (map && currentTileLayer) {
            map.removeLayer(currentTileLayer);
            currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        }
    } else {
        aktifTema = "dark";
        document.body.className = "dark-theme";
        btn.innerText = "☀️ Açık Tema";
        if (map && currentTileLayer) {
            map.removeLayer(currentTileLayer);
            currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
        }
    }
}

function loadGlobalLeaderboard() {
    fetch('/api/leaderboard')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('leaderboard-list');
            if (!container) return;
            container.innerHTML = "";
            if (data.leaderboard && data.leaderboard.length > 0) {
                data.leaderboard.forEach((row, index) => {
                    container.innerHTML += `
                        <div class="leader-row">
                            <span class="rank-num">#${index + 1}</span>
                            <span class="player-name">${row.ad} ${row.soyad}</span>
                            <span class="player-score">${row.skor} P</span>
                        </div>`;
                });
            } else {
                container.innerHTML = `<div class="leader-row no-score">Henüz kayıtlı rekor yok.</div>`;
            }
        })
        .catch(err => console.log("Skor tablosu çekilemedi."));
}

function showChoiceStep() {
    document.getElementById('auth-choice-step').classList.remove('hide');
    document.getElementById('login-step').classList.add('hide');
    document.getElementById('register-step').classList.add('hide');
}

function showLoginStep() {
    document.getElementById('auth-choice-step').classList.add('hide');
    document.getElementById('login-step').classList.remove('hide');
}

function showRegisterStep() {
    document.getElementById('auth-choice-step').classList.add('hide');
    document.getElementById('register-step').classList.remove('hide');
}

async function handleGiris() {
    const kAdi = document.getElementById('login-user').value.trim().toLowerCase();
    const sifre = document.getElementById('login-pass').value.trim();

    if (!kAdi || !sifre) {
        alert("Lütfen kullanıcı adı ve şifreni girin.");
        return;
    }

    try {
        const res = await fetch('/api/auth/giris', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kullanici_adi: kAdi, sifre: sifre })
        });
        const data = await res.json();

        if (data.success) {
            currentKullaniciAdi = data.kullanici_adi;
            currentAdSoyad = `${data.ad} ${data.soyad}`;
            truckName = currentKullaniciAdi;

            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('rules-screen').classList.remove('hide');

            updateGaragePreview();
        } else {
            alert("Hata: " + data.error);
        }
    } catch (err) {
        alert("Sunucu bağlantı hatası!");
    }
}

async function handleKayit() {
    const ad = document.getElementById('auth-ad').value.trim();
    const soyad = document.getElementById('auth-soyad').value.trim();
    const kAdi = document.getElementById('auth-user').value.trim().toLowerCase();
    const sifre = document.getElementById('auth-pass').value.trim();

    if (!ad || !soyad || !kAdi || !sifre) {
        alert("Lütfen tüm kayıt alanlarını doldurun.");
        return;
    }

    try {
        const res = await fetch('/api/auth/kayit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ad, soyad, kullanici_adi: kAdi, sifre })
        });
        const data = await res.json();
        alert(data.message || data.error);
        
        if (data.success) {
            document.getElementById('login-user').value = kAdi;
            showLoginStep();
        }
        loadGlobalLeaderboard();
    } catch (err) {
        console.error(err);
    }
}

function gecGarajEkranina() {
    document.getElementById('rules-screen').style.display = 'none';
    document.getElementById('start-screen').classList.remove('hide');
}

function selectTruckColor(element) {
    document.querySelectorAll('#truck-color-palette .color-dot').forEach(d => d.classList.remove('active'));
    element.classList.add('active');
    truckColor = element.getAttribute('data-value');
    updateGaragePreview();
}

function selectLaserColor(element) {
    document.querySelectorAll('#laser-color-palette .color-dot').forEach(d => d.classList.remove('active'));
    element.classList.add('active');
    laserColor = element.getAttribute('data-value');
    updateGaragePreview();
}

function updateGaragePreview() {
    const name = truckName || "...";
    const size = document.getElementById('select-truck-size').value;
    const label = document.getElementById('preview-label');
    if (label) label.innerText = name;

    const bed = document.getElementById('preview-bed');
    if (bed) {
        bed.style.background = truckColor;
        bed.innerHTML = `
            <div class="laser-platform"><div class="laser-nozzle"></div></div>
            <div class="truck-bed-logo-container">
                <span class="logo-recycle-inline">♻️</span>
                <img src="assets/bayrampasa-belediyesi-logo1.png" class="truck-bed-logo-bpa">
            </div>`;
    }

    const wrapper = document.getElementById('preview-truck-wrapper');
    const truckBody = document.getElementById('preview-truck-body');

    if (truckBody && wrapper) {
        truckBody.className = "real-truck";
        if (size === "kucuk") {
            truckBody.classList.add('truck-size-kucuk');
            wrapper.style.width = "75px";
        } else if (size === "buyuk") {
            truckBody.classList.add('truck-size-buyuk');
            wrapper.style.width = "115px";
        } else {
            truckBody.classList.add('truck-size-normal');
            wrapper.style.width = "95px";
        }
    }
}

function lobiyeKatilVeEşleş() {
    selectedMahalle = document.getElementById('select-mahalle').value;
    truckSize = document.getElementById('select-truck-size').value;
    currentMode = document.getElementById('select-game-mode').value;

    remainingMahalles = Object.keys(bayrampasaMahalleSinirlari).filter(m => m !== selectedMahalle);

    const parts = currentAdSoyad.split(" ");
    fetch('/api/kullanici-kaydet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad: parts[0], soyad: parts[1], arac: truckName })
    }).catch(e => console.log("Lokal SQL Pasif"));

    if (currentMode === "online") {
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('matchmaking-container').classList.remove('hide');

       socket = io();

        socket.emit('havuza-grid', {
            ad: parts[0],
            soyad: parts[1],
            mahalle: selectedMahalle,
            arac: truckName,
            renk: truckColor,
            lazerRenk: laserColor,
            boyut: truckSize,
            kullanici_adi: currentKullaniciAdi
        });

        socket.on('match-bulundu', (data) => {
            aktifOdaId = data.odaId;
            benimRolum = data.rol;
            rakipBilgi = data.rakip;

            document.getElementById('matchmaking-container').style.display = 'none';
            startGameMode();
        });
    } else {
        document.getElementById('start-screen').style.display = 'none';
        aktifOdaId = null;
        benimRolum = "player1";
        rakipBilgi = null;
        startGameMode();
    }
}

function sonrakiSiralıMahalle() {
    if (remainingMahalles.length === 0) {
        alert(`Tebrikler! 11 Mahallenin tamamını temizledin!\nToplam Skorun: ${generalScore} Puan\nSürücü: ${currentAdSoyad}`);
        guvenliCikis();
        return;
    }

    selectedMahalle = remainingMahalles.shift();

    lives = 3;
    collectedBoxesCount = 0;
    totalDeliveredBoxes = 0;
    score = 0;

    startGameMode();
}

function startGameMode() {
    winScreen.classList.add('hide');
    gameOverScreen.classList.add('hide');

    document.getElementById('hud-container').classList.remove('hide');
    document.getElementById('bottom-panel').classList.remove('hide');
    document.getElementById('mobile-controls').classList.remove('hide');

    hudTruckName.innerText = `${currentAdSoyad} [${truckName}]`;
    hudBoundary.innerText = selectedMahalle + " Mh.";
    hudClearedCount.innerText = clearedMahalles.length + " / 11";
    hudScore.innerText = score;

    questDesc.innerText = `📦 Hedef: Geri Dönüşüm Evine toplam 15 atık ulaştır!`;
    questProgress.innerText = `Kasadaki: ${collectedBoxesCount}/${maxBoxCapacity} | Teslim Edilen: ${totalDeliveredBoxes}/${targetDeliveryGoal}`;

    playerCoords = [...bayrampasaMahalleSinirlari[selectedMahalle].center];
    stationCoords = [playerCoords[0], playerCoords[1] + 0.0006];

    if (map) { map.remove(); map = null; }

    map = L.map('map', {
        center: playerCoords,
        zoom: 17,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        keyboard: false
    });

    if (aktifTema === "dark") {
        currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
    } else {
        currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }

    setTimeout(() => { if (map) map.invalidateSize(); }, 250);

    L.polygon(bayrampasaMahalleSinirlari[selectedMahalle].coords, {
        color: '#1e90ff', weight: 3, fillColor: '#1e90ff', fillOpacity: 0.06
    }).addTo(map);

    stationMarker = L.marker(stationCoords, { icon: icons.ecoHouse }).addTo(map);

    let totalWidth = truckSize === "kucuk" ? 65 : (truckSize === "buyuk" ? 105 : 80);
    let sizeClass = `truck-size-${truckSize}`;

    playerMarker = L.marker(playerCoords, {
        icon: L.divIcon({
            className: 'game-sprite',
            html: `
                <div id="game-truck-wrapper" class="truck-wrapper" style="width:${totalWidth}px;">
                    <div class="real-truck ${sizeClass}">
                        <div class="truck-bed" style="background:${truckColor} !important;">
                            <div class="laser-platform"><div id="laser-nozzle" class="laser-nozzle"></div></div>
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; gap: 3px;">
                                <span style="font-size: 10px; color:#fff;">♻️</span>
                                <img src="assets/bayrampasa-belediyesi-logo1.png" style="height: 12px; width: auto;">
                            </div>
                        </div>
                        <div class="truck-cabin"><div class="truck-window"></div></div>
                        <div class="truck-wheel w-front"></div><div class="truck-wheel w-back"></div>
                    </div>
                    <div class="truck-label" style="border-color: #2ed573;">${truckName} (SEN)</div>
                </div>
            `,
            iconSize: [totalWidth, 60], iconAnchor: [totalWidth / 2, 30]
        })
    }).addTo(map);

    if (currentMode === "online" && rakipBilgi) {
        let rWidth = rakipBilgi.boyut === "kucuk" ? 65 : (rakipBilgi.boyut === "buyuk" ? 105 : 80);
        let rSizeClass = `truck-size-${rakipBilgi.boyut}`;
        rakipMarker = L.marker(stationCoords, {
            icon: L.divIcon({
                className: 'game-sprite',
                html: `
                    <div class="truck-wrapper" style="width:${rWidth}px;">
                        <div class="real-truck ${rSizeClass}">
                            <div class="truck-bed" style="background:${rakipBilgi.renk} !important;">
                                <div class="laser-platform"><div class="laser-nozzle"></div></div>
                                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; gap: 3px;">
                                    <span style="font-size: 10px; color:#fff;">♻️</span>
                                    <img src="assets/bayrampasa-belediyesi-logo1.png" style="height: 12px; width: auto;">
                                </div>
                            </div>
                            <div class="truck-cabin"><div class="truck-window"></div></div>
                            <div class="truck-wheel w-front"></div><div class="truck-wheel w-back"></div>
                        </div>
                        <div class="truck-label" style="border-color: #ff4757;">${rakipBilgi.arac} (RAKİP)</div>
                    </div>
                `,
                iconSize: [rWidth, 60], iconAnchor: [rWidth / 2, 30]
            })
        }).addTo(map);
    }

    if (currentMode === "online" && socket) {
        socket.on('rakip-aksiyon', (data) => {
            if (rakipMarker) rakipMarker.setLatLng(data.coords);
        });

        socket.on('nesne-olustur-lokal', (data) => {
            if (!map) return;
            let targetIcon = icons.glassBottle;
            if (data.wasteType === 'pet') targetIcon = icons.glassContainer1;
            if (data.wasteType === 'paper') targetIcon = icons.paper;
            if (data.wasteType === 'bootle') targetIcon = icons.bootle;

            if (data.type === '📦') {
                let m = L.marker(data.coords, { icon: targetIcon }).addTo(map);
                boxes.push({ id: data.id, marker: m, lat: data.coords[0], lng: data.coords[1], wasteType: data.wasteType });
            } else {
                const enemyIcon = L.divIcon({ className: '', html: `<div style="font-size:26px; filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.5));">${data.type}</div>` });
                let m = L.marker(data.coords, { icon: enemyIcon }).addTo(map);
                enemies.push({ id: data.id, marker: m, lat: data.coords[0], lng: data.coords[1], hp: data.hp, type: data.type });
            }
        });

        socket.on('kutuyu-sil-lokal', (data) => {
            let idx = boxes.findIndex(b => b.id === data.id);
            if (idx !== -1) {
                boxes[idx].marker.remove();
                boxes.splice(idx, 1);
            }
        });

        socket.on('dusmani-sil-lokal', (data) => {
            let idx = enemies.findIndex(e => e.id === data.id);
            if (idx !== -1) {
                enemies[idx].marker.remove();
                enemies.splice(idx, 1);
            }
        });

        socket.on('dusman-ates-etti-lokal', (data) => {
            if (!map) return;
            const icon = L.divIcon({ className: '', html: `<div style="width:8px; height:8px; background:#ff4757; border-radius:50%; box-shadow: 0 0 5px #ff4757;"></div>` });
            let m = L.marker(data.coords, { icon: icon }).addTo(map);
            enemyBullets.push({ marker: m, lat: data.coords[0], lng: data.coords[1] });
        });

        socket.on('oda-bitti-sen-kaybettin', (data) => {
            clearTimers();
            if (map) { map.remove(); map = null; }
            document.getElementById('win-title').innerText = "⏱️ RAKİP KAZANDI!";
            document.getElementById('win-title').style.color = "var(--accent)";
            document.getElementById('win-msg').innerHTML = `Rakibiniz bu mahalleyi daha hızlı temizledi. Diğer mahalleye geçip farkı kapatabilirsin! (Genel Skorun: ${generalScore})`;
            winScreen.classList.remove('hide');
        });

        socket.on('oda-bitti-rakip-elendi', (data) => {
            clearTimers();
            if (map) { map.remove(); map = null; }
            document.getElementById('win-title').innerText = "🏆 ZAFER SENİN!";
            document.getElementById('win-title').style.color = "var(--primary)";
            document.getElementById('win-msg').innerHTML = `Rakibiniz kirliliğe yenik düşerek elendi! Mahalleyi kurtardın, sıradaki mahalleye geç!`;
            winScreen.classList.remove('hide');
        });
    }

    gameActive = true;
    frames = 0;
    lives = 3;
    hudHp.innerText = "❤️❤️❤️";

    clearInterval(loopInterval);
    loopInterval = setInterval(gameLoop, 1000 / 60);

    if (currentMode === "offline" || benimRolum === "player1") {
        clearInterval(spawnInterval);
        clearInterval(shootInterval);
        clearInterval(boxSpawnInterval);
        spawnInterval = setInterval(serverPollutionEnemy, 1800);
        shootInterval = setInterval(enemyAttackFire, 1500);
        boxSpawnInterval = setInterval(serverCardboardBox, 2550);
    }
}

function gameLoop() {
    if (!gameActive) return;
    frames++;

    const truckWrapper = document.getElementById('game-truck-wrapper');
    let isMoving = keys.w || keys.s || keys.a || keys.d;

    if (truckWrapper) {
        if (isMoving) truckWrapper.classList.add('truck-moving');
        else truckWrapper.classList.remove('truck-moving');
    }

    const moveSpeed = 0.00006;
    let nextLat = playerCoords[0];
    let nextLng = playerCoords[1];

    if (keys.w) nextLat += moveSpeed;
    if (keys.s) nextLat -= moveSpeed;
    if (keys.a) nextLng -= moveSpeed;
    if (keys.d) nextLng += moveSpeed;

    if (isPointInPolygon([nextLat, nextLng], bayrampasaMahalleSinirlari[selectedMahalle].coords)) {
        playerCoords[0] = nextLat;
        playerCoords[1] = nextLng;
        borderFlash.style.boxShadow = "inset 0 0 50px rgba(255, 71, 87, 0)";
    } else {
        borderFlash.style.boxShadow = "inset 0 0 50px rgba(255, 71, 87, 0.6)";
    }

    if (playerMarker) playerMarker.setLatLng(playerCoords);
    if (map) map.panTo(playerCoords, { animate: false });

    if (currentMode === "online" && socket && aktifOdaId) {
        socket.emit('aksiyon-verisi', { odaId: aktifOdaId, coords: playerCoords });
    }

    if (frames % 12 === 0) { fireLaser(); }

    let distanceToStation = getDistance(playerCoords[0], playerCoords[1], stationCoords[0], stationCoords[1]);
    if (distanceToStation < 35 && collectedBoxesCount > 0) {
        totalDeliveredBoxes += collectedBoxesCount;
        score += collectedBoxesCount * 120;
        generalScore += collectedBoxesCount * 120;
        hudScore.innerText = score;
        collectedBoxesCount = 0;
        
        // Depo boşaldı, uyarıyı kapat
        document.getElementById('depo-uyari').style.display = 'none';

        if (totalDeliveredBoxes >= targetDeliveryGoal) {
            triggerMahalleWin();
            return;
        } else {
            questProgress.innerText = `Kasadaki: ${collectedBoxesCount}/${maxBoxCapacity} | Teslim Edilen: ${totalDeliveredBoxes}/${targetDeliveryGoal}`;
        }
    }

    let dynamicOverAnyWaste = false;

    for (let i = boxes.length - 1; i >= 0; i--) {
        let box = boxes[i];
        let bDist = getDistance(playerCoords[0], playerCoords[1], box.lat, box.lng);

        if (bDist < 30) {
            dynamicOverAnyWaste = true;
            if (collectedBoxesCount < maxBoxCapacity) {
                if (targetCollectingBoxId !== box.id) {
                    targetCollectingBoxId = box.id;
                    clearTimeout(standStillTimer);
                    standStillTimer = setTimeout(() => {
                        if (gameActive && collectedBoxesCount < maxBoxCapacity) {
                            collectedBoxesCount++;
                            questProgress.innerText = `Kasadaki: ${collectedBoxesCount}/${maxBoxCapacity} | Teslim Edilen: ${totalDeliveredBoxes}/${targetDeliveryGoal}`;

                            // DEPO DOLDUYSA UYARIYI AÇ
                            if (collectedBoxesCount >= maxBoxCapacity) {
                                document.getElementById('depo-uyari').style.display = 'block';
                            }

                            if (currentMode === "online" && socket) {
                                socket.emit('kutuyu-yedim', { odaId: aktifOdaId, id: box.id });
                            }
                            box.marker.remove();
                            boxes.splice(i, 1);
                        }
                        targetCollectingBoxId = null;
                    }, 0); 
                }
            }
            break;
        }
    }

    if (!dynamicOverAnyWaste) {
        clearTimeout(standStillTimer);
        targetCollectingBoxId = null;
    }

    for (let i = playerBullets.length - 1; i >= 0; i--) {
        let pb = playerBullets[i];
        pb.lat += 0.0001;
        pb.marker.setLatLng([pb.lat, pb.lng]);

        if (pb.lat - playerCoords[0] > 0.003) {
            pb.marker.remove();
            playerBullets.splice(i, 1);
            continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
            let en = enemies[j];
            let dist = getDistance(pb.lat, pb.lng, en.lat, en.lng);

            if (dist < 35) {
                en.hp--;
                pb.marker.remove();
                playerBullets.splice(i, 1);

                if (en.hp <= 0) {
                    let earned = (en.type === '💨') ? 10 : (en.type === '🛢️' ? 20 : 30);
                    score += earned;
                    generalScore += earned;
                    hudScore.innerText = score;

                    if (currentMode === "online" && socket) {
                        socket.emit('dusmani-vurdum', { odaId: aktifOdaId, id: en.id });
                    }
                    en.marker.remove();
                    enemies.splice(j, 1);
                }
                break;
            }
        }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let eb = enemyBullets[i];
        eb.lat -= 0.00004;
        eb.marker.setLatLng([eb.lat, eb.lng]);

        if (playerCoords[0] - eb.lat > 0.003) {
            eb.marker.remove();
            enemyBullets.splice(i, 1);
            continue;
        }

        if (getDistance(eb.lat, eb.lng, playerCoords[0], playerCoords[1]) < 25) {
            eb.marker.remove();
            enemyBullets.splice(i, 1);
            takeDamage();
        }
    }
}

function fireLaser() {
    const nozzle = document.getElementById('laser-nozzle');
    let targetCoords = [playerCoords[0] + 0.0001, playerCoords[1]];

    if (nozzle && map) {
        const rect = nozzle.getBoundingClientRect();
        const mapContainer = map.getContainer().getBoundingClientRect();
        const x = rect.left - mapContainer.left + (rect.width / 2);
        const y = rect.top - mapContainer.top;
        const containerPoint = L.point(x, y);
        try {
            const latlng = map.containerPointToLatLng(containerPoint);
            targetCoords = [latlng.lat, latlng.lng];
        } catch (e) { }
    }

    const icon = L.divIcon({
        className: '',
        html: `<div style="width:4px; height:15px; background:${laserColor}; box-shadow:0 0 8px ${laserColor}; border-radius:2px;"></div>`
    });

    if (map) {
        let m = L.marker(targetCoords, { icon: icon }).addTo(map);
        playerBullets.push({ marker: m, lat: targetCoords[0], lng: targetCoords[1] });
    }
}

function serverPollutionEnemy() {
    if (!gameActive || enemies.length > 5 || !map) return;

    let randomLat, randomLng, valid = false;
    for (let i = 0; i < 15; i++) {
        randomLat = playerCoords[0] + (Math.random() - 0.5) * 0.0025;
        randomLng = playerCoords[1] + (Math.random() - 0.5) * 0.0025;
        if (isPointInPolygon([randomLat, randomLng], bayrampasaMahalleSinirlari[selectedMahalle].coords)) {
            valid = true; break;
        }
    }
    if (!valid) return;

    const enemyTypes = [{ icon: '💨', type: '💨', hp: 1 }, { icon: '🛢️', type: '🛢️', hp: 1 }, { icon: '🏭', type: '🏭', hp: 2 }];
    let selected = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
    let objId = "en_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    const enemyIcon = L.divIcon({ className: '', html: `<div style="font-size:26px; filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.5));">${selected.icon}</div>` });
    let marker = L.marker([randomLat, randomLng], { icon: enemyIcon }).addTo(map);
    let enemyObj = { id: objId, marker, lat: randomLat, lng: randomLng, hp: selected.hp, type: selected.type };
    enemies.push(enemyObj);

    if (currentMode === "online" && socket) {
        socket.emit('nesne-uretildi', {
            odaId: aktifOdaId, id: objId, type: selected.type, coords: [randomLat, randomLng], hp: selected.hp
        });
    }

    setTimeout(() => {
        let index = enemies.findIndex(e => e.id === objId);
        if (index !== -1) {
            enemyObj.marker.remove();
            enemies.splice(index, 1);
            if (currentMode === "online" && socket && aktifOdaId) {
                socket.emit('dusmani-vurdum', { odaId: aktifOdaId, id: objId });
            }
        }
    }, 4000);
}

function serverCardboardBox() {
    if (!gameActive || boxes.length >= 4 || !map) return;

    let randomLat, randomLng, valid = false;
    for (let i = 0; i < 15; i++) {
        randomLat = playerCoords[0] + (Math.random() - 0.5) * 0.0025;
        randomLng = playerCoords[1] + (Math.random() - 0.5) * 0.0025;
        if (isPointInPolygon([randomLat, randomLng], bayrampasaMahalleSinirlari[selectedMahalle].coords)) {
            valid = true; break;
        }
    }
    if (!valid) return;

    let objId = "box_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    const wastePool = [
        { type: 'glass', icon: icons.glassBottle },
        { type: 'pet', icon: icons.glassContainer1 },
        { type: 'paper', icon: icons.paper },
        { type: 'bootle', icon: icons.bootle }
    ];
    let selectedWaste = wastePool[Math.floor(Math.random() * wastePool.length)];

    let marker = L.marker([randomLat, randomLng], { icon: selectedWaste.icon }).addTo(map);
    let boxObj = { id: objId, marker, lat: randomLat, lng: randomLng, wasteType: selectedWaste.type, type: '📦' };
    boxes.push(boxObj);

    if (currentMode === "online" && socket) {
        socket.emit('nesne-uretildi', {
            odaId: aktifOdaId, id: objId, type: '📦', wasteType: selectedWaste.type, coords: [randomLat, randomLng]
        });
    }

    setTimeout(() => {
        let index = boxes.findIndex(b => b.id === objId);
        if (index !== -1) {
            boxObj.marker.remove();
            boxes.splice(index, 1);
            if (currentMode === "online" && socket && aktifOdaId) {
                socket.emit('kutuyu-yedim', { odaId: aktifOdaId, id: objId });
            }
        }
    }, 5000);
}

function enemyAttackFire() {
    if (!gameActive || enemies.length === 0 || !map) return;
    let activeEnemy = enemies[Math.floor(Math.random() * enemies.length)];

    let bulletLat = activeEnemy.lat - 0.0001;
    let bulletLng = activeEnemy.lng;

    const icon = L.divIcon({ className: '', html: `<div style="width:8px; height:8px; background:#ff4757; border-radius:50%; box-shadow: 0 0 5px #ff4757;"></div>` });
    let m = L.marker([bulletLat, bulletLng], { icon: icon }).addTo(map);
    enemyBullets.push({ marker: m, lat: bulletLat, lng: bulletLng });

    if (currentMode === "online" && socket && aktifOdaId) {
        socket.emit('dusman-ates-etti', { odaId: aktifOdaId, coords: [bulletLat, bulletLng] });
    }
}

function takeDamage() {
    lives--;
    if (lives === 2) hudHp.innerText = "❤️❤️";
    else if (lives === 1) hudHp.innerText = "❤️";
    else {
        hudHp.innerText = "💀";
        if (currentMode === "online" && socket) {
            socket.emit('ben-elendim', { odaId: aktifOdaId });
        }
        clearTimers();
        if (map) { map.remove(); map = null; }

        document.getElementById('win-title').innerText = "💥 ARACIN PARÇALANDI!";
        document.getElementById('win-title').style.color = "var(--danger)";
        document.getElementById('win-msg').innerHTML = `Bu mahalledeki görev başarısız oldu ancak operasyon bitmedi. Sıradaki mahalleye geç!`;
        winScreen.classList.remove('hide');
    }
}

function triggerMahalleWin() {
    clearTimers();
    if (currentMode === "online" && socket) {
        socket.emit('ben-kazandim', { odaId: aktifOdaId });
    }
    if (map) { map.remove(); map = null; }

    fetch('/api/skor-kaydet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kullanici_adi: currentKullaniciAdi, skor: generalScore })
    }).then(() => loadGlobalLeaderboard());

    if (!clearedMahalles.includes(selectedMahalle)) clearedMahalles.push(selectedMahalle);
    document.getElementById('win-title').innerText = "🏆 GÖREV BAŞARIYLA TAMAMLANDI!";
    document.getElementById('win-title').style.color = "var(--primary)";
    document.getElementById('win-msg').innerHTML = `Harika iş çıkardın Sürücü! Atıkları teslim ettin ve Geri Dönüşüm Evini doldurdun!`;
    winScreen.classList.remove('hide');
}

function guvenliCikis() {
    clearTimers();
    if (map) { map.remove(); map = null; }
    if (socket) { socket.disconnect(); socket = null; }

    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('auth-ad').value = '';
    document.getElementById('auth-soyad').value = '';
    document.getElementById('auth-user').value = '';
    document.getElementById('auth-pass').value = '';
    
    currentKullaniciAdi = "";
    currentAdSoyad = "";
    score = 0;
    generalScore = 0;
    clearedMahalles = [];
    remainingMahalles = Object.keys(bayrampasaMahalleSinirlari);

    document.getElementById('hud-container').classList.add('hide');
    document.getElementById('bottom-panel').classList.add('hide');
    document.getElementById('mobile-controls').classList.add('hide');
    document.getElementById('depo-uyari').style.display = 'none';
    winScreen.classList.add('hide');
    gameOverScreen.classList.add('hide');
    startScreen.classList.add('hide');
    document.getElementById('rules-screen').classList.add('hide');

    showChoiceStep(); 
    document.getElementById('auth-container').style.display = 'flex';
    loadGlobalLeaderboard();
}

function clearTimers() {
    gameActive = false;
    clearTimeout(standStillTimer);
    clearInterval(loopInterval);
    clearInterval(spawnInterval);
    clearInterval(shootInterval);
    clearInterval(boxSpawnInterval);
    stationMarker = null;
    rakipMarker = null;
    playerMarker = null;
    enemies = []; playerBullets = []; enemyBullets = []; boxes = [];
}

function getDistance(lat1, lon1, lat2, lon2) {
    let R = 6371e3;
    let phi1 = lat1 * Math.PI / 180, phi2 = lat2 * Math.PI / 180;
    let deltaPhi = (lat2 - lat1) * Math.PI / 180, deltaLambda = (lon2 - lon1) * Math.PI / 180;
    let a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function isPointInPolygon(point, vs) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/* --- KUSURSUZ MOBİL JOYSTICK KONTROLLERİ --- */
function setupMobileControls() {
    const bindTouch = (id, keyProp) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.style.touchAction = 'none'; 

        const startMove = (e) => { 
            e.preventDefault(); 
            keys[keyProp] = true; 
        };
        
        const stopMove = (e) => { 
            e.preventDefault(); 
            keys[keyProp] = false; 
        };

        btn.addEventListener('pointerdown', startMove);
        btn.addEventListener('pointerup', stopMove);    
        btn.addEventListener('pointercancel', stopMove); 
        btn.addEventListener('pointerout', stopMove);   
        btn.addEventListener('pointerleave', stopMove); 
    };

    bindTouch('btn-up', 'w');
    bindTouch('btn-down', 's');
    bindTouch('btn-left', 'a');
    bindTouch('btn-right', 'd');
}

setupMobileControls();