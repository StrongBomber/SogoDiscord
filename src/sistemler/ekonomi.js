const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { getUser, addCoins, setCoins, addXp, getInventory, addItem, removeItem, setEquipItem, updateDailyTimestamp, ITEMS, ANIMALS, activeBlackjack, formatCoins, drawCard, calculateHand } = require("../database");
const { getMainMenuEmbed, getMainMenuComponents } = require("../komutlar/menu");

const backButtonRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("back_to_main").setLabel("⬅️ Ana Menüye Dön").setStyle(ButtonStyle.Secondary)
);

async function handleEconomyInteractions(interaction) {
  const userId = interaction.user.id;
  const customId = interaction.customId;

  // --- BUTTON ETKİLEŞİMLERİ ---
  if (interaction.isButton()) {
    if (customId === "back_to_main") {
      activeBlackjack.delete(userId);
      const embed = await getMainMenuEmbed(userId);
      await interaction.update({ embeds: [embed], components: getMainMenuComponents() });
      return true;
    }

    if (customId === "nav_economy") {
      const user = await getUser(userId);
      const activeItem = user && user.equipped_item ? ITEMS[user.equipped_item]?.name : "Yok ❌";
      const embed = new EmbedBuilder().setColor("#57F287").setTitle("🪙 Ekonomi, Meslek ve Macera Dünyası")
        .setDescription("Aşağıdaki paneli kullanarak avlanabilir, malzemelerinizi işleyebilir veya zindanlara akın atabilirsiniz.")
        .addFields({ name: "Cüzdan", value: `💰 **${formatCoins(user.coins)}** Jeton`, inline: true }, { name: "Kuşanılan", value: `⚔️ **${activeItem}**`, inline: true });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hunt_menu_nav").setLabel("🏹 Hayvan Avla").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("hunt_house_nav").setLabel("🥩 Av İşleme Evi").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("work").setLabel("💼 Çalış").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("beg").setLabel("🙏 Dilen").setStyle(ButtonStyle.Secondary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("daily").setLabel("📅 Günlük Ödül").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("gamble_menu").setLabel("🎰 Kumar Salonu").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("dungeon_menu").setLabel("🏰 Zindan Akını").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("shop_menu").setLabel("🛒 Market").setStyle(ButtonStyle.Primary)
      );
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("inv_menu").setLabel("🎒 Envanterim").setStyle(ButtonStyle.Secondary)
      );
      await interaction.update({ embeds: [embed], components: [row1, row2, row3, backButtonRow] });
      return true;
    }

    if (customId === "hunt_menu_nav") {
      const embed = new EmbedBuilder().setColor("#57F287").setTitle("🏹 Avcılık ve İz Sürücülük Ormanı")
        .setDescription("Avlamak istediğiniz hayvanı alttaki listenen seçin. Nadir hayvanların kaçma olasılığı yüksektir.\n\n🎒 **Avcı İpucu:** Eğer marketten **Gelişmiş Av Tüfeği** kuşanırsanız avların kaçma ihtimali **%15 azalır**!");

      const options = Object.entries(ANIMALS).map(([id, animal]) => ({
        label: `${animal.name} (Svy. ${animal.reqLv})`,
        description: `Kaçış Riski: %${Math.floor(animal.escapeChance * 100)} | Ham Değeri: ${formatCoins(animal.rawPrice)}`,
        value: id
      }));
      await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("hunt_animal_select").setPlaceholder("Avlanacak bir hedef seçin...").addOptions(options)), backButtonRow] });
      return true;
    }

    if (customId === "hunt_house_nav") {
      const inv = await getInventory(userId);
      const embed = new EmbedBuilder().setColor("#E67E22").setTitle("🥩 Av İşleme ve Kasap Atölyesi")
        .setDescription("Avladığınız çiğ hayvanları burada satabilir, mutfakta pişirebilir/işleyebilir ya da yiyerek yüksek miktarda tecrübe puanı (XP) elde edebilirsiniz!");

      const options = [];
      inv.forEach(row => {
        if (row.itemId.startsWith("raw_") || row.itemId.startsWith("proc_")) {
          const baseId = row.itemId.replace("raw_", "").replace("proc_", "");
          const animal = ANIMALS[baseId];
          if (animal) {
            const displayName = row.itemId.startsWith("raw_") ? `Çiğ ${animal.name}` : animal.processedName;
            options.push({ label: `${displayName} (${row.quantity} Adet)`, value: row.itemId });
          }
        }
      });

      if (options.length === 0) {
        embed.setDescription("Atölyenizde işlenecek hiçbir av eti bulunamadı. Önce ormana gidip avlanmalısınız! 🏹");
        await interaction.update({ embeds: [embed], components: [backButtonRow] });
        return true;
      }
      await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("hh_item_select").setPlaceholder("Ürün seçin...").addOptions(options)), backButtonRow] });
      return true;
    }

    if (customId.startsWith("hhact_")) {
      const [, action, prefix, baseId] = customId.split("_");
      const itemId = `${prefix}_${baseId}`;
      const animal = ANIMALS[baseId];
      const inv = await getInventory(userId);
      const matched = inv.find(r => r.itemId === itemId);

      if (!matched || matched.quantity <= 0) {
        await interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Ürün Kalmamış")], components: [backButtonRow] });
        return true;
      }

      const embed = new EmbedBuilder().setTimestamp();
      if (action === "sell") {
        const price = prefix === "raw" ? animal.rawPrice : animal.processedPrice;
        await removeItem(userId, itemId, 1); await addCoins(userId, price);
        embed.setColor("#57F287").setTitle("💰 Ticaret Başarılı").setDescription(`1 adet ürün satıldı. Kazanç: **+${formatCoins(price)}** Jeton.`);
      } else if (action === "eat") {
        const xpReward = prefix === "raw" ? animal.rawXp : animal.processedXp;
        await removeItem(userId, itemId, 1); const xpRes = await addXp(userId, xpReward);
        embed.setColor("#5865F2").setTitle("🍖 Afiyet Olsun!").setDescription(`Ürün tüketildi. **+${xpReward} XP** kazandınız.${xpRes.leveledUp ? `\n🎉 **Seviye Atladınız! Yeni Seviye: ${xpRes.level}**` : ""}`);
      } else if (action === "proc") {
        await removeItem(userId, itemId, 1); await addItem(userId, `proc_${baseId}`);
        embed.setColor("#E67E22").setTitle("🍳 Dönüştürme Başarılı").setDescription(`Ürün başarıyla işlendi ve **${animal.processedName}** üretildi!`);
      }
      await interaction.update({ embeds: [embed], components: [backButtonRow] });
      return true;
    }

    if (customId === "work" || customId === "beg") {
      const isWork = customId === "work";
      const user = await getUser(userId);
      let reward = isWork ? Math.floor(Math.random() * 301) + 100 : Math.floor(Math.random() * 46) + 5;
      let multiplier = 1 + ((user.level - 1) * 0.1);
      if (isWork && user.equipped_item === "pickaxe") multiplier += 0.5;
      
      reward = Math.floor(reward * multiplier);
      await addCoins(userId, reward);
      const xpRes = await addXp(userId, isWork ? 60 : 15);
      await interaction.update({
        embeds: [new EmbedBuilder().setColor("#57F287").setTitle(isWork ? "💼 Çalışıldı" : "🙏 Dilendiniz").setDescription(`**+${formatCoins(reward)}** Jeton ve **+${isWork ? 60 : 15} XP** kazandınız! ${xpRes.leveledUp ? `\n🎉 Yeni Seviye: ${xpRes.level}` : ""}`)],
        components: [backButtonRow]
      });
      return true;
    }

    if (customId === "daily") {
      const user = await getUser(userId); const cooldown = 86400000; const now = Date.now();
      if (now - user.last_daily < cooldown) {
        await interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("⏱️ Bekleme Süresi").setDescription(`Tekrar almak için **${Math.floor((cooldown - (now - user.last_daily)) / 3600000)} saat** beklemelisiniz.`)], components: [backButtonRow] });
        return true;
      }
      const dailyReward = 500 + (user.level * 150);
      await addCoins(userId, dailyReward); await updateDailyTimestamp(userId, now);
      await interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("📅 Günlük Ödül").setDescription(`Giriş ödülü eklendi: **+${formatCoins(dailyReward)}** Jeton!`)], components: [backButtonRow] });
      return true;
    }

    if (customId === "dungeon_menu") {
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("dg_easy").setLabel("🟢 Kolay").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("dg_medium").setLabel("🟡 Orta").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("dg_hard").setLabel("🔴 Zor").setStyle(ButtonStyle.Danger));
      await interaction.update({ embeds: [new EmbedBuilder().setColor("#E67E22").setTitle("🏰 Zindan Akınları")], components: [row, backButtonRow] });
      return true;
    }

    if (customId.startsWith("dg_")) {
      const user = await getUser(userId); const difficulty = customId.replace("dg_", "");
      let reqLv = 1, chance = 0.7, prize = 300, xp = 100, pen = 100;
      if (difficulty === "medium") { reqLv = 3; chance = 0.5; prize = 1000; xp = 250; pen = 350; }
      else if (difficulty === "hard") { reqLv = 5; chance = 0.3; prize = 3000; xp = 600; pen = 1000; }
      if (user.level < reqLv) { await interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Seviyeniz Yetersiz")], components: [backButtonRow] }); return true; }
      if (Math.random() < chance) { await addCoins(userId, prize); await addXp(userId, xp); await interaction.update({ embeds: [new EmbedBuilder().setColor("#57F287").setTitle("⚔️ Zafer!").setDescription(`Zindan temizlendi: **+${formatCoins(prize)}** Jeton!`)], components: [backButtonRow] }); }
      else { await addCoins(userId, -pen); await interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("💀 Bozgun!").setDescription(`Geri çekildiniz, hasar bedeli: **-${formatCoins(pen)}** Jeton.`)], components: [backButtonRow] }); }
      return true;
    }

    if (customId === "gamble_menu") {
      const sm = new StringSelectMenuBuilder().setCustomId("gamble_select").setPlaceholder("Oyun seçin...").addOptions([{ label: "Yazı Tura", value: "cf_lobby" }, { label: "Slot Makinesi", value: "slots_lobby" }, { label: "Rulet", value: "roulette_lobby" }, { label: "Blackjack", value: "bj_lobby" }]);
      await interaction.update({ embeds: [new EmbedBuilder().setColor("#FEE75C").setTitle("🎰 Kumar Salonu")], components: [new ActionRowBuilder().addComponents(sm), backButtonRow] });
      return true;
    }

    if (["cf_yazi", "cf_tura", "slots_spin_btn", "bj_bet_start"].includes(customId) || customId.startsWith("rl_")) {
      const actionType = customId.startsWith("rl_") ? `rl_${customId.split("_")[1]}` : customId;
      const modal = new ModalBuilder().setCustomId(`modal_${actionType}`).setTitle("Bahis Girişi");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bet_amount").setLabel("Bahis Miktarı (Min: 100)").setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal);
      return true;
    }

    if (customId === "bj_hit" || customId === "bj_stand") {
      const game = activeBlackjack.get(userId);
      if (!game) { await interaction.update({ embeds: [new EmbedBuilder().setTitle("Oyun Yok")], components: [backButtonRow] }); return true; }
      if (customId === "bj_hit") {
        game.playerHand.push(drawCard()); const ps = calculateHand(game.playerHand);
        if (ps > 21) { await addCoins(userId, -game.bet); activeBlackjack.delete(userId); await interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("💥 KAYBETTİNİZ (Bust)").setDescription(`Skorunuz 21'i geçti! Skor: **${ps}**`)], components: [backButtonRow] }); return true; }
      } else {
        let ds = calculateHand(game.dealerHand); while (ds < 17) { game.dealerHand.push(drawCard()); ds = calculateHand(game.dealerHand); }
        const ps = calculateHand(game.playerHand); const em = new EmbedBuilder();
        if (ds > 21 || ps > ds) { await addCoins(userId, game.bet); em.setColor("#57F287").setTitle("🎉 KAZANDINIZ!"); }
        else if (ds > ps) { await addCoins(userId, -game.bet); em.setColor("#ED4245").setTitle("❌ KAYBETTİNİZ!"); }
        else em.setColor("#FEE75C").setTitle("⚖️ BERABERE!");
        activeBlackjack.delete(userId); await interaction.update({ embeds: [em.setDescription(`Sizin Skor: **${ps}** | Kasanın Skoru: **${ds}**`)], components: [backButtonRow] }); return true;
      }
      const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_hit").setLabel("Kart Çek").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("bj_stand").setLabel("Dur").setStyle(ButtonStyle.Danger));
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("🃏 Blackjack").setDescription(`Eliniz: ${game.playerHand.map(c => c.text).join(" ")} (Skor: **${calculateHand(game.playerHand)}**)\nKasa: [🔒 Gizli Kart] [${game.dealerHand[1].text}]`)], components: [actionRow] });
      return true;
    }

    if (customId === "shop_menu") {
      const options = Object.entries(ITEMS).map(([id, it]) => ({ label: it.name, description: `${it.price} Jeton | ${it.desc}`, value: id }));
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("🛒 Donanım Marketi")], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("shop_buy_select").addOptions(options)), backButtonRow] });
      return true;
    }

    if (customId === "inv_menu") {
      const inv = await getInventory(userId); const u = await getUser(userId);
      const options = inv.filter(r => ITEMS[r.itemId]).map(r => ({ label: ITEMS[r.itemId].name, value: r.itemId }));
      const comps = []; if (options.length > 0) comps.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("inv_equip_select").addOptions(options)));
      comps.push(backButtonRow); await interaction.update({ embeds: [new EmbedBuilder().setTitle("🎒 Envanteriniz").setDescription(`Şu an kuşanılan teçhizat: **${u.equipped_item ? ITEMS[u.equipped_item].name : "Yok ❌"}**`)], components: comps });
      return true;
    }
  }

  // --- SELECT MENU ETKİLEŞİMLERİ ---
  if (interaction.isStringSelectMenu()) {
    if (customId === "hunt_animal_select") {
      const animalId = interaction.values[0]; const animal = ANIMALS[animalId]; const user = await getUser(userId);
      if (user.level < animal.reqLv) { await interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setTitle("❌ Seviyeniz Yetersiz").setDescription(`Gereken Seviye: **${animal.reqLv}**`)], components: [backButtonRow] }); return true; }
      let escapeChance = animal.escapeChance; if (user.equipped_item === "rifle") escapeChance = Math.max(0.05, escapeChance - 0.15);
      const isEscaped = Math.random() < escapeChance;
      const embed = new EmbedBuilder().setTimestamp();
      if (isEscaped) embed.setColor("#FEE75C").setTitle("💨 Av Kaçtı!").setDescription(`**${animal.name}** kaçmayı başardı.`);
      else { await addItem(userId, `raw_${animalId}`); await addXp(userId, animal.rawXp); embed.setColor("#57F287").setTitle("🎯 Av Başarılı!").setDescription(`**${animal.name}** yakalandı!`); }
      await interaction.update({ embeds: [embed], components: [backButtonRow] }); return true;
    }

    if (customId === "hh_item_select") {
      const itemId = interaction.values[0]; const isRaw = itemId.startsWith("raw_"); const baseId = itemId.replace("raw_", "").replace("proc_", ""); const animal = ANIMALS[baseId];
      const inv = await getInventory(userId); const matched = inv.find(r => r.itemId === itemId);
      if (!matched || matched.quantity <= 0) { await interaction.update({ embeds: [new EmbedBuilder().setTitle("Ürün Kalmamış")], components: [backButtonRow] }); return true; }
      const embed = new EmbedBuilder().setColor("#3498DB").setTitle(`🎬 Ürün: ${isRaw ? `Çiğ ${animal.name}` : animal.processedName}`).setDescription(`Mevcut Stok: **${matched.quantity}** adet.\nFiyat: **${formatCoins(isRaw ? animal.rawPrice : animal.processedPrice)}** Jeton`);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`hhact_sell_${itemId}`).setLabel("💰 Sat (1 Adet)").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`hhact_eat_${itemId}`).setLabel("🍖 Ye (1 Adet)").setStyle(ButtonStyle.Primary));
      if (isRaw) row.addComponents(new ButtonBuilder().setCustomId(`hhact_proc_${itemId}`).setLabel("🍳 Pişir / İşle").setStyle(ButtonStyle.Danger));
      await interaction.update({ embeds: [embed], components: [row, backButtonRow] }); return true;
    }

    if (customId === "gamble_select") {
      const choice = interaction.values[0];
      if (choice === "cf_lobby") await interaction.update({ embeds: [new EmbedBuilder().setTitle("🪙 Yazı Tura Salonu")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("cf_yazi").setLabel("Yazı Seç").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("cf_tura").setLabel("Tura Seç").setStyle(ButtonStyle.Success)), backButtonRow] });
      if (choice === "slots_lobby") await interaction.update({ embeds: [new EmbedBuilder().setTitle("🎰 Slot Makinesi")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("slots_spin_btn").setLabel("Kolu Çevir").setStyle(ButtonStyle.Danger)), backButtonRow] });
      if (choice === "roulette_lobby") await interaction.update({ embeds: [new EmbedBuilder().setTitle("🎡 Rulet Masası")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("rl_red").setLabel("Kırmızı (x2)").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("rl_black").setLabel("Siyah (x2)").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("rl_green").setLabel("Yeşil (x14)").setStyle(ButtonStyle.Success)), backButtonRow] });
      if (choice === "bj_lobby") await interaction.update({ embeds: [new EmbedBuilder().setTitle("🃏 Blackjack Masası")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_bet_start").setLabel("Masaya Otur").setStyle(ButtonStyle.Primary)), backButtonRow] });
      return true;
    }

    if (customId === "shop_buy_select") {
      const id = interaction.values[0]; const it = ITEMS[id]; const u = await getUser(userId);
      if (u.coins < it.price) { await interaction.update({ embeds: [new EmbedBuilder().setTitle("❌ Yetersiz Bakiye")], components: [backButtonRow] }); return true; }
      await addCoins(userId, -it.price); await addItem(userId, id);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("✅ Satın Alındı").setDescription(`${it.name} başarıyla kuşanılmak üzere alındı.`)], components: [backButtonRow] }); return true;
    }

    if (customId === "inv_equip_select") {
      await setEquipItem(userId, interaction.values[0]);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("✅ Ekipman Kuşanıldı")], components: [backButtonRow] }); return true;
    }
  }

  // --- MODAL SUBMIT (KUMAR BAHİS HESAPLAMALARI) ---
  if (interaction.isModalSubmit() && customId.startsWith("modal_")) {
    const user = await getUser(userId); const bet = parseInt(interaction.fields.getTextInputValue("bet_amount"));
    if (isNaN(bet) || bet < 100 || user.coins < bet) { await interaction.reply({ content: "❌ Geçersiz bahis miktarı veya yetersiz bakiye! (Min: 100 Jeton)", ephemeral: true }); return true; }
    const embed = new EmbedBuilder().setTimestamp();

    if (customId.startsWith("modal_cf_")) {
      const isWin = Math.random() < 0.5; await addCoins(userId, isWin ? bet : -bet);
      embed.setColor(isWin ? "#57F287" : "#ED4245").setTitle(isWin ? "🎉 Kazandınız!" : "❌ Kaybettiniz!").setDescription(`Bahis Bedeli: **${formatCoins(bet)}** Jeton`);
    }
    else if (customId === "modal_slots_spin") {
      const sym = ["🍎", "🍋", "🍒", "💎"]; const s1 = sym[Math.floor(Math.random() * 4)], s2 = sym[Math.floor(Math.random() * 4)], s3 = sym[Math.floor(Math.random() * 4)];
      if (s1 === s2 && s2 === s3) { await addCoins(userId, bet * 3); embed.setColor("#57F287").setTitle("👑 JACKPOT! (3 Katı)").setDescription(`🎰 **[ ${s1} | ${s2} | ${s3} ]**`); }
      else if (s1 === s2 || s1 === s3 || s2 === s3) { await addCoins(userId, Math.floor(bet * 0.5)); embed.setColor("#57F287").setTitle("💵 Amorti (Yarım Kazanç)").setDescription(`🎰 **[ ${s1} | ${s2} | ${s3} ]**`); }
      else { await addCoins(userId, -bet); embed.setColor("#ED4245").setTitle("❌ Kaybettiniz!").setDescription(`🎰 **[ ${s1} | ${s2} | ${s3} ]**`); }
    }
    else if (customId.startsWith("modal_rl_")) {
      const userChoice = customId.replace("modal_rl_", ""); const roll = ["red", "black", "red", "black", "green"][Math.floor(Math.random() * 5)];
      if (userChoice === roll) { const winAmt = userChoice === "green" ? bet * 14 : bet; await addCoins(userId, winAmt); embed.setColor("#57F287").setTitle("🎉 Rulet Kazancı!"); }
      else { await addCoins(userId, -bet); embed.setColor("#ED4245").setTitle("❌ Masa Kazandı!"); }
      embed.setDescription(`Sizin Tercih: **${userChoice}** | Çıkan Renk: **${roll}**`);
    }
    else if (customId === "modal_bj_start") {
      const ph = [drawCard(), drawCard()], dh = [drawCard(), drawCard()]; activeBlackjack.set(userId, { bet, playerHand: ph, dealerHand: dh });
      embed.setColor("#5865F2").setTitle("🃏 Blackjack Masası").setDescription(`Eliniz: ${ph.map(c => c.text).join(" ")} (Skor: **${calculateHand(ph)}**)\nKasa: [🔒 Gizli Kart] [${dh[1].text}]`);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bj_hit").setLabel("Kart Çek").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("bj_stand").setLabel("Dur").setStyle(ButtonStyle.Danger));
      await interaction.update({ embeds: [embed], components: [row] }); return true;
    }
    const uu = await getUser(userId); embed.addFields({ name: "Güncel Cüzdan", value: `💰 **${formatCoins(uu.coins)}** Jeton` });
    await interaction.update({ embeds: [embed], components: [backButtonRow] }); return true;
  }
  return false;
}

module.exports = { handleEconomyInteractions };
