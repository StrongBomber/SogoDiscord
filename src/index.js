require("dotenv").config();
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { ensureUser } = require("./database");
const { handleEconomyInteractions } = require("./sistemler/ekonomi");
const { handleModerationInteractions } = require("./sistemler/moderasyon");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.commands = new Collection();

// --- DİNAMİK KOMUT YÜKLEYİCİSİ ---
const commandsPath = path.join(__dirname, "komutlar");
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    }
  }
}

client.on("ready", async () => {
  console.log(`🤖 Bot ${client.user.tag} olarak başarıyla tetiklendi!`);
  try {
    // Tüm yüklenen slash komutlarını Discord API'sine otomatik kaydet
    const slashCommands = [];
    client.commands.forEach(cmd => slashCommands.push(cmd.data));
    await client.application.commands.set(slashCommands);
    console.log("✅ Tüm Slash komutları Discord entegrasyonuna senkronize edildi.");
  } catch (error) {
    console.error("❌ Komut senkronizasyon hatası:", error);
  }
});

// --- METİN TABANLI ESKİ SİSTEM (!menu) ---
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;
  if (msg.content === "!menu") {
    const menuCommand = client.commands.get("menu");
    if (menuCommand) {
      await ensureUser(msg.author.id);
      return menuCommand.execute(msg, true);
    }
  }
});

// --- ETKİLEŞİM VE PANEL YÖNETİM MOTORU ---
client.on("interactionCreate", async interaction => {
  // Veritabanı güvencesi
  await ensureUser(interaction.user.id);

  // 1. Modern Slash Komut Yönetimi (/menu)
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, false);
    } catch (error) {
      console.error(error);
    }
    return;
  }

  // 2. Modüler Ekonomi/RPG Etkileşim Yönlendiricisi
  const ecoHandled = await handleEconomyInteractions(interaction);
  if (ecoHandled) return;

  // 3. Modüler Genel/Moderasyon Etkileşim Yönlendiricisi
  const modHandled = await handleModerationInteractions(interaction);
  if (modHandled) return;
});

client.login(process.env.DISCORD_TOKEN);
