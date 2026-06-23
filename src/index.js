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

// Veritabanı yapılandırması
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

// --- DİNAMİK BAKİYE BİÇİMLENDİRME FONKSİYONU ---
function formatCoins(amount) {
  // Eğer bakiye milyonluksa ve son 3 hanesi sıfırsa (Kısa gösterime uygunsa)
  if (amount >= 1000000 && amount % 1000 === 0) {
    return `${amount / 1000000}M`;
  }
  // Eğer bakiye binlikse ve tam sıfırlarla bitiyorsa (Örn: 50,000 -> 50K)
  if (amount >= 1000 && amount % 1000 === 0) {
    return `${amount / 1000}K`;
  }
  // Küsuratlıysa direkt virgüllü gösterir (Örn: 1,128,898)
  return amount.toLocaleString("en-US");
}

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

function setCoins(id, amount) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE users SET coins = ? WHERE id = ?", [amount, id], (err) => {
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
function getMainMenuEmbed() {
  return new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🤖 Çok Amaçlı Gelişmiş Bot Paneli")
    .setDescription("Aşağıdaki butonları kullanarak sistemler arasında geçiş yapabilirsiniz. Tüm işlemler tek bir mesaj üzerinden canlı güncellenir.")
    .addFields(
      { name: "🪙 Ekonomi & RPG", value: "Oyunlar, envanter ve market sistemi.", inline: true },
      { name: "⚙️ Genel Komutlar", value: "Sunucu ve kullanıcı istatistikleri.", inline: true },
      { name: "🛠️ Sandbox Modu", value: "Yöneticiler için bakiye kontrol merkezi.", inline: true }
    )
    .setFooter({ text: "Gelişmiş Altyapı v3.5" })
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

// --- ETKİLEŞİM YÖNETİMİ ---
client.on("interactionCreate", async interaction => {
  const userId = interaction.user.id;
  await ensureUser(userId);

  // ==========================================
  // 1. BUTON NAVİGASYON VE KATEGORİ ETKİLEŞİMLERİ
  // ==========================================
  if (interaction.isButton()) {
    
    if (interaction.customId === "back_to_main") {
      return interaction.update({ embeds: [getMainMenuEmbed()], components: getMainMenuComponents() });
    }

    // ANA KATEGORİ: EKONOMİ PANELİ
    if (interaction.customId === "nav_economy") {
      const user = await getUser(userId);
      const activeItem = user && user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok ❌";

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("🪙 Ekonomi & RPG Dünyası")
        .setDescription("Buradan çalışabilir, avlanabilir, marketten alışveriş yapabilir veya paranızı katlayabilirsiniz.")
        .addFields(
          { name: "💰 Bakiyeniz", value: `**${formatCoins(user ? user.coins : 0)}** Jeton`, inline: true },
          { name: "🔰 Kuşanılan Eşya", value: `**${activeItem}**`, inline: true }
        );

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

      return interaction.update({ embeds: [embed], components: [row1, row2, backButtonRow] });
    }

    // ANA KATEGORİ: GENEL BOT KOMUTLARI PANELİ
    if (interaction.customId === "nav_general") {
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("⚙️ Genel Bot Özellikleri")
        .setDescription("Öğrenmek istediğiniz bilgi türünü aşağıdaki butonlardan seçin.");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("gen_server").setLabel("📊 Sunucu Bilgisi").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("gen_user").setLabel("👤 Kullanıcı Bilgisi").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("gen_ping").setLabel("🏓 Bot Gecikmesi (Ping)").setStyle(ButtonStyle.Secondary)
      );

      return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
    }

    // ANA KATEGORİ: SANDBOX MODU PANELİ (Yönetici Kontrolü)
    if (interaction.customId === "nav_sandbox") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetki Yetersiz").setDescription("Sandbox modunu yalnızca sunucu **Yöneticileri** kullanabilir.");
        return interaction.update({ embeds: [embed], components: [backButtonRow] });
      }

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("🛠️ Yönetici Sandbox Modu")
        .setDescription("Aşağıdaki listeden parasını görmek veya değiştirmek istediğiniz kullanıcıyı seçin.");

      const userSelect = new UserSelectMenuBuilder()
        .setCustomId("sandbox_user_select")
        .setPlaceholder("Bir oyuncu seçin...");

      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(userSelect), backButtonRow] });
    }

    // GENEL ÖZELLİKLER ALT ETKİLEŞİMLERİ
    if (interaction.customId === "gen_server") {
      const guild = interaction.guild;
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`📊 Sunucu Bilgisi: ${guild.name}`)
        .addFields(
          { name: "🆔 Sunucu ID", value: `${guild.id}`, inline: true },
          { name: "👑 Sunucu Sahibi", value: `<@${guild.ownerId}>`, inline: true },
          { name: "👥 Toplam Üye", value: `${guild.memberCount} Üye`, inline: true },
          { name: "📅 Kuruluş Tarihi", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
        );
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    if (interaction.customId === "gen_user") {
      const member = interaction.member;
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle(`👤 Kullanıcı Bilgisi: ${interaction.user.username}`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: "🆔 Kullanıcı ID", value: `${interaction.user.id}`, inline: true },
          { name: "🗓️ Hesabın Açılışı", value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: "📥 Sunucuya Katılım", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: "🎭 En Yüksek Rol", value: `${member.roles.highest}`, inline: true }
        );
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    if (interaction.customId === "gen_ping") {
      const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setTitle("🏓 Bot Gecikme Süresi")
        .setDescription(`Anlık API Gecikmesi: **${client.ws.ping}ms**`);
      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // SANDBOX ÖZEL ETKİLEŞİMİ: BAKİYE DÜZENLEME MODAL TETİKLEMESİ
    if (interaction.customId.startsWith("sb_edit_")) {
      const targetId = interaction.customId.replace("sb_edit_", "");
      
      const modal = new ModalBuilder().setCustomId(`modal_sb_set_${targetId}`).setTitle("💰 Bakiye Değiştir");
      const coinInput = new TextInputBuilder()
        .setCustomId("new_coin_amount")
        .setLabel("Yeni Jeton Miktarını Yazın")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(coinInput));
      return interaction.showModal(modal);
    }

    // EKONOMİ OYUN KAZANÇLARI (Hunt, Work, Beg)
    const rewards = { hunt: [50, 200, "🏹 Av Başarılı!", "rifle"], work: [100, 400, "💼 Mesai Tamamlandı!", "pickaxe"], beg: [5, 50, "🙏 Dilenme Başarılı!", null] };
    if (rewards[interaction.customId]) {
      const [min, max, title, requiredItem] = rewards[interaction.customId];
      let reward = Math.floor(Math.random() * (max - min + 1)) + min;
      
      const user = await getUser(userId);
      let multiplierActive = false;

      if (requiredItem && user.equipped_item === requiredItem) {
        reward = Math.floor(reward * 1.5);
        multiplierActive = true;
      }

      await addCoins(userId, reward);
      const updatedUser = await getUser(userId);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle(title)
        .setDescription(`Hesabınıza **+${formatCoins(reward)}** jeton eklendi.${multiplierActive ? "\n*(Kuşanılan eşya sayesinde %50 bonus!)*" : ""}`)
        .addFields({ name: "Güncel Bakiye", value: `💰 ${formatCoins(updatedUser.coins)} jeton` });

      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // KUMAR SEÇENEKLERİ ANA PANELİ
    if (interaction.customId === "gamble_menu") {
      const embed = new EmbedBuilder().setColor("#FEE75C").setTitle("🎰 Kumar Salonu").setDescription("Lütfen oynamak istediğiniz oyunu seçin.\n\n⚠️ **Kural:** Minimum bahis miktarı **100 jetondur**.");
      const selectMenu = new StringSelectMenuBuilder().setCustomId("gamble_select").setPlaceholder("Bir oyun türü seçin...")
        .addOptions([
          { label: "Yazı Tura (Coinflip)", description: "Tarafını seç ve parayı fırlat!", value: "coinflip_nav", emoji: "🪙" },
          { label: "Slot Makinesi (Slots)", description: "Sembolleri eşleştir, şansını dene!", value: "slots_nav", emoji: "🍒" }
        ]);
      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), backButtonRow] });
    }

    if (interaction.customId === "cf_yazi" || interaction.customId === "cf_tura") {
      const side = interaction.customId === "cf_yazi" ? "Yazı" : "Tura";
      const modal = new ModalBuilder().setCustomId(`modal_cf_${interaction.customId}`).setTitle(`🪙 Coinflip: ${side}`);
      const betInput = new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Miktarını Girin (En az 100)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3);
      modal.addComponents(new ActionRowBuilder().addComponents(betInput));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "slots_spin_btn") {
      const modal = new ModalBuilder().setCustomId("modal_slots_spin").setTitle("🍒 Slot Makinesi");
      const betInput = new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Miktarını Girin (En az 100)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3);
      modal.addComponents(new ActionRowBuilder().addComponents(betInput));
      return interaction.showModal(modal);
    }

    // SHOP VE INVENTORY BUTONLARI
    if (interaction.customId === "shop_menu") {
      const embed = new EmbedBuilder().setColor("#5865F2").setTitle("🛒 Alışveriş Pazarı").setDescription("Kuşanılan eşyalar meslek kazançlarınızı kalıcı olarak arttırır.");
      const options = [];
      for (const [id, item] of Object.entries(ITEMS)) {
        embed.addFields({ name: `${item.name} - 💰 ${formatCoins(item.price)} Jeton`, value: item.desc });
        options.push({ label: item.name.split(" ").slice(1).join(" "), description: `${formatCoins(item.price)} Jeton`, value: id });
      }
      const selectMenu = new StringSelectMenuBuilder().setCustomId("shop_buy_select").setPlaceholder("Satın almak için bir eşya seçin...").addOptions(options);
      return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), backButtonRow] });
    }

    if (interaction.customId === "inv_menu") {
      const inv = await getInventory(userId);
      const user = await getUser(userId);
      const embed = new EmbedBuilder().setColor("#E67E22").setTitle("🎒 Oyuncu Envanteri").setDescription(`Aktif Kuşanılan: **${user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok"}**\n\nSahip Olduğunuz Eşyalar:`);
      const options = [];
      if (inv.length === 0) embed.setDescription("Envanteriniz şu anda bomboş.");
      else {
        inv.forEach(row => {
          const item = ITEMS[row.itemId];
          if (item) {
            embed.addFields({ name: item.name, value: `Adet: ${row.quantity}x | *${item.desc}*` });
            options.push({ label: item.name.split(" ").slice(1).join(" "), description: "Kuşanmak için seçin", value: row.itemId });
          }
        });
      }
      const comp = [];
      if (options.length > 0) comp.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("inv_equip_select").setPlaceholder("Eşya seç...").addOptions(options)));
      comp.push(backButtonRow);
      return interaction.update({ embeds: [embed], components: comp });
    }
  }

  // ==========================================
  // 2. SEÇİM MENÜSÜ ETKİLEŞİMLERİ
  // ==========================================
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "gamble_select") {
      const choice = interaction.values[0];
      if (choice === "coinflip_nav") {
        const embed = new EmbedBuilder().setColor("#FEE75C").setTitle("🪙 Coinflip (Yazı Tura)").setDescription("Lütfen oynamak istediğiniz tarafı seçin.");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("cf_yazi").setLabel("🪙 Yazı").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("cf_tura").setLabel("🦅 Tura").setStyle(ButtonStyle.Success)
        );
        return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
      }
      if (choice === "slots_nav") {
        const embed = new EmbedBuilder().setColor("#FEE75C").setTitle("🍒 Slot Makinesi").setDescription("Bahis miktarınızı belirlemek için butona tıklayın.");
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("slots_spin_btn").setLabel("🎰 Kolu Çevir").setStyle(ButtonStyle.Danger));
        return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
      }
    }

    if (interaction.customId === "shop_buy_select") {
      const itemId = interaction.values[0];
      const item = ITEMS[itemId];
      const user = await getUser(userId);
      if (user.coins < item.price) {
        return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Bakiye").setDescription(`Gerekli: **${formatCoins(item.price)}** | Sizde: **${formatCoins(user.coins)}**`)], components: [backButtonRow] });
      }
      await addCoins(userId, -item.price);
      await addItem(userId, itemId);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("🎉 Başarılı").setDescription(`**${item.name}** envantere eklendi! Kuşanmayı unutmayın.`)], components: [backButtonRow] });
    }

    if (interaction.customId === "inv_equip_select") {
      const itemId = interaction.values[0];
      await setEquipItem(userId, itemId);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("⚔️ Kuşanıldı").setDescription(`Başarıyla **${ITEMS[itemId].name}** aktif edildi!`)], components: [backButtonRow] });
    }
  }

  // SANDBOX KULLANICI SEÇİM MENÜSÜ ETKİLEŞİMİ
  if (interaction.isUserSelectMenu() && interaction.customId === "sandbox_user_select") {
    const targetUserId = interaction.values[0];
    await ensureUser(targetUserId);
    const targetUser = await getUser(targetUserId);

    const embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle("🛠️ Sandbox: Oyuncu Bilgisi")
      .setDescription(`Seçilen Kullanıcı: <@${targetUserId}>\n🆔 ID: \`${targetUserId}\`\n\n💵 Güncel Parası: **${formatCoins(targetUser.coins)}** Jeton`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sb_edit_${targetUserId}`).setLabel("✍️ Bakiyeyi Düzenle").setStyle(ButtonStyle.Danger)
    );

    return interaction.update({ embeds: [embed], components: [row, backButtonRow] });
  }

  // ==========================================
  // 3. MODAL SUBMIT ETKİLEŞİMLERİ
  // ==========================================
  if (interaction.isModalSubmit()) {
    
    // SANDBOX MODAL SİSTEMİ (Para Değiştirme)
    if (interaction.customId.startsWith("modal_sb_set_")) {
      const targetId = interaction.customId.replace("modal_sb_set_", "");
      const newAmountInput = interaction.fields.getTextInputValue("new_coin_amount");
      const newAmount = parseInt(newAmountInput);

      if (isNaN(newAmount) || newAmount < 0) {
        return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Hata").setDescription("Lütfen geçerli ve pozitif bir sayı girin.")], components: [backButtonRow] });
      }

      await setCoins(targetId, newAmount);
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("🛠️ Sandbox: İşlem Başarılı")
        .setDescription(`<@${targetId}> isimli kullanıcının yeni bakiyesi **${formatCoins(newAmount)}** jeton olarak güncellendi!`);

      return interaction.update({ embeds: [embed], components: [backButtonRow] });
    }

    // KUMAR MODALLARI (Coinflip ve Slots Hesaplamaları)
    const user = await getUser(userId);
    const betInput = interaction.fields.getTextInputValue("bet_amount");
    const bet = parseInt(betInput);

    if (isNaN(bet) || bet < 100) {
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Geçersiz Bahis").setDescription("Bahis en az 100 jeton olmalıdır.")], components: [backButtonRow] });
    }
    if (user.coins < bet) {
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Yetersiz Bakiye").setDescription(`Bakiyeniz yetersiz. Mevcut: **${formatCoins(user.coins)}**`)], components: [backButtonRow] });
    }

    const embed = new EmbedBuilder().setTimestamp();

    if (interaction.customId.startsWith("modal_cf_")) {
      const chosenSide = interaction.customId.endsWith("cf_yazi") ? "Yazı" : "Tura";
      const systemResult = Math.random() < 0.5 ? "Yazı" : "Tura";

      if (chosenSide === systemResult) {
        await addCoins(userId, bet);
        embed.setColor("#57F287").setTitle("🪙 Coinflip: Kazandınız!").setDescription(`Tahmin: **${chosenSide}** | Gelen: **${systemResult}**\n\nHesabınıza **+${formatCoins(bet)}** eklendi.`);
      } else {
        await addCoins(userId, -bet);
        embed.setColor("#ED4245").setTitle("🪙 Coinflip: Kaybettiniz!").setDescription(`Tahmin: **${chosenSide}** | Gelen: **${systemResult}**\n\nHesabınızdan **-${formatCoins(bet)}** düştü.`);
      }
    }

    if (interaction.customId === "modal_slots_spin") {
      const emojis = ["🍎", "🍋", "🍒", "💎"];
      const s1 = emojis[Math.floor(Math.random() * emojis.length)];
      const s2 = emojis[Math.floor(Math.random() * emojis.length)];
      const s3 = emojis[Math.floor(Math.random() * emojis.length)];
      const display = `┃  ${s1}  ┃  ${s2}  ┃  ${s3}  ┃`;

      if (s1 === s2 && s2 === s3) {
        const prize = bet * 3;
        await addCoins(userId, prize);
        embed.setColor("#57F287").setTitle("🍒 Slot: JACKPOT!").setDescription(`### ${display}\n\nÜçü de eşleşti! **+${formatCoins(prize)}** kazandınız.`);
      } else if (s1 === s2 || s1 === s3 || s2 === s3) {
        const prize = Math.floor(bet * 0.5);
        await addCoins(userId, prize);
        embed.setColor("#57F287").setTitle("🍒 Slot: Kazandınız!").setDescription(`### ${display}\n\nİki sembol eşleşti! **+${formatCoins(prize)}** kazandınız.`);
      } else {
        await addCoins(userId, -bet);
        embed.setColor("#ED4245").setTitle("🍒 Slot: Kaybettiniz!").setDescription(`### ${display}\n\nHiçbiri eşleşmedi. **-${formatCoins(bet)}** kaybettiniz.`);
      }
    }

    const updatedUser = await getUser(userId);
    embed.addFields({ name: "Yeni Bakiyeniz", value: `💰 **${formatCoins(updatedUser.coins)}** Jeton` });
    return interaction.update({ embeds: [embed], components: [backButtonRow] });
  }
});

client.login(process.env.DISCORD_TOKEN);
