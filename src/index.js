require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./economy.db");

// Bellekte anlık aktif Blackjack oyunlarını tutmak için Map
const activeBlackjack = new Map();

// Veritabanı genişletilmiş RPG şeması
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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- RPG MARKET AYARLARI ---
const ITEMS = {
  rifle: { name: "🏹 Gelişmiş Av Tüfeği", price: 600, desc: "Avların kaçış şansını %15 azaltır.", type: "hunt" },
  pickaxe: { name: "⛏️ Saf Altın Kazma", price: 1000, desc: "Çalışma ödüllerini %50 artırır.", type: "work" }
};

// --- TAM 15 ADET DETAYLI AV HAYVANI VERİLERİ ---
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

// --- BAKİYE BİÇİMLENDİRME ---
function formatCoins(amount) {
  if (amount >= 1000000 && amount % 1000 === 0) return `${amount / 1000000}M`;
  if (amount >= 1000 && amount % 1000 === 0) return `${amount / 1000}K`;
  return amount.toLocaleString("en-US");
}

function getRequiredXp(level) {
  return level * 350;
}

// --- ASENKRON VERİTABANI YARDIMCILARI ---
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

// --- ANA PANEL TASARIMI ---
async function getMainMenuEmbed(userId) {
  const user = await getUser(userId);
  const activeItem = user && user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok ❌";
  return new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🤖 Devasa RPG & Eğlence İstasyonu")
    .setDescription("Karakterinizi geliştirin, ormanda vahşi hayvanları avlayın veya lüks yemekler hazırlayın!")
    .addFields(
      { name: "👤 Profil Detayları", value: `🌟 **Seviye:** ${user.level}\n✨ **XP:** ${user.xp}/${getRequiredXp(user.level)}`, inline: true },
      { name: "💰 Finansal Durum", value: `💵 **Cüzdan:** ${formatCoins(user.coins)} Jeton\n⚔️ **Silah:** ${activeItem}`, inline: true }
    )
    .setTimestamp();
}

function getMainMenuComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("nav_economy").setLabel("🪙 Ekonomi & RPG").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("nav_general").setLabel("⚙️ Genel Komutlar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("nav_sandbox").setLabel("🛠️ Sandbox Modu").setStyle(ButtonStyle.Danger)
  )];
}

const backButtonRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("back_to_main").setLabel("⬅️ Ana Menüye Dön").setStyle(ButtonStyle.Secondary)
);

client.on("messageCreate", async msg => {
  if (msg.author.bot || msg.content !== "!menu") return;
  await ensureUser(msg.author.id);
  return msg.reply({ embeds: [await getMainMenuEmbed(msg.author.id)], components: getMainMenuComponents() });
});

// --- ANA ETKİLEŞİM MOTORU ---
client.on("interactionCreate", async interaction => {
  const userId = interaction.user.id;
  await ensureUser(userId);

  if (interaction.isButton()) {
    if (interaction.customId === "back_to_main") {
      activeBlackjack.delete(userId);
      return interaction.update({ embeds: [await getMainMenuEmbed(userId)], components: getMainMenuComponents() });
    }

    // ALT MENÜ: EKONOMİ & RPG
    if (interaction.customId === "nav_economy") {
      const user = await getUser(userId);
      const activeItem = user && user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok ❌";
      const embed = new EmbedBuilder().setColor("#57F287").setTitle("🪙 Ekonomi, Meslek ve Macera Dünyası")
        .setDescription("Aşağıdaki paneli kullanarak avlanabilir, malzemelerinizi işleyebilir veya zindanlara akın atabilirsiniz.")
        .addFields({ name: "Cüzdan", value: `💰 **${formatCoins(user.coins)}** Jeton`, inline: true }, { name: "Kuşanılan", value: `⚔️ **${activeItem}**`, inline: true });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hunt_menu_nav").setLabel("🏹 Hayvan Avla").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("hunt_house_nav").setLabel("🥩 Av İşleme Evi").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("work").setLabel("💼 Çalış").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("beg").setLabel("🙏 Dilen").setStyle(ButtonStyle.Secondary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("daily").setLabel("📅 Günlük Ödül").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("gamble_menu").setLabel("🎰 Kumar Salonu").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("dungeon_menu").setLabel("🏰 Zindan Akını").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("shop_menu").setLabel("🛒 Market").setStyle(ButtonStyle.Primary)
      );
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("inv_menu").setLabel("🎒 Envanterim").setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({ embeds: [embed], components: [row1, row2, row3, backButtonRow] });
    }

    // 🏹 AVCILIK LOBİSİ (HAYVAN SEÇİM EKRANI)
    if (interaction.customId === "hunt_menu_nav") {
      const user = await getUser(userId);
      const embed = new EmbedBuilder().setColor("#57F287").setTitle("🏹 Avcılık ve İz Sürücülük Ormanı")
        .setDescription("Avlamak istediğiniz hayvanı alttaki listeden seçin. Nadir hayvanların kaçma olasılığı yüksektir.\n\n🎒 **Avcı İpucu:** Eğer marketten **Gelişmiş Av Tüfeği** kuşanırsanız avların kaçma ihtimali **%15 azalır**!");

      const options = Object.entries(ANIMALS).map(([id, animal]) => ({
        label: `${animal.name} (Svy. ${animal.reqLv})`,
        description: `Kaçış Riski: %${Math.floor(animal.escapeChance * 100)} | Ham Değeri: ${formatCoins(animal.rawPrice)}`,
        value: id
      }));

      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("hunt_animal_select").setPlaceholder("Avlanacak bir hedef seçin...").addOptions(options)), backButtonRow] });
    }

    // 🥩 AV İŞLEME EVİ PANELİ (MUTFAK & KASAP)
    if (interaction.customId === "hunt_house_nav") {
      const inv = await getInventory(userId);
      const embed = new EmbedBuilder().setColor("#E67E22").setTitle("🥩 Av İşleme ve Kasap Atölyesi")
        .setDescription("Avladığınız çiğ hayvanları burada satabilir, mutfakta pişirebilir/işleyebilir ya da yiyerek yüksek miktarda tecrübe puanı (XP) elde edebilirsiniz!");

      const options = [];
      inv.forEach(row => {
        const isRaw = row.itemId.startsWith("raw_");
        const isProc = row.itemId.startsWith("proc_");
        if (isRaw || isProc) {
          const baseId = row.itemId.replace("raw_", "").replace("proc_", "");
          const animal = ANIMALS[baseId];
          if (animal) {
            const displayName = isRaw ? `Çiğ ${animal.name}` : animal.processedName;
            options.push({
              label: `${displayName} (${row.quantity} Adet)`,
              description: isRaw ? `Pişirilebilir / Çiğ Olarak Satılabilir` : `Yenilebilir / Lüks Fiyata Satılabilir`,
              value: row.itemId
            });
          }
        }
      });

      if (options.length === 0) {
        embed.setDescription("Atölyenizde işlenecek hiçbir av eti bulunamadı. Önce ormana gidip avlanmalısınız! 🏹");
        return interaction.update({ embeds: [embed], components: [backButtonRow] });
      }

      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("hh_item_select").setPlaceholder("İşlem yapılacak av ürününü seçin...").addOptions(options)), backButtonRow] });
    }

    // AV İŞLEME AKSİYON BUTON MOTORU (SAT, YE, İŞLE)
    if (interaction.customId.startsWith("hhact_")) {
      const parts = interaction.customId.split("_"); // hhact, [sell/eat/proc], [raw/proc], [animalId]
      const action = parts[1];
      const prefix = parts[2];
      const baseId = parts[3];
      const itemId = `${prefix}_${baseId}`;
      const animal = ANIMALS[baseId];

      const inv = await getInventory(userId);
      const matched = inv.find(r => r.itemId === itemId);
      const qty = matched ? matched.quantity : 0;

      if (qty <= 0) {
        return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Stok").setDescription("Envanterinizde bu üründen kalmamış.")], components: [backButtonRow] });
      }

      const embed = new EmbedBuilder().setTimestamp();

      if (action === "sell") {
        const price = prefix === "raw" ? animal.rawPrice : animal.processedPrice;
        await removeItem(userId, itemId, 1);
        await addCoins(userId, price);
        embed.setColor("#57F287").setTitle("💰 Ticaret Başarılı")
          .setDescription(`1 adet **${prefix === "raw" ? `Çiğ ${animal.name}` : animal.processedName}** başarıyla tüccara satıldı!\n\n💵 Kazanç: **+${formatCoins(price)}** Jeton.`);
      } 
      else if (action === "eat") {
        const xpReward = prefix === "raw" ? animal.rawXp : animal.processedXp;
        await removeItem(userId, itemId, 1);
        const xpRes = await addXp(userId, xpReward);
        embed.setColor("#5865F2").setTitle("🍖 Afiyet Olsun!")
          .setDescription(`1 adet **${prefix === "raw" ? `Çiğ ${animal.name}` : animal.processedName}** yediniz ve sindirdiniz.\n\n✨ **+${xpReward} XP** kazandınız.${xpRes.leveledUp ? `\n\n🎉 **TEBRİKLER! Seviye Atladınız! Yeni Seviye: ${xpRes.level}**` : ""}`);
      } 
      else if (action === "proc") {
        await removeItem(userId, itemId, 1);
        await addItem(userId, `proc_${baseId}`);
        embed.setColor("#E67E22").setTitle("🍳 Dönüştürme Başarılı")
          .setDescription(`1 adet **Çiğ ${animal.name}** işleme tezgahında harika bir şekilde dönüştürüldü ve **${animal.processedName}** üretildi!`);
      }

      const updatedUser = await getUser(userId);
      embed.addFields({ name: "Mevcut Durum", value: `💰 Cüzdan: **${formatCoins(updatedUser.coins)}** | 🌟 Seviye: **${updatedUser.level}**` });
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // ESKİ MESLEKLER (Work & Beg)
    if (interaction.customId === "work" || interaction.customId === "beg") {
      const isWork = interaction.customId === "work";
      const min = isWork ? 100 : 5, max = isWork ? 400 : 50;
      let user = await getUser(userId);
      let reward = Math.floor(Math.random() * (max - min + 1)) + min;
      
      let multiplier = 1 + ((user.level - 1) * 0.1);
      if (isWork && user.equipped_item === "pickaxe") multiplier += 0.5;
      
      reward = Math.floor(reward * multiplier);
      await addCoins(userId, reward);
      const xpRes = await addXp(userId, isWork ? 60 : 15);
      const updatedUser = await getUser(userId);

      return interaction.update({
        embeds: [new EmbedBuilder().setColor("#57F287").setTitle(isWork ? "💼 Mesai Yapıldı" : "🙏 Dilendiniz")
          .setDescription(`**+${formatCoins(reward)}** Jeton kazandınız! \n✨ **+${isWork ? 60 : 15} XP** elde edildi. ${xpRes.leveledUp ? `\n\n🎉 **Seviye Atladınız! Yeni Seviye: ${xpRes.level}**` : ""}`)
          .addFields({ name: "Güncel Bakiye", value: `💰 **${formatCoins(updatedUser.coins)}** Jeton` })],
        components: [backButtonRow]
      });
    }

    // DİĞER BUTON GEÇİŞLERİ (Daily, Dungeon, Sandbox vb.)
    if (interaction.customId === "daily") {
      const user = await getUser(userId); const cooldown = 86400000; const now = Date.now();
      if (now - user.last_daily < cooldown) {
        const timeLeft = cooldown - (now - user.last_daily);
        return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("⏱️ Bekleme Süresi").setDescription(`Tekrar almak için **${Math.floor(timeLeft / 3600000)} saat** beklemelisiniz.`)], components: [backButtonRow] });
      }
      const dailyReward = 500 + (user.level * 150);
      await addCoins(userId, dailyReward); await updateDailyTimestamp(userId, now);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("📅 Günlük Ödül").setDescription(`Giriş ödülü olarak **+${formatCoins(dailyReward)}** Jeton eklendi!`)], components: [backButtonRow] });
    }

    if (interaction.customId === "nav_general") {
      const embed = new EmbedBuilder().setColor("#5865F2").setTitle("⚙️ Genel Komutlar").setDescription("Sistem istatistikleri modülü.");
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gen_server").setLabel("📊 Sunucu").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("gen_user").setLabel("👤 Profil").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("gen_ping").setLabel("🏓 Ping").setStyle(ButtonStyle.Secondary));
      return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
    }

    if (interaction.customId === "gen_server") return interaction.update({ embeds: [new EmbedBuilder().setColor("#5865F2").setTitle(`📊 Sunucu: ${interaction.guild.name}`).addFields({ name: "Üye Üye", value: `${interaction.guild.memberCount}` })], components: [backButtonRow] });
    if (interaction.customId === "gen_user") return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle(`👤 Kullanıcı: ${interaction.user.username}`).setThumbnail(interaction.user.displayAvatarURL())], components: [backButtonRow] });
    if (interaction.customId === "gen_ping") return interaction.update({ embeds: [new EmbedBuilder().setColor("#FEE75C").setTitle("🏓 Gecikme").setDescription(`Hız: **${client.ws.ping}ms**`)], components: [backButtonRow] });

    if (interaction.customId === "nav_sandbox") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetki Yok")], components: [backButtonRow] });
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("🛠️ Sandbox Modu")], components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("sandbox_user_select")), backButtonRow] });
    }

    if (interaction.customId === "dungeon_menu") {
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("dg_easy").setLabel("🟢 Kolay").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("dg_medium").setLabel("🟡 Orta").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("dg_hard").setLabel("🔴 Zor").setStyle(ButtonStyle.Danger));
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#E67E22").setTitle("🏰 Zindanlar")], components: [row, backButtonRow] });
    }

    if (interaction.customId.startsWith("dg_")) {
      const user = await getUser(userId); const difficulty = interaction.customId.replace("dg_", "");
      let reqLv = 1, chance = 0.7, prize = 300, xp = 100, pen = 100;
      if (difficulty === "medium") { reqLv = 3; chance = 0.5; prize = 1000; xp = 250; pen = 350; }
      else if (difficulty === "hard") { reqLv = 5; chance = 0.3; prize = 3000; xp = 600; pen = 1000; }
      if (user.level < reqLv) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Seviyeniz Yetersiz")], components: [backButtonRow] });
      if (Math.random() < chance) { await addCoins(userId, prize); const xr = await addXp(userId, xp); return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("⚔️ Zafer!").setDescription(`**+${formatCoins(prize)}** kazandınız.`)], components: [backButtonRow] }); }
      else { await addCoins(userId, -pen); return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("💀 Bozgun!").setDescription(`**-${formatCoins(pen)}** kaybettiniz.`)], components: [backButtonRow] }); }
    }

    if (interaction.customId === "gamble_menu") {
      const sm = new StringSelectMenuBuilder().setCustomId("gamble_select").setPlaceholder("Oyun seçin...").addOptions([{ label: "Yazı Tura", value: "cf_lobby" }, { label: "Slot", value: "slots_lobby" }, { label: "Rulet", value: "roulette_lobby" }, { label: "Blackjack", value: "bj_lobby" }]);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#FEE75C").setTitle("🎰 Kumar Odası")], components: [new ActionRowBuilder().addComponents(sm), backButtonRow] });
    }

    if (interaction.customId === "cf_yazi" || interaction.customId === "cf_tura") {
      const modal = new ModalBuilder().setCustomId(`modal_cf_${interaction.customId}`).setTitle("Bahis Girişi");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Gir").setStyle(TextInputStyle.Short)));
      return interaction.showModal(modal);
    }
    if (interaction.customId === "slots_spin_btn") {
      const modal = new ModalBuilder().setCustomId("modal_slots_spin").setTitle("Bahis Girişi");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Gir").setStyle(TextInputStyle.Short)));
      return interaction.showModal(modal);
    }
    if (interaction.customId.startsWith("rl_")) {
      const modal = new ModalBuilder().setCustomId(`modal_rl_${interaction.customId.split("_")[1]}`).setTitle("Bahis Girişi");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Gir").setStyle(TextInputStyle.Short)));
      return interaction.showModal(modal);
    }
    if (interaction.customId === "bj_bet_start") {
      const modal = new ModalBuilder().setCustomId("modal_bj_start").setTitle("Bahis Girişi");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Gir").setStyle(TextInputStyle.Short)));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "bj_hit" || interaction.customId === "bj_stand") {
      const game = activeBlackjack.get(userId);
      if (!game) return interaction.update({ embeds: [new EmbedBuilder().setTitle("Oyun Yok")], components: [backButtonRow] });
      if (interaction.customId === "bj_hit") {
        game.playerHand.push(drawCard()); const ps = calculateHand(game.playerHand);
        if (ps > 21) { await addCoins(userId, -game.bet); activeBlackjack.delete(userId); return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("KAYBETTİNİZ (Bust)").setDescription(`Skor: ${ps}`)], components: [backButtonRow] }); }
      } else {
        let ds = calculateHand(game.dealerHand); while (ds < 17) { game.dealerHand.push(drawCard()); ds = calculateHand(game.dealerHand); }
        const ps = calculateHand(game.playerHand); const em = new EmbedBuilder();
        if (ds > 21 || ps > ds) { await addCoins(userId, game.bet); em.setColor("#57F287").setTitle("KAZANDINIZ"); }
        else if (ds > ps) { await addCoins(userId, -game.bet); em.setColor("#ED4245").setTitle("KAYBETTİNİZ"); }
        else em.setColor("#FEE75C").setTitle("BERABERE");
        activeBlackjack.delete(userId); return interaction.update({ embeds: [em.setDescription(`Siz: ${ps} | Kasa: ${ds}`)], components: [backButtonRow] });
      }
      const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_hit").setLabel("Kart Çek").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("bj_stand").setLabel("Dur").setStyle(ButtonStyle.Danger));
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("Blackjack").setDescription(`Siz: ${calculateHand(game.playerHand)}`)], components: [actionRow] });
    }

    if (interaction.customId === "shop_menu") {
      const options = Object.entries(ITEMS).map(([id, it]) => ({ label: it.name, description: `${it.price} Jeton`, value: id }));
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("🛒 Market")], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("shop_buy_select").addOptions(options)), backButtonRow] });
    }
    if (interaction.customId === "inv_menu") {
      const inv = await getInventory(userId); const u = await getUser(userId);
      const options = inv.filter(r => ITEMS[r.itemId]).map(r => ({ label: ITEMS[r.itemId].name, value: r.itemId }));
      const comps = []; if (options.length > 0) comps.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("inv_equip_select").addOptions(options)));
      comps.push(backButtonRow); return interaction.update({ embeds: [new EmbedBuilder().setTitle("🎒 Envanter").setDescription(`Kuşanılan: ${u.equipped_item || "Yok"}`)], components: comps });
    }
    if (interaction.customId.startsWith("sb_edit_")) {
      const modal = new ModalBuilder().setCustomId(`modal_sb_set_${interaction.customId.replace("sb_edit_", "")}`).setTitle("Bakiye Ayarla");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("new_coin_amount").setLabel("Miktar").setStyle(TextInputStyle.Short)));
      return interaction.showModal(modal);
    }
  }

  if (interaction.isStringSelectMenu()) {
    // 🏹 SİLME/AV SEÇİM ETKİLEŞİMİ
    if (interaction.customId === "hunt_animal_select") {
      const animalId = interaction.values[0];
      const animal = ANIMALS[animalId];
      const user = await getUser(userId);

      if (user.level < animal.reqLv) {
        return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Seviye").setDescription(`Bu hayvanın izini sürmek için en az **Seviye ${animal.reqLv}** olmalısınız!`)], components: [backButtonRow] });
      }

      let escapeChance = animal.escapeChance;
      if (user.equipped_item === "rifle") escapeChance = Math.max(0.05, escapeChance - 0.15); // Tüfek bonusu

      const isEscaped = Math.random() < escapeChance;
      const embed = new EmbedBuilder().setTimestamp();

      if (isEscaped) {
        embed.setColor("#FEE75C").setTitle("💨 Av Elinizden Kaçtı!").setDescription(`**${animal.name}** son anda gürültüyü fark edip çalılıklara kaçtı! Takip başarısız.`);
      } else {
        await addItem(userId, `raw_${animalId}`); // Çiğ olarak envantere ekle
        const xpRes = await addXp(userId, animal.rawXp);
        embed.setColor("#57F287").setTitle("🎯 Av Başarılı!")
          .setDescription(`Harika bir atışla **${animal.name}** yakaladınız!\n\n📦 Malzeme **Av İşleme Evi** deposuna kaldırıldı.\n✨ **+${animal.rawXp} XP** kazanıldı.${xpRes.leveledUp ? `\n🎉 **Seviye Atladınız! Yeni Seviye: ${xpRes.level}**` : ""}`);
      }
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // 🥩 AV İŞLEME EVİ EŞYA SEÇİMİ
    if (interaction.customId === "hh_item_select") {
      const itemId = interaction.values[0];
      const isRaw = itemId.startsWith("raw_");
      const baseId = itemId.replace("raw_", "").replace("proc_", "");
      const animal = ANIMALS[baseId];

      const inv = await getInventory(userId);
      const matched = inv.find(r => r.itemId === itemId);
      const qty = matched ? matched.quantity : 0;

      if (qty <= 0) return interaction.update({ embeds: [new EmbedBuilder().setTitle("Ürün Kalmamış")], components: [backButtonRow] });

      const embed = new EmbedBuilder().setColor("#3498DB").setTitle(`🎬 Ürün Yönetimi: ${isRaw ? `Çiğ ${animal.name}` : animal.processedName}`)
        .setDescription(`Bu üründen deponuzda **${qty}** adet var. Ne yapmak istersiniz?`)
        .addFields(
          { name: "💰 Satış Fiyatı", value: `${formatCoins(isRaw ? animal.rawPrice : animal.processedPrice)} Jeton`, inline: true },
          { name: "✨ Tüketim XP'si", value: `${isRaw ? animal.rawXp : animal.processedXp} XP`, inline: true }
        );

      if (isRaw) {
        embed.addFields({ name: "🍳 İşleme Dönüşümü", value: `İşlendiğinde **${animal.processedName}** olur. Değeri katlanır!` });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hhact_sell_${itemId}`).setLabel("💰 1 Adet Sat").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`hhact_eat_${itemId}`).setLabel("🍖 1 Adet Ye").setStyle(ButtonStyle.Primary)
      );

      if (isRaw) {
        row.addComponents(new ButtonBuilder().setCustomId(`hhact_proc_${itemId}`).setLabel("🍳 1 Adet İşle").setStyle(ButtonStyle.Danger));
      }

      return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
    }

    // DİĞER STANDART SEÇİM MENÜLERİ
    if (interaction.customId === "gamble_select") {
      const choice = interaction.values[0];
      if (choice === "cf_lobby") return interaction.update({ embeds: [new EmbedBuilder().setTitle("Yazı Tura")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("cf_yazi").setLabel("Yazı").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("cf_tura").setLabel("Tura").setStyle(ButtonStyle.Success)), backButtonRow] });
      if (choice === "slots_lobby") return interaction.update({ embeds: [new EmbedBuilder().setTitle("Slot Makinesi")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("slots_spin_btn").setLabel("Çevir").setStyle(ButtonStyle.Danger)), backButtonRow] });
      if (choice === "roulette_lobby") return interaction.update({ embeds: [new EmbedBuilder().setTitle("Rulet")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("rl_red").setLabel("Kırmızı").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("rl_black").setLabel("Siyah").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("rl_green").setLabel("Yeşil").setStyle(ButtonStyle.Success)), backButtonRow] });
      if (choice === "bj_lobby") return interaction.update({ embeds: [new EmbedBuilder().setTitle("Blackjack (21)")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_bet_start").setLabel("Masaya Otur").setStyle(ButtonStyle.Primary)), backButtonRow] });
    }

    if (interaction.customId === "shop_buy_select") {
      const id = interaction.values[0]; const it = ITEMS[id]; const u = await getUser(userId);
      if (u.coins < it.price) return interaction.update({ embeds: [new EmbedBuilder().setTitle("Yetersiz Bakiye")], components: [backButtonRow] });
      await addCoins(userId, -it.price); await addItem(userId, id);
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("Başarılı").setDescription(`${it.name} satın alındı.`)], components: [backButtonRow] });
    }
    if (interaction.customId === "inv_equip_select") {
      await setEquipItem(userId, interaction.values[0]);
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("Kuşanıldı")], components: [backButtonRow] });
    }
  }

  if (interaction.isUserSelectMenu() && interaction.customId === "sandbox_user_select") {
    const target = interaction.values[0]; const tu = await getUser(target);
    return interaction.update({ embeds: [new EmbedBuilder().setTitle("Sandbox").setDescription(`<@${target}> Parası: ${formatCoins(tu.coins)}`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sb_edit_${target}`).setLabel("Düzenle").setStyle(ButtonStyle.Danger)), backButtonRow] });
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("modal_sb_set_")) {
      const amt = parseInt(interaction.fields.getTextInputValue("new_coin_amount"));
      await setCoins(interaction.customId.replace("modal_sb_set_", ""), isNaN(amt) ? 0 : amt);
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("Bakiye Güncellendi")], components: [backButtonRow] });
    }

    const user = await getUser(userId);
    const bet = parseInt(interaction.fields.getTextInputValue("bet_amount"));
    if (isNaN(bet) || bet < 100 || user.coins < bet) return interaction.update({ embeds: [new EmbedBuilder().setTitle("❌ Hatalı Bahis veya Yetersiz Jeton")], components: [backButtonRow] });

    const embed = new EmbedBuilder().setTimestamp();

    if (interaction.customId.startsWith("modal_cf_")) {
      const win = Math.random() < 0.5; await addCoins(userId, win ? bet : -bet);
      embed.setColor(win ? "#57F287" : "#ED4245").setTitle(win ? "Kazandınız!" : "Kaybettiniz!").setDescription(`Bahis: ${formatCoins(bet)}`);
    }
    if (interaction.customId === "modal_slots_spin") {
      const sym = ["🍎", "🍋", "🍒", "💎"]; const s1 = sym[Math.floor(Math.random() * 4)], s2 = sym[Math.floor(Math.random() * 4)], s3 = sym[Math.floor(Math.random() * 4)];
      if (s1 === s2 && s2 === s3) { await addCoins(userId, bet * 3); embed.setColor("#57F287").setTitle("JACKPOT!").setDescription(`[${s1} ${s2} ${s3}]`); }
      else if (s1 === s2 || s1 === s3 || s2 === s3) { await addCoins(userId, Math.floor(bet * 0.5)); embed.setColor("#57F287").setTitle("Kazandınız").setDescription(`[${s1} ${s2} ${s3}]`); }
      else { await addCoins(userId, -bet); embed.setColor("#ED4245").setTitle("Kaybettiniz").setDescription(`[${s1} ${s2} ${s3}]`); }
    }
    if (interaction.customId.startsWith("modal_rl_")) {
      const cc = interaction.customId.replace("modal_rl_", ""); const rc = ["red", "black", "red", "black", "green"][Math.floor(Math.random() * 5)];
      if (cc === rc) { const w = cc === "green" ? bet * 14 : bet; await addCoins(userId, w); embed.setColor("#57F287").setTitle("Kazandınız"); }
      else { await addCoins(userId, -bet); embed.setColor("#ED4245").setTitle("Kaybettiniz"); }
    }
    if (interaction.customId === "modal_bj_start") {
      const ph = [drawCard(), drawCard()], dh = [drawCard(), drawCard()];
      activeBlackjack.set(userId, { bet, playerHand: ph, dealerHand: dh });
      embed.setColor("#5865F2").setTitle("Blackjack Masası").setDescription(`Eliniz: ${ph.map(c => c.text).join(" ")} (${calculateHand(ph)})`);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_hit").setLabel("Çek").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("bj_stand").setLabel("Dur").setStyle(ButtonStyle.Danger));
      return interaction.update({ embeds: [embed], components: [row] });
    }

    const uu = await getUser(userId); embed.addFields({ name: "Cüzdan", value: `${formatCoins(uu.coins)}` });
    return interaction.update({ embeds: [embed], components: [backButtonRow] });
  }
});

client.login(process.env.DISCORD_TOKEN);
