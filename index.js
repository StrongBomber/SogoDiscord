
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const dbFile = './data/db.json';

// cooldowns
const cooldowns = new Map();

function loadDB() {
  if (!fs.existsSync(dbFile)) return {};
  return JSON.parse(fs.readFileSync(dbFile));
}

function saveDB(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

function getUser(db, id) {
  if (!db[id]) {
    db[id] = {
      cash: 0,
      inventory: [],
      lastDaily: 0,
      xp: 0,
      level: 1
    };
  }
  return db[id];
}

function addXP(user, amount) {
  user.xp += amount;
  const needed = user.level * 100;
  if (user.xp >= needed) {
    user.level++;
    user.xp = 0;
  }
}

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;

  const now = Date.now();
  const db = loadDB();
  const user = getUser(db, message.author.id);

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  // XP system
  addXP(user, Math.floor(Math.random() * 10) + 5);

  // cooldown example (global per user command spam control)
  if (cooldowns.has(message.author.id)) {
    const diff = now - cooldowns.get(message.author.id);
    if (diff < 1500) return;
  }
  cooldowns.set(message.author.id, now);

  if (cmd === "balance" || cmd === "bal") {
    return message.reply(`💰 Money: **${user.cash}** coins`);
  }

  if (cmd === "daily") {
    const day = 24 * 60 * 60 * 1000;
    if (now - user.lastDaily < day) {
      return message.reply("⏳ You already claimed daily reward.");
    }
    const reward = 500;
    user.cash += reward;
    user.lastDaily = now;
    saveDB(db);
    return message.reply(`🎁 Daily reward: **${reward} coins**`);
  }

  if (cmd === "beg") {
    const earn = Math.floor(Math.random() * 80) + 10;
    user.cash += earn;
    saveDB(db);
    return message.reply(`🪙 You begged and got **${earn} coins**`);
  }

  if (cmd === "work") {
    const earn = Math.floor(Math.random() * 200) + 50;
    user.cash += earn;
    saveDB(db);
    return message.reply(`💼 You worked and earned **${earn} coins**`);
  }

  if (cmd === "shop") {
    return message.reply(
      "🛒 Shop:\n" +
      "1. apple - 100 coins\n" +
      "2. sword - 500 coins\n" +
      "Use !buy <item>"
    );
  }

  if (cmd === "buy") {
    const item = args[0];
    const shop = {
      apple: 100,
      sword: 500
    };

    if (!shop[item]) return message.reply("Item not found.");

    if (user.cash < shop[item]) return message.reply("Not enough coins.");

    user.cash -= shop[item];
    user.inventory.push(item);

    saveDB(db);
    return message.reply(`🛍️ You bought **${item}**`);
  }

  if (cmd === "inventory" || cmd === "inv") {
    return message.reply(`🎒 Inventory: ${user.inventory.length ? user.inventory.join(", ") : "Empty"}`);
  }

  if (cmd === "gamble") {
    const bet = parseInt(args[0]);
    if (!bet || bet <= 0) return message.reply("Enter valid bet.");
    if (user.cash < bet) return message.reply("Not enough coins.");

    const win = Math.random() > 0.5;

    if (win) {
      user.cash += bet;
      saveDB(db);
      return message.reply(`🎉 You won **${bet} coins**`);
    } else {
      user.cash -= bet;
      saveDB(db);
      return message.reply(`💀 You lost **${bet} coins**`);
    }
  }

  if (cmd === "profile") {
    return message.reply(
      `📊 Profile:\n💰 ${user.cash} coins\n⭐ Level ${user.level}\n✨ XP ${user.xp}`
    );
  }

  saveDB(db);
});

client.login(config.token);
