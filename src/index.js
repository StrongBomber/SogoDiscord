import mongoose from 'mongoose';

// ─────────────────────────────────────────────
// USER SCHEMA
// ─────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  balance: { type: Number, default: 500, min: 0 },
  bank: { type: Number, default: 0, min: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  inventory: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    quantity: { type: Number, default: 1 }
  }],
  cards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Card' }],
  completedQuests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quest' }],
  achievements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Achievement' }],
  dailyStreak: { type: Number, default: 0 },
  lastDaily: { type: Date, default: null },
  lastWork: { type: Date, default: null },
  lastRob: { type: Date, default: null },
  totalEarned: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  questProgress: { type: Map, of: Number, default: {} },
  createdAt: { type: Date, default: Date.now }
});

// ─────────────────────────────────────────────
// ITEM SCHEMA
// ─────────────────────────────────────────────
const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  emoji: { type: String, default: '📦' },
  category: {
    type: String,
    enum: ['araç', 'yiyecek', 'koleksiyon', 'özel', 'güçlendirme'],
    default: 'araç'
  },
  rarity: {
    type: String,
    enum: ['yaygın', 'nadir', 'epik', 'efsanevi'],
    default: 'yaygın'
  },
  usable: { type: Boolean, default: false },
  tradeable: { type: Boolean, default: true },
  maxStack: { type: Number, default: 99 },
  effect: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

// ─────────────────────────────────────────────
// CARD SCHEMA
// ─────────────────────────────────────────────
const cardSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  templateId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  emoji: { type: String, default: '🃏' },
  rarity: {
    type: String,
    enum: ['yaygın', 'nadir', 'epik', 'efsanevi', 'mitik'],
    default: 'yaygın'
  },
  power: { type: Number, default: 1 },
  series: { type: String, default: 'Temel' },
  foil: { type: Boolean, default: false },
  obtainedAt: { type: Date, default: Date.now }
});

// ─────────────────────────────────────────────
// AUCTION SCHEMA
// ─────────────────────────────────────────────
const auctionSchema = new mongoose.Schema({
  sellerId: { type: String, required: true },
  sellerName: { type: String, required: true },
  itemType: { type: String, enum: ['item', 'card', 'para'], default: 'item' },
  itemId: { type: mongoose.Schema.Types.ObjectId, refPath: 'itemType' },
  itemName: { type: String, required: true },
  itemEmoji: { type: String, default: '📦' },
  quantity: { type: Number, default: 1 },
  startPrice: { type: Number, required: true, min: 1 },
  currentPrice: { type: Number, required: true },
  buyNowPrice: { type: Number, default: null },
  minBidIncrement: { type: Number, default: 10 },
  bids: [{
    bidderId: { type: String, required: true },
    bidderName: { type: String, required: true },
    amount: { type: Number, required: true },
    bidAt: { type: Date, default: Date.now }
  }],
  highestBidderId: { type: String, default: null },
  highestBidderName: { type: String, default: null },
  status: { type: String, enum: ['aktif', 'tamamlandı', 'iptal'], default: 'aktif' },
  endsAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

// ─────────────────────────────────────────────
// MARKET LISTING SCHEMA
// ─────────────────────────────────────────────
const marketListingSchema = new mongoose.Schema({
  sellerId: { type: String, required: true },
  sellerName: { type: String, required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  itemName: { type: String, required: true },
  itemEmoji: { type: String, default: '📦' },
  quantity: { type: Number, default: 1, min: 1 },
  pricePerUnit: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['aktif', 'satıldı', 'iptal'], default: 'aktif' },
  createdAt: { type: Date, default: Date.now }
});

// ─────────────────────────────────────────────
// QUEST SCHEMA
// ─────────────────────────────────────────────
const questSchema = new mongoose.Schema({
  questId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  emoji: { type: String, default: '📋' },
  type: {
    type: String,
    enum: ['günlük', 'haftalık', 'aylık', 'özel'],
    default: 'günlük'
  },
  requirements: [{
    action: {
      type: String,
      enum: ['kazanma', 'harcama', 'gönderme', 'satma', 'kart_açma', 'pazar_alışveriş', 'ihale_kazanma']
    },
    amount: { type: Number, default: 1 }
  }],
  rewards: {
    para: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    items: [{ itemId: mongoose.Schema.Types.ObjectId, quantity: Number }]
  },
  active: { type: Boolean, default: true }
});

// ─────────────────────────────────────────────
// ACHIEVEMENT SCHEMA
// ─────────────────────────────────────────────
const achievementSchema = new mongoose.Schema({
  achievementId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  emoji: { type: String, default: '🏆' },
  category: {
    type: String,
    enum: ['ekonomi', 'sosyal', 'koleksiyon', 'gizli'],
    default: 'ekonomi'
  },
  requirement: {
    action: { type: String, required: true },
    amount: { type: Number, default: 1 }
  },
  reward: {
    para: { type: Number, default: 0 },
    xp: { type: Number, default: 0 }
  },
  rarity: {
    type: String,
    enum: ['bronz', 'gümüş', 'altın', 'platin'],
    default: 'bronz'
  }
});

// ─────────────────────────────────────────────
// FLEA MARKET LISTING (Bit Pazarı)
// ─────────────────────────────────────────────
const fleaMarketSchema = new mongoose.Schema({
  sellerId: { type: String, required: true },
  sellerName: { type: String, required: true },
  itemName: { type: String, required: true },
  itemEmoji: { type: String, default: '🗑️' },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 1 },
  condition: {
    type: String,
    enum: ['sıfır', 'iyi', 'orta', 'kötü'],
    default: 'orta'
  },
  status: { type: String, enum: ['aktif', 'satıldı', 'iptal'], default: 'aktif' },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 saat
  },
  createdAt: { type: Date, default: Date.now }
});

// ─────────────────────────────────────────────
// TRANSACTION LOG SCHEMA
// ─────────────────────────────────────────────
const transactionSchema = new mongoose.Schema({
  fromId: { type: String, default: 'system' },
  toId: { type: String, required: true },
  amount: { type: Number, required: true },
  type: {
    type: String,
    enum: ['kazanma', 'harcama', 'transfer', 'vergi', 'faiz', 'ödül', 'ihale', 'pazar'],
    default: 'kazanma'
  },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model('User', userSchema);
export const Item = mongoose.model('Item', itemSchema);
export const Card = mongoose.model('Card', cardSchema);
export const Auction = mongoose.model('Auction', auctionSchema);
export const MarketListing = mongoose.model('MarketListing', marketListingSchema);
export const FleaMarket = mongoose.model('FleaMarket', fleaMarketSchema);
export const Quest = mongoose.model('Quest', questSchema);
export const Achievement = mongoose.model('Achievement', achievementSchema);
export const Transaction = mongoose.model('Transaction', transactionSchema);
