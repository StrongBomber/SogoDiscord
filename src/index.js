require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./economy.db');

db.run(`CREATE TABLE IF NOT EXISTS users(
id TEXT PRIMARY KEY,
coins INTEGER DEFAULT 0,
last_daily INTEGER DEFAULT 0
)`);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

function getUser(id){
  return new Promise(resolve=>{
    db.get('SELECT * FROM users WHERE id=?',[id],(e,row)=>{
      if(row) return resolve(row);
      db.run('INSERT INTO users(id,coins,last_daily) VALUES(?,?,?)',[id,0,0],()=>{
        resolve({id,coins:0,last_daily:0});
      });
    });
  });
}

client.on('messageCreate', async message=>{
  if(message.author.bot) return;
  if(!message.content.startsWith('!')) return;

  const args = message.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if(cmd==='balance'){
    const user = await getUser(message.author.id);
    return message.reply(`💰 ${user.coins} coins`);
  }

  if(cmd==='daily'){
    const user = await getUser(message.author.id);
    const now = Date.now();
    if(now - user.last_daily < 86400000){
      return message.reply('You already claimed daily reward.');
    }

    const reward = 500;
    db.run('UPDATE users SET coins=coins+?, last_daily=? WHERE id=?',
      [reward, now, message.author.id]);
    return message.reply(`You received ${reward} coins!`);
  }

  if(cmd==='hunt'){
    const reward = Math.floor(Math.random()*150)+50;
    db.run('UPDATE users SET coins=coins+? WHERE id=?',
      [reward, message.author.id]);
    return message.reply(`🏹 You hunted and earned ${reward} coins.`);
  }
});

client.once('ready', ()=>{
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
