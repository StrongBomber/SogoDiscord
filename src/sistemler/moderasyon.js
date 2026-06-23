const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require("discord.js");
const { getUser, setCoins, formatCoins } = require("../database");
const { getMainMenuComponents } = require("../komutlar/menu");

const backButtonRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("back_to_main").setLabel("⬅️ Ana Menüye Dön").setStyle(ButtonStyle.Secondary)
);

async function handleModerationInteractions(interaction) {
  const userId = interaction.user.id;
  const customId = interaction.customId;

  // --- BUTTON AKSİYONLARI ---
  if (interaction.isButton()) {
    if (customId === "nav_general") {
      const embed = new EmbedBuilder().setColor("#5865F2").setTitle("⚙️ Genel Yönetim ve Moderasyon Paneli").setDescription("Sunucu istatistiklerini denetleyin veya moderasyon eylemlerini yürütün.");
      const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gen_server").setLabel("📊 Sunucu").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("gen_user").setLabel("👤 Profil").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("gen_ping").setLabel("🏓 Ping").setStyle(ButtonStyle.Secondary));
      const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("mod_purge_btn").setLabel("🧹 Mesaj Sil").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("mod_lock_btn").setLabel("🔒 Kanalı Kilitle").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("mod_unlock_btn").setLabel("🔓 Kilidi Aç").setStyle(ButtonStyle.Success));
      const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("mod_kick_btn").setLabel("🥾 Üye At (Kick)").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("mod_ban_btn").setLabel("🔨 Üye Yasakla (Ban)").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("mod_say_nav").setLabel("✍️ Mesaj Yazdır").setStyle(ButtonStyle.Primary));
      const row4 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("mod_timeout_btn").setLabel("⏳ Sürgün (Timeout)").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("mod_untimeout_btn").setLabel("🔊 Sürgün Kaldır").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("mod_whisper_btn").setLabel("🤫 Fısıltı Odası Aç").setStyle(ButtonStyle.Primary));
      await interaction.update({ embeds: [embed], components: [row1, row2, row3, row4, backButtonRow] }); return true;
    }

    if (customId === "mod_purge_btn") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      const modal = new ModalBuilder().setCustomId("modal_purge").setTitle("Mesaj Temizleme");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("purge_amount").setLabel("Miktar (1 - 100)").setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal); return true;
    }

    if (customId === "mod_lock_btn" || customId === "mod_unlock_btn") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      const isLock = customId === "mod_lock_btn";
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: isLock ? false : null });
      const embed = new EmbedBuilder().setColor(isLock ? "#ED4245" : "#57F287").setTitle(isLock ? "🔒 Kanal Kilitlendi" : "🔓 Kanal Kilidi Açıldı").setDescription(isLock ? "Bu kanal yazı gönderimine mühürlendi." : "Kanal kilidi kaldırıldı, herkes yazabilir.");
      await interaction.update({ embeds: [embed], components: [backButtonRow] }); return true;
    }

    if (["mod_kick_btn", "mod_ban_btn", "mod_timeout_btn", "mod_untimeout_btn", "mod_whisper_btn"].includes(customId)) {
      const isWhisper = customId === "mod_whisper_btn";
      if (!isWhisper) {
        const reqPerm = customId.includes("kick") ? PermissionFlagsBits.KickMembers : customId.includes("ban") ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.ModerateMembers;
        if (!interaction.member.permissions.has(reqPerm)) return interaction.reply({ content: "❌ Yetkiniz yetersiz.", ephemeral: true });
      }
      const titleMap = { mod_kick_btn: "🥾 Üye Atma", mod_ban_btn: "🔨 Üye Banlama", mod_timeout_btn: "⏳ Sürgün Cezası", mod_untimeout_btn: "🔊 Sürgün Kaldırma", mod_whisper_btn: "🤫 Gizli Fısıltı Odası" };
      const embed = new EmbedBuilder().setColor("#2b2d31").setTitle(titleMap[customId]).setDescription("İşlem uygulamak istediğiniz kullanıcıyı seçin:");
      const sm = new UserSelectMenuBuilder().setCustomId(`menu_${customId.replace("mod_", "").replace("_btn", "")}_user`).setPlaceholder("Kullanıcı Ara ve Seç...");
      await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(sm), backButtonRow] }); return true;
    }

    if (customId === "mod_say_nav") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("✍️ Yazdırma Formatı Seçin")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("say_normal_btn").setLabel("📝 Normal Yazı").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("say_embed_btn").setLabel("🖼️ Embed")).setComponents, backButtonRow] }); return true;
    }

    if (customId === "say_normal_btn" || customId === "say_embed_btn") {
      const isEmbed = customId === "say_embed_btn";
      const modal = new ModalBuilder().setCustomId(`modal_say_${isEmbed ? "embed" : "normal"}`).setTitle("Metin Giriş Paneli");
      if (!isEmbed) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("say_text").setLabel("Mesaj İçeriği").setStyle(TextInputStyle.Paragraph).setRequired(true)));
      else modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("emb_title").setLabel("Başlık").setStyle(TextInputStyle.Short)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("emb_desc").setLabel("Açıklama").setStyle(TextInputStyle.Paragraph)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("emb_color").setLabel("Hex Kodu (Örn: #ff0000)").setStyle(TextInputStyle.Short).setValue("#5865F2"))
      );
      await interaction.showModal(modal); return true;
    }

    if (customId === "gen_server") return interaction.update({ embeds: [new EmbedBuilder().setColor("#5865F2").setTitle(`📊 Sunucu: ${interaction.guild.name}`).addFields({ name: "Toplam Üye", value: `${interaction.guild.memberCount}` })], components: [backButtonRow] }).then(() => true);
    if (customId === "gen_user") return interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle(`👤 Kullanıcı: ${interaction.user.username}`).setThumbnail(interaction.user.displayAvatarURL())], components: [backButtonRow] }).then(() => true);
    if (customId === "gen_ping") return interaction.update({ embeds: [new EmbedBuilder().setColor("#FEE75C").setTitle("🏓 Gecikme").setDescription(`Hız: **${interaction.client.ws.ping}ms**`)], components: [backButtonRow] }).then(() => true);

    if (customId === "nav_sandbox") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.update({ embeds: [new EmbedBuilder().setTitle("❌ Yetki Yok")], components: [backButtonRow] }).then(() => true);
      return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("🛠️ Admin Sandbox Modu")], components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("sandbox_user_select")), backButtonRow] }).then(() => true);
    }
    if (customId.startsWith("sb_edit_")) {
      const modal = new ModalBuilder().setCustomId(`modal_sb_set_${customId.replace("sb_edit_", "")}`).setTitle("Bakiye Ayarla");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("new_coin_amount").setLabel("Miktar").setStyle(TextInputStyle.Short)));
      await interaction.showModal(modal); return true;
    }
  }

  // --- USER SELECT AKSİYONLARI ---
  if (interaction.isUserSelectMenu()) {
    const targetId = interaction.values[0];
    if (customId === "sandbox_user_select") {
      const tu = await getUser(targetId);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("Sandbox").setDescription(`<@${targetId}> Güncel Parası: **${formatCoins(tu.coins)}**`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sb_edit_${targetId}`).setLabel("Parasını Düzenle").setStyle(ButtonStyle.Danger)), backButtonRow] }); return true;
    }

    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!member && customId !== "menu_whisper_user") { await interaction.update({ embeds: [new EmbedBuilder().setTitle("❌ Üye Bulunamadı")], components: [backButtonRow] }); return true; }

    if (customId === "menu_kick_user" || customId === "menu_ban_user") {
      if (customId === "menu_kick_user" ? !member.kickable : !member.bannable) { await interaction.update({ embeds: [new EmbedBuilder().setTitle("❌ Botun Yetkisi Yetmiyor")], components: [backButtonRow] }); return true; }
      if (customId === "menu_kick_user") await member.kick(`Panel: ${interaction.user.tag}`); else await member.ban({ reason: `Panel: ${interaction.user.tag}` });
      await interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("✅ İşlem Başarılı").setDescription(`<@${targetId}> sunucudan uzaklaştırıldı.`)], components: [backButtonRow] }); return true;
    }

    if (customId === "menu_timeout_user") {
      const modal = new ModalBuilder().setCustomId(`modal_timeout_submit_${targetId}`).setTitle("Sürgün Süresi ve Sebep");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("timeout_time").setLabel("Süre (Dakika)").setStyle(TextInputStyle.Short)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("timeout_reason").setLabel("Sebep").setStyle(TextInputStyle.Short).setValue("Kural İhlali")));
      await interaction.showModal(modal); return true;
    }

    if (customId === "menu_untimeout_user") {
      await member.timeout(null);
      await interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("🔊 Sürgün Kaldırıldı")], components: [backButtonRow] }); return true;
    }

    if (customId === "menu_whisper_user") {
      const modal = new ModalBuilder().setCustomId(`modal_whisper_submit_${targetId}`).setTitle("Gizli Fısıltı Girişi");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("whisper_msg").setLabel("İlk Fısıltı Mesajı").setStyle(TextInputStyle.Paragraph).setRequired(true)));
      await interaction.showModal(modal); return true;
    }
  }

  // --- MODAL AKSİYONLARI ---
  if (interaction.isModalSubmit()) {
    if (customId === "modal_purge") {
      const amount = parseInt(interaction.fields.getTextInputValue("purge_amount"));
      if (isNaN(amount) || amount < 1 || amount > 100) return interaction.reply({ content: "❌ 1-100 arası sayı girin.", ephemeral: true }).then(() => true);
      await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({ content: `🧹 **${amount}** mesaj silindi.`, ephemeral: true }).then(() => true);
    }
    if (customId === "modal_say_normal" || customId === "modal_say_embed") {
      if (customId === "modal_say_normal") await interaction.channel.send({ content: interaction.fields.getTextInputValue("say_text") });
      else {
        let color = interaction.fields.getTextInputValue("emb_color") || "#5865F2"; if (!color.startsWith("#")) color = `#${color}`;
        await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle(interaction.fields.getTextInputValue("emb_title")).setDescription(interaction.fields.getTextInputValue("emb_desc")).setColor(color)] });
      }
      return interaction.reply({ content: "✅ Gönderildi.", ephemeral: true }).then(() => true);
    }
    if (customId.startsWith("modal_timeout_submit_")) {
      const targetId = customId.split("_")[3]; const mins = parseInt(interaction.fields.getTextInputValue("timeout_time"));
      const rsn = interaction.fields.getTextInputValue("timeout_reason") || "Belirtilmedi";
      const member = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!member || isNaN(mins)) return interaction.reply({ content: "❌ Hata.", ephemeral: true }).then(() => true);
      await member.timeout(mins * 60 * 1000, rsn);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("⏳ Sürgün Atıldı").setDescription(`<@${targetId}>, **${mins}** dakika susturuldu.`)] }).then(() => true);
    }
    if (customId.startsWith("modal_whisper_submit_")) {
      const targetId = customId.split("_")[3]; const msgText = interaction.fields.getTextInputValue("whisper_msg");
      const member = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!member) return interaction.reply({ content: "❌ Üye aktif değil.", ephemeral: true }).then(() => true);
      const thread = await interaction.channel.threads.create({ name: `🤫 fısıltı-${member.user.username}`, autoArchiveDuration: 60, type: 12 });
      await thread.members.add(interaction.user.id); await thread.members.add(targetId);
      await thread.send({ content: `<@${targetId}>`, embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("🤫 Özel Fısıltı Odası").setDescription(`Sadece ikiniz görebilirsiniz.\n\n💬 **Mesaj:**\n> ${msgText}`)] });
      return interaction.reply({ content: `✅ Fısıltı odası kuruldu: ${thread}`, ephemeral: true }).then(() => true);
    }
    if (customId.startsWith("modal_sb_set_")) {
      const amt = parseInt(interaction.fields.getTextInputValue("new_coin_amount"));
      await setCoins(customId.replace("modal_sb_set_", ""), isNaN(amt) ? 0 : amt);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("✅ Bakiye Sandbox Tarafından Güncellendi")], components: [backButtonRow] }); return true;
    }
  }
  return false;
}

module.exports = { handleModerationInteractions };
