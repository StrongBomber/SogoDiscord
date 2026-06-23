require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  StringSelectMenuBuilder 
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./economy.db");

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, coins INTEGER DEFAULT 0)");
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- ASENKRON VERİTABANI YARDIMCI FONKSİYONLARI ---
function ensureUser(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      if (row) resolve(row);
      else {
        db.run("INSERT INTO users(id, coins) VALUES(?, 100)", [id], (err) => {
          if (err) return reject(err);
          resolve({ id, coins: 100 });
        });
      }
    });
  });
}

function addCoins(id, amount) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE users SET coins = coins + ? WHERE id = ?", [amount, id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function getUser(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// --- ORTAK ARAYÜZ BİLEŞENLERİ ---
function getMainMenuEmbed() {
  return new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🪙 Ekonomi & Eğlence Merkezi")
    .setDescription("Aşağıdaki butonları kullanarak işlerinizi yönetebilir, mini oyunlar oynayabilir veya kumar salonunda şansınızı deneyebilirsiniz!")
    .addFields(
      { name: "🏹 Avlan", value: "Vahşi doğada ava çık.", inline: true },
      { name: "💼 Çalış", value: "Günlük mesai yap.", inline: true },
      { name: "🙏 Dilen", value: "Şansını sokakta dene.", inline: true }
    )
    .setFooter({ text: "Gelişmiş Ekonomi Sistemi" })
    .setTimestamp();
}

function getMainMenuComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("hunt").setLabel("🏹 Avlan").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("work").setLabel("💼 Çalış").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("beg").setLabel("🙏 Dilen").setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamble_menu").setLabel("🎰 Kumar Salonu").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("balance").setLabel("💰 Bakiye Kontrol").setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

const backButtonRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("back_to_main").setLabel("⬅️ Ana Menüye Dön").setStyle(ButtonStyle.Secondary)
);

// --- MESAJ KOMUTLARI ---
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  if (msg.content === "!menu") {
    await ensureUser(msg.author.id);
    return msg.reply({
      embeds: [getMainMenuEmbed()],
      components: getMainMenuComponents()
    });
  }
});

// --- ETKİLEŞİM (BUTTON & SELECT MENU) YÖNETİMİ ---
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  const userId = interaction.user.id;
  await ensureUser(userId);

  // 1. BUTON ETKİLEŞİMLERİ
  if (interaction.isButton()) {
    
    if (interaction.customId === "back_to_main") {
      return interaction.update({
        embeds: [getMainMenuEmbed()],
        components: getMainMenuComponents()
      });
    }

    if (interaction.customId === "balance") {
      const row = await getUser(userId);
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("💰 Hesap Cüzdanı")
        .setDescription(`Mevcut bakiyeniz: **${row ? row.coins : 0}** jeton.`)
        .setTimestamp();

      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // Kazanma mekanikleri (Avlan, Çalış, Dilen)
    const rewards = { 
      hunt: [50, 200, "🏹 Av Başarılı!"], 
      work: [100, 400, "💼 Mesai Tamamlandı!"], 
      beg: [5, 50, "🙏 Birileri Üç Beş Kuruş Attı!"] 
    };

    if (rewards[interaction.customId]) {
      const [min, max, title] = rewards[interaction.customId];
      const reward = Math.floor(Math.random() * (max - min + 1)) + min;
      
      await addCoins(userId, reward);
      const user = await getUser(userId);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle(title)
        .setDescription(`Hesabınıza **+${reward}** jeton eklendi.`)
        .addFields({ name: "Güncel Bakiye", value: `💰 ${user.coins} jeton` })
        .setTimestamp();

      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    if (interaction.customId === "gamble_menu") {
      const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setTitle("🎰 Kumar Salonuna Hoş Geldiniz")
        .setDescription("Lütfen oynamak istediğiniz oyunu aşağıdaki menüden seçin.\n\n⚠️ **Not:** Tüm oyunların giriş bedeli sabit **50 jetondur**.");

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("gamble_select")
        .setPlaceholder("Bir oyun seçimi yapın...")
        .addOptions([
          { label: "Yazı Tura (Coinflip)", description: "%50 şansla paranı katla.", value: "coinflip", emoji: "🪙" },
          { label: "Slot Makinesi (Slots)", description: "Sembolleri eşleştir, büyük ödülü kap.", value: "slots", emoji: "🍒" } // Hata buradaki tırnak eksikliğindeydi, düzeltildi!
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
    }
  }

  // 2. SEÇİM MENÜSÜ ETKİLEŞİMLERİ (KUMAR SİSTEMİ)
  if (interaction.isStringSelectMenu() && interaction.customId === "gamble_select") {
    const user = await getUser(userId);
    const bet = 50;

    if (!user || user.coins < bet) {
      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("❌ Yetersiz Bakiye")
        .setDescription(`Kumar oynamak için en az **${bet}** jetonunuz olmalıdır.\nMevcut bakiyeniz: **${user ? user.coins : 0}** jeton.`);

      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    const gameType = interaction.values[0];
    const embed = new EmbedBuilder().setTimestamp();

    // --- YAZI TURA OYUNU ---
    if (gameType === "coinflip") {
      const win = Math.random() < 0.5;
      if (win) {
        await addCoins(userId, bet);
        embed.setColor("#57F287")
             .setTitle("🪙 Yazı-Tura: Kazandınız!")
             .setDescription(`Para döndü ve doğru tahmin ettiniz! **+${bet}** jeton kazandınız.`);
      } else {
        await addCoins(userId, -bet);
        embed.setColor("#ED4245")
             .setTitle("🪙 Yazı-Tura: Kaybettiniz!")
             .setDescription(`Para döndü ancak yanlış yüzü geldi. **-${bet}** jeton kaybettiniz.`);
      }
    } 
    
    // --- SLOT MAKİNESİ OYUNU ---
    else if (gameType === "slots") {
      const emojis = ["🍎", "🍋", "🍒", "💎"];
      const s1 = emojis[Math.floor(Math.random() * emojis.length)];
      const s2 = emojis[Math.floor(Math.random() * emojis.length)];
      const s3 = emojis[Math.floor(Math.random() * emojis.length)];

      const slotDisplay = `┃  ${s1}  ┃  ${s2}  ┃  ${s3}  ┃`;

      if (s1 === s2 && s2 === s3) {
        const jackpot = bet * 4;
        await addCoins(userId, jackpot);
        embed.setColor("#57F287")
             .setTitle("🍒 Slot: JACKPOT!")
             .setDescription(`### ${slotDisplay}\n\nMüthiş! Tüm semboller eşleşti. **+${jackpot}** jeton kazandınız!`);
      } else if (s1 === s2 || s1 === s3 || s2 === s3) {
        const smallWin = bet;
        await addCoins(userId, smallWin);
        embed.setColor("#57F287")
             .setTitle("🍒 Slot: Kazandınız!")
             .setDescription(`### ${slotDisplay}\n\nGüzel! İki sembol aynı geldi. **+${smallWin}** jeton kazandınız.`);
      } else {
        await addCoins(userId, -bet);
        embed.setColor("#ED4245")
             .setTitle("🍒 Slot: Kaybettiniz!")
             .setDescription(`### ${slotDisplay}\n\nTüh! Hiçbir sembol eşleşmedi. **-${bet}** jeton kaybettiniz.`);
      }
    }

    const updatedUser = await getUser(userId);
    embed.addFields({ name: "Yeni Bakiyeniz", value: `💰 ${updatedUser ? updatedUser.coins : 0} jeton` });

    return interaction.update({ embeds: [embed], components: [backButtonRow] });
  }
});

client.login(process.env.DISCORD_TOKEN);
