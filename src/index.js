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

const activeBlackjack = new Map();
const activeWhispers = new Map(); 
// Çekiliş verilerini hafızada yönetmek için yeni Map'ler
const activeGiveaways = new Map();

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
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

// --- RPG MARKET AYARLARI ---
const ITEMS = {
  rifle: { name: "🏹 Gelişmiş Av Tüfeği", price: 600, desc: "Avların kaçış şansını %15 azaltır.", type: "hunt" },
  pickaxe: { name: "⛏️ Saf Altın Kazma", price: 1000, desc: "Çalışma ödüllerini %50 artırır.", type: "work" }
};

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

function formatCoins(amount) {
  if (amount >= 1000000 && amount % 1000 === 0) return `${amount / 1000000}M`;
  if (amount >= 1000 && amount % 1000 === 0) return `${amount / 1000}K`;
  return amount.toLocaleString("en-US");
}

function getRequiredXp(level) {
  return level * 350;
}

// --- FISILTI PANELİ YARDIMCILARI ---
function buildBridgeEmbed(logs, targetId) {
  const logText = logs.length > 0 ? logs.join("\n") : "*Henüz bir mesaj geçmişi yok...*";
  return new EmbedBuilder()
    .setColor("#9B59B6")
    .setTitle("🤫 Canlı Anonim Fısıltı Paneli")
    .setDescription(`**Hedef Kullanıcı:** <@${targetId}>\n\n**💬 Sohbet Geçmişi:**\n${logText}`)
    .setFooter({ text: "Bu paneli sadece siz görebilirsiniz. Sürekli etkileşimde token yenilenir." })
    .setTimestamp();
}

function buildBridgeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("wh_bridge_reply").setLabel("✍️ Mesaj Gönder").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("wh_bridge_close").setLabel("🔒 Odayı Kapat").setStyle(ButtonStyle.Danger)
  );
}

function buildBridgeFormatRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("wh_bridge_fmt_normal").setLabel("📝 Normal Yazı").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("wh_bridge_fmt_embed").setLabel("🖼️ Embed Mesaj").setStyle(ButtonStyle.Success)
  );
}

// --- ÇEKİLİŞ BİTİRME MOTORU (YENİ) ---
async function endGiveaway(giveawayId, forcedClient = null) {
  const gw = activeGiveaways.get(giveawayId);
  if (!gw || gw.ended) return;
  gw.ended = true;
  if (gw.timeout) clearTimeout(gw.timeout);

  const activeClient = forcedClient || client;
  const channel = await activeClient.channels.fetch(gw.channelId).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
  const participants = Array.from(gw.participants);

  if (participants.length === 0) {
    if (msg) {
      const emptyEmbed = EmbedBuilder.from(msg.embeds[0])
        .setColor("#ED4245")
        .setDescription(`❌ **Çekiliş Süresi Doldu!**\n\n**Katılım Yetersiz:** Çekilişe hiç kimse katılmadığı için kazanan belirlenemedi.`)
        .setFields([]);
      await msg.edit({ embeds: [emptyEmbed], components: [] }).catch(() => null);
    }
    activeGiveaways.delete(giveawayId);
    return;
  }

  const winnersCount = Math.min(gw.winnersCount, participants.length);
  const winners = [];
  
  for (let i = 0; i < winnersCount; i++) {
    const randIdx = Math.floor(Math.random() * participants.length);
    winners.push(participants.splice(randIdx, 1)[0]);
  }

  gw.lastWinners = winners; // Reroll için kazananları sakla

  if (msg) {
    const endEmbed = EmbedBuilder.from(msg.embeds[0])
      .setColor("#2B2D31")
      .setDescription(`🎉 **Çekiliş Sonuçlandı!**\n\n🎁 **Ödül:** ${gw.prize}\n👑 **Kazananlar:** ${winners.map(w => `<@${w}>`).join(", ")}\n👥 **Toplam Katılım:** \`${gw.participants.size}\``)
      .setFields([]);
    
    // Sadece yetkililerin tetikleyebileceği Reroll (Yeniden Döndür) butonu ekleniyor
    const rerollRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gw_reroll_${giveawayId}`).setLabel("🔁 Yeniden Döndür (Reroll)").setStyle(ButtonStyle.Secondary)
    );
    await msg.edit({ embeds: [endEmbed], components: [rerollRow] }).catch(() => null);
    await msg.reply({ content: `🎉 Tebrikler ${winners.map(w => `<@${w}>`).join(", ")}, **${gw.prize}** kazandınız!` }).catch(() => null);
  }
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
    new ButtonBuilder().setCustomId("nav_general").setLabel("⚙️ Genel / Moderasyon").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("nav_sandbox").setLabel("🛠️ Sandbox Modu").setStyle(ButtonStyle.Danger)
  )];
}

const backButtonRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("back_to_main").setLabel("⬅️ Ana Menüye Dön").setStyle(ButtonStyle.Secondary)
);

// --- SLASH KOMUT KAYIT MOTORU ---
client.on("ready", async () => {
  console.log(`🤖 Bot ${client.user.tag} olarak başarıyla başlatıldı!`);
  try {
    await client.application.commands.set([
      {
        name: "menu",
        description: "Devasa RPG, Eğlence ve Moderasyon istasyonunu açar."
      }
    ]);
    console.log("✅ Slash komutları Discord API'sine başarıyla senkronize edildi.");
  } catch (error) {
    console.error("❌ Slash komutları kaydedilirken hata oluştu:", error);
  }
});

// --- MESAJ YAKALAYICI ---
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  if (msg.channel.isThread() && activeWhispers.has(msg.channel.id)) {
    const bridge = activeWhispers.get(msg.channel.id);
    if (msg.author.id === bridge.targetId) {
      bridge.logs.push(`👤 **Karşı Taraf:** ${msg.content}`);
      if (bridge.lastInteraction) {
        await bridge.lastInteraction.editReply({
          embeds: [buildBridgeEmbed(bridge.logs, bridge.targetId)],
          components: [buildBridgeButtons()]
        }).catch(() => null);
      }
    }
    return;
  }

  if (msg.content === "!menu") {
    await ensureUser(msg.author.id);
    return msg.reply({ embeds: [await getMainMenuEmbed(msg.author.id)], components: getMainMenuComponents() });
  }
});

// --- ANA ETKİLEŞİM MOTORU ---
client.on("interactionCreate", async interaction => {
  const userId = interaction.user.id;
  await ensureUser(userId);

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "menu") {
      return interaction.reply({ embeds: [await getMainMenuEmbed(userId)], components: getMainMenuComponents() });
    }
  }

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

    // 🏹 AVCILIK LOBİSİ
    if (interaction.customId === "hunt_menu_nav") {
      const user = await getUser(userId);
      const embed = new EmbedBuilder().setColor("#57F287").setTitle("🏹 Avcılık ve İz Sürücülük Ormanı")
        .setDescription("Avlamak istediğiniz hayvanı alttaki listenen seçin. Nadir hayvanların kaçma olasılığı yüksektir.\n\n🎒 **Avcı İpucu:** Eğer marketten **Gelişmiş Av Tüfeği** kuşanırsanız avların kaçma ihtimali **%15 azalır**!");

      const options = Object.entries(ANIMALS).map(([id, animal]) => ({
        label: `${animal.name} (Svy. ${animal.reqLv})`,
        description: `Kaçış Riski: %${Math.floor(animal.escapeChance * 100)} | Ham Değeri: ${formatCoins(animal.rawPrice)}`,
        value: id
      }));

      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("hunt_animal_select").setPlaceholder("Avlanacak bir hedef seçin...").addOptions(options)), backButtonRow] });
    }

    // 🥩 AV İŞLEME EVİ PANELİ
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

    // AV İŞLEME AKSİYONLARI
    if (interaction.customId.startsWith("hhact_")) {
      const parts = interaction.customId.split("_"); const action = parts[1]; const prefix = parts[2]; const baseId = parts[3]; const itemId = `${prefix}_${baseId}`; const animal = ANIMALS[baseId];
      const inv = await getInventory(userId); const matched = inv.find(r => r.itemId === itemId); const qty = matched ? matched.quantity : 0;
      if (qty <= 0) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Stok")], components: [backButtonRow] });
      const embed = new EmbedBuilder().setTimestamp();

      if (action === "sell") {
        const price = prefix === "raw" ? animal.rawPrice : animal.processedPrice; await removeItem(userId, itemId, 1); await addCoins(userId, price);
        embed.setColor("#57F287").setTitle("💰 Ticaret Başarılı").setDescription(`1 adet **${prefix === "raw" ? `Çiğ ${animal.name}` : animal.processedName}** satıldı!\n\n💵 Kazanç: **+${formatCoins(price)}** Jeton.`);
      } else if (action === "eat") {
        const xpReward = prefix === "raw" ? animal.rawXp : animal.processedXp; await removeItem(userId, itemId, 1); const xpRes = await addXp(userId, xpReward);
        embed.setColor("#5865F2").setTitle("🍖 Afiyet Olsun!").setDescription(`1 adet **${prefix === "raw" ? `Çiğ ${animal.name}` : animal.processedName}** yediniz.\n\n✨ **+${xpReward} XP** kazandınız.${xpRes.leveledUp ? `\n\n🎉 **Seviye Atladınız! Yeni Seviye: ${xpRes.level}**` : ""}`);
      } else if (action === "proc") {
        await removeItem(userId, itemId, 1); await addItem(userId, `proc_${baseId}`);
        embed.setColor("#E67E22").setTitle("🍳 Dönüştürme Başarılı").setDescription(`1 adet **Çiğ ${animal.name}** işlendi ve **${animal.processedName}** üretildi!`);
      }
      const updatedUser = await getUser(userId); embed.addFields({ name: "Mevcut Durum", value: `💰 Cüzdan: **${formatCoins(updatedUser.coins)}** | 🌟 Seviye: **${updatedUser.level}**` });
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // TEMEL MESLEKLER
    if (interaction.customId === "work" || interaction.customId === "beg") {
      const isWork = interaction.customId === "work"; const min = isWork ? 100 : 5, max = isWork ? 400 : 50;
      let user = await getUser(userId); let reward = Math.floor(Math.random() * (max - min + 1)) + min;
      let multiplier = 1 + ((user.level - 1) * 0.1); if (isWork && user.equipped_item === "pickaxe") multiplier += 0.5;
      reward = Math.floor(reward * multiplier); await addCoins(userId, reward); const xpRes = await addXp(userId, isWork ? 60 : 15); const updatedUser = await getUser(userId);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle(isWork ? "💼 Mesai Yapıldı" : "🙏 Dilendiniz").setDescription(`**+${formatCoins(reward)}** Jeton kazandınız! \n✨ **+${isWork ? 60 : 15} XP** elde edildi. ${xpRes.leveledUp ? `\n\n🎉 **Seviye Atladınız! Yeni Seviye: ${xpRes.level}**` : ""}`).addFields({ name: "Güncel Bakiye", value: `💰 **${formatCoins(updatedUser.coins)}** Jeton` })], components: [backButtonRow] });
    }

    // --- MODERASYON & GENEL PANELİ ---
    if (interaction.customId === "nav_general") {
      const embed = new EmbedBuilder().setColor("#5865F2").setTitle("⚙️ Genel Yönetim ve Moderasyon Paneli")
        .setDescription("Sunucu istatistiklerini kontrol edin, moderasyon eylemlerini gerçekleştirin veya topluluk çekilişleri düzenleyin.");

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("gen_server").setLabel("📊 Sunucu").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("gen_user").setLabel("👤 Profil").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("gen_ping").setLabel("🏓 Ping").setStyle(ButtonStyle.Secondary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("mod_purge_btn").setLabel("🧹 Mesaj Sil").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("mod_lock_btn").setLabel("🔒 Kanalı Kilitle").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("mod_unlock_btn").setLabel("🔓 Kilidi Aç").setStyle(ButtonStyle.Success)
      );
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("mod_kick_btn").setLabel("🥾 Üye At (Kick)").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("mod_ban_btn").setLabel("🔨 Üye Yasakla (Ban)").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("mod_say_nav").setLabel("✍️ Mesaj Yazdır").setStyle(ButtonStyle.Primary)
      );
      const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("mod_timeout_btn").setLabel("⏳ Sürgün (Timeout)").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("mod_whisper_btn").setLabel("🤫 Fısıltı Odası").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("mod_giveaway_nav").setLabel("🎉 Çekiliş Düzenle").setStyle(ButtonStyle.Success) // ÇEKİLİŞ NAVİGASYON
      );

      return interaction.update({ embeds: [embed], components: [row1, row2, row3, row4, backButtonRow] });
    }

    // --- 🎉 ÇEKİLİŞ TETİKLEYİCİLERİ VE YÖNETİM BUTONLARI (YENİ) ---
    if (interaction.customId === "mod_giveaway_nav") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Çekiliş düzenlemek için **Etkinlikleri Yönet** veya **Yönetici** yetkiniz olmalıdır.", ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId("modal_giveaway_setup").setTitle("🎉 Çekiliş Kurulum Sihirbazı");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("gw_prize").setLabel("Hediye/Ödül Nedir?").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("gw_winners").setLabel("Kaç Kazanan Olacak? (Örn: 1)").setStyle(TextInputStyle.Short).setValue("1").setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("gw_date").setLabel("Bitiş Günü ve Ayı (Örn: 24/06)").setStyle(TextInputStyle.Short).setPlaceholder("GG/AA formatında girin").setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("gw_time").setLabel("Bitiş Saati ve Dakikası (Örn: 21:30)").setStyle(TextInputStyle.Short).setPlaceholder("SS:DD formatında girin").setRequired(true))
      );
      return interaction.showModal(modal);
    }

    // Çekilişe Katılma Butonu
    if (interaction.customId.startsWith("gw_join_")) {
      const giveawayId = interaction.customId.replace("gw_join_", "");
      const gw = activeGiveaways.get(giveawayId);
      if (!gw || gw.ended) return interaction.reply({ content: "❌ Bu çekiliş süresi dolmuş veya iptal edilmiş.", ephemeral: true });

      if (gw.participants.has(userId)) {
        gw.participants.delete(userId);
        interaction.reply({ content: "↩️ Çekilişten katılımınızı geri çektiniz.", ephemeral: true });
      } else {
        gw.participants.add(userId);
        interaction.reply({ content: "✅ Çekilişe başarıyla katıldınız! Şansınız bol olsun.", ephemeral: true });
      }

      // Ana embed katılım sayısını canlı güncelle
      const channel = await client.channels.fetch(gw.channelId).catch(() => null);
      if (channel) {
        const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
        if (msg && msg.embeds[0]) {
          const updatedEmbed = EmbedBuilder.from(msg.embeds[0]).setFields([{ name: "👥 Katılımcı Sayısı", value: `\`${gw.participants.size}\` Üye`, inline: true }]);
          await msg.edit({ embeds: [updatedEmbed] }).catch(() => null);
        }
      }
      return;
    }

    // Ephemeral Panel: Çekiliş İptal Etme
    if (interaction.customId.startsWith("gw_ctrl_cancel_")) {
      const giveawayId = interaction.customId.replace("gw_ctrl_cancel_", "");
      const gw = activeGiveaways.get(giveawayId);
      if (!gw) return interaction.reply({ content: "❌ Çekiliş zaten bulunamadı.", ephemeral: true });

      if (gw.timeout) clearTimeout(gw.timeout);
      
      const channel = await client.channels.fetch(gw.channelId).catch(() => null);
      if (channel) {
        const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
        if (msg) {
          const cancelEmbed = EmbedBuilder.from(msg.embeds[0]).setColor("#ED4245").setDescription("🛑 **Bu çekiliş yetkili tarafından iptal edilmiştir.**").setFields([]);
          await msg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => null);
        }
      }

      activeGiveaways.delete(giveawayId);
      return interaction.update({ content: "🛑 Çekiliş tamamen iptal edildi ve ana mesaj kapatıldı.", embeds: [], components: [] });
    }

    // Ephemeral Panel: Çekilişi Anında Bitir
    if (interaction.customId.startsWith("gw_ctrl_force_")) {
      const giveawayId = interaction.customId.replace("gw_ctrl_force_", "");
      const gw = activeGiveaways.get(giveawayId);
      if (!gw || gw.ended) return interaction.reply({ content: "❌ Çekiliş zaten bitmiş veya bulunamadı.", ephemeral: true });

      await endGiveaway(giveawayId);
      return interaction.update({ content: "⚡ Çekiliş süresi beklenmeden anında sonlandırıldı!", embeds: [], components: [] });
    }

    // Yeniden Döndürme (Reroll) Butonu Eylemi
    if (interaction.customId.startsWith("gw_reroll_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Reroll yapmak için **Etkinlikleri Yönet** yetkiniz olmalıdır.", ephemeral: true });
      }
      const giveawayId = interaction.customId.replace("gw_reroll_", "");
      const gw = activeGiveaways.get(giveawayId);
      if (!gw) return interaction.reply({ content: "❌ Bu çekilişin verilerine ulaşılamadı (Bot yeniden başlamış olabilir).", ephemeral: true });

      const participants = Array.from(gw.participants);
      if (participants.length === 0) return interaction.reply({ content: "❌ Çekilişe kimse katılmadığı için yeniden döndürülemez.", ephemeral: true });

      const newWinner = participants[Math.floor(Math.random() * participants.length)];
      await interaction.reply({ content: `🔁 **Yeniden Döndürme Başarılı!**\n🎁 Yeni Şanslı Talihli: <@${newWinner}>! Tebrikler!` });
      return;
    }

    // FISILTI SİSTEMİ BUTONLARI
    if (interaction.customId === "wh_bridge_reply") {
      const bridge = activeWhispers.get(userId);
      if (!bridge) return interaction.reply({ content: "❌ Aktif fısıltı odası bulunamadı.", ephemeral: true });
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🤫 Gönderim Formatı Seçin").setDescription("Göndereceğiniz yeni mesajın biçimini belirleyin:")], components: [buildBridgeFormatRow()] });
    }
    if (interaction.customId.startsWith("wh_bridge_fmt_")) {
      const type = interaction.customId.replace("wh_bridge_fmt_", "");
      const modal = new ModalBuilder().setCustomId(`modal_wh_reply_submit_${type}`).setTitle(type === "normal" ? "Normal Yazı Yanıtı" : "Embed Formatında Yanıt");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("whisper_reply_msg").setLabel("Fısıltı Cevabınız").setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return interaction.showModal(modal);
    }
    if (interaction.customId === "wh_bridge_close") {
      const bridge = activeWhispers.get(userId); if (!bridge) return interaction.reply({ content: "❌ Aktif fısıltı odası bulunamadı.", ephemeral: true });
      const thread = await client.channels.fetch(bridge.threadId).catch(() => null);
      if (thread) { await thread.send({ content: "🔒 *Bu fısıltı odası yetkili tarafından kapatıldı.*" }).catch(() => null); await thread.setArchived(true).catch(() => null); }
      activeWhispers.delete(bridge.threadId); activeWhispers.delete(userId);
      return interaction.update({ content: "🔒 Fısıltı odası başarıyla kapatıldı.", embeds: [], components: [] });
    }
    if (interaction.customId.startsWith("whfmt_")) {
      const parts = interaction.customId.split("_"); const type = parts[1]; const targetId = parts[2];
      const modal = new ModalBuilder().setCustomId(`modal_wh_submit_${type}_${targetId}`).setTitle(type === "normal" ? "Normal Yazı Fısıltısı" : "Embed Formatında Fısıltı");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("whisper_msg").setLabel("Fısıltı Mesajı İçeriği").setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return interaction.showModal(modal);
    }

    // MODERASYON: PURGE / LOCKS
    if (interaction.customId === "mod_purge_btn") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      const modal = new ModalBuilder().setCustomId("modal_purge").setTitle("Mesaj Temizleme Paneli");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("purge_amount").setLabel("Silinecek Miktar (1 - 100)").setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }
    if (interaction.customId === "mod_lock_btn") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("🔒 Kanal Kilitlendi").setDescription(`Bu kanal <@${userId}> tarafından kapatıldı.`)], components: [backButtonRow] });
    }
    if (interaction.customId === "mod_unlock_btn") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("🔓 Kanal Kilidi Açıldı")], components: [backButtonRow] });
    }

    // KICK / BAN / TIMEOUT SEÇİMLERİ
    if (interaction.customId === "mod_kick_btn") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#E67E22").setTitle("🥾 Üye Atma")], components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("menu_kick_user")), backButtonRow] });
    }
    if (interaction.customId === "mod_ban_btn") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("🔨 Üye Yasaklama")], components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("menu_ban_user")), backButtonRow] });
    }
    if (interaction.customId === "mod_timeout_btn") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("⏳ Sürgün (Timeout)")], components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("menu_timeout_user")), backButtonRow] });
    }
    if (interaction.customId === "mod_whisper_btn") {
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🤫 Gizli Fısıltı Odası Kur")], components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("menu_whisper_user")), backButtonRow] });
    }
    if (interaction.customId === "mod_say_nav") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("✍️ Bot Ağzından Mesaj Yazdır")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("say_normal_btn").setLabel("📝 Normal Yazı").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("say_embed_btn").setLabel("🖼️ Embed Mesaj").setStyle(ButtonStyle.Success)), backButtonRow] });
    }

    if (interaction.customId === "say_normal_btn") {
      const modal = new ModalBuilder().setCustomId("modal_say_normal").setTitle("Normal Yazı Gönder");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("say_text").setLabel("Mesaj İçeriği").setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return interaction.showModal(modal);
    }
    if (interaction.customId === "say_embed_btn") {
      const modal = new ModalBuilder().setCustomId("modal_say_embed").setTitle("Embed Mesaj Oluştur");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("emb_title").setLabel("Başlık").setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("emb_desc").setLabel("Metin").setStyle(TextInputStyle.Paragraph).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("emb_color").setLabel("Hex Kodu").setStyle(TextInputStyle.Short).setValue("#5865F2")));
      return interaction.showModal(modal);
    }

    // STATS & SANDBOX & RPG DİĞER
    if (interaction.customId === "gen_server") return interaction.update({ embeds: [new EmbedBuilder().setColor("#5865F2").setTitle(`📊 Sunucu: ${interaction.guild.name}`).addFields({ name: "Toplam Üye", value: `${interaction.guild.memberCount}` })], components: [backButtonRow] });
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
      if (Math.random() < chance) { await addCoins(userId, prize); await addXp(userId, xp); return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("⚔️ Zafer!").setDescription(`**+${formatCoins(prize)}** kazandınız.`)], components: [backButtonRow] }); }
      else { await addCoins(userId, -pen); return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("💀 Bozgun!").setDescription(`**-${formatCoins(pen)}** kaybettiniz.`)], components: [backButtonRow] }); }
    }
    if (interaction.customId === "gamble_menu") {
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#FEE75C").setTitle("🎰 Kumar Odası")], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("gamble_select").setPlaceholder("Oyun seçin...").addOptions([{ label: "Yazı Tura", value: "cf_lobby" }, { label: "Slot", value: "slots_lobby" }, { label: "Rulet", value: "roulette_lobby" }, { label: "Blackjack", value: "bj_lobby" }])), backButtonRow] });
    }
    if (interaction.customId === "cf_yazi" || interaction.customId === "cf_tura") {
      const modal = new ModalBuilder().setCustomId(`modal_cf_${interaction.customId}`).setTitle("Bahis Girişi"); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Gir").setStyle(TextInputStyle.Short))); return interaction.showModal(modal);
    }
    if (interaction.customId === "slots_spin_btn") {
      const modal = new ModalBuilder().setCustomId("modal_slots_spin").setTitle("Bahis Girişi"); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Gir").setStyle(TextInputStyle.Short))); return interaction.showModal(modal);
    }
    if (interaction.customId.startsWith("rl_")) {
      const modal = new ModalBuilder().setCustomId(`modal_rl_${interaction.customId.split("_")[1]}`).setTitle("Bahis Girişi"); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Gir").setStyle(TextInputStyle.Short))); return interaction.showModal(modal);
    }
    if (interaction.customId === "bj_bet_start") {
      const modal = new ModalBuilder().setCustomId("modal_bj_start").setTitle("Bahis Girişi"); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Gir").setStyle(TextInputStyle.Short))); return interaction.showModal(modal);
    }
    if (interaction.customId === "bj_hit" || interaction.customId === "bj_stand") {
      const game = activeBlackjack.get(userId); if (!game) return interaction.update({ embeds: [new EmbedBuilder().setTitle("Oyun Yok")], components: [backButtonRow] });
      if (interaction.customId === "bj_hit") {
        game.playerHand.push(drawCard()); const ps = calculateHand(game.playerHand);
        if (ps > 21) { await addCoins(userId, -game.bet); activeBlackjack.delete(userId); return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("KAYBETTİNİZ (Bust)").setDescription(`Skor: ${ps}`)], components: [backButtonRow] }); }
      } else {
        let ds = calculateHand(game.dealerHand); while (ds < 17) { game.dealerHand.push(drawCard()); ds = calculateHand(game.dealerHand); }
        const ps = calculateHand(game.playerHand); const em = new EmbedBuilder();
        if (ds > 21 || ps > ds) { await addCoins(userId, game.bet); em.setColor("#57F287").setTitle("KAZANDINIZ"); } else if (ds > ps) { await addCoins(userId, -game.bet); em.setColor("#ED4245").setTitle("KAYBETTİNİZ"); } else em.setColor("#FEE75C").setTitle("BERABERE");
        activeBlackjack.delete(userId); return interaction.update({ embeds: [em.setDescription(`Siz: ${ps} | Kasa: ${ds}`)], components: [backButtonRow] });
      }
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("Blackjack").setDescription(`Siz: ${calculateHand(game.playerHand)}`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_hit").setLabel("Kart Çek").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("bj_stand").setLabel("Dur").setStyle(ButtonStyle.Danger))] });
    }
    if (interaction.customId === "daily") {
      const user = await getUser(userId); const cooldown = 86400000; const now = Date.now();
      if (now - user.last_daily < cooldown) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("⏱️ Bekleme Süresi").setDescription(`Tekrar almak için **${Math.floor((cooldown - (now - user.last_daily)) / 3600000)} saat** beklemelisiniz.`)], components: [backButtonRow] });
      const dailyReward = 500 + (user.level * 150); await addCoins(userId, dailyReward); await updateDailyTimestamp(userId, now);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("📅 Günlük Ödül").setDescription(`Giriş ödülü olarak **+${formatCoins(dailyReward)}** Jeton eklendi!`)], components: [backButtonRow] });
    }
    if (interaction.customId === "shop_menu") {
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("🛒 Market")], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("shop_buy_select").addOptions(Object.entries(ITEMS).map(([id, it]) => ({ label: it.name, description: `${it.price} Jeton`, value: id })))), backButtonRow] });
    }
    if (interaction.customId === "inv_menu") {
      const inv = await getInventory(userId); const u = await getUser(userId); const options = inv.filter(r => ITEMS[r.itemId]).map(r => ({ label: ITEMS[r.itemId].name, value: r.itemId }));
      const comps = []; if (options.length > 0) comps.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("inv_equip_select").addOptions(options))); comps.push(backButtonRow);
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("🎒 Envanter").setDescription(`Kuşanılan: ${u.equipped_item || "Yok"}`)], components: comps });
    }
    if (interaction.customId.startsWith("sb_edit_")) {
      const modal = new ModalBuilder().setCustomId(`modal_sb_set_${interaction.customId.replace("sb_edit_", "")}`).setTitle("Bakiye Ayarla"); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("new_coin_amount").setLabel("Miktar").setStyle(TextInputStyle.Short))); return interaction.showModal(modal);
    }
  }

  // --- STRING SELECT MENÜLERİ ---
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "hunt_animal_select") {
      const animalId = interaction.values[0]; const animal = ANIMALS[animalId]; const user = await getUser(userId);
      if (user.level < animal.reqLv) return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Seviye").setDescription(`Bu hayvanın izini sürmek için en az **Seviye ${animal.reqLv}** olmalısınız!`)], components: [backButtonRow] });
      let escapeChance = animal.escapeChance; if (user.equipped_item === "rifle") escapeChance = Math.max(0.05, escapeChance - 0.15);
      const isEscaped = Math.random() < escapeChance; const embed = new EmbedBuilder().setTimestamp();
      if (isEscaped) embed.setColor("#FEE75C").setTitle("💨 Av Elinizden Kaçtı!").setDescription(`**${animal.name}** son anda kaçtı!`);
      else { await addItem(userId, `raw_${animalId}`); await addXp(userId, animal.rawXp); embed.setColor("#57F287").setTitle("🎯 Av Başarılı!").setDescription(`**${animal.name}** yakaladınız!`); }
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }
    if (interaction.customId === "hh_item_select") {
      const itemId = interaction.values[0]; const isRaw = itemId.startsWith("raw_"); const baseId = itemId.replace("raw_", "").replace("proc_", ""); const animal = ANIMALS[baseId]; const inv = await getInventory(userId); const matched = inv.find(r => r.itemId === itemId); const qty = matched ? matched.quantity : 0;
      if (qty <= 0) return interaction.update({ embeds: [new EmbedBuilder().setTitle("Ürün Kalmamış")], components: [backButtonRow] });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`hhact_sell_${itemId}`).setLabel("💰 Sat").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`hhact_eat_${itemId}`).setLabel("🍖 Ye").setStyle(ButtonStyle.Primary)); if (isRaw) row.addComponents(new ButtonBuilder().setCustomId(`hhact_proc_${itemId}`).setLabel("🍳 İşle").setStyle(ButtonStyle.Danger));
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#3498DB").setTitle(`🎬 Ürün Yönetimi: ${isRaw ? `Çiğ ${animal.name}` : animal.processedName}`).setDescription(`Stok: **${qty}** adet.`).addFields({ name: "💰 Satış Fiyatı", value: `${formatCoins(isRaw ? animal.rawPrice : animal.processedPrice)} Jeton`, inline: true }, { name: "✨ Tüketim XP'si", value: `${isRaw ? animal.rawXp : animal.processedXp} XP`, inline: true })], components: [row, backButtonRow] });
    }
    if (interaction.customId === "gamble_select") {
      const choice = interaction.values[0];
      if (choice === "cf_lobby") return interaction.update({ embeds: [new EmbedBuilder().setTitle("Yazı Tura")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("cf_yazi").setLabel("Yazı").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("cf_tura").setLabel("Tura").setStyle(ButtonStyle.Success)), backButtonRow] });
      if (choice === "slots_lobby") return interaction.update({ embeds: [new EmbedBuilder().setTitle("Slot Makinesi")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("slots_spin_btn").setLabel("Çevir").setStyle(ButtonStyle.Danger)), backButtonRow] });
      if (choice === "roulette_lobby") return interaction.update({ embeds: [new EmbedBuilder().setTitle("Rulet")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("rl_red").setLabel("Kırmızı").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("rl_black").setLabel("Siyah").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("rl_green").setLabel("Yeşil").setStyle(ButtonStyle.Success)), backButtonRow] });
      if (choice === "bj_lobby") return interaction.update({ embeds: [new EmbedBuilder().setTitle("Blackjack (21)")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_bet_start").setLabel("Masaya Otur").setStyle(ButtonStyle.Primary)), backButtonRow] });
    }
    if (interaction.customId === "shop_buy_select") {
      const id = interaction.values[0]; const it = ITEMS[id]; const u = await getUser(userId); if (u.coins < it.price) return interaction.update({ embeds: [new EmbedBuilder().setTitle("Yetersiz Bakiye")], components: [backButtonRow] });
      await addCoins(userId, -it.price); await addItem(userId, id); return interaction.update({ embeds: [new EmbedBuilder().setTitle("Başarılı").setDescription(`${it.name} satın alındı.`)], components: [backButtonRow] });
    }
    if (interaction.customId === "inv_equip_select") {
      await setEquipItem(userId, interaction.values[0]); return interaction.update({ embeds: [new EmbedBuilder().setTitle("Kuşanıldı")], components: [backButtonRow] });
    }
  }

  // --- USER SELECT MENÜLERİ ---
  if (interaction.isUserSelectMenu()) {
    if (interaction.customId === "sandbox_user_select") {
      const target = interaction.values[0]; const tu = await getUser(target);
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("Sandbox").setDescription(`<@${target}> Parası: ${formatCoins(tu.coins)}`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sb_edit_${target}`).setLabel("Düzenle").setStyle(ButtonStyle.Danger)), backButtonRow] });
    }
    if (interaction.customId === "menu_whisper_user") {
      const targetId = interaction.values[0];
      return interaction.reply({ embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🖼️ Fısıltı Formatı Seçin").setDescription(`<@${targetId}> kullanıcısına açılacak fısıltı odasındaki ilk mesajın biçimini seçin:`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`whfmt_normal_${targetId}`).setLabel("📝 Normal Yazı").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`whfmt_embed_${targetId}`).setLabel("🖼️ Embed Mesaj").setStyle(ButtonStyle.Success))], ephemeral: true });
    }
    if (interaction.customId === "menu_kick_user") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
      const targetId = interaction.values[0]; const member = await interaction.guild.members.fetch(targetId).catch(() => null); if (!member || !member.kickable) return interaction.update({ embeds: [new EmbedBuilder().setTitle("❌ Başarısız")], components: [backButtonRow] });
      await member.kick(`Panel: ${interaction.user.tag}`); return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("🥾 Atıldı")], components: [backButtonRow] });
    }
    if (interaction.customId === "menu_ban_user") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: "Yetkiniz yok.", ephemeral: true });
      const targetId = interaction.values[0]; const member = await interaction.guild.members.fetch(targetId).catch(() => null); if (!member || !member.bannable) return interaction.update({ embeds: [new EmbedBuilder().setTitle("❌ Başarısız")], components: [backButtonRow] });
      await member.ban({ reason: `Panel: ${interaction.user.tag}` }); return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("🔨 Yasaklandı")], components: [backButtonRow] });
    }
    if (interaction.customId === "menu_timeout_user") {
      const targetId = interaction.values[0];
      return interaction.showModal(new ModalBuilder().setCustomId(`modal_timeout_submit_${targetId}`).setTitle("Sürgün Süresi").addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("timeout_time").setLabel("Süre (Dakika)").setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("timeout_reason").setLabel("Sebep").setStyle(TextInputStyle.Short).setValue("Kural İhlali"))));
    }
    if (interaction.customId === "menu_untimeout_user") {
      const targetId = interaction.values[0]; const member = await interaction.guild.members.fetch(targetId).catch(() => null); if (!member) return interaction.update({ embeds: [new EmbedBuilder().setTitle("❌ Bulunamadı")], components: [backButtonRow] });
      await member.timeout(null); return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("🔊 Sürgün Kaldırıldı")], components: [backButtonRow] });
    }
  }

  // --- MODAL SUBMIT (FORM MOTORU) ---
  if (interaction.isModalSubmit()) {

    // 🎉 ÇEKİLİŞ KURULUM FORM SUBMIT ALANI (YENİ)
    if (interaction.customId === "modal_giveaway_setup") {
      const prize = interaction.fields.getTextInputValue("gw_prize");
      const winnersCount = parseInt(interaction.fields.getTextInputValue("gw_winners")) || 1;
      const dateStr = interaction.fields.getTextInputValue("gw_date"); // Örn: 24/06
      const timeStr = interaction.fields.getTextInputValue("gw_time"); // Örn: 18:00

      try {
        const [day, month] = dateStr.split("/").map(Number);
        const [hour, minute] = timeStr.split(":").map(Number);
        const currentYear = new Date().getFullYear();

        // Girilen parametrelerle hedef tarih objesini inşa etme
        const targetDate = new Date(currentYear, month - 1, day, hour, minute, 0);
        const now = new Date();

        if (isNaN(targetDate.getTime()) || targetDate <= now) {
          return interaction.reply({ content: "❌ Hata: Geçersiz veya geçmiş bir tarih/saat girdiniz! Lütfen kontrol edin.", ephemeral: true });
        }

        const msRemaining = targetDate.getTime() - now.getTime();
        const timestampSeconds = Math.floor(targetDate.getTime() / 1000);
        const giveawayId = `gw_${Date.now()}`;

        // Herkesin görebileceği Katılım Embed Mesajı
        const giveawayEmbed = new EmbedBuilder()
          .setColor("#5865F2")
          .setTitle("🎉 ÇEKİLİŞ BAŞLADI 🎉")
          .setDescription(`🎁 **Ödül:** ${prize}\n👑 **Kazanan Sayısı:** \`${winnersCount}\` Talihli\n\n⏱️ **Kalan Zaman:** <t:${timestampSeconds}:R> (<t:${timestampSeconds}:F>)`)
          .setFields([{ name: "👥 Katılımcı Sayısı", value: "`0` Üye", inline: true }])
          .setFooter({ text: "Aşağıdaki butona basarak şansınızı deneyebilirsiniz!" })
          .setTimestamp();

        const joinRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`gw_join_${giveawayId}`).setLabel("🎉 Katıl / Ayrıl").setStyle(ButtonStyle.Primary)
        );

        // Kanala çekilişi yolla
        const publicMessage = await interaction.channel.send({ embeds: [giveawayEmbed], components: [joinRow] });

        // Zamanlayıcıyı kur
        const timeout = setTimeout(() => {
          endGiveaway(giveawayId);
        }, msRemaining);

        // Çekiliş verilerini haritaya yaz
        const gwData = {
          id: giveawayId,
          prize,
          winnersCount,
          endTime: targetDate.getTime(),
          channelId: interaction.channelId,
          messageId: publicMessage.id,
          participants: new Set(),
          timeout,
          ended: false
        };
        activeGiveaways.set(giveawayId, gwData);

        // SADECE BİZDE GÖZÜKEN (Ephemeral) Yönetim Paneli
        const controlEmbed = new EmbedBuilder()
          .setColor("#E67E22")
          .setTitle("🛠️ Çekiliş Yönetim Masası")
          .setDescription(`**${prize}** çekilişi başarıyla başlatıldı.\n\nBu panel sadece size özeldir, çekilişi buradan sabote edilmeden yönetebilirsiniz.`);

        const ctrlRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`gw_ctrl_force_${giveawayId}`).setLabel("⚡ Anında Bitir").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`gw_ctrl_cancel_${giveawayId}`).setLabel("🛑 Çekilişi İptal Et").setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({ embeds: [controlEmbed], components: [ctrlRow], ephemeral: true });

      } catch (err) {
        console.error(err);
        return interaction.reply({ content: "❌ Çekiliş oluşturulurken bir hata meydana geldi.", ephemeral: true });
      }
    }
    
    // FISILTI ODALARI FORM SUBMIT MOTORLARI
    if (interaction.customId.startsWith("modal_wh_submit_")) {
      const parts = interaction.customId.split("_"); const formatType = parts[3]; const targetId = parts[4]; const msgText = interaction.fields.getTextInputValue("whisper_msg");
      const member = await interaction.guild.members.fetch(targetId).catch(() => null); if (!member) return interaction.reply({ content: "❌ Üye bulunamadı.", ephemeral: true });
      try {
        const thread = await interaction.channel.threads.create({ name: `🤫 gizli-fısıltı-${Math.floor(1000 + Math.random() * 9000)}`, autoArchiveDuration: 60, type: 12, reason: `Anonim İletişim` });
        await thread.members.add(targetId);
        if (formatType === "normal") await thread.send({ content: `🔔 **Yeni bir anonim fısıltı mesajı aldınız!**\n\n${msgText}` });
        else await thread.send({ content: `<@${targetId}>`, embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🤫 Anonim Fısıltı Mesajı").setDescription(msgText).setTimestamp()] });
        const initialLogs = [`✍️ **Siz (${formatType === "normal" ? "Yazı" : "Embed"}):** ${msgText}`];
        const bridgeObject = { initiatorId: userId, targetId: targetId, threadId: thread.id, logs: initialLogs, lastInteraction: interaction };
        activeWhispers.set(thread.id, bridgeObject); activeWhispers.set(userId, bridgeObject);
        return interaction.reply({ embeds: [buildBridgeEmbed(initialLogs, targetId)], components: [buildBridgeButtons()], ephemeral: true });
      } catch (err) { return interaction.reply({ content: "❌ Oda açılamadı.", ephemeral: true }); }
    }
    if (interaction.customId.startsWith("modal_wh_reply_submit_")) {
      const type = interaction.customId.replace("modal_wh_reply_submit_", ""); const msgText = interaction.fields.getTextInputValue("whisper_reply_msg");
      const bridge = activeWhispers.get(userId); if (!bridge) return interaction.reply({ content: "❌ Aktif oda bulunamadı.", ephemeral: true });
      const thread = await client.channels.fetch(bridge.threadId).catch(() => null); if (!thread) { activeWhispers.delete(bridge.threadId); activeWhispers.delete(userId); return interaction.reply({ content: "❌ Odaya erişilemedi.", ephemeral: true }); }
      if (type === "normal") await thread.send({ content: `💬 **Gelen Yanıt:** ${msgText}` }); else await thread.send({ embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("💬 Gelen Yanıt").setDescription(msgText).setTimestamp()] });
      bridge.logs.push(`✍️ **Siz (${type === "normal" ? "Yazı" : "Embed"}):** ${msgText}`); bridge.lastInteraction = interaction;
      return interaction.reply({ embeds: [buildBridgeEmbed(bridge.logs, bridge.targetId)], components: [buildBridgeButtons()], ephemeral: true });
    }

    // STANDART DİĞER MODALLER (PURGE, SAY, TIMEOUT VS)
    if (interaction.customId === "modal_purge") {
      const amount = parseInt(interaction.fields.getTextInputValue("purge_amount")); if (isNaN(amount) || amount < 1 || amount > 100) return interaction.reply({ content: "❌ Geçersiz miktar.", ephemeral: true });
      await interaction.channel.bulkDelete(amount, true); return interaction.reply({ content: `🧹 **${amount}** mesaj silindi.`, ephemeral: true });
    }
    if (interaction.customId === "modal_say_normal") {
      await interaction.channel.send({ content: interaction.fields.getTextInputValue("say_text") }); return interaction.reply({ content: "✅ Gönderildi.", ephemeral: true });
    }
    if (interaction.customId === "modal_say_embed") {
      const title = interaction.fields.getTextInputValue("emb_title"); const desc = interaction.fields.getTextInputValue("emb_desc"); let color = interaction.fields.getTextInputValue("emb_color") || "#5865F2"; if (!color.startsWith("#")) color = `#${color}`;
      await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp()] }); return interaction.reply({ content: "✅ Gönderildi.", ephemeral: true });
    }
    if (interaction.customId.startsWith("modal_timeout_submit_")) {
      const targetId = interaction.customId.split("_")[3]; const minutes = parseInt(interaction.fields.getTextInputValue("timeout_time")); const reason = interaction.fields.getTextInputValue("timeout_reason") || "Belirtilmedi";
      if (isNaN(minutes) || minutes <= 0) return interaction.reply({ content: "❌ Geçersiz süre.", ephemeral: true });
      const member = await interaction.guild.members.fetch(targetId).catch(() => null); if (!member) return interaction.reply({ content: "❌ Bulunamadı.", ephemeral: true });
      await member.timeout(minutes * 60 * 1000, reason); return interaction.reply({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("⏳ Susturuldu").setDescription(`<@${targetId}>, ${minutes} dk susturuldu.`)] });
    }
    if (interaction.customId.startsWith("modal_sb_set_")) {
      const amt = parseInt(interaction.fields.getTextInputValue("new_coin_amount")); await setCoins(interaction.customId.replace("modal_sb_set_", ""), isNaN(amt) ? 0 : amt); return interaction.update({ embeds: [new EmbedBuilder().setTitle("Bakiye Güncellendi")], components: [backButtonRow] });
    }

    // KUMAR SALONU MATEMATİKLERİ
    const user = await getUser(userId); const bet = parseInt(interaction.fields.getTextInputValue("bet_amount"));
    if (isNaN(bet) || bet < 100 || user.coins < bet) return interaction.update({ embeds: [new EmbedBuilder().setTitle("❌ Hatalı Bahis")], components: [backButtonRow] });
    const embed = new EmbedBuilder().setTimestamp();

    if (interaction.customId.startsWith("modal_cf_")) {
      const win = Math.random() < 0.5; await addCoins(userId, win ? bet : -bet); embed.setColor(win ? "#57F287" : "#ED4245").setTitle(win ? "Kazandınız!" : "Kaybettiniz!").setDescription(`Bahis: ${formatCoins(bet)}`);
    }
    if (interaction.customId === "modal_slots_spin") {
      const sym = ["🍎", "🍋", "🍒", "💎"]; const s1 = sym[Math.floor(Math.random() * 4)], s2 = sym[Math.floor(Math.random() * 4)], s3 = sym[Math.floor(Math.random() * 4)];
      if (s1 === s2 && s2 === s3) { await addCoins(userId, bet * 3); embed.setColor("#57F287").setTitle("JACKPOT!").setDescription(`[${s1} ${s2} ${s3}]`); }
      else if (s1 === s2 || s1 === s3 || s2 === s3) { await addCoins(userId, Math.floor(bet * 0.5)); embed.setColor("#57F287").setTitle("Kazandınız").setDescription(`[${s1} ${s2} ${s3}]`); }
      else { await addCoins(userId, -bet); embed.setColor("#ED4245").setTitle("Kaybettiniz").setDescription(`[${s1} ${s2} ${s3}]`); }
    }
    if (interaction.customId.startsWith("modal_rl_")) {
      const cc = interaction.customId.replace("modal_rl_", ""); const rc = ["red", "black", "red", "black", "green"][Math.floor(Math.random() * 5)];
      if (cc === rc) { const w = cc === "green" ? bet * 14 : bet; await addCoins(userId, w); embed.setColor("#57F287").setTitle("Kazandınız"); } else { await addCoins(userId, -bet); embed.setColor("#ED4245").setTitle("Kaybettiniz"); }
    }
    if (interaction.customId === "modal_bj_start") {
      const ph = [drawCard(), drawCard()], dh = [drawCard(), drawCard()]; activeBlackjack.set(userId, { bet, playerHand: ph, dealerHand: dh });
      embed.setColor("#5865F2").setTitle("Blackjack Masası").setDescription(`Eliniz: ${ph.map(c => c.text).join(" ")} (${calculateHand(ph)})`);
      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_hit").setLabel("Çek").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("bj_stand").setLabel("Dur").setStyle(ButtonStyle.Danger))] });
    }
    const uu = await getUser(userId); embed.addFields({ name: "Cüzdan", value: `${formatCoins(uu.coins)}` });
    return interaction.update({ embeds: [embed], components: [backButtonRow] });
  }
});

client.login(process.env.DISCORD_TOKEN);
