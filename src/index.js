require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./economy.db");

// Veritabanı tablolarını genişletiyoruz
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, coins INTEGER DEFAULT 500, equipped_item TEXT DEFAULT NULL)");
  db.run("CREATE TABLE IF NOT EXISTS inventory(userId TEXT, itemId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(userId, itemId))");
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- SABİT EŞYA VERİLERİ (MARKET) ---
const ITEMS = {
  rifle: { name: "🏹 Gelişmiş Av Tüfeği", price: 600, desc: "Avlanma (Hunt) ödüllerini %50 artırır.", type: "hunt" },
  pickaxe: { name: "⛏️ Saf Altın Kazma", price: 1000, desc: "Çalışma (Work) ödüllerini %50 artırır.", type: "work" }
};

// --- ASENKRON VERİTABANI YARDIMCI FONKSİYONLARI ---
function ensureUser(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      if (row) resolve(row);
      else {
        db.run("INSERT INTO users(id, coins, equipped_item) VALUES(?, 500, NULL)", [id], (err) => {
          if (err) return reject(err);
          resolve({ id, coins: 500, equipped_item: null });
        });
      }
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

function addCoins(id, amount) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE users SET coins = coins + ? WHERE id = ?", [amount, id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function getInventory(userId) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM inventory WHERE userId = ? AND quantity > 0", [userId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function addItem(userId, itemId) {
  return new Promise((resolve, reject) => {
    db.run("INSERT INTO inventory(userId, itemId, quantity) VALUES(?, ?, 1) ON CONFLICT(userId, itemId) DO UPDATE SET quantity = quantity + 1", [userId, itemId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function setEquipItem(userId, itemId) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE users SET equipped_item = ? WHERE id = ?", [itemId, userId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// --- ORTAK ARAYÜZ BİLEŞENLERİ ---
async function getMainMenuEmbed(userId) {
  const user = await getUser(userId);
  const activeItem = user && user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok ❌";

  return new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🪙 Gelişmiş Ekonomi & RPG Merkezi")
    .setDescription("Aşağıdaki paneli kullanarak RPG hayatınızı yönetebilir, pazardan alışveriş yapabilir veya bakiye katlayabilirsiniz!")
    .addFields(
      { name: "💰 Mevcut Bakiye", value: `**${user ? user.coins : 0}** Jeton`, inline: true },
      { name: "🔰 Kuşanılan Eşya", value: `**${activeItem}**`, inline: true }
    )
    .setFooter({ text: "Geliştirilmiş Altyapı v2.0" })
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
    new ButtonBuilder().setCustomId("shop_menu").setLabel("🛒 Market").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("inv_menu").setLabel("🎒 Envanterim").setStyle(ButtonStyle.Secondary)
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
      embeds: [await getMainMenuEmbed(msg.author.id)],
      components: getMainMenuComponents()
    });
  }
});

// --- ETKİLEŞİM YÖNETİMİ ---
client.on("interactionCreate", async interaction => {
  const userId = interaction.user.id;
  await ensureUser(userId);

  // 1. BUTON ETKİLEŞİMLERİ
  if (interaction.isButton()) {
    
    if (interaction.customId === "back_to_main") {
      return interaction.update({
        embeds: [await getMainMenuEmbed(userId)],
        components: getMainMenuComponents()
      });
    }

    // Klasik Kazanma Komutları (+ Ekipman Çarpanı)
    const rewards = { hunt: [50, 200, "🏹 Av Başarılı!", "rifle"], work: [100, 400, "💼 Mesai Tamamlandı!", "pickaxe"], beg: [5, 50, "🙏 Dilenme Başarılı!", null] };

    if (rewards[interaction.customId]) {
      const [min, max, title, requiredItem] = rewards[interaction.customId];
      let reward = Math.floor(Math.random() * (max - min + 1)) + min;
      
      const user = await getUser(userId);
      let multiplierActive = false;

      if (requiredItem && user.equipped_item === requiredItem) {
        reward = Math.floor(reward * 1.5); // %50 Ekipman Bonusu
        multiplierActive = true;
      }

      await addCoins(userId, reward);
      const updatedUser = await getUser(userId);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle(title)
        .setDescription(`Hesabınıza **+${reward}** jeton eklendi.${multiplierActive ? "\n*(Kuşanılan eşya sayesinde %50 daha fazla kazandınız!)*" : ""}`)
        .addFields({ name: "Güncel Bakiye", value: `💰 ${updatedUser.coins} jeton` })
        .setTimestamp();

      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // Kumar Ana Seçim Menüsü
    if (interaction.customId === "gamble_menu") {
      const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setTitle("🎰 Kumar Salonu")
        .setDescription("Lütfen oynamak istediğiniz oyunu seçin.\n\n⚠️ **Kural:** Minimum bahis miktarı **100 jetondur**.");

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("gamble_select")
        .setPlaceholder("Bir oyun türü seçin...")
        .addOptions([
          { label: "Yazı Tura (Coinflip)", description: "Tarafını seç ve parayı fırlat!", value: "coinflip_nav", emoji: "🪙" },
          { label: "Slot Makinesi (Slots)", description: "Sembolleri eşleştir, şansını dene!", value: "slots_nav", emoji: "🍒" }
        ]);

      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), backButtonRow] });
    }

    // Yazı Tura Taraf Seçimleri -> Modal Açma Tetikleyicileri
    if (interaction.customId === "cf_yazi" || interaction.customId === "cf_tura") {
      const side = interaction.customId === "cf_yazi" ? "Yazı" : "Tura";
      
      const modal = new ModalBuilder().setCustomId(`modal_cf_${interaction.customId}`).setTitle(`🪙 Coinflip: ${side}`);
      const betInput = new TextInputBuilder()
        .setCustomId("bet_amount")
        .setLabel("Bahis Miktarını Girin (En az 100)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(3);

      modal.addComponents(new ActionRowBuilder().addComponents(betInput));
      return interaction.showModal(modal);
    }

    // Slot Makinesi -> Modal Açma Tetikleyicisi
    if (interaction.customId === "slots_spin_btn") {
      const modal = new ModalBuilder().setCustomId("modal_slots_spin").setTitle("🍒 Slot Makinesi");
      const betInput = new TextInputBuilder()
        .setCustomId("bet_amount")
        .setLabel("Bahis Miktarını Girin (En az 100)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(3);

      modal.addComponents(new ActionRowBuilder().addComponents(betInput));
      return interaction.showModal(modal);
    }

    // MARKET MENÜSÜ
    if (interaction.customId === "shop_menu") {
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("🛒 Alışveriş Pazarı")
        .setDescription("Kuşanılan eşyalar meslek kazançlarınızı kalıcı olarak arttırır.");

      const options = [];
      for (const [id, item] of Object.entries(ITEMS)) {
        embed.addFields({ name: `${item.name} - 💰 ${item.price} Jeton`, value: item.desc });
        options.push({ label: item.name.split(" ").slice(1).join(" "), description: `${item.price} Jeton`, value: id });
      }

      const selectMenu = new StringSelectMenuBuilder().setCustomId("shop_buy_select").setPlaceholder("Satın almak için bir eşya seçin...").addOptions(options);
      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), backButtonRow] });
    }

    // ENVANTER MENÜSÜ
    if (interaction.customId === "inv_menu") {
      const inv = await getInventory(userId);
      const user = await getUser(userId);

      const embed = new EmbedBuilder()
        .setColor("#E67E22")
        .setTitle("🎒 Oyuncu Envanteri")
        .setDescription(`Aktif Kuşanılan: **${user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok"}**\n\nSahip Olduğunuz Eşyalar:`);

      const options = [];
      if (inv.length === 0) {
        embed.setDescription("Envanteriniz şu anda bomboş. Marketten eşya satın alabilirsiniz.");
      } else {
        inv.forEach(row => {
          const item = ITEMS[row.itemId];
          if (item) {
            embed.addFields({ name: item.name, value: `Adet: ${row.quantity}x | *${item.desc}*` });
            options.push({ label: item.name.split(" ").slice(1).join(" "), description: "Kuşanmak için seçin", value: row.itemId });
          }
        });
      }

      const comp = [];
      if (options.length > 0) {
        const selectMenu = new StringSelectMenuBuilder().setCustomId("inv_equip_select").setPlaceholder("Kuşanmak istediğiniz eşyayı seçin...").addOptions(options);
        comp.push(new ActionRowBuilder().addComponents(selectMenu));
      }
      comp.push(backButtonRow);

      return interaction.update({ embeds: [embed], components: comp });
    }
  }

  // 2. SEÇİM MENÜSÜ ETKİLEŞİMLERİ
  if (interaction.isStringSelectMenu()) {
    
    // Kumar Alt Menü Yönlendirmeleri
    if (interaction.customId === "gamble_select") {
      const choice = interaction.values[0];

      if (choice === "coinflip_nav") {
        const embed = new EmbedBuilder()
          .setColor("#FEE75C")
          .setTitle("🪙 Coinflip (Yazı Tura)")
          .setDescription("Lütfen oynamak istediğiniz tarafı seçin. Taraf seçtikten sonra bahis miktarını gireceksiniz.");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("cf_yazi").setLabel("🪙 Yazı").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("cf_tura").setLabel("🦅 Tura").setStyle(ButtonStyle.Success)
        );
        return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
      }

      if (choice === "slots_nav") {
        const embed = new EmbedBuilder()
          .setColor("#FEE75C")
          .setTitle("🍒 Slot Makinesi")
          .setDescription("Kolu çevirmek için butona basın ve bahis miktarınızı belirleyin!");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("slots_spin_btn").setLabel("🎰 Kolu Çevir (Bahis Gir)").setStyle(ButtonStyle.Danger)
        );
        return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
      }
    }

    // Market Alışveriş İşlemi
    if (interaction.customId === "shop_buy_select") {
      const itemId = interaction.values[0];
      const item = ITEMS[itemId];
      const user = await getUser(userId);

      if (user.coins < item.price) {
        const embed = new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Bakiye").setDescription(`Bu eşyayı almak için **${item.price}** jetona ihtiyacınız var.\nBakiyeniz: **${user.coins}** jeton.`);
        return interaction.update({ embeds: [embed], components: [backButtonRow] });
      }

      await addCoins(userId, -item.price);
      await addItem(userId, itemId);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("🎉 Satın Alım Başarılı!")
        .setDescription(`**${item.name}** başarıyla satın alındı ve envanterinize eklendi!\n\n*Not: Eşyanın özelliklerinin aktif olması için envanter menüsünden kuşanmayı unutmayın!*`);

      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // Eşya Kuşanma İşlemi
    if (interaction.customId === "inv_equip_select") {
      const itemId = interaction.values[0];
      await setEquipItem(userId, itemId);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("⚔️ Ekipman Kuşanıldı")
        .setDescription(`Başarıyla **${ITEMS[itemId].name}** kuşanıldı! Artık ilgili meslekte pasif bonusunuz aktif.`);

      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }
  }

  // 3. MODAL SUBMIT ETKİLEŞİMLERİ (KUMAR MATEMATİĞİ)
  if (interaction.isModalSubmit()) {
    const user = await getUser(userId);
    const betInput = interaction.fields.getTextInputValue("bet_amount");
    const bet = parseInt(betInput);

    // Bahis Doğrulama Filtreleri
    if (isNaN(bet) || bet < 100) {
      const embed = new EmbedBuilder().setColor("#ED4245").setTitle("❌ Geçersiz Bahis").setDescription("Girdiğiniz bahis miktarı geçersiz veya 100 jetondan az.");
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    if (user.coins < bet) {
      const embed = new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Bakiye").setDescription(`Yetersiz bakiye! En fazla **${user.coins}** jeton değerinde bahis yapabilirsiniz.`);
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    const embed = new EmbedBuilder().setTimestamp();

    // --- YAZI TURA KAZANMA ALGORİTMASI ---
    if (interaction.customId.startsWith("modal_cf_")) {
      const chosenSide = interaction.customId.endsWith("cf_yazi") ? "Yazı" : "Tura";
      const systemResult = Math.random() < 0.5 ? "Yazı" : "Tura";

      if (chosenSide === systemResult) {
        await addCoins(userId, bet);
        embed.setColor("#57F287")
             .setTitle("🪙 Coinflip: Kazandınız!")
             .setDescription(`Tahmininiz: **${chosenSide}** | Gelen: **${systemResult}**\n\nTebrikler! Hesabınıza **+${bet}** jeton eklendi.`);
      } else {
        await addCoins(userId, -bet);
        embed.setColor("#ED4245")
             .setTitle("🪙 Coinflip: Kaybettiniz!")
             .setDescription(`Tahmininiz: **${chosenSide}** | Gelen: **${systemResult}**\n\nTüh, şansınız yaver gitmedi. **-${bet}** jeton kaybettiniz.`);
      }
    }

    // --- SLOT KAZANMA ALGORİTMASI ---
    if (interaction.customId === "modal_slots_spin") {
      const emojis = ["🍎", "🍋", "🍒", "💎"];
      const s1 = emojis[Math.floor(Math.random() * emojis.length)];
      const s2 = emojis[Math.floor(Math.random() * emojis.length)];
      const s3 = emojis[Math.floor(Math.random() * emojis.length)];

      const slotDisplay = `┃  ${s1}  ┃  ${s2}  ┃  ${s3}  ┃`;

      if (s1 === s2 && s2 === s3) {
        const prize = bet * 3; // 3'lü kombinasyon 3 katı verir
        await addCoins(userId, prize);
        embed.setColor("#57F287")
             .setTitle("🍒 Slot: JACKPOT!")
             .setDescription(`### ${slotDisplay}\n\nMüthiş! Tüm semboller eşleşti. **+${prize}** jeton kazandınız!`);
      } else if (s1 === s2 || s1 === s3 || s2 === s3) {
        const prize = Math.floor(bet * 0.5); // 2'li kombinasyon paranın yarısını kâr getirir
        await addCoins(userId, prize);
        embed.setColor("#57F287")
             .setTitle("🍒 Slot: Kazandınız!")
             .setDescription(`### ${slotDisplay}\n\nGüzel! İki sembol aynı geldi. **+${prize}** jeton kazandınız.`);
      } else {
        await addCoins(userId, -bet);
        embed.setColor("#ED4245")
             .setTitle("🍒 Slot: Kaybettiniz!")
             .setDescription(`### ${slotDisplay}\n\nTüh! Hiçbir sembol eşleşmedi. **-${bet}** jeton kaybettiniz.`);
      }
    }

    const updatedUser = await getUser(userId);
    embed.addFields({ name: "Yeni Bakiyeniz", value: `💰 **${updatedUser.coins}** Jeton` });

    return interaction.update({ embeds: [embed], components: [backButtonRow] });
  }
});

client.login(process.env.DISCORD_TOKEN);
