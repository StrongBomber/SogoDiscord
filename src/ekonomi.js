import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import {
  getOrCreateUser, formatMoney, formatNumber, applyTax,
  checkCooldown, formatCooldown, antiExploitCheck,
  addXP, logTransaction, successEmbed, errorEmbed, infoEmbed, sendLog
} from '../utils/helpers.js';
import { EmbedBuilder as EB } from 'discord.js';

// ─────────────────────────────────────────────
// /BAKİYE
// ─────────────────────────────────────────────
export const bakiyeCommand = {
  data: new SlashCommandBuilder()
    .setName('bakiye')
    .setDescription('Bakiyeni veya başka birinin bakiyesini görüntüle.')
    .addUserOption(opt =>
      opt.setName('kullanıcı').setDescription('Bakiyesini görmek istediğin kullanıcı').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('kullanıcı') || interaction.user;
    const user = await getOrCreateUser(target.id, target.username);
    const total = user.balance + user.bank;

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`💰 ${target.username} — Bakiye`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '👛 Cüzdan', value: `${formatNumber(user.balance)} 🪙`, inline: true },
        { name: '🏦 Banka', value: `${formatNumber(user.bank)} 🪙`, inline: true },
        { name: '💎 Toplam', value: `${formatNumber(total)} 🪙`, inline: true },
        { name: '⭐ Seviye', value: `${user.level}`, inline: true },
        { name: '📊 XP', value: `${formatNumber(user.xp)}`, inline: true },
        { name: '🔥 Günlük Seri', value: `${user.dailyStreak} gün`, inline: true }
      )
      .setFooter({ text: `Toplam Kazanılan: ${formatNumber(user.totalEarned)} 🪙` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};

// ─────────────────────────────────────────────
// /YATIR
// ─────────────────────────────────────────────
export const yatirCommand = {
  data: new SlashCommandBuilder()
    .setName('yatır')
    .setDescription('Cüzdanından bankaya para yatır.')
    .addStringOption(opt =>
      opt.setName('miktar').setDescription('Yatırılacak miktar (sayı veya "hepsi")').setRequired(true)
    ),

  async execute(interaction) {
    const user = await getOrCreateUser(interaction.user.id, interaction.user.username);
    const input = interaction.options.getString('miktar');
    let amount = input.toLowerCase() === 'hepsi' ? user.balance : parseInt(input);

    if (isNaN(amount) || amount <= 0)
      return interaction.reply({ embeds: [errorEmbed('Geçerli bir miktar girin.')], ephemeral: true });

    if (amount > user.balance)
      return interaction.reply({ embeds: [errorEmbed(`Cüzdanında yeterli para yok! Mevcut: ${formatNumber(user.balance)} 🪙`)], ephemeral: true });

    user.balance -= amount;
    user.bank += amount;
    await user.save();
    await logTransaction(interaction.user.id, interaction.user.id, amount, 'transfer', 'Bankaya yatırma');

    return interaction.reply({
      embeds: [successEmbed('Para Yatırıldı', `${formatMoney(amount)} bankaya yatırdın.\n\n👛 Cüzdan: ${formatMoney(user.balance)}\n🏦 Banka: ${formatMoney(user.bank)}`)]
    });
  }
};

// ─────────────────────────────────────────────
// /ÇEK
// ─────────────────────────────────────────────
export const cekCommand = {
  data: new SlashCommandBuilder()
    .setName('çek')
    .setDescription('Bankadan cüzdanına para çek.')
    .addStringOption(opt =>
      opt.setName('miktar').setDescription('Çekilecek miktar (sayı veya "hepsi")').setRequired(true)
    ),

  async execute(interaction) {
    const user = await getOrCreateUser(interaction.user.id, interaction.user.username);
    const input = interaction.options.getString('miktar');
    let amount = input.toLowerCase() === 'hepsi' ? user.bank : parseInt(input);

    if (isNaN(amount) || amount <= 0)
      return interaction.reply({ embeds: [errorEmbed('Geçerli bir miktar girin.')], ephemeral: true });

    if (amount > user.bank)
      return interaction.reply({ embeds: [errorEmbed(`Bankanda yeterli para yok! Mevcut: ${formatNumber(user.bank)} 🪙`)], ephemeral: true });

    user.bank -= amount;
    user.balance += amount;
    await user.save();
    await logTransaction('bank', interaction.user.id, amount, 'transfer', 'Bankadan çekme');

    return interaction.reply({
      embeds: [successEmbed('Para Çekildi', `${formatMoney(amount)} bankadan çektin.\n\n👛 Cüzdan: ${formatMoney(user.balance)}\n🏦 Banka: ${formatMoney(user.bank)}`)]
    });
  }
};

// ─────────────────────────────────────────────
// /GÖNDER
// ─────────────────────────────────────────────
export const gonderCommand = {
  data: new SlashCommandBuilder()
    .setName('gönder')
    .setDescription('Başka bir kullanıcıya para gönder.')
    .addUserOption(opt =>
      opt.setName('kullanıcı').setDescription('Parayı göndereceğin kullanıcı').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('miktar').setDescription('Gönderilecek miktar').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('kullanıcı');
    const amount = interaction.options.getInteger('miktar');

    if (target.id === interaction.user.id)
      return interaction.reply({ embeds: [errorEmbed('Kendinize para gönderemezsiniz!')], ephemeral: true });

    if (target.bot)
      return interaction.reply({ embeds: [errorEmbed('Botlara para gönderemezsiniz!')], ephemeral: true });

    // Anti-exploit kontrolü
    const exploit = antiExploitCheck(interaction.user.id);
    if (exploit.blocked)
      return interaction.reply({ embeds: [errorEmbed(exploit.reason)], ephemeral: true });

    const sender = await getOrCreateUser(interaction.user.id, interaction.user.username);
    const receiver = await getOrCreateUser(target.id, target.username);

    const { net, tax } = applyTax(amount);

    if (sender.balance < amount)
      return interaction.reply({ embeds: [errorEmbed(`Yeterli paran yok! Mevcut: ${formatNumber(sender.balance)} 🪙`)], ephemeral: true });

    sender.balance -= amount;
    receiver.balance += net;
    receiver.totalEarned += net;
    sender.totalSpent += amount;

    await sender.save();
    await receiver.save();
    await logTransaction(interaction.user.id, target.id, net, 'transfer', `Kullanıcıya gönderme (vergi: ${tax})`);
    await addXP(interaction.user.id, 5);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💸 Para Gönderildi')
      .setDescription(`${interaction.user} → ${target}`)
      .addFields(
        { name: '💰 Gönderilen', value: `${formatNumber(amount)} 🪙`, inline: true },
        { name: '🏛️ Vergi', value: `${formatNumber(tax)} 🪙`, inline: true },
        { name: '✅ Alınan', value: `${formatNumber(net)} 🪙`, inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};

// ─────────────────────────────────────────────
// /GÜNLÜK
// ─────────────────────────────────────────────
export const gunlukCommand = {
  data: new SlashCommandBuilder()
    .setName('günlük')
    .setDescription('Günlük ödülünü al!'),

  async execute(interaction) {
    const user = await getOrCreateUser(interaction.user.id, interaction.user.username);
    const now = new Date();
    const lastDaily = user.lastDaily;

    if (lastDaily) {
      const diff = now - lastDaily;
      const cooldown = 20 * 60 * 60 * 1000; // 20 saat

      if (diff < cooldown) {
        const remaining = cooldown - diff;
        return interaction.reply({
          embeds: [errorEmbed(`Günlük ödülünü zaten aldın! Bir sonraki: **${formatCooldown(remaining)}** sonra.`)],
          ephemeral: true
        });
      }

      // Seri kontrolü
      const streakWindow = 48 * 60 * 60 * 1000;
      if (diff <= streakWindow) {
        user.dailyStreak += 1;
      } else {
        user.dailyStreak = 1;
      }
    } else {
      user.dailyStreak = 1;
    }

    const baseReward = 200;
    const streakBonus = Math.min(user.dailyStreak * 20, 500);
    const total = baseReward + streakBonus;

    user.balance += total;
    user.totalEarned += total;
    user.lastDaily = now;
    await user.save();
    await addXP(interaction.user.id, 10);
    await logTransaction('system', interaction.user.id, total, 'ödül', `Günlük ödül (seri: ${user.dailyStreak})`);

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('🌅 Günlük Ödül')
      .setDescription(`**${interaction.user.username}** günlük ödülünü aldı!`)
      .addFields(
        { name: '💰 Temel Ödül', value: `${formatNumber(baseReward)} 🪙`, inline: true },
        { name: '🔥 Seri Bonusu', value: `+${formatNumber(streakBonus)} 🪙`, inline: true },
        { name: '✅ Toplam', value: `${formatNumber(total)} 🪙`, inline: true },
        { name: '📅 Günlük Seri', value: `${user.dailyStreak} gün 🔥`, inline: true },
        { name: '👛 Yeni Bakiye', value: `${formatNumber(user.balance)} 🪙`, inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};

// ─────────────────────────────────────────────
// /LİDERLİK
// ─────────────────────────────────────────────
export const liderlikCommand = {
  data: new SlashCommandBuilder()
    .setName('liderlik')
    .setDescription('Sunucu liderlik tablosunu görüntüle.')
    .addStringOption(opt =>
      opt.setName('tür')
        .setDescription('Sıralama türü')
        .setRequired(false)
        .addChoices(
          { name: '💰 Bakiye', value: 'balance' },
          { name: '🏦 Banka', value: 'bank' },
          { name: '⭐ Seviye', value: 'level' },
          { name: '📈 Kazanılan', value: 'totalEarned' }
        )
    ),

  async execute(interaction) {
    const { User } = await import('../models/index.js');
    const type = interaction.options.getString('tür') || 'balance';
    const typeNames = { balance: '💰 Bakiye', bank: '🏦 Banka', level: '⭐ Seviye', totalEarned: '📈 Toplam Kazanılan' };

    const users = await User.find().sort({ [type]: -1 }).limit(10);
    const myRank = await User.countDocuments({ [type]: { $gt: interaction.user.id } });

    let desc = '';
    const medals = ['🥇', '🥈', '🥉'];
    users.forEach((u, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      const val = formatNumber(u[type]);
      const unit = type === 'level' ? '⭐' : '🪙';
      desc += `${medal} **${u.username}** — ${val} ${unit}\n`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`🏆 Liderlik Tablosu — ${typeNames[type]}`)
      .setDescription(desc || 'Henüz veri yok.')
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
