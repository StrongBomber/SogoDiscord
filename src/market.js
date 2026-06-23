import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Item, MarketListing } from '../models/index.js';
import {
  getOrCreateUser, formatMoney, formatNumber, applyTax,
  successEmbed, errorEmbed, infoEmbed, addXP, logTransaction, rarityEmojis
} from '../utils/helpers.js';

// ─────────────────────────────────────────────
// /SAT — Markete eşya listele
// ─────────────────────────────────────────────
export const satCommand = {
  data: new SlashCommandBuilder()
    .setName('sat')
    .setDescription('Envanterindeki bir eşyayı pazara listele.')
    .addStringOption(opt =>
      opt.setName('eşya').setDescription('Satmak istediğin eşyanın adı').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('fiyat').setDescription('Birim fiyat (🪙)').setRequired(true).setMinValue(1)
    )
    .addIntegerOption(opt =>
      opt.setName('adet').setDescription('Kaç adet satmak istiyorsun?').setRequired(false).setMinValue(1)
    ),

  async execute(interaction) {
    const itemName = interaction.options.getString('eşya');
    const price = interaction.options.getInteger('fiyat');
    const quantity = interaction.options.getInteger('adet') || 1;

    const user = await getOrCreateUser(interaction.user.id, interaction.user.username);
    const item = await Item.findOne({ name: { $regex: new RegExp(itemName, 'i') } });

    if (!item)
      return interaction.reply({ embeds: [errorEmbed(`"${itemName}" adında bir eşya bulunamadı.`)], ephemeral: true });

    if (!item.tradeable)
      return interaction.reply({ embeds: [errorEmbed('Bu eşya satılamaz.')], ephemeral: true });

    const invEntry = user.inventory.find(i => i.itemId.toString() === item._id.toString());
    if (!invEntry || invEntry.quantity < quantity)
      return interaction.reply({ embeds: [errorEmbed(`Envanterinde yeterli **${item.name}** yok.`)], ephemeral: true });

    // Envanterden düş
    invEntry.quantity -= quantity;
    if (invEntry.quantity === 0) {
      user.inventory = user.inventory.filter(i => i.itemId.toString() !== item._id.toString());
    }
    await user.save();

    // Pazar listesi oluştur
    const listing = await MarketListing.create({
      sellerId: interaction.user.id,
      sellerName: interaction.user.username,
      itemId: item._id,
      itemName: item.name,
      itemEmoji: item.emoji,
      quantity,
      pricePerUnit: price
    });

    const embed = new EmbedBuilder()
      .setColor(0x27ae60)
      .setTitle('🏪 Pazara Eklendi')
      .setDescription(`${item.emoji} **${item.name}** × ${quantity} adet pazara listelendi.`)
      .addFields(
        { name: '💰 Birim Fiyat', value: `${formatNumber(price)} 🪙`, inline: true },
        { name: '📦 Adet', value: `${quantity}`, inline: true },
        { name: '💎 Toplam Değer', value: `${formatNumber(price * quantity)} 🪙`, inline: true },
        { name: '🆔 Listeleme ID', value: `\`${listing._id}\``, inline: false }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};

// ─────────────────────────────────────────────
// /PAZAR — Pazar listesini görüntüle
// ─────────────────────────────────────────────
export const pazarCommand = {
  data: new SlashCommandBuilder()
    .setName('pazar')
    .setDescription('Aktif pazar listelerini görüntüle.')
    .addStringOption(opt =>
      opt.setName('eşya').setDescription('Belirli bir eşyayı ara').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('sıralama')
        .setDescription('Sıralama türü')
        .setRequired(false)
        .addChoices(
          { name: '💰 En Ucuz', value: 'ucuz' },
          { name: '💎 En Pahalı', value: 'pahalı' },
          { name: '🕐 En Yeni', value: 'yeni' }
        )
    ),

  async execute(interaction) {
    const search = interaction.options.getString('eşya');
    const sort = interaction.options.getString('sıralama') || 'yeni';

    const query = { status: 'aktif' };
    if (search) query.itemName = { $regex: new RegExp(search, 'i') };

    const sortMap = {
      ucuz: { pricePerUnit: 1 },
      pahalı: { pricePerUnit: -1 },
      yeni: { createdAt: -1 }
    };

    const listings = await MarketListing.find(query).sort(sortMap[sort]).limit(15);

    if (!listings.length)
      return interaction.reply({ embeds: [infoEmbed('Pazar Boş', 'Şu an aktif listeleme bulunmuyor.')], ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0x2980b9)
      .setTitle('🏪 Oyuncu Pazarı')
      .setTimestamp();

    const lines = listings.map((l, i) =>
      `${i + 1}. ${l.itemEmoji} **${l.itemName}** × ${l.quantity}` +
      `\n   💰 ${formatNumber(l.pricePerUnit)} 🪙/adet — ${l.sellerName}\n   🆔 \`${l._id}\``
    );

    embed.setDescription(lines.join('\n\n'));
    embed.setFooter({ text: `Satın almak için: /satınal <id>` });

    return interaction.reply({ embeds: [embed] });
  }
};

// ─────────────────────────────────────────────
// /SATINAL — Pazardan eşya satın al
// ─────────────────────────────────────────────
export const satinalCommand = {
  data: new SlashCommandBuilder()
    .setName('satınal')
    .setDescription('Pazardan bir eşya satın al.')
    .addStringOption(opt =>
      opt.setName('id').setDescription('Listeleme ID\'si').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('adet').setDescription('Kaç adet almak istiyorsun?').setRequired(false).setMinValue(1)
    ),

  async execute(interaction) {
    const listingId = interaction.options.getString('id');
    const requestQty = interaction.options.getInteger('adet') || 1;

    const listing = await MarketListing.findById(listingId).catch(() => null);
    if (!listing || listing.status !== 'aktif')
      return interaction.reply({ embeds: [errorEmbed('Bu listeleme bulunamadı veya artık aktif değil.')], ephemeral: true });

    if (listing.sellerId === interaction.user.id)
      return interaction.reply({ embeds: [errorEmbed('Kendi listelemenizi satın alamazsınız!')], ephemeral: true });

    const buyQty = Math.min(requestQty, listing.quantity);
    const totalCost = listing.pricePerUnit * buyQty;
    const { net, tax } = applyTax(totalCost);

    const buyer = await getOrCreateUser(interaction.user.id, interaction.user.username);
    const seller = await getOrCreateUser(listing.sellerId, listing.sellerName);

    if (buyer.balance < totalCost)
      return interaction.reply({ embeds: [errorEmbed(`Yeterli paran yok! Gerekli: ${formatNumber(totalCost)} 🪙`)], ephemeral: true });

    const item = await Item.findById(listing.itemId);

    // Para transferi
    buyer.balance -= totalCost;
    buyer.totalSpent += totalCost;
    seller.balance += net;
    seller.totalEarned += net;

    // Envanter güncelle
    const existing = buyer.inventory.find(i => i.itemId.toString() === listing.itemId.toString());
    if (existing) {
      existing.quantity += buyQty;
    } else {
      buyer.inventory.push({ itemId: listing.itemId, quantity: buyQty });
    }

    // Listeleme güncelle
    listing.quantity -= buyQty;
    if (listing.quantity === 0) listing.status = 'satıldı';

    await buyer.save();
    await seller.save();
    await listing.save();
    await addXP(interaction.user.id, 8);
    await logTransaction(interaction.user.id, listing.sellerId, net, 'pazar', `Pazar alışverişi: ${listing.itemName} × ${buyQty}`);

    const embed = new EmbedBuilder()
      .setColor(0x27ae60)
      .setTitle('🛒 Satın Alındı!')
      .addFields(
        { name: '📦 Eşya', value: `${listing.itemEmoji} ${listing.itemName} × ${buyQty}`, inline: true },
        { name: '💰 Ödenen', value: `${formatNumber(totalCost)} 🪙`, inline: true },
        { name: '🏛️ Vergi', value: `${formatNumber(tax)} 🪙`, inline: true },
        { name: '👤 Satıcı', value: listing.sellerName, inline: true },
        { name: '👛 Kalan Bakiye', value: `${formatNumber(buyer.balance)} 🪙`, inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};

// ─────────────────────────────────────────────
// /LİSTELEMELERİM — Kendi listelerimi yönet
// ─────────────────────────────────────────────
export const listelemelerimCommand = {
  data: new SlashCommandBuilder()
    .setName('listelemelerim')
    .setDescription('Pazardaki aktif listelemelerini görüntüle ve iptal et.'),

  async execute(interaction) {
    const listings = await MarketListing.find({ sellerId: interaction.user.id, status: 'aktif' });

    if (!listings.length)
      return interaction.reply({ embeds: [infoEmbed('Listeleme Yok', 'Pazarda aktif listelemeniz bulunmuyor.')], ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0x8e44ad)
      .setTitle('📋 Benim Listelemeleri')
      .setTimestamp();

    const lines = listings.map((l, i) =>
      `${i + 1}. ${l.itemEmoji} **${l.itemName}** × ${l.quantity} — ${formatNumber(l.pricePerUnit)} 🪙/adet\n   🆔 \`${l._id}\``
    );

    embed.setDescription(lines.join('\n\n'));
    embed.setFooter({ text: 'İptal etmek için: /istelipt <id>' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

// ─────────────────────────────────────────────
// /LİSTEİPT — Listelemeyi iptal et
// ─────────────────────────────────────────────
export const listeIptCommand = {
  data: new SlashCommandBuilder()
    .setName('listelipt')
    .setDescription('Pazardaki listelemeni iptal et ve eşyayı geri al.')
    .addStringOption(opt =>
      opt.setName('id').setDescription('Listeleme ID\'si').setRequired(true)
    ),

  async execute(interaction) {
    const listingId = interaction.options.getString('id');
    const listing = await MarketListing.findById(listingId).catch(() => null);

    if (!listing || listing.status !== 'aktif')
      return interaction.reply({ embeds: [errorEmbed('Listeleme bulunamadı.')], ephemeral: true });

    if (listing.sellerId !== interaction.user.id)
      return interaction.reply({ embeds: [errorEmbed('Bu listeleme size ait değil.')], ephemeral: true });

    const user = await getOrCreateUser(interaction.user.id, interaction.user.username);
    const existing = user.inventory.find(i => i.itemId.toString() === listing.itemId.toString());
    if (existing) {
      existing.quantity += listing.quantity;
    } else {
      user.inventory.push({ itemId: listing.itemId, quantity: listing.quantity });
    }

    listing.status = 'iptal';
    await user.save();
    await listing.save();

    return interaction.reply({
      embeds: [successEmbed('Listeleme İptal Edildi', `${listing.itemEmoji} **${listing.itemName}** × ${listing.quantity} envanterine geri döndü.`)]
    });
  }
};
