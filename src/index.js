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

// Bellekte anlık aktif Blackjack oyunlarını tutmak için Map (Hızlı erişim ve mesaj düzenleme için)
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

// --- RPG AYARLARI VE PAZAR ---
const ITEMS = {
  rifle: { name: "🏹 Gelişmiş Av Tüfeği", price: 600, desc: "Avlanma ödüllerini %50 artırır.", type: "hunt" },
  pickaxe: { name: "⛏️ Saf Altın Kazma", price: 1000, desc: "Çalışma ödüllerini %50 artırır.", type: "work" }
};

// --- DİNAMİK BAKİYE BİÇİMLENDİRME ---
function formatCoins(amount) {
  if (amount >= 1000000 && amount % 1000 === 0) return `${amount / 1000000}M`;
  if (amount >= 1000 && amount % 1000 === 0) return `${amount / 1000}K`;
  return amount.toLocaleString("en-US");
}

// --- SEVİYE HESAPLAMA ---
function getRequiredXp(level) {
  return level * 350; // Her seviye için gereken XP formülü
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

function setEquipItem(userId, itemId) {
  return new Promise((resolve, reject) => { db.run("UPDATE users SET equipped_item = ? WHERE id = ?", [itemId, userId], (err) => { if (err) return reject(err); resolve(); }); });
}

// --- BLACKJACK KART MATEMATİĞİ ---
function drawCard() {
  const suits = ["♠️", "♥️", "♦️", "♣️"];
  const values = [
    { name: "2", val: 2 }, { name: "3", val: 3 }, { name: "4", val: 4 }, { name: "5", val: 5 },
    { name: "6", val: 6 }, { name: "7", val: 7 }, { name: "8", val: 8 }, { name: "9", val: 9 },
    { name: "10", val: 10 }, { name: "J", val: 10 }, { name: "Q", val: 10 }, { name: "K", val: 10 },
    { name: "A", val: 11 }
  ];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const value = values[Math.floor(Math.random() * values.length)];
  return { text: `[${suit} ${value.name}]`, score: value.val, isAce: value.name === "A" };
}

function calculateHand(hand) {
  let score = hand.reduce((acc, card) => acc + card.score, 0);
  let aces = hand.filter(card => card.isAce).length;
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

// --- ANA PANEL TASARIMI ---
async function getMainMenuEmbed(userId) {
  const user = await getUser(userId);
  const activeItem = user && user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok ❌";
  const reqXp = getRequiredXp(user ? user.level : 1);

  return new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🤖 Devasa RPG & Eğlence İstasyonu")
    .setDescription("Karakterinizi geliştirin, zindanları yağmalayın ya da kumar salonunda servet kazanın!")
    .addFields(
      { name: "👤 Profil Detayları", value: `🌟 **Seviye:** ${user.level}\n✨ **XP:** ${user.xp}/${reqXp}`, inline: true },
      { name: "💰 Finansal Durum", value: `💵 **Cüzdan:** ${formatCoins(user.coins)} Jeton\n⚔️ **Silah:** ${activeItem}`, inline: true }
    )
    .setTimestamp();
}

function getMainMenuComponents() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("nav_economy").setLabel("🪙 Ekonomi & RPG").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("nav_general").setLabel("⚙️ Genel Komutlar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("nav_sandbox").setLabel("🛠️ Sandbox Modu").setStyle(ButtonStyle.Danger)
  );
  return [row];
}

const backButtonRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("back_to_main").setLabel("⬅️ Ana Menüye Dön").setStyle(ButtonStyle.Secondary)
);

// --- KOMUT BASLATICISI ---
client.on("messageCreate", async msg => {
  if (msg.author.bot || msg.content !== "!menu") return;
  await ensureUser(msg.author.id);
  return msg.reply({ embeds: [await getMainMenuEmbed(msg.author.id)], components: getMainMenuComponents() });
});

// --- ANA ETKİLEŞİM MOTORU ---
client.on("interactionCreate", async interaction => {
  const userId = interaction.user.id;
  await ensureUser(userId);

  // ==========================================
  // 1. BUTON VE NAVİGASYON MOTORU
  // ==========================================
  if (interaction.isButton()) {
    if (interaction.customId === "back_to_main") {
      activeBlackjack.delete(userId); // Varsa yarım kalan bj oyununu temizle
      return interaction.update({ embeds: [await getMainMenuEmbed(userId)], components: getMainMenuComponents() });
    }

    // ALT MENÜ: EKONOMİ & RPG
    if (interaction.customId === "nav_economy") {
      const user = await getUser(userId);
      const activeItem = user && user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok ❌";
      const embed = new EmbedBuilder().setColor("#57F287").setTitle("🪙 Ekonomi, Meslek ve Macera Dünyası")
        .setDescription("Aşağıdaki paneli kullanarak para kazanabilir, günlük hediyenizi alabilir ya da zindanlara katılabilirsiniz.")
        .addFields({ name: "Cüzdan", value: `💰 **${formatCoins(user.coins)}** Jeton`, inline: true }, { name: "Kuşanılan", value: `⚔️ **${activeItem}**`, inline: true });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hunt").setLabel("🏹 Avlan").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("work").setLabel("💼 Çalış").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("beg").setLabel("🙏 Dilen").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("daily").setLabel("📅 Günlük Ödül").setStyle(ButtonStyle.Primary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("gamble_menu").setLabel("🎰 Kumar Salonu").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("dungeon_menu").setLabel("🏰 Zindan Akını").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("shop_menu").setLabel("🛒 Market").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("inv_menu").setLabel("🎒 Envanterim").setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({ embeds: [embed], components: [row1, row2, backButtonRow] });
    }

    // ALT MENÜ: GENEL ÖZELLİKLER
    if (interaction.customId === "nav_general") {
      const embed = new EmbedBuilder().setColor("#5865F2").setTitle("⚙️ Genel Bot Özellikleri").setDescription("Sistem bilgilerini buradan inceleyebilirsiniz.");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("gen_server").setLabel("📊 Sunucu Bilgisi").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("gen_user").setLabel("👤 Kullanıcı Bilgisi").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("gen_ping").setLabel("🏓 Gecikme").setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
    }

    // ALT MENÜ: SANDBOX
    if (interaction.customId === "nav_sandbox") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetki Reddedildi").setDescription("Bu panel sadece yöneticilere özeldir.")], components: [backButtonRow] });
      }
      const embed = new EmbedBuilder().setColor("#ED4245").setTitle("🛠️ Sunucu Geliştirici Sandbox Modu").setDescription("Bakiyesini kontrol etmek istediğiniz kullanıcıyı seçin.");
      const userSelect = new UserSelectMenuBuilder().setCustomId("sandbox_user_select").setPlaceholder("Bir oyuncu belirleyin...");
      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(userSelect), backButtonRow] });
    }

    // GENEL INFO ETKİLEŞİMLERİ
    if (interaction.customId === "gen_server") {
      const g = interaction.guild;
      const embed = new EmbedBuilder().setColor("#5865F2").setTitle(`📊 Sunucu: ${g.name}`).addFields({ name: "ID", value: g.id, inline: true }, { name: "Üye Sayısı", value: `${g.memberCount}`, inline: true }, { name: "Kuruluş", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true });
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }
    if (interaction.customId === "gen_user") {
      const embed = new EmbedBuilder().setColor("#57F287").setTitle(`👤 Kullanıcı: ${interaction.user.username}`).setThumbnail(interaction.user.displayAvatarURL()).addFields({ name: "ID", value: interaction.user.id, inline: true }, { name: "Roller", value: `${interaction.member.roles.highest}`, inline: true });
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }
    if (interaction.customId === "gen_ping") {
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#FEE75C").setTitle("🏓 Pong!").setDescription(`Gecikme Hızı: **${client.ws.ping}ms**`)], components: [backButtonRow] });
    }

    // MESLEK KAZANÇLARI (Hunt, Work, Beg)
    const careerRewards = { hunt: [50, 200, "🏹 Avlanma Başarılı!", "rifle", 40], work: [100, 400, "💼 Mesai Yapıldı!", "pickaxe", 60], beg: [5, 50, "🙏 Sokakta Dilendiniz!", null, 15] };
    if (careerRewards[interaction.customId]) {
      const [min, max, title, reqItem, xpReward] = careerRewards[interaction.customId];
      let user = await getUser(userId);
      let reward = Math.floor(Math.random() * (max - min + 1)) + min;
      
      // Level ve Item Çarpan Hesabı
      let multiplier = 1 + ((user.level - 1) * 0.1); // Her level +%10 kazanç sağlar
      if (reqItem && user.equipped_item === reqItem) multiplier += 0.5; // Eşya +%50 verir
      
      reward = Math.floor(reward * multiplier);
      await addCoins(userId, reward);
      const xpResult = await addXp(userId, xpReward);
      const updatedUser = await getUser(userId);

      const embed = new EmbedBuilder().setColor("#57F287").setTitle(title)
        .setDescription(`**+${formatCoins(reward)}** Jeton kazandınız! \n✨ **+${xpReward} XP** elde edildi. ${xpResult.leveledUp ? `\n\n🎉 **TEBRİKLER! Seviye Atladınız! Yeni Seviyeniz: ${xpResult.level}**` : ""}`)
        .addFields({ name: "Güncel Durum", value: `💰 Bakiye: **${formatCoins(updatedUser.coins)}**\n🌟 Seviye: **${updatedUser.level}**` });
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // GÜNLÜK ÖDÜL SİSTEMİ
    if (interaction.customId === "daily") {
      const user = await getUser(userId);
      const cooldown = 86400000; // 24 Saat
      const now = Date.now();

      if (now - user.last_daily < cooldown) {
        const timeLeft = cooldown - (now - user.last_daily);
        const hrs = Math.floor(timeLeft / 3600000);
        const mins = Math.floor((timeLeft % 3600000) / 60000);
        return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("⏱️ Bekleme Süresi").setDescription(`Günlük ödülünüzü zaten aldınız! Tekrar almak için **${hrs} saat ${mins} dakika** beklemelisiniz.`)], components: [backButtonRow] });
      }

      const dailyReward = 500 + (user.level * 150); // Seviyeye göre artan ödül havuzu
      await addCoins(userId, dailyReward);
      await updateDailyTimestamp(userId, now);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("📅 Günlük Ödül Toplandı").setDescription(`Sisteme giriş yaptığınız için seviyenize özel **+${formatCoins(dailyReward)}** Jeton cüzdanınıza eklendi!`)], components: [backButtonRow] });
    }

    // 🏰 ZİNDAN MENÜSÜ
    if (interaction.customId === "dungeon_menu") {
      const embed = new EmbedBuilder().setColor("#E67E22").setTitle("🏰 Kadim Zindan Seferleri")
        .setDescription("Zindanlar tehlikelidir fakat inanılmaz ödüller ve XP barındırır. Seviyenize uygun zorluğu seçip akını başlatın!");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("dg_easy").setLabel("🟢 Kolay Zindan (Lv. 1+)").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("dg_medium").setLabel("🟡 Orta Zindan (Lv. 3+)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("dg_hard").setLabel("🔴 Zor Zindan (Lv. 5+)").setStyle(ButtonStyle.Danger)
      );
      return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
    }

    // ZİNDAN SAVAŞ MATEMATİĞİ
    if (interaction.customId.startsWith("dg_")) {
      const user = await getUser(userId);
      const difficulty = interaction.customId.replace("dg_", "");
      let reqLv = 1, winChance = 0.70, goldPrize = 0, xpPrize = 0, lossPenalty = 0, name = "";

      if (difficulty === "easy") { reqLv = 1; winChance = 0.75; goldPrize = 300; xpPrize = 100; lossPenalty = 100; name = "Goblin Mağarası"; }
      else if (difficulty === "medium") { reqLv = 3; winChance = 0.55; goldPrize = 1000; xpPrize = 250; lossPenalty = 350; name = "Kayıp Katakomb"; }
      else if (difficulty === "hard") { reqLv = 5; winChance = 0.35; goldPrize = 3000; xpPrize = 600; lossPenalty = 1000; name = "Ejderha İni"; }

      if (user.level < reqLv) {
        return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Seviye").setDescription(`Bu zindana girmek için en az **Seviye ${reqLv}** olmalısınız!\nMevcut Seviyeniz: **${user.level}**`)], components: [backButtonRow] });
      }

      const win = Math.random() < winChance;
      const embed = new EmbedBuilder().setTimestamp();

      if (win) {
        await addCoins(userId, goldPrize);
        const xpRes = await addXp(userId, xpPrize);
        embed.setColor("#57F287").setTitle(`⚔️ Zindan Başarılı: ${name}`)
          .setDescription(`Zindanın sonundaki canavarı alt etmeyi başardınız!\n\n💰 Ganimet: **+${formatCoins(goldPrize)} Jeton**\n✨ Tecrübe: **+${xpPrize} XP** ${xpRes.leveledUp ? `\n\n🎉 **SEVİYE ATLADINIZ! Yeni Seviye: ${xpRes.level}**` : ""}`);
      } else {
        // Para sıfırın altına düşmesin koruması
        const finalPenalty = user.coins < lossPenalty ? user.coins : lossPenalty;
        await addCoins(userId, -finalPenalty);
        embed.setColor("#ED4245").setTitle(`💀 Başarısız Seviye: ${name}`)
          .setDescription(`Zindandaki yaratıklar sizi ağır yaraladı ve kaçmak zorunda kaldınız.\n\n🩹 Kayıp: **-${formatCoins(finalPenalty)} Jeton** (Tedavi masrafı)`);
      }
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // KUMAR SALONU ANA GEÇİŞİ
    if (interaction.customId === "gamble_menu") {
      const embed = new EmbedBuilder().setColor("#FEE75C").setTitle("🎰 Kumar ve Şans Oyunları Salonu").setDescription("Oynamak istediğiniz lobiye giriş yapın.\n⚠️ Tüm oyunlarda minimum bahis alt sınırı **100 Jeton**dur.");
      const selectMenu = new StringSelectMenuBuilder().setCustomId("gamble_select").setPlaceholder("Bir şans oyunu seçimi yapın...")
        .addOptions([
          { label: "Yazı Tura (Coinflip)", description: "Kendi tarafını seç ve parayı fırlat!", value: "cf_lobby", emoji: "🪙" },
          { label: "Slot Makinesi (Slots)", description: "Meyveleri diz, büyük jackpotu vur!", value: "slots_lobby", emoji: "🍒" },
          { label: "Rulet (Roulette)", description: "Renklerin dünyasına gir ve katla!", value: "roulette_lobby", emoji: "🎡" },
          { label: "Blackjack (21)", description: "Dağıtıcıya karşı stratejini konuştur!", value: "bj_lobby", emoji: "🃏" }
        ]);
      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), backButtonRow] });
    }

    // YAZI TURA BUTON TETİKLEYİCİLERİ
    if (interaction.customId === "cf_yazi" || interaction.customId === "cf_tura") {
      const side = interaction.customId === "cf_yazi" ? "Yazı" : "Tura";
      const modal = new ModalBuilder().setCustomId(`modal_cf_${interaction.customId}`).setTitle(`🪙 Coinflip Miktar Girişi: ${side}`);
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Miktarını Girin (Min 100)").setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    // SLOT BUTON TETİKLEYİCİSİ
    if (interaction.customId === "slots_spin_btn") {
      const modal = new ModalBuilder().setCustomId("modal_slots_spin").setTitle("🍒 Slot Bahis Girişi");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Miktarını Girin (Min 100)").setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    // RULET RENK SEÇİM MOTORU (MODALA YÖNLENDİRİR)
    if (interaction.customId.startsWith("rl_")) {
      const color = interaction.customId.split("_")[1]; // red, black, green
      const modal = new ModalBuilder().setCustomId(`modal_rl_${color}`).setTitle(`🎡 Rulet Bahis Girişi`);
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Miktarını Girin (Min 100)").setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    // BLACKJACK BAHİS BUTON TETİKLEYİCİSİ
    if (interaction.customId === "bj_bet_start") {
      const modal = new ModalBuilder().setCustomId("modal_bj_start").setTitle("🃏 Blackjack Bahis Girişi");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Masaya Koyulacak Bahis (Min 100)").setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    // INTERAKTIF BLACKJACK OYUN İÇİ BUTON KONTROLLERİ (HIT & STAND)
    if (interaction.customId === "bj_hit" || interaction.customId === "bj_stand") {
      const game = activeBlackjack.get(userId);
      if (!game) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Oyun Zaman Aşımı").setDescription("Aktif oyun bulunamadı.")], components: [backButtonRow] });

      if (interaction.customId === "bj_hit") {
        game.playerHand.push(drawCard());
        const pScore = calculateHand(game.playerHand);

        if (pScore > 21) { // BUST! Oyuncu direkt kaybetti
          await addCoins(userId, -game.bet);
          activeBlackjack.delete(userId);
          const embed = new EmbedBuilder().setColor("#ED4245").setTitle("🃏 Blackjack: KAYBETTİNİZ (Bust!)")
            .setDescription(`**Kartlarınız:** ${game.playerHand.map(c => c.text).join(" ")} (${pScore})\n**Dağıtıcı:** ${game.dealerHand[0].text}\n\n21 sınırını geçtiniz! **-${formatCoins(game.bet)}** Jeton kaybettiniz.`);
          return interaction.update({ embeds: [embed], components: [backButtonRow] });
        }
      } else if (interaction.customId === "bj_stand") {
        // Oyuncu durdu, sıra dağıtıcıda. Dağıtıcı 17'ye ulaşana kadar kart çeker.
        let dScore = calculateHand(game.dealerHand);
        while (dScore < 17) {
          game.dealerHand.push(drawCard());
          dScore = calculateHand(game.dealerHand);
        }

        const pScore = calculateHand(game.playerHand);
        const embed = new EmbedBuilder().setTimestamp();

        if (dScore > 21 || pScore > dScore) { // Oyuncu kazandı
          await addCoins(userId, game.bet);
          embed.setColor("#57F287").setTitle("🃏 Blackjack: KAZANDINIZ!")
            .setDescription(`**Kartlarınız:** ${game.playerHand.map(c => c.text).join(" ")} (${pScore})\n**Dağıtıcı:** ${game.dealerHand.map(c => c.text).join(" ")} (${dScore})\n\nTebrikler, kasayı yendiniz! **+${formatCoins(game.bet)}** Jeton kazandınız.`);
        } else if (dScore > pScore) { // Dağıtıcı kazandı
          await addCoins(userId, -game.bet);
          embed.setColor("#ED4245").setTitle("🃏 Blackjack: KAYBETTİNİZ!")
            .setDescription(`**Kartlarınız:** ${game.playerHand.map(c => c.text).join(" ")} (${pScore})\n**Dağıtıcı:** ${game.dealerHand.map(c => c.text).join(" ")} (${dScore})\n\nKasa sizden daha yüksek yaptı! **-${formatCoins(game.bet)}** Jeton kaybettiniz.`);
        } else { // Beraberlik (Push)
          embed.setColor("#FEE75C").setTitle("🃏 Blackjack: BERABERE (Push)")
            .setDescription(`**Kartlarınız:** ${game.playerHand.map(c => c.text).join(" ")} (${pScore})\n**Dağıtıcı:** ${game.dealerHand.map(c => c.text).join(" ")} (${dScore})\n\nSkorlar eşit, bahsinizi geri aldınız.`);
        }
        activeBlackjack.delete(userId);
        return interaction.update({ embeds: [embed], components: [backButtonRow] });
      }

      // Hit sonrası oyun devam ediyorsa ekranı güncelle
      const pScore = calculateHand(game.playerHand);
      const embed = new EmbedBuilder().setColor("#5865F2").setTitle("🃏 Blackjack (21) Masası").setDescription("Kart çekmeye devam edecek misiniz yoksa kalacak mısınız?")
        .addFields(
          { name: "Sizin Eliniz", value: `${game.playerHand.map(c => c.text).join(" ")} (Skor: **${pScore}**)` },
          { name: "Kasa Eli", value: `${game.dealerHand[0].text} + [Gizli Kart]` },
          { name: "Ortadaki Bahis", value: `💰 ${formatCoins(game.bet)} Jeton` }
        );
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bj_hit").setLabel("🃏 Kart Çek (Hit)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("bj_stand").setLabel("🛑 Dur (Stand)").setStyle(ButtonStyle.Danger)
      );
      return interaction.update({ embeds: [embed], components: [actionRow] });
    }

    // SHOP & INVENTORY BUTON DESTEKLERİ
    if (interaction.customId === "shop_menu") {
      const embed = new EmbedBuilder().setColor("#5865F2").setTitle("🛒 Ekipman Pazarı").setDescription("Satın alınan ekipmanlar meslek gruplarından kazandığınız parayı ve tecrübeyi arttırır.");
      const options = [];
      for (const [id, item] of Object.entries(ITEMS)) {
        embed.addFields({ name: `${item.name} | fiyati: 💰 ${formatCoins(item.price)}`, value: item.desc });
        options.push({ label: item.name.split(" ").slice(1).join(" "), description: `${formatCoins(item.price)} Jeton`, value: id });
      }
      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("shop_buy_select").setPlaceholder("Satın almak için seçin...").addOptions(options)), backButtonRow] });
    }

    if (interaction.customId === "inv_menu") {
      const inv = await getInventory(userId);
      const user = await getUser(userId);
      const embed = new EmbedBuilder().setColor("#E67E22").setTitle("🎒 Sırt Çantam (Envanter)").setDescription(`Şu Anda Kuşanılan: **${user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok ❌"}**\n\nSahip Olduğunuz Eşyalar:`);
      const options = [];
      if (inv.length === 0) embed.setDescription("Çantanızda hiçbir ekipman yok.");
      else {
        inv.forEach(row => {
          const item = ITEMS[row.itemId];
          if (item) {
            embed.addFields({ name: item.name, value: `Miktar: ${row.quantity} adet | *${item.desc}*` });
            options.push({ label: item.name.split(" ").slice(1).join(" "), description: "Kuşanmak için tıkla", value: row.itemId });
          }
        });
      }
      const comp = [];
      if (options.length > 0) comp.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("inv_equip_select").setPlaceholder("Kuşanılacak eşyayı seçin...").addOptions(options)));
      comp.push(backButtonRow);
      return interaction.update({ embeds: [embed], components: comp });
    }

    // SANDBOX BUTON ETKİLEŞİMİ (MODALA ATAR)
    if (interaction.customId.startsWith("sb_edit_")) {
      const targetId = interaction.customId.replace("sb_edit_", "");
      const modal = new ModalBuilder().setCustomId(`modal_sb_set_${targetId}`).setTitle("🛠️ Sandbox Bakiye Editörü");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("new_coin_amount").setLabel("Yeni Jeton Değerini Belirleyin").setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }
  }

  // ==========================================
  // 2. SEÇİM MENÜLERİ MOTORU
  // ==========================================
  if (interaction.isStringSelectMenu()) {
    // KUMAR LOBİ SEÇİMLERİ YÖNLENDİRMESİ
    if (interaction.customId === "gamble_select") {
      const choice = interaction.values[0];

      if (choice === "cf_lobby") {
        const embed = new EmbedBuilder().setColor("#FEE75C").setTitle("🪙 Coinflip (Yazı Tura) Alanı").setDescription("Lütfen oynamak istediğiniz tarafı seçin; ardından bahis penceresi açılacaktır.");
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("cf_yazi").setLabel("🪙 Yazı Seç").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("cf_tura").setLabel("🦅 Tura Seç").setStyle(ButtonStyle.Success));
        return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
      }
      if (choice === "slots_lobby") {
        const embed = new EmbedBuilder().setColor("#FEE75C").setTitle("🍒 Slot Makinesi Odası").setDescription("Şans kolunu çevirmek için aşağıdaki butonu kullanın.");
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("slots_spin_btn").setLabel("🎰 Bahis Gir ve Kolu Çevir").setStyle(ButtonStyle.Danger));
        return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
      }
      if (choice === "roulette_lobby") {
        const embed = new EmbedBuilder().setColor("#FEE75C").setTitle("🎡 Rulet Masası").setDescription("Bahis yapmak istediğiniz Rengi/Sayıyı seçin:\n\n🔴 **Kırmızı (Red):** 2 Kat Ödül\n⚫ **Siyah (Black):** 2 Kat Ödül\n🟢 **Yeşil (Green - 0):** 14 Kat Devasa Ödül!");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("rl_red").setLabel("🔴 Kırmızı").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("rl_black").setLabel("⚫ Siyah").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("rl_green").setLabel("🟢 Yeşil (0)").setStyle(ButtonStyle.Success)
        );
        return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
      }
      if (choice === "bj_lobby") {
        const embed = new EmbedBuilder().setColor("#FEE75C").setTitle("🃏 Blackjack (21) Masası").setDescription("Krupiyeye karşı oynamak ve taktiğini konuşturmak için masaya otur ve bahsini gir!");
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_bet_start").setLabel("🃏 Bahis Koy ve Oyunu Başlat").setStyle(ButtonStyle.Primary));
        return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
      }
    }

    if (interaction.customId === "shop_buy_select") {
      const itemId = interaction.values[0]; const item = ITEMS[itemId]; const user = await getUser(userId);
      if (user.coins < item.price) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Bakiye").setDescription(`Gerekli: **${formatCoins(item.price)}** | Sizde olan: **${formatCoins(user.coins)}**`)], components: [backButtonRow] });
      await addCoins(userId, -item.price); await addItem(userId, itemId);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("🎉 Başarılı Alışveriş").setDescription(`**${item.name}** çantanıza eklendi. Aktif etmek için envanterden kuşanın.`)], components: [backButtonRow] });
    }

    if (interaction.customId === "inv_equip_select") {
      const itemId = interaction.values[0]; await setEquipItem(userId, itemId);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("⚔️ Ekipman Değiştirildi").setDescription(`Başarıyla **${ITEMS[itemId].name}** kuşanıldı ve pasif gelir desteği aktif edildi!`)], components: [backButtonRow] });
    }
  }

  // SANDBOX KULLANICI SEÇİM ALANI
  if (interaction.isUserSelectMenu() && interaction.customId === "sandbox_user_select") {
    const target = interaction.values[0]; await ensureUser(target);
    const tUser = await getUser(target);
    const embed = new EmbedBuilder().setColor("#ED4245").setTitle("🛠️ Sandbox Üye Bilgisi Görüntüleme")
      .setDescription(`Kullanıcı: <@${target}>\nID: \`${target}\`\n\n💵 Güncel Hesap Bakiyesi: **${formatCoins(tUser.coins)} Jeton**`);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sb_edit_${target}`).setLabel("✍️ Yeni Bakiye Tanımla").setStyle(ButtonStyle.Danger));
    return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
  }

  // ==========================================
  // 3. SEÇİM MODALLARI (MATEMATİK VE KUMAR SONUÇLARI)
  // ==========================================
  if (interaction.isModalSubmit()) {
    // YÖNETİCİ SANDBOX PARAYI SET ETME MODALİ
    if (interaction.customId.startsWith("modal_sb_set_")) {
      const targetId = interaction.customId.replace("modal_sb_set_", "");
      const amt = parseInt(interaction.fields.getTextInputValue("new_coin_amount"));
      if (isNaN(amt) || amt < 0) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Geçersiz Girdi").setDescription("Lütfen pozitif tam sayı yazın.")], components: [backButtonRow] });
      await setCoins(targetId, amt);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("🛠️ İşlem Tamamlandı").setDescription(`<@${targetId}> adlı kişinin hesabı zorunlu olarak **${formatCoins(amt)}** jeton yapıldı.`)], components: [backButtonRow] });
    }

    // KUMAR MİKTAR KONTROL VE FİLTRE MOTORU
    const user = await getUser(userId);
    const bet = parseInt(interaction.fields.getTextInputValue("bet_amount"));

    if (isNaN(bet) || bet < 100) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Geçersiz Bahis").setDescription("Girdiğiniz değer hatalı veya 100 jetonluk alt limitten az.")], components: [backButtonRow] });
    if (user.coins < bet) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Cüzdan Boş").setDescription(`Yetersiz bakiye. Maksimum bahis limitiniz: **${formatCoins(user.coins)}**`)], components: [backButtonRow] });

    const embed = new EmbedBuilder().setTimestamp();

    // KUMAR HESAP: COINFLIP
    if (interaction.customId.startsWith("modal_cf_")) {
      const chosen = interaction.customId.endsWith("cf_yazi") ? "Yazı" : "Tura";
      const rand = Math.random() < 0.5 ? "Yazı" : "Tura";

      if (chosen === rand) {
        await addCoins(userId, bet);
        embed.setColor("#57F287").setTitle("🪙 Coinflip: KAZANDINIZ!").setDescription(`Tahmin: **${chosen}** | Gelen: **${rand}**\n\nHesabınıza **+${formatCoins(bet)}** jeton eklendi.`);
      } else {
        await addCoins(userId, -bet);
        embed.setColor("#ED4245").setTitle("🪙 Coinflip: KAYBETTİNİZ!").setDescription(`Tahmin: **${chosen}** | Gelen: **${rand}**\n\nHesabınızdan **-${formatCoins(bet)}** jeton düştü.`);
      }
    }

    // KUMAR HESAP: SLOTS
    if (interaction.customId === "modal_slots_spin") {
      const symbols = ["🍎", "🍋", "🍒", "💎"];
      const s1 = symbols[Math.floor(Math.random() * symbols.length)];
      const s2 = symbols[Math.floor(Math.random() * symbols.length)];
      const s3 = symbols[Math.floor(Math.random() * symbols.length)];
      const line = `┃  ${s1}  ┃  ${s2}  ┃  ${s3}  ┃`;

      if (s1 === s2 && s2 === s3) {
        const prize = bet * 3; await addCoins(userId, prize);
        embed.setColor("#57F287").setTitle("🍒 Slot: BÜYÜK JACKPOT!").setDescription(`### ${line}\n\nTüm simgeler tam eşleşti! Bahsin 3 katını kazandınız: **+${formatCoins(prize)}**`);
      } else if (s1 === s2 || s1 === s3 || s2 === s3) {
        const prize = Math.floor(bet * 0.5); await addCoins(userId, prize);
        embed.setColor("#57F287").setTitle("🍒 Slot: Kazandınız").setDescription(`### ${line}\n\nİki simge yan yana geldi! Yarım bahis kâr elde ettiniz: **+${formatCoins(prize)}**`);
      } else {
        await addCoins(userId, -bet);
        embed.setColor("#ED4245").setTitle("🍒 Slot: Şanssız Gün").setDescription(`### ${line}\n\nHiçbir meyve tutmadı! Bahis kaybedildi: **-${formatCoins(bet)}**`);
      }
    }

    // KUMAR HESAP: RULET
    if (interaction.customId.startsWith("modal_rl_")) {
      const chosenColor = interaction.customId.replace("modal_rl_", ""); // red, black, green
      const colors = ["red", "black", "red", "black", "red", "black", "green"]; // Basit rulet çarkı olasılığı (Green düşüktür)
      const rolledColor = colors[Math.floor(Math.random() * colors.length)];
      const colorEmojis = { red: "🔴 Kırmızı", black: "⚫ Siyah", green: "🟢 Yeşil (0)" };

      if (chosenColor === rolledColor) {
        let winMultiplier = chosenColor === "green" ? 14 : 1; 
        let winAmount = bet * winMultiplier;
        await addCoins(userId, winAmount);
        embed.setColor("#57F287").setTitle("🎡 Rulet: KAZANDINIZ!")
          .setDescription(`Oynanan: **${colorEmojis[chosenColor]}** | Gelen: **${colorEmojis[rolledColor]}**\n\nTebrikler! Masadan **+${formatCoins(winAmount)} Jeton** ile ayrılıyorsunuz.`);
      } else {
        await addCoins(userId, -bet);
        embed.setColor("#ED4245").setTitle("🎡 Rulet: KAYBETTİNİZ!")
          .setDescription(`Oynanan: **${colorEmojis[chosenColor]}** | Gelen: **${colorEmojis[rolledColor]}**\n\nRenk eşleşmedi, masadaki **-${formatCoins(bet)} Jeton** kasaya kaldı.`);
      }
    }

    // KUMAR HESAP: BLACKJACK OYUN BAŞLANGICI
    if (interaction.customId === "modal_bj_start") {
      const pHand = [drawCard(), drawCard()];
      const dHand = [drawCard(), drawCard()];
      const pScore = calculateHand(pHand);

      // Bellek durumunu oluştur
      activeBlackjack.set(userId, { bet, playerHand: pHand, dealerHand: dHand });

      embed.setColor("#5865F2").setTitle("🃏 Blackjack Masası Açıldı").setDescription("Kartlarınız dağıtıldı. Lütfen aşağıdaki butonları kullanarak hamlenizi yapın.")
        .addFields(
          { name: "Sizin Eliniz", value: `${pHand.map(c => c.text).join(" ")} (Skor: **${pScore}**)` },
          { name: "Kasa Eli (Açık Kart)", value: `${dHand[0].text} + [Gizli Kart]` },
          { name: "Masadaki Bahis", value: `💰 ${formatCoins(bet)} Jeton` }
        );

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bj_hit").setLabel("🃏 Kart Çek (Hit)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("bj_stand").setLabel("🛑 Dur (Stand)").setStyle(ButtonStyle.Danger)
      );
      return interaction.update({ embeds: [embed], components: [actionRow] });
    }

    // Ortak bakiye yazdırma alanı (Tüm modal sonuçları için geçerli)
    const updatedUser = await getUser(userId);
    embed.addFields({ name: "Güncel Cüzdan Durumu", value: `💰 **${formatCoins(updatedUser.coins)}** Jeton` });
    return interaction.update({ embeds: [embed], components: [backButtonRow] });
  }
});

client.login(process.env.DISCORD_TOKEN);
