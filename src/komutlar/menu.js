const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getUser, ITEMS, formatCoins, getRequiredXp } = require("../database");

async function getMainMenuEmbed(userId) {
  const user = await getUser(userId);
  const activeItem = user && user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok ❌";
  return new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🤖 Devasa RPG & Eğlence İstasyonu")
    .setDescription("Karakterinizi geliştirin, ormanda vahşi hayvanları avlayın veya lüks yemekler hazırlayın!")
    .addFields(
      { name: "👤 Profil Detayları", value: `🌟 **Seviye:** ${user.level}\n✨ **XP:** ${user.xp}/${getRequiredXp(user.level)}`, inline: true },
      { name: "💰 Finansal Durum", value: `💵 **Cüzdan:** ${formatCoins(user.coins)} Jeton\n⚔️ **Silah:** ${activeItem}`, inline: true }
    )
    .setTimestamp();
}

function getMainMenuComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("nav_economy").setLabel("🪙 Ekonomi & RPG").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("nav_general").setLabel("⚙️ Genel / Moderasyon").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("nav_sandbox").setLabel("🛠️ Sandbox Modu").setStyle(ButtonStyle.Danger)
  )];
}

module.exports = {
  data: {
    name: "menu",
    description: "Devasa RPG, Eğlence ve Moderasyon istasyonunu açar."
  },
  async execute(interactionOrMessage, isMessage = false) {
    const userId = isMessage ? interactionOrMessage.author.id : interactionOrMessage.user.id;
    const embed = await getMainMenuEmbed(userId);
    const components = getMainMenuComponents();

    if (isMessage) {
      return interactionOrMessage.reply({ embeds: [embed], components: components });
    } else {
      return interactionOrMessage.reply({ embeds: [embed], components: components });
    }
  },
  getMainMenuEmbed,
  getMainMenuComponents
};
