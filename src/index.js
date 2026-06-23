
require("dotenv").config();
const {Client,GatewayIntentBits,ActionRowBuilder,ButtonBuilder,ButtonStyle} = require("discord.js");
const sqlite3=require("sqlite3").verbose();

const db=new sqlite3.Database("./economy.db");

db.serialize(()=>{
db.run("CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, coins INTEGER DEFAULT 0)");
});

const client=new Client({
 intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]
});

function ensureUser(id){
 return new Promise(resolve=>{
  db.get("SELECT * FROM users WHERE id=?",[id],(e,row)=>{
   if(row) resolve(row);
   else{
    db.run("INSERT INTO users(id,coins) VALUES(?,0)",[id],()=>resolve({id,coins:0}));
   }
  });
 });
}

client.on("messageCreate",async msg=>{
 if(msg.author.bot) return;
 if(msg.content==="!menu"){
  const row=new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId("hunt").setLabel("🏹 Hunt").setStyle(ButtonStyle.Primary),
   new ButtonBuilder().setCustomId("work").setLabel("💼 Work").setStyle(ButtonStyle.Success),
   new ButtonBuilder().setCustomId("beg").setLabel("🙏 Beg").setStyle(ButtonStyle.Secondary),
   new ButtonBuilder().setCustomId("balance").setLabel("💰 Balance").setStyle(ButtonStyle.Danger)
  );
  return msg.reply({content:"Economy Menu",components:[row]});
 }

 if(!msg.content.startsWith("!")) return;

 const cmd=msg.content.slice(1).toLowerCase();

 if(cmd==="balance"){
   const u=await ensureUser(msg.author.id);
   return msg.reply(`Coins: ${u.coins}`);
 }

 if(cmd==="hunt"){
   await ensureUser(msg.author.id);
   const reward=Math.floor(Math.random()*150)+50;
   db.run("UPDATE users SET coins=coins+? WHERE id=?",[reward,msg.author.id]);
   return msg.reply(`🏹 +${reward} coins`);
 }

 if(cmd==="work"){
   await ensureUser(msg.author.id);
   const reward=Math.floor(Math.random()*300)+100;
   db.run("UPDATE users SET coins=coins+? WHERE id=?",[reward,msg.author.id]);
   return msg.reply(`💼 +${reward} coins`);
 }

 if(cmd==="beg"){
   await ensureUser(msg.author.id);
   const reward=Math.floor(Math.random()*50)+1;
   db.run("UPDATE users SET coins=coins+? WHERE id=?",[reward,msg.author.id]);
   return msg.reply(`🙏 Someone gave you ${reward} coins`);
 }
});

client.on("interactionCreate",async interaction=>{
 if(!interaction.isButton()) return;

 await ensureUser(interaction.user.id);

 const rewards={hunt:[50,200],work:[100,350],beg:[1,50]};

 if(interaction.customId==="balance"){
  db.get("SELECT * FROM users WHERE id=?",[interaction.user.id],(_,u)=>{
   interaction.reply({content:`💰 ${u.coins} coins`,ephemeral:true});
  });
  return;
 }

 if(rewards[interaction.customId]){
  const [a,b]=rewards[interaction.customId];
  const reward=Math.floor(Math.random()*(b-a))+a;
  db.run("UPDATE users SET coins=coins+? WHERE id=?",[reward,interaction.user.id]);
  interaction.reply(`Earned ${reward} coins!`);
 }
});

client.login(process.env.DISCORD_TOKEN);
