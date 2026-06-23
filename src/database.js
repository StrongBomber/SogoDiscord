const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./economy.db");

const activeBlackjack = new Map();

// Veritabanı Şeması İlk Kurulumu
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY, 
    coins INTEGER DEFAULT 500, 
    equipped_item TEXT DEFAULT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    last_daily INTEGER DEFAULT 0
  )`);
  db.run("CREATE TABLE IF NOT EXISTS inventory(userId TEXT, itemId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(userId, itemId))");
});

// --- RPG MARKET AYARLARI ---
const ITEMS = {
  rifle: { name: "🏹 Gelişmiş Av Tüfeği", price: 600, desc: "Avların kaçış şansını %15 azaltır.", type: "hunt" },
  pickaxe: { name: "⛏️ Saf Altın Kazma", price: 1000, desc: "Çalışma ödüllerini %50 artırır.", type: "work" }
};

// --- AVCILIK VERİLERİ ---
const ANIMALS = {
  rabbit: { name: "🐇 Tavşan", reqLv: 1, escapeChance: 0.15, rawPrice: 45, processedName: "🍖 Pişmiş Tavşan Budu", processedPrice: 100, rawXp: 15, processedXp: 50 },
  duck: { name: "🦆 Ördek", reqLv: 1, escapeChance: 0.20, rawPrice: 55, processedName: "🍗 Fırınlanmış Ördek", processedPrice: 120, rawXp: 18, processedXp: 55 },
  partridge: { name: "🐦 Keklik", reqLv: 1, escapeChance: 0.25, rawPrice: 65, processedName: "🥩 Keklik Izgara", processedPrice: 140, rawXp: 20, processedXp: 60 },
  pheasant: { name: "🦚 Sülün", reqLv: 2, escapeChance: 0.30, rawPrice: 110, processedName: "🍲 Soslu Sülün Yahnisi", processedPrice: 240, rawXp: 30, processedXp: 85 },
  fox: { name: "🦊 Tilki", reqLv: 2, escapeChance: 0.35, rawPrice: 150, processedName: "🧣 Kaliteli Tilki Kürkü", processedPrice: 320, rawXp: 35, processedXp: 95 },
  beaver: { name: "🦫 Kunduz", reqLv: 2, escapeChance: 0.32, rawPrice: 140, processedName: "🥾 Kunduz Derisi Çizme", processedPrice: 300, rawXp: 32, processedXp: 90 },
  deer: { name: "🦌 Geyik", reqLv: 3, escapeChance: 0.40, rawPrice: 250, processedName: "🥩 Tütsülenmiş Geyik Eti", processedPrice: 550, rawXp: 50, processedXp: 140 },
  boar: { name: "🐗 Yaban Domuzu", reqLv: 3, escapeChance: 0.45, rawPrice: 300, processedName: "🥓 Baharatlı Domuz Pastırması", processedPrice: 650, rawXp: 55, processedXp: 150 },
  lynx: { name: "🐱 Vaşak", reqLv: 3, escapeChance: 0.50, rawPrice: 380, processedName: "🧥 Lüks Vaşak Kürkü", processedPrice: 800, rawXp: 60, processedXp: 170 },
  wolf: { name: "🐺 Kurt", reqLv: 4, escapeChance: 0.55, rawPrice: 520, processedName: "🛡️ Kurt Dişi Tılsım Kolye", processedPrice: 1200, rawXp: 80, processedXp: 220 },
  ibex: { name: "🐐 Dağ Keçisi", reqLv: 4, escapeChance: 0.52, rawPrice: 480, processedName: "🥩 Güveçte Keçi Kavurması", processedPrice: 1050, rawXp: 75, processedXp: 210 },
  black_bear: { name: "🐻 Kara Ayı", reqLv: 4, escapeChance: 0.60, rawPrice: 750, processedName: "🍯 Şifalı Ayı Yağı Özütü", processedPrice: 1700, rawXp: 100, processedXp: 280 },
  grizzly: { name: "🐻‍❄️ Bozayı", reqLv: 5, escapeChance: 0.65, rawPrice: 1200, processedName: "👑 Hükümdar Bozayı Postu", processedPrice: 2700, rawXp: 150, processedXp: 450 },
  leopard: { name: "🐆 Pars", reqLv: 5, escapeChance: 0.70, rawPrice: 1500, processedName: "🎪 Egzotik Pars Pelerini", processedPrice: 3500, rawXp: 180, processedXp: 550 },
  white_hart: { name: "🦄 Efsanevi Beyaz Geyik", reqLv: 5, escapeChance: 0.80, rawPrice: 3500, processedName: "💎 Kadim Ruh Özü Kristali", processedPrice: 8000, rawXp: 300, processedXp: 1100 }
};

// --- YARDIMCI MATEMATİK & VERİ FONKSİYONLARI ---
function formatCoins(amount) {
  if (amount >= 1000000 && amount % 1000 === 0) return `${amount / 1000000}M`;
  if (amount >= 1000 && amount % 1000 === 0) return `${amount / 1000}K`;
  return amount.toLocaleString("en-US");
}

function getRequiredXp(level) { return level * 350; }

function ensureUser(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      if (row) resolve(row);
      else {
        db.run("INSERT INTO users(id, coins, equipped_item, xp, level, last_daily) VALUES(?, 500, NULL, 0, 1, 0)", [id], (err) => {
          if (err) return reject(err);
          resolve({ id, coins: 500, equipped_item: null, xp: 0, level: 1, last_daily: 0 });
        });
      }
    });
  });
}

function getUser(id) {
  return new Promise((resolve, reject) => { db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => { if (err) return reject(err); resolve(row); }); });
}

function addCoins(id, amount) {
  return new Promise((resolve, reject) => { db.run("UPDATE users SET coins = coins + ? WHERE id = ?", [amount, id], (err) => { if (err) return reject(err); resolve(); }); });
}

function setCoins(id, amount) {
  return new Promise((resolve, reject) => { db.run("UPDATE users SET coins = ? WHERE id = ?", [amount, id], (err) => { if (err) return reject(err); resolve(); }); });
}

function updateDailyTimestamp(id, ts) {
  return new Promise((resolve, reject) => { db.run("UPDATE users SET last_daily = ? WHERE id = ?", [ts, id], (err) => { if (err) return reject(err); resolve(); }); });
}

function addXp(id, amount) {
  return new Promise((resolve, reject) => {
    db.get("SELECT xp, level FROM users WHERE id = ?", [id], (err, row) => {
      if (!row) return resolve({ leveledUp: false });
      let newXp = row.xp + amount;
      let currentLevel = row.level;
      let leveledUp = false;

      while (newXp >= getRequiredXp(currentLevel)) {
        newXp -= getRequiredXp(currentLevel);
        currentLevel++;
        leveledUp = true;
      }

      db.run("UPDATE users SET xp = ?, level = ? WHERE id = ?", [newXp, currentLevel, id], (err) => {
        if (err) return reject(err);
        resolve({ leveledUp, level: currentLevel });
      });
    });
  });
}

function getInventory(userId) {
  return new Promise((resolve, reject) => { db.all("SELECT * FROM inventory WHERE userId = ? AND quantity > 0", [userId], (err, rows) => { if (err) return reject(err); resolve(rows || []); }); });
}

function addItem(userId, itemId) {
  return new Promise((resolve, reject) => { db.run("INSERT INTO inventory(userId, itemId, quantity) VALUES(?, ?, 1) ON CONFLICT(userId, itemId) DO UPDATE SET quantity = quantity + 1", [userId, itemId], (err) => { if (err) return reject(err); resolve(); }); });
}

function removeItem(userId, itemId, quantity = 1) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE inventory SET quantity = quantity - ? WHERE userId = ? AND itemId = ?", [quantity, userId, itemId], function(err) {
      if (err) return reject(err);
      db.run("DELETE FROM inventory WHERE userId = ? AND itemId = ? AND quantity <= 0", [userId, itemId], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

function setEquipItem(userId, itemId) {
  return new Promise((resolve, reject) => { db.run("UPDATE users SET equipped_item = ? WHERE id = ?", [itemId, userId], (err) => { if (err) return reject(err); resolve(); }); });
}

// --- BLACKJACK KART MATEMATİĞİ ---
function drawCard() {
  const suits = ["♠️", "♥️", "♦️", "♣️"];
  const values = [{ name: "2", val: 2 }, { name: "3", val: 3 }, { name: "4", val: 4 }, { name: "5", val: 5 }, { name: "6", val: 6 }, { name: "7", val: 7 }, { name: "8", val: 8 }, { name: "9", val: 9 }, { name: "10", val: 10 }, { name: "J", val: 10 }, { name: "Q", val: 10 }, { name: "K", val: 10 }, { name: "A", val: 11 }];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const value = values[Math.floor(Math.random() * values.length)];
  return { text: `[${suit} ${value.name}]`, score: value.val, isAce: value.name === "A" };
}

function calculateHand(hand) {
  let score = hand.reduce((acc, card) => acc + card.score, 0);
  let aces = hand.filter(card => card.isAce).length;
  while (score > 21 && aces > 0) { score -= 10; aces--; }
  return score;
}

module.exports = {
  db, activeBlackjack, ITEMS, ANIMALS, formatCoins, getRequiredXp,
  ensureUser, getUser, addCoins, setCoins, updateDailyTimestamp, addXp,
  getInventory, addItem, removeItem, setEquipItem, drawCard, calculateHand
};
