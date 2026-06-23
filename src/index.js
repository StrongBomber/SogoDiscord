/**
 * 🤫 Gelişmiş İkinci El Ticaret, Bit Pazarı ve Kart Ekonomi Botu
 * Dil: JavaScript (Node.js)
 * Kütüphane: Discord.js v14 & Mongoose (MongoDB)
 * Yapı: Monolitik Tek Dosya Sistem (index.js)
 */

require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  UserSelectMenuBuilder,
  ChannelSelectMenuBuilder, 
  ChannelType,              
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ApplicationCommandOptionType
} = require("discord.js");
const mongoose = require("mongoose");

// --- CLIENT TANIMLAMALARI ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages 
  ],
  partials: [Partials.Channel, Partials.Message] 
});

// --- ENFLASYON VE EKONOMİ AYARLARI ---
const CONFIG = {
  TAX_RATE: 0.05, // %5 Genel Transfer/Pazar Vergisi
  DAILY_TRANSFER_LIMIT: 500000, // Günlük Maksimum Para Gönderme Limiti
  BASE_UPKEEP_COST: 250, // Eşya Başına Bakım Ücreti Kontrolü
  AUCTION_COMMISSION: 0.08, // %8 Açık Artırma Komisyonu
  XP_PER_TRADE: 150, // Her Ticaret Başına Kazanılan XP
};

// --- VERİ TABANI ŞEMALARI (MONGOOSE MODELS) ---

const UserEconomySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  wallet: { type: Number, default: 5000 },
  bank: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  lastDaily: { type: Date, default: null },
  dailyTransferAmount: { type: Number, default: 0 },
  lastTransferReset: { type: Date, default: Date.now }
});
const UserEconomy = mongoose.model("UserEconomy", UserEconomySchema);

const InventorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  itemId: { type: String, required: true },
  name: { type: String, required: true },
  quality: { type: String, required: true }, // Yaygın, Nadir, Epik, Efsanevi, Mitik, Kozmik
  condition: { type: String, required: true }, // Yeni, Temiz, Kullanılmış, Eski, Antika
  actualValue: { type: Number, required: true },
  isListed: { type: Boolean, default: false }
});
const Inventory = mongoose.model("Inventory", InventorySchema);

const MarketListingSchema = new mongoose.Schema({
  listingId: { type: String, required: true, unique: true },
  sellerId: { type: String, required: true },
  itemId: { type: String, required: true },
  name: { type: String, required: true },
  quality: { type: String, required: true },
  condition: { type: String, required: true },
  price: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
const MarketListing = mongoose.model("MarketListing", MarketListingSchema);

const CardInventorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  cardId: { type: String, required: true },
  name: { type: String, required: true },
  rarity: { type: String, required: true },
  boostType: { type: String, required: true } // PazarlıkUstası, Tüccar, BitPazariAvcısı, Bankacı, Koleksiyoncu
});
const CardInventory = mongoose.model("CardInventory", CardInventorySchema);

const AuctionSchema = new mongoose.Schema({
  auctionId: { type: String, required: true, unique: true },
  sellerId: { type: String, required: true },
  itemName: { type: String, required: true },
  quality: { type: String, required: true },
  condition: { type: String, required: true },
  currentBid: { type: Number, required: true },
  highestBidder: { type: String, default: null },
  endsAt: { type: Date, required: true },
  isClosed: { type: Boolean, default: false }
});
const Auction = mongoose.model("Auction", AuctionSchema);

const QuestSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  type: { type: String, required: true }, // 'sell', 'buy_flea'
  targetCount: { type: Number, required: true },
  currentCount: { type: Number, default: 0 },
  rewardMoney: { type: Number, default: 0 },
  isCompleted: { type: Boolean, default: false }
});
const Quest = mongoose.model("Quest", QuestSchema);

// --- STATIC GAME DATA (KARTLAR, BİT PAZARI VE SETLER) ---

const CARD_POOL = [
  { id: "c1", name: "Kapalıçarşı Çırağı", rarity: "Yaygın", boostType: "PazarlıkUstası", desc: "Alış fiyatlarını %5 ucuzlatır." },
  { id: "c2", name: "Bit Pazarı Eksperi", rarity: "Nadir", boostType: "BitPazariAvcısı", desc: "Bit pazarında nadir eşya bulma şansını %15 artırır." },
  { id: "c3", name: "Borsa Spekülatörü", rarity: "Epik", boostType: "Bankacı", desc: "Banka işlemlerinde ekstra getiri sağlar." },
  { id: "c4", name: "Venedik Taciri", rarity: "Efsanevi", boostType: "Tüccar", desc: "Pazar yerindeki satışlardan %15 daha fazla gelir elde etmenizi sağlar." },
  { id: "c5", name: "Zamanın Efendisi", rarity: "Mitik", boostType: "Koleksiyoncu", desc: "Koleksiyon tamamlama ödüllerini ikiye katlar." }
];

const FLEA_MARKET_POOL = [
  { name: "Nokia 3310", baseValue: 1200, qualities: ["Eski", "Kullanılmış", "Temiz"] },
  { name: "Sony Walkman Kasetçalar", baseValue: 3500, qualities: ["Antika", "Eski", "Temiz"] },
  { name: "Nintendo GameBoy Color", baseValue: 8500, qualities: ["Temiz", "Yeni", "Antika"] },
  { name: "Retro Gaz Lambası", baseValue: 450, qualities: ["Eski", "Kullanılmış"] },
  { name: "Antika Köstekli Saat", baseValue: 22000, qualities: ["Antika", "Temiz"] },
  { name: "Sahte Altın Külçesi", baseValue: 50, qualities: ["Kullanılmış"] },
  { name: "Tarihi El Yazması Kitap", baseValue: 65000, qualities: ["Antika"] }
];

const PACK_PRICES = { standard: 1500, rare: 4000, epic: 10000, premium: 25000 };

const COLLECTIONS = {
  "Retro Elektronik Seti": ["Nokia 3310", "Sony Walkman Kasetçalar", "Nintendo GameBoy Color"]
};

// --- YARDIMCI SİSTEM FONKSİYONLARI ---

async function checkLevelUp(userId, channel) {
  const econ = await UserEconomy.findOne({ userId });
  if (!econ) return;
  const neededXp = econ.level * 2500;
  if (econ.xp >= neededXp) {
    econ.xp -= neededXp;
    econ.level += 1;
    await econ.save();
    
    const embed = new EmbedBuilder()
      .setColor("#2ECC71")
      .setTitle("🎉 SEVİYE ATLADI!")
      .setDescription(`<@${userId}> ticari dehasını kanıtlayarak **Seviye ${econ.level}** seviyesine ulaştı!\nÜnvan: **Usta Tüccar**`)
      .setTimestamp();
    if (channel) channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => null);
  }
}

async function addXp(userId, amount, channel) {
  await UserEconomy.findOneAndUpdate({ userId }, { $inc: { xp: amount } }, { upsert: true });
  await checkLevelUp(userId, channel);
}

async function getCardBoost(userId, boostType) {
  const cards = await CardInventory.find({ userId, boostType });
  if (cards.length > 0) {
    if (boostType === "PazarlıkUstası") return 0.90; // %10 indirim
    if (boostType === "Tüccar") return 1.15; // %15 kar artışı
    if (boostType === "BitPazariAvcısı") return 0.25; // %25 şans bonusu
  }
  return 1.0;
}

async function updateQuest(userId, type, channel) {
  const quest = await Quest.findOne({ userId, type, isCompleted: false });
  if (quest) {
    quest.currentCount += 1;
    if (quest.currentCount >= quest.targetCount) {
      quest.isCompleted = true;
      await UserEconomy.findOneAndUpdate({ userId }, { $inc: { wallet: quest.rewardMoney } });
      const embed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("🎯 Görev Tamamlandı!")
        .setDescription(`<@${userId}>, **${type === 'sell' ? 'Pazarda Eşya Satma' : 'Bit Pazarından Alışveriş'}** görevini bitirdi ve **${quest.rewardMoney}₺** ödül kazandı!`);
      if (channel) channel.send({ embeds: [embed] });
    }
    await quest.save();
  }
}

// --- BOT HAZIRLIK ETKİNLİĞİ (READY EVENT & SLASH COMMANDS REGISTRATION) ---

client.on("ready", async () => {
  console.log(`🤖 Ekonomi Motoru ${client.user.tag} üzerinde aktif edildi!`);
  
  // MongoDB Bağlantısı
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI).then(() => console.log("💾 MongoDB Entegrasyonu Başarılı.")).catch(err => console.error("❌ Veri tabanı hatası:", err));
  } else {
    console.warn("⚠️ MONGO_URI bulunamadı, lokal entegrasyon hataya sebebiyet verebilir.");
  }

  // Global Slash Komutlarının Kaydedilmesi
  try {
    await client.application.commands.set([
      { name: "bakiye", description: "Mevcut finansal durumunuzu görüntüler." },
      { name: "yatir", description: "Cüzdanınızdan bankaya para yatırır.", options: [{ name: "miktar", type: ApplicationCommandOptionType.Integer, description: "Yatırılacak miktar", required: true }] },
      { name: "cek", description: "Bankanızdan cüzdanınıza para çeker.", options: [{ name: "miktar", type: ApplicationCommandOptionType.Integer, description: "Çekilecek miktar", required: true }] },
      { name: "gonder", description: "Başka bir oyuncuya güvenli para transferi gerçekleştirir.", options: [{ name: "kullanici", type: ApplicationCommandOptionType.User, description: "Alıcı kullanıcı", required: true }, { name: "miktar", type: ApplicationCommandOptionType.Integer, description: "Gönderilecek miktar", required: true }] },
      { name: "profil", description: "Ticari seviyenizi, ünvanınızı ve envanter özetinizi gösterir." },
      { name: "bitpazari", description: "Bit pazarına giderek şansınızı ve tezgahları kontrol edin." },
      { name: "pazar", description: "Oyuncuların ikinci el pazar ilanlarını listeler veya yeni ilan açar.", options: [{ name: "islem", type: ApplicationCommandOptionType.String, description: "Yapılacak eylem", required: true, choices: [{ name: "Listele", value: "list" }, { name: "İlanlarımı Gör", value: "my" }] }] },
      { name: "kartlarim", description: "Sahip olduğunuz kart koleksiyonunu ve pasif güçlendirmeleri gösterir." },
      { name: "paketac", description: "Mağazadan ticaret kart paketi satın alarak açar.", options: [{ name: "tur", type: ApplicationCommandOptionType.String, description: "Paket kalitesi", required: true, choices: [{ name: "Standart Paket (1.500₺)", value: "standard" }, { name: "Nadir Paket (4.000₺)", value: "rare" }, { name: "Epik Paket (10.000₺)", value: "epic" }, { name: "Premium Paket (25.000₺)", value: "premium" }] }] },
      { name: "ihale", description: "Açık artırma pazarını kontrol eder, ilan açar veya teklif verir.", options: [{ name: "islem", type: ApplicationCommandOptionType.String, description: "İhale eylemi", required: true, choices: [{ name: "Aktif İhaleleri Gör", value: "view" }, { name: "Teklif Ver", value: "bid" }, { name: "İhale Başlat", value: "create" }] }] },
      { name: "koleksiyon", description: "Eşya setlerinizi ve tamamlanma durumlarını kontrol eder." },
      { name: "gorevler", description: "Aktif günlük ticari görevlerinizi listeler." },
      { name: "liderlik", description: "Sunucunun en zengin ve en yüksek seviyeli tüccarlarını sıralar." }
    ]);
    console.log("🚀 Tüm Slash Komutları Discord API üzerine başarıyla senkronize edildi.");
  } catch (err) {
    console.error("❌ Komut senkronizasyon motoru hatası:", err);
  }

  // Otomatik İhale Sonlandırma Döngüsü (Her 30 Saniyede Bir)
  setInterval(async () => {
    const now = new Date();
    const expiredAuctions = await Auction.find({ endsAt: { $lte: now }, isClosed: false });
    for (const auc of expiredAuctions) {
      auc.isClosed = true;
      await auc.save();
      
      if (!auc.highestBidder) {
        // Alıcı çıkmadı, eşyayı satıcıya iade et
        await Inventory.create({ userId: auc.sellerId, itemId: "auc_" + Date.now(), name: auc.itemName, quality: auc.quality, condition: auc.condition, actualValue: auc.currentBid });
      } else {
        // Satış gerçekleşti
        const fee = Math.floor(auc.currentBid * CONFIG.AUCTION_COMMISSION);
        const finalPayout = auc.currentBid - fee;
        
        await UserEconomy.findOneAndUpdate({ userId: auc.sellerId }, { $inc: { wallet: finalPayout } });
        await Inventory.create({ userId: auc.highestBidder, itemId: "auc_" + Date.now(), name: auc.itemName, quality: auc.quality, condition: auc.condition, actualValue: auc.currentBid });
      }
    }
  }, 30000);
});

// --- ANA ETKİLEŞİM MOTORU (INTERACTION CREATE HANDLER) ---

client.on("interactionCreate", async interaction => {
  const userId = interaction.user.id;
  
  // Güvenli profil/ekonomi garantisi (Lazy loading profile check)
  if (interaction.isCommand() || interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    const profileExists = await UserEconomy.findOne({ userId });
    if (!profileExists) {
      await UserEconomy.create({ userId, wallet: 5000, bank: 0 });
    }
  }

  // --- 1. SLASH COMMANDS HANDLERS ---
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;

    // [/bakiye]
    if (commandName === "bakiye") {
      const econ = await UserEconomy.findOne({ userId });
      const invItems = await Inventory.find({ userId, isListed: false });
      const totalInvValue = invItems.reduce((acc, item) => acc + item.actualValue, 0);
      const netWorth = econ.wallet + econ.bank + totalInvValue;

      const embed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle(`💰 Finansal Hesap Özeti - ${interaction.user.username}`)
        .addFields(
          { name: "💵 Cüzdan Nakit", value: `${econ.wallet.toLocaleString()} ₺`, inline: true },
          { name: "🏦 Banka Depozito", value: `${econ.bank.toLocaleString()} ₺`, inline: true },
          { name: "📦 Envanter Değeri", value: `${totalInvValue.toLocaleString()} ₺`, inline: true },
          { name: "📈 Toplam Net Servet", value: `**${netWorth.toLocaleString()} ₺**`, inline: false }
        )
        .setFooter({ text: "Anti-Enflasyon ve Güvenli Bankacılık Altyapısı" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // [/yatir]
    if (commandName === "yatir") {
      const amount = options.getInteger("miktar");
      if (amount <= 0) return interaction.reply({ content: "❌ Geçersiz miktar girdiniz.", ephemeral: true });

      const econ = await UserEconomy.findOne({ userId });
      if (econ.wallet < amount) return interaction.reply({ content: "❌ Cüzdanınızda bu kadar nakit bulunmuyor.", ephemeral: true });

      await UserEconomy.findOneAndUpdate({ userId }, { $inc: { wallet: -amount, bank: amount } });
      return interaction.reply({ content: `✅ Banka hesabınıza başarıyla **${amount.toLocaleString()} ₺** yatırıldı.` });
    }

    // [/cek]
    if (commandName === "cek") {
      const amount = options.getInteger("miktar");
      if (amount <= 0) return interaction.reply({ content: "❌ Geçersiz miktar girdiniz.", ephemeral: true });

      const econ = await UserEconomy.findOne({ userId });
      if (econ.bank < amount) return interaction.reply({ content: "❌ Banka hesabınızda bu kadar bakiye bulunmuyor.", ephemeral: true });

      await UserEconomy.findOneAndUpdate({ userId }, { $inc: { bank: -amount, wallet: amount } });
      return interaction.reply({ content: `✅ Banka hesabınızdan cüzdanınıza **${amount.toLocaleString()} ₺** nakit çekildi.` });
    }

    // [/gonder]
    if (commandName === "gonder") {
      const targetUser = options.getUser("kullanici");
      const amount = options.getInteger("miktar");

      if (targetUser.id === userId) return interaction.reply({ content: "❌ Kendinize para gönderemezsiniz.", ephemeral: true });
      if (amount <= 0) return interaction.reply({ content: "❌ Geçersiz transfer tutarı.", ephemeral: true });

      const econ = await UserEconomy.findOne({ userId });
      if (econ.wallet < amount) return interaction.reply({ content: "❌ Cüzdanınızda yeterli bakiye yok.", ephemeral: true });

      // Günlük Limit & Anti-Abuse Kontrolü
      const now = new Date();
      if (now - econ.lastTransferReset > 86400000) {
        econ.dailyTransferAmount = 0;
        econ.lastTransferReset = now;
        await econ.save();
      }

      if (econ.dailyTransferAmount + amount > CONFIG.DAILY_TRANSFER_LIMIT) {
        return interaction.reply({ content: `❌ Günlük para gönderme limitinizi (**${CONFIG.DAILY_TRANSFER_LIMIT.toLocaleString()} ₺**) aşıyorsunuz!`, ephemeral: true });
      }

      const tax = Math.floor(amount * CONFIG.TAX_RATE);
      const cleanAmount = amount - tax;

      // Atomik İşlemlerle Bakiyeleri Güncelleme (Race Condition Koruması)
      await UserEconomy.findOneAndUpdate({ userId }, { $inc: { wallet: -amount, dailyTransferAmount: amount } });
      await UserEconomy.findOneAndUpdate({ userId: targetUser.id }, { $inc: { wallet: cleanAmount } }, { upsert: true });

      const embed = new EmbedBuilder()
        .setColor("#E67E22")
        .setTitle("💸 Para Transferi Gerçekleşti")
        .setDescription(`<@${userId}> adlı kullanıcı <@${targetUser.id}> kullanıcısına para gönderdi.`)
        .addFields(
          { name: "Brüt Tutar", value: `${amount.toLocaleString()} ₺`, inline: true },
          { name: "Kesilen Pazar Vergisi (%5)", value: `${tax.toLocaleString()} ₺`, inline: true },
          { name: "Alıcıya Ulaşan Net Tutar", value: `${cleanAmount.toLocaleString()} ₺`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // [/profil]
    if (commandName === "profil") {
      const econ = await UserEconomy.findOne({ userId });
      const itemsCount = await Inventory.countDocuments({ userId, isListed: false });
      const cardsCount = await CardInventory.countDocuments({ userId });
      const neededXp = econ.level * 2500;

      const embed = new EmbedBuilder()
        .setColor("#9B59B6")
        .setTitle(`📇 Ticari Kimlik Profili - ${interaction.user.username}`)
        .setDescription(`**Ünvan:** Usta Tüccar (Seviye ${econ.level})`)
        .addFields(
          { name: "📈 Tecrübe Puanı (XP)", value: `${econ.xp} / ${neededXp} XP`, inline: true },
          { name: "📦 Envanterdeki Eşyalar", value: `${itemsCount} Adet Eşya`, inline: true },
          { name: "🃏 Toplam Kart Koleksiyonu", value: `${cardsCount} Adet Ticari Kart`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // [/bitpazari]
    if (commandName === "bitpazari") {
      // Şans çarpanını hesapla
      const boost = await getCardBoost(userId, "BitPazariAvcısı");
      
      // Havuzdan rastgele 3 eşya seç ve kullanıcıya sun
      const itemRow = new ActionRowBuilder();
      const generatedItems = [];

      for (let i = 0; i < 3; i++) {
        const randomBase = FLEA_MARKET_POOL[Math.floor(Math.random() * FLEA_MARKET_POOL.length)];
        const condition = randomBase.qualities[Math.floor(Math.random() * randomBase.qualities.length)];
        
        // Kondisyona göre değer çarpanı kurgusu
        let condMultiplier = 1.0;
        if (condition === "Antika") condMultiplier = 3.5;
        if (condition === "Yeni") condMultiplier = 1.8;
        if (condition === "Eski") condMultiplier = 0.5;
        if (condition === "Kullanılmış") condMultiplier = 0.3;

        const fakeChance = Math.random();
        let actualValue = Math.floor(randomBase.baseValue * condMultiplier);
        let displayName = randomBase.name;
        
        if (fakeChance < 0.25) { // %25 İhtimalle ürün sahte/değersiz çıkabilir
          actualValue = 10;
          displayName = "⚠️ Şüpheli " + displayName;
        } else if (fakeChance > 0.90 * (1 / boost)) { // Şans kartı varsa jackpot ihtimali artar
          actualValue = Math.floor(actualValue * 5);
          displayName = "✨ Kusursuz " + displayName;
        }

        const costPrice = Math.floor(randomBase.baseValue * 0.7 * (fakeChance > 0.5 ? 0.8 : 1.2));
        const uniqueId = `flea_${Date.now()}_${i}`;
        
        generatedItems.push({ uniqueId, name: displayName, cost: costPrice, actualValue, condition });
        
        itemRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_flea_${costPrice}_${actualValue}_${condition}_${displayName.replace(/ /g, "-")}`)
            .setLabel(`${displayName.substring(0,15)} (${costPrice}₺)`)
            .setStyle(ButtonStyle.Primary)
        );
      }

      const embed = new EmbedBuilder()
        .setColor("#F39C12")
        .setTitle("🏪 Bit Pazarı Tezgâhı")
        .setDescription("Aşağıdaki ürünler bit pazarından rastgele toplanmıştır. Satın aldıktan sonra gerçek değerleri envanterinizde güncellenir. Kâr da edebilirsiniz, dolandırılabilirsiniz de!")
        .setFooter({ text: "Unutmayın: Kartlarınız şansınızı doğrudan etkiler." })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], components: [itemRow] });
    }

    // [/pazar]
    if (commandName === "pazar") {
      const operation = options.getString("islem");

      if (operation === "list") {
        // Envanterdeki satılabilir (pazarda olmayan) ürünleri getir
        const inventoryItems = await Inventory.find({ userId, isListed: false });
        if (inventoryItems.length === 0) return interaction.reply({ content: "❌ Envanterinizde satışa çıkarılabilecek boşta ürün bulunamadı.", ephemeral: true });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("market_select_item")
          .setPlaceholder("Satışa çıkarılacak eşyayı seçin...");

        inventoryItems.slice(0, 25).forEach(item => {
          selectMenu.addOptions({
            label: `${item.name} (${item.condition})`,
            description: `Gerçek Tahmini Değer: ${item.actualValue}₺`,
            value: item._id.toString()
          });
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.reply({ content: "💼 Satışa sunmak istediğiniz ürünü seçin:", components: [row], ephemeral: true });
      }

      if (operation === "my") {
        const myListings = await MarketListing.find({ sellerId: userId });
        if (myListings.length === 0) return interaction.reply({ content: "❌ Şu an pazarda aktif bir ilanınız bulunmuyor.", ephemeral: true });

        const embed = new EmbedBuilder()
          .setColor("#34495E")
          .setTitle("📋 Aktif Pazar İlanlarınız")
          .setDescription(myListings.map(l => `🔹 **${l.name}** (${l.condition}) - Fiyat: **${l.price} ₺** [ID: ${l.listingId}]`).join("\n"))
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }
    }

    // [/kartlarim]
    if (commandName === "kartlarim") {
      const userCards = await CardInventory.find({ userId });
      if (userCards.length === 0) return interaction.reply({ content: "🃏 Henüz hiçbir ticaret güçlendirici kartına sahip değilsiniz. `/paketac` komutunu deneyin!", ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor("#1ABC9C")
        .setTitle(`🃏 Kart Koleksiyonunuz - ${interaction.user.username}`)
        .setDescription("Aşağıdaki kartlar hesabınıza kalıcı pasif paslar ve ekonomik ayrıcalıklar sağlar:")
        .addFields(userCards.map(c => ({
          name: `${c.name} [${c.rarity}]`,
          value: `Güçlendirici Modülü: \`${c.boostType}\``,
          inline: true
        })))
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // [/paketac]
    if (commandName === "paketac") {
      const packType = options.getString("tur");
      const price = PACK_PRICES[packType];

      const econ = await UserEconomy.findOne({ userId });
      if (econ.wallet < price) return interaction.reply({ content: `❌ Bu paketi açmak için yeterli nakitiniz yok! Gerekli: **${price} ₺**`, ephemeral: true });

      // Parayı düş
      await UserEconomy.findOneAndUpdate({ userId }, { $inc: { wallet: -price } });

      // Havuzdan ağırlıklı kart çekimi simülasyonu
      const rolledCard = CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
      
      await CardInventory.create({
        userId,
        cardId: rolledCard.id,
        name: rolledCard.name,
        rarity: rolledCard.rarity,
        boostType: rolledCard.boostType
      });

      // Animasyonlu Açılış Efekti (Embed Güncelleme)
      const initialEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("📦 Paket Yırtılıyor...")
        .setDescription("Şans çarkları dönüyor, kart ambalajından ayrılıyor...");

      await interaction.reply({ embeds: [initialEmbed] });

      setTimeout(async () => {
        const finalEmbed = new EmbedBuilder()
          .setColor("#9B59B6")
          .setTitle("✨ PAKET AÇILDI!")
          .setDescription(`<@${userId}> yeni bir pasif güçlendirici kart kazandı!`)
          .addFields(
            { name: "Kart İsmi", value: rolledCard.name, inline: true },
            { name: "Nadirliği", value: rolledCard.rarity, inline: true },
            { name: "Sağladığı Pasif", value: rolledCard.desc, inline: false }
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [finalEmbed] });
      }, 2500);
      return;
    }

    // [/ihale]
    if (commandName === "ihale") {
      const operation = options.getString("islem");

      if (operation === "view") {
        const activeAuctions = await Auction.find({ isClosed: false });
        if (activeAuctions.length === 0) return interaction.reply({ content: "🔨 Şu an pazar yerinde aktif açık artırma bulunmuyor.", ephemeral: true });

        const embed = new EmbedBuilder()
          .setColor("#D35400")
          .setTitle("🔨 Aktif İhaleler / Açık Artırma Havuzu")
          .setDescription(activeAuctions.map(a => `🔹 **${a.itemName}** (${a.condition}) | Mevcut En Yüksek Teklif: **${a.currentBid} ₺** | En Yüksek Teklif Veren: ${a.highestBidder ? `<@${a.highestBidder}>` : "Yok"} | Bitiş: <t:${Math.floor(a.endsAt.getTime() / 1000)}:R>\n*Teklif vermek için ID: \`${a.auctionId}\`*`).join("\n\n"));

        return interaction.reply({ embeds: [embed] });
      }

      if (operation === "bid") {
        const modal = new ModalBuilder().setCustomId("modal_auction_bid_submit").setTitle("İhaleye Teklif Ver");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("auc_id").setLabel("İhale ID'si").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("auc_amount").setLabel("Teklif Ettiğiniz Tutar (₺)").setStyle(TextInputStyle.Short).setRequired(true))
        );
        return interaction.showModal(modal);
      }

      if (operation === "create") {
        const userItems = await Inventory.find({ userId, isListed: false });
        if (userItems.length === 0) return interaction.reply({ content: "❌ Envanterinizde ihaleye çıkarılacak boşta ürün bulunamadı.", ephemeral: true });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("auction_select_item")
          .setPlaceholder("İhaleye çıkarılacak eşyayı seçin...");

        userItems.slice(0, 25).forEach(item => {
          selectMenu.addOptions({
            label: `${item.name} (${item.condition})`,
            description: `Değer Tabanı: ${item.actualValue}₺`,
            value: item._id.toString()
          });
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.reply({ content: "🔨 İhale platformuna koymak istediğiniz ürünü seçin:", components: [row], ephemeral: true });
      }
    }

    // [/koleksiyon]
    if (commandName === "koleksiyon") {
      const userItems = await Inventory.find({ userId });
      const userItemNames = userItems.map(i => i.name);

      const embed = new EmbedBuilder()
        .setColor("#34495E")
        .setTitle("📚 Koleksiyon Kitapçığı ve Set Durumları")
        .setTimestamp();

      for (const [setName, requiredItems] of Object.entries(COLLECTIONS)) {
        const completedCount = requiredItems.filter(item => userItemNames.includes(item)).length;
        const statusText = completedCount === requiredItems.length ? "✅ TAMAMLANDI (+50.000₺ Ödül Alındı)" : `⏳ Eksik Parçalar var (${completedCount}/${requiredItems.length})`;
        embed.addFields({ name: setName, value: `Gereksinimler: ${requiredItems.join(", ")}\nDurum: **${statusText}**` });
      }

      return interaction.reply({ embeds: [embed] });
    }

    // [/gorevler]
    if (commandName === "gorevler") {
      let quest = await Quest.findOne({ userId, isCompleted: false });
      if (!quest) {
        // Yeni görev ata
        const types = ["sell", "buy_flea"];
        const selectedType = types[Math.floor(Math.random() * types.length)];
        quest = await Quest.create({
          userId,
          type: selectedType,
          targetCount: selectedType === "sell" ? 3 : 2,
          rewardMoney: 5000
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("🎯 Günlük Ticari Görevleriniz")
        .setDescription(`**Görev:** ${quest.type === "sell" ? "Pazar yerinde 3 eşya satın" : "Bit pazarından 2 defa alışveriş yapın"}\n**İlerleme:** \`${quest.currentCount} / ${quest.targetCount}\`\n**Ödül:** \`${quest.rewardMoney} ₺\``)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // [/liderlik]
    if (commandName === "liderlik") {
      const topRich = await UserEconomy.find().sort({ wallet: -1 }).limit(5);
      const topLevel = await UserEconomy.find().sort({ level: -1 }).limit(5);

      const embed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("🏆 Sunucu Ticaret Odası Liderlik Tablosu")
        .addFields(
          { name: "💰 En Zengin Girişimciler", value: topRich.map((u, index) => `${index + 1}. <@${u.userId}> - Cüzdan: **${u.wallet.toLocaleString()} ₺**`).join("\n") || "Veri yok", inline: false },
          { name: "⭐ En Yüksek Seviyeli Tacirler", value: topLevel.map((u, index) => `${index + 1}. <@${u.userId}> - Seviye: **${u.level}**`).join("\n") || "Veri yok", inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }

  // --- 2. BUTTONS ETKİLEŞİMLERİ (BUTTON CLICK RESPONSES) ---
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId.startsWith("buy_flea_")) {
      const parts = customId.split("_");
      const cost = parseInt(parts[2]);
      const actualValue = parseInt(parts[3]);
      const condition = parts[4];
      const name = parts[5].replace(/-/g, " ");

      const econ = await UserEconomy.findOne({ userId });
      if (econ.wallet < cost) return interaction.reply({ content: "❌ Cüzdanınızda bu ürünü alacak kadar nakit yok!", ephemeral: true });

      // Parayı düş envantere ekle
      await UserEconomy.findOneAndUpdate({ userId }, { $inc: { wallet: -cost } });
      await Inventory.create({
        userId,
        itemId: "item_" + Date.now(),
        name,
        quality: actualValue > cost * 2 ? "Efsanevi" : "Yaygın",
        condition,
        actualValue
      });

      // Görev ve XP güncelleme
      await updateQuest(userId, "buy_flea", interaction.channel);
      await addXp(userId, CONFIG.XP_PER_TRADE, interaction.channel);

      const netProfit = actualValue - cost;
      const profitText = netProfit >= 0 ? `📈 Net Kâr: +${netProfit}₺` : `📉 Net Zarar: ${netProfit}₺`;

      const embed = new EmbedBuilder()
        .setColor(netProfit >= 0 ? "#2ECC71" : "#E74C3C")
        .setTitle("🛒 Satın Alım Başarılı")
        .setDescription(`Bit pazarından **${name}** ürününü başarıyla satın aldınız ve eksper raporu çıktı!`)
        .addFields(
          { name: "Ödediğiniz Tutar", value: `${cost} ₺`, inline: true },
          { name: "Gerçek Piyasa Değeri", value: `${actualValue} ₺`, inline: true },
          { name: "Finansal Analiz Durumu", value: `**${profitText}**`, inline: false }
        )
        .setTimestamp();

      // Butonları devre dışı bırakmak için orijinal mesajı güncelle
      return interaction.update({ embeds: [embed], components: [] });
    }
  }

  // --- 3. SELECT MENUS ETKİLEŞİMLERİ ---
  if (interaction.isStringSelectMenu()) {
    // Pazar İlan Fiyat Belirleme Aşaması
    if (interaction.customId === "market_select_item") {
      const dbItemId = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`modal_market_price_submit_${dbItemId}`).setTitle("Pazar İlan Fiyatı Belirle");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("listing_price").setLabel("Satış Fiyatını Yazın (₺)").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      return interaction.showModal(modal);
    }

    // İhale Taban Fiyat Belirleme Aşaması
    if (interaction.customId === "auction_select_item") {
      const dbItemId = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`modal_auction_price_submit_${dbItemId}`).setTitle("İhale Başlangıç Fiyatı");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("auc_start_price").setLabel("Başlangıç Taban Fiyatı (₺)").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      return interaction.showModal(modal);
    }
  }

  // --- 4. MODAL FORMS SUBMISSIONS ---
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;

    if (customId.startsWith("modal_market_price_submit_")) {
      const dbItemId = customId.replace("modal_market_price_submit_", "");
      const priceInput = interaction.fields.getTextInputValue("listing_price");
      const price = parseInt(priceInput);

      if (isNaN(price) || price <= 0) return interaction.reply({ content: "❌ Lütfen geçerli pozitif bir sayısal değer girin.", ephemeral: true });

      const item = await Inventory.findById(dbItemId);
      if (!item || item.userId !== userId) return interaction.reply({ content: "❌ Eşya bulunamadı veya size ait değil.", ephemeral: true });

      item.isListed = true;
      await item.save();

      const uniqueListingId = "list_" + Math.floor(1000 + Math.random() * 9000);
      await MarketListing.create({
        listingId: uniqueListingId,
        sellerId: userId,
        itemId: item._id.toString(),
        name: item.name,
        quality: item.quality,
        condition: item.condition,
        price: price
      });

      await updateQuest(userId, "sell", interaction.channel);

      return interaction.reply({ content: `✅ **${item.name}** adlı ürününüz **${price.toLocaleString()} ₺** fiyat etiketiyle \`${uniqueListingId}\` kodu üzerinden pazara arz edilmiştir.` });
    }

    if (customId.startsWith("modal_auction_price_submit_")) {
      const dbItemId = customId.replace("modal_auction_price_submit_", "");
      const priceInput = interaction.fields.getTextInputValue("auc_start_price");
      const startPrice = parseInt(priceInput);

      if (isNaN(startPrice) || startPrice <= 0) return interaction.reply({ content: "❌ Geçersiz başlangıç fiyatı.", ephemeral: true });

      const item = await Inventory.findById(dbItemId);
      if (!item || item.userId !== userId) return interaction.reply({ content: "❌ Eşya doğrulaması başarısız.", ephemeral: true });

      // Eşyayı envanterden ihale süresince sil/ayır
      await Inventory.findByIdAndDelete(dbItemId);

      const uniqueAucId = "auc_" + Math.floor(1000 + Math.random() * 9000);
      const endsAt = new Date(Date.now() + 3600000 * 2); // 2 Saatlik İhale Süresi

      await Auction.create({
        auctionId: uniqueAucId,
        sellerId: userId,
        itemName: item.name,
        quality: item.quality,
        condition: item.condition,
        currentBid: startPrice,
        endsAt: endsAt
      });

      return interaction.reply({ content: `🔨 **${item.name}** ürünü için **${startPrice.toLocaleString()} ₺** başlangıç fiyatı ile açık artırma başlatıldı! İhale ID: \`${uniqueAucId}\`` });
    }

    if (customId === "modal_auction_bid_submit") {
      const aucId = interaction.fields.getTextInputValue("auc_id");
      const bidAmount = parseInt(interaction.fields.getTextInputValue("auc_amount"));

      if (isNaN(bidAmount) || bidAmount <= 0) return interaction.reply({ content: "❌ Geçersiz teklif miktarı.", ephemeral: true });

      const auction = await Auction.findOne({ auctionId: aucId, isClosed: false });
      if (!auction) return interaction.reply({ content: "❌ Bu ID'ye ait aktif bir açık artırma bulunamadı veya süresi dolmuş.", ephemeral: true });

      if (bidAmount <= auction.currentBid) return interaction.reply({ content: `❌ Teklifiniz mevcut en yüksek tekliften (**${auction.currentBid} ₺**) daha yüksek olmalıdır!`, ephemeral: true });

      const econ = await UserEconomy.findOne({ userId });
      if (econ.wallet < bidAmount) return interaction.reply({ content: "❌ Cüzdanınızda teklif ettiğiniz miktarda nakit bulunmuyor.", ephemeral: true });

      // Eski en yüksek teklif verene parasını iade et
      if (auction.highestBidder) {
        await UserEconomy.findOneAndUpdate({ userId: auction.highestBidder }, { $inc: { wallet: auction.currentBid } });
      }

      // Yeni teklif verenin parasını bloke et ve ihaleyi güncelle
      await UserEconomy.findOneAndUpdate({ userId }, { $inc: { wallet: -bidAmount } });
      
      auction.currentBid = bidAmount;
      auction.highestBidder = userId;
      
      // Son dakika teklif uzatma mekanizması (Anti-Sniping Engelleyici)
      const timeLeft = auction.endsAt - new Date();
      if (timeLeft < 300000) { // Son 5 dakika kalmışsa süreyi 5 dakika uzat
        auction.endsAt = new Date(auction.endsAt.getTime() + 300000);
      }
      
      await auction.save();

      return interaction.reply({ content: `✅ **${auction.itemName}** için başarıyla **${bidAmount.toLocaleString()} ₺** değerinde en yüksek teklifi verdiniz.` });
    }
  }
});

// --- ENGINE RECOVERY VE GLOBAL ERROR MANAGEMENT ---
process.on("unhandledRejection", error => {
  console.error("❌ Kritik Sistem Hatası Yakalandı (Unhandled Rejection):", error);
});

client.login(process.env.DISCORD_TOKEN);
