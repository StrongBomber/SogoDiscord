require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  UserSelectMenuBuilder,
  ChannelSelectMenuBuilder, // Yeni eklendi
  ChannelType,              // Yeni eklendi
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

const activeWhispers = new Map(); 

// --- FISILTI PANELİ YARDIMCILARI ---
function buildBridgeEmbed(logs, targetId) {
  const logText = logs.length > 0 ? logs.join("\n") : "*Henüz bir mesaj geçmişi yok...*";
  return new EmbedBuilder()
    .setColor("#9B59B6")
    .setTitle("🤫 Canlı Anonim Fısıltı Paneli")
    .setDescription(`**Hedef Kullanıcı:** <@${targetId}>\n\n**💬 Sohbet Geçmişi:**\n${logText}`)
    .setFooter({ text: "Bu paneli sadece siz görebilirsiniz." })
    .setTimestamp();
}

function buildBridgeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("wh_bridge_reply").setLabel("✍️ Mesaj Gönder").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("wh_bridge_close").setLabel("🔒 Odayı Kapat").setStyle(ButtonStyle.Danger)
  );
}

function buildBridgeFormatRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("wh_bridge_fmt_normal").setLabel("📝 Normal Yazı").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("wh_bridge_fmt_embed").setLabel("🖼️ Embed Mesaj").setStyle(ButtonStyle.Success)
  );
}

function getInitialWhisperComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("wh_start_flow").setLabel("🤫 Fısıltı Panelini Aç").setStyle(ButtonStyle.Secondary)
  )];
}

function getInitialWhisperEmbed() {
  return new EmbedBuilder()
    .setColor("#9B59B6")
    .setTitle("🤫 Gizli Fısıltı Sistemi")
    .setDescription("Aşağıdaki butona tıklayarak **sadece sizin görebileceğiniz** fısıltı panelini aktifleştirin.");
}

// --- READY ETKİNLİĞİ ---
client.on("ready", async () => {
  console.log(`🤖 Bot ${client.user.tag} olarak başarıyla başlatıldı!`);
  try {
    await client.application.commands.set([
      {
        name: "fısıltı",
        description: "Gizli ve anonim bir fısıltı odası veya DM fısıltısı başlatır."
      }
    ]);
    console.log("✅ Fısıltı slash komutu başarıyla senkronize edildi.");
  } catch (error) {
    console.error("❌ Başlatma motorunda hata oluştu:", error);
  }
});

// --- MESAJ YAKALAYICI ---
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  // Hedef kullanıcının thread içerisindeki yanıtlarını yakalayıp panele yansıtma kısmı
  if (msg.channel.isThread() && activeWhispers.has(msg.channel.id)) {
    const bridge = activeWhispers.get(msg.channel.id);
    if (msg.author.id === bridge.targetId) {
      bridge.logs.push(`👤 **Karşı Taraf:** ${msg.content}`);
      if (bridge.lastInteraction) {
        await bridge.lastInteraction.editReply({
          embeds: [buildBridgeEmbed(bridge.logs, bridge.targetId)],
          components: [buildBridgeButtons()]
        }).catch(() => null);
      }
    }
    return;
  }

  if (msg.content === "!fısıltı") {
    return msg.reply({ embeds: [getInitialWhisperEmbed()], components: getInitialWhisperComponents() });
  }
});

// --- ETKİLEŞİM MOTORU ---
client.on("interactionCreate", async interaction => {
  const userId = interaction.user.id;

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "fısıltı") {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🤫 Fısıldanacak Kullanıcıyı Seçin").setDescription("Lütfen anonim fısıltı göndermek istediğiniz kullanıcıyı aşağıdaki menüden seçin.")],
        components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("menu_whisper_user").setPlaceholder("Kullanıcı seçiniz..."))],
        ephemeral: true
      });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "wh_start_flow") {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🤫 Fısıldanacak Kullanıcıyı Seçin").setDescription("Lütfen anonim fısıltı göndermek istediğiniz kullanıcıyı aşağıdaki menüden seçin.")],
        components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("menu_whisper_user").setPlaceholder("Kullanıcı seçiniz..."))],
        ephemeral: true
      });
    }

    if (interaction.customId === "wh_bridge_reply") {
      const bridge = activeWhispers.get(userId);
      if (!bridge) return interaction.reply({ content: "❌ Aktif fısıltı odası bulunamadı.", ephemeral: true });
      return interaction.update({ 
        embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🤫 Gönderim Formatı Seçin").setDescription("Göndereceğiniz yeni yanıtın biçimini belirleyin:")], 
        components: [buildBridgeFormatRow()] 
      });
    }

    if (interaction.customId.startsWith("wh_bridge_fmt_")) {
      const type = interaction.customId.replace("wh_bridge_fmt_", "");
      const modal = new ModalBuilder().setCustomId(`modal_wh_reply_submit_${type}`).setTitle(type === "normal" ? "Normal Yazı Yanıtı" : "Embed Formatında Yanıt");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("whisper_reply_msg").setLabel("Fısıltı Cevabınız").setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "wh_bridge_close") {
      const bridge = activeWhispers.get(userId); 
      if (!bridge) return interaction.reply({ content: "❌ Aktif fısıltı odası bulunamadı.", ephemeral: true });
      
      const thread = await client.channels.fetch(bridge.threadId).catch(() => null);
      if (thread) { 
        await thread.send({ content: "🔒 *Bu fısıltı odası kapatıldı.*" }).catch(() => null); 
        await thread.setArchived(true).catch(() => null); 
      }
      activeWhispers.delete(bridge.threadId); 
      activeWhispers.delete(userId);
      return interaction.update({ content: "🔒 Fısıltı odası başarıyla kapatıldı ve arşivlendi.", embeds: [], components: [] });
    }

    // Yöntem Seçim Butonları Tetiklendiğinde
    if (interaction.customId.startsWith("whmethod_")) {
      const parts = interaction.customId.split("_");
      const method = parts[1]; // thread veya dm
      const targetId = parts[2];

      if (method === "dm") {
        // DM modu seçildiyse direkt format adımına geç
        return interaction.update({
          embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🖼️ Fısıltı Formatı Seçin").setDescription(`Mesajın görünüm biçimini seçin:`)],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`whfmt_dm_normal_${targetId}`).setLabel("📝 Normal Yazı").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`whfmt_dm_embed_${targetId}`).setLabel("🖼️ Embed Mesaj").setStyle(ButtonStyle.Success)
          )],
          ephemeral: true
        });
      } else if (method === "thread") {
        // Oda modu seçildiyse önce Kanal Seçim Menüsünü göster
        return interaction.update({
          embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("📁 Kanal Seçimi").setDescription("Fısıltı odasının (Thread) kurulacağı metin kanalını seçin:")],
          components: [new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId(`menu_whisper_channel_${targetId}`)
              .setPlaceholder("Bir metin kanalı seçin...")
              .addChannelTypes(ChannelType.GuildText)
          )],
          ephemeral: true
        });
      }
    }

    // Format Seçildikten Sonra Modal Açma (DM veya Kanal id'li thread fark etmeksizin)
    if (interaction.customId.startsWith("whfmt_")) {
      const parts = interaction.customId.split("_"); 
      const method = parts[1]; // thread veya dm
      const type = parts[2]; // normal veya embed
      const targetId = parts[3];
      const channelId = parts[4] || ""; // Sadece thread modunda doludur
      
      const customModalId = `modal_wh_submit_${method}_${type}_${targetId}` + (channelId ? `_${channelId}` : "");
      
      const modal = new ModalBuilder().setCustomId(customModalId).setTitle(type === "normal" ? "Normal Yazı Fısıltısı" : "Embed Formatında Fısıltı");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("whisper_msg").setLabel("Fısıltı Mesajı İçeriği").setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return interaction.showModal(modal);
    }
  }

  if (interaction.isUserSelectMenu()) {
    if (interaction.customId === "menu_whisper_user") {
      const targetId = interaction.values[0];
      // Kendine atma engeli kaldırıldı.

      return interaction.update({ 
        embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🔀 Gönderim Türü Seçin").setDescription(`<@${targetId}> kullanıcısına fısıltıyı nasıl iletmek istersiniz?\n\n**Oda Kurma:** Belirleyeceğiniz kanalda ikinizin de erişebileceği özel bir başlık odası açar.\n**DM (Direkt Mesaj):** Mesajı doğrudan kullanıcının özel mesaj kutusuna anonim olarak gönderir.`)], 
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`whmethod_thread_${targetId}`).setLabel("📁 Oda Kurma").setStyle(ButtonStyle.Primary), 
          new ButtonBuilder().setCustomId(`whmethod_dm_${targetId}`).setLabel("💬 DM Üzerinden").setStyle(ButtonStyle.Success)
        )], 
        ephemeral: true 
      });
    }
  }

  // --- KANAL SEÇİM MENÜSÜ YAKALAYICI ---
  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId.startsWith("menu_whisper_channel_")) {
      const targetId = interaction.customId.replace("menu_whisper_channel_", "");
      const channelId = interaction.values[0];

      // Kanal seçildikten sonra format butonlarını göster ve kanal kimliğini butona göm
      return interaction.update({
        embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🖼️ Fısıltı Formatı Seçin").setDescription(`Mesajın görünüm biçimini seçin:`)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`whfmt_thread_normal_${targetId}_${channelId}`).setLabel("📝 Normal Yazı").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`whfmt_thread_embed_${targetId}_${channelId}`).setLabel("🖼️ Embed Mesaj").setStyle(ButtonStyle.Success)
        )],
        ephemeral: true
      });
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("modal_wh_submit_")) {
      const parts = interaction.customId.split("_"); 
      const methodType = parts[3]; // thread veya dm
      const formatType = parts[4]; // normal veya embed
      const targetId = parts[5]; 
      const channelId = parts[6];  // Sadece thread ise doludur
      const msgText = interaction.fields.getTextInputValue("whisper_msg");
      
      const member = await interaction.guild.members.fetch(targetId).catch(() => null); 
      if (!member) return interaction.reply({ content: "❌ Üye sunucuda bulunamadı.", ephemeral: true });

      // --- DM ÜZERİNDEN GÖNDERİM MODU ---
      if (methodType === "dm") {
        try {
          if (formatType === "normal") {
            await member.send({ content: `🔔 **Bir anonim fısıltı mesajı aldınız!**\n\n${msgText}` });
          } else {
            await member.send({ embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🤫 Anonim Fısıltı Mesajı").setDescription(msgText).setTimestamp()] });
          }
          return interaction.reply({ content: `✅ Fısıltınız <@${targetId}> kullanıcısına **DM yoluyla** anonim olarak başarıyla iletildi!`, ephemeral: true });
        } catch (err) {
          return interaction.reply({ content: "❌ Kullanıcıya DM gönderilemedi. DM kutusu kapalı olabilir.", ephemeral: true });
        }
      }

      // --- ODA KURMA MODU ---
      if (methodType === "thread") {
        try {
          // Kullanıcının seçtiği hedef kanalı çekiyoruz
          const targetChannel = await client.channels.fetch(channelId).catch(() => null);
          if (!targetChannel || !targetChannel.isTextBased()) {
            return interaction.reply({ content: "❌ Seçilen yazı kanalı bulunamadı veya erişilemez durumda.", ephemeral: true });
          }

          const thread = await targetChannel.threads.create({ 
            name: `🤫 fısıltı-${Math.floor(1000 + Math.random() * 9000)}`, 
            autoArchiveDuration: 60, 
            type: 12 // Özel Alt Başlık (GuildPrivateThread)
          });
          
          await thread.members.add(targetId).catch(() => null);
          
          if (formatType === "normal") {
            await thread.send({ content: `🔔 **Yeni bir anonim fısıltı mesajı aldınız!**\n\n${msgText}` });
          } else {
            await thread.send({ content: `<@${targetId}>`, embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🤫 Anonim Fısıltı Mesajı").setDescription(msgText).setTimestamp()] });
          }

          const initialLogs = [`✍️ **Siz (${formatType === "normal" ? "Yazı" : "Embed"}):** ${msgText}`];
          const bridgeObject = { initiatorId: userId, targetId: targetId, threadId: thread.id, logs: initialLogs, lastInteraction: interaction };
          
          activeWhispers.set(thread.id, bridgeObject); 
          activeWhispers.set(userId, bridgeObject);
          
          return interaction.reply({ embeds: [buildBridgeEmbed(initialLogs, targetId)], components: [buildBridgeButtons()], ephemeral: true });
        } catch (err) { 
          return interaction.reply({ content: "❌ Gizli başlık odası oluşturulurken bir hata oluştu. Yetkilerimi ve kanal izinlerimi kontrol edin.", ephemeral: true }); 
        }
      }
    }

    // Panele Yazılan Yanıtlar Gönderildiğinde
    if (interaction.customId.startsWith("modal_wh_reply_submit_")) {
      const type = interaction.customId.replace("modal_wh_reply_submit_", ""); 
      const msgText = interaction.fields.getTextInputValue("whisper_reply_msg");
      
      const bridge = activeWhispers.get(userId); 
      if (!bridge) return interaction.reply({ content: "❌ Aktif oda bulunamadı.", ephemeral: true });
      
      const thread = await client.channels.fetch(bridge.threadId).catch(() => null); 
      if (!thread) { 
        activeWhispers.delete(bridge.threadId); 
        activeWhispers.delete(userId); 
        return interaction.reply({ content: "❌ Odaya erişilemedi, muhtemelen silinmiş.", ephemeral: true }); 
      }

      if (type === "normal") {
        await thread.send({ content: `💬 **Gelen Yanıt:** ${msgText}` }); 
      } else {
        await thread.send({ embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("💬 Gelen Yanıt").setDescription(msgText).setTimestamp()] });
      }

      bridge.logs.push(`✍️ **Siz (${type === "normal" ? "Yazı" : "Embed"}):** ${msgText}`); 
      bridge.lastInteraction = interaction;
      
      return interaction.reply({ embeds: [buildBridgeEmbed(bridge.logs, bridge.targetId)], components: [buildBridgeButtons()], ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
