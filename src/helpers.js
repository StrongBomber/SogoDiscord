import { EmbedBuilder } from 'discord.js';
import { User, Transaction } from '../models/index.js';

// ─────────────────────────────────────────────
// XP SİSTEMİ
// ─────────────────────────────────────────────
export function xpForLevel(level) {
  return Math.floor(100 * Math.pow(1.4, level - 1));
}

export async function addXP(userId, amount) {
  const user = await User.findOne({ userId });
  if (!user) return null;

  user.xp += amount;
  const xpNeeded = xpForLevel(user.level);

  const leveledUp = user.xp >= xpNeeded;
  if (leveledUp) {
    user.xp -= xpNeeded;
    user.level += 1;
    const bonus = user.level * 50;
    user.balance += bonus;
    await user.save();
    return { leveledUp: true, newLevel: user.level, bonus };
  }

  await user.save();
  return { leveledUp: false };
}

// ─────────────────────────────────────────────
// VERGİ SİSTEMİ
// ─────────────────────────────────────────────
export function calculateTax(amount) {
  if (amount <= 1000) return Math.floor(amount * 0.05);
  if (amount <= 10000) return Math.floor(amount * 0.10);
  if (amount <= 100000) return Math.floor(amount * 0.15);
  return Math.floor(amount * 0.20);
}

export function applyTax(amount) {
  const tax = calculateTax(amount);
  return { net: amount - tax, tax };
}

// ─────────────────────────────────────────────
// NADİRLİK RENKLERİ
// ─────────────────────────────────────────────
export const rarityColors = {
  yaygın: 0x95a5a6,
  nadir: 0x3498db,
  epik: 0x9b59b6,
  efsanevi: 0xf39c12,
  mitik: 0xe74c3c
};

export const rarityEmojis = {
  yaygın: '⬜',
  nadir: '🟦',
  epik: '🟣',
  efsanevi: '🟡',
  mitik: '🔴'
};

export const rarityWeights = {
  yaygın: 55,
  nadir: 25,
  epik: 12,
  efsanevi: 6,
  mitik: 2
};

export function rollRarity() {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const [rarity, weight] of Object.entries(rarityWeights)) {
    cumulative += weight;
    if (roll < cumulative) return rarity;
  }
  return 'yaygın';
}

// ─────────────────────────────────────────────
// KULLANICI ALMA / OLUŞTURMA
// ─────────────────────────────────────────────
export async function getOrCreateUser(userId, username) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = await User.create({ userId, username });
  }
  return user;
}

// ─────────────────────────────────────────────
// PARA FORMATLAMA
// ─────────────────────────────────────────────
export function formatMoney(amount) {
  return `**${amount.toLocaleString('tr-TR')}** 🪙`;
}

export function formatNumber(num) {
  return num.toLocaleString('tr-TR');
}

// ─────────────────────────────────────────────
// COOLDOWN YÖNETİCİSİ
// ─────────────────────────────────────────────
const cooldowns = new Map();

export function checkCooldown(userId, commandName, durationMs) {
  const key = `${userId}:${commandName}`;
  const lastUsed = cooldowns.get(key);
  const now = Date.now();

  if (lastUsed) {
    const remaining = durationMs - (now - lastUsed);
    if (remaining > 0) {
      return { onCooldown: true, remaining };
    }
  }

  cooldowns.set(key, now);
  return { onCooldown: false };
}

export function formatCooldown(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} saniye`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dakika ${seconds % 60} saniye`;
  const hours = Math.floor(minutes / 60);
  return `${hours} saat ${minutes % 60} dakika`;
}

// ─────────────────────────────────────────────
// ANTİ-EKSPLOİT KORUMA
// ─────────────────────────────────────────────
const transferHistory = new Map();
const TRANSFER_LIMIT = 5;
const TRANSFER_WINDOW = 60 * 1000; // 1 dakika

export function antiExploitCheck(userId) {
  const now = Date.now();
  const history = transferHistory.get(userId) || [];
  const recent = history.filter(t => now - t < TRANSFER_WINDOW);

  if (recent.length >= TRANSFER_LIMIT) {
    return { blocked: true, reason: 'Çok fazla işlem yapıyorsunuz. Lütfen bekleyin.' };
  }

  recent.push(now);
  transferHistory.set(userId, recent);
  return { blocked: false };
}

// ─────────────────────────────────────────────
// İŞLEM KAYIT
// ─────────────────────────────────────────────
export async function logTransaction(fromId, toId, amount, type, description) {
  await Transaction.create({ fromId, toId, amount, type, description });
}

// ─────────────────────────────────────────────
// EMBED YARDIMCILARI
// ─────────────────────────────────────────────
export function successEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

export function errorEmbed(description) {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('❌ Hata')
    .setDescription(description)
    .setTimestamp();
}

export function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

// ─────────────────────────────────────────────
// LOG KANALI
// ─────────────────────────────────────────────
export async function sendLog(client, embed) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;
  try {
    const channel = await client.channels.fetch(logChannelId);
    if (channel) await channel.send({ embeds: [embed] });
  } catch {
    // Kanal bulunamazsa sessizce geç
  }
}
