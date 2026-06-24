require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, EndBehaviorType } = require('@discordjs/voice');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const prism = require('prism-media');

// OpenAI Kurulumu
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Discord Client Kurulumu (Ses için GuildVoiceStates intent'i şarttır)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const player = createAudioPlayer();

client.once('ready', async () => {
    console.log(`Bot başarıyla başlatıldı: ${client.user.tag}`);
    
    // Slash komutlarını Discord API'sine kaydetme
    const commands = [
        new SlashCommandBuilder().setName('join').setDescription('Botu ses kanalına çağırır.'),
        new SlashCommandBuilder().setName('leave').setDescription('Botu ses kanalından çıkarır.')
    ].map(command => command.toJSON());

    try {
        await client.rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('Slash komutları başarıyla yüklendi.');
    } catch (error) {
        console.error('Komut yükleme hatası:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, member, guild } = interaction;

    if (commandName === 'join') {
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'Önce bir ses kanalına katılmalısın!', ephemeral: true });
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: false,
            selfDeaf: false
        });

        connection.subscribe(player);
        await interaction.reply({ content: 'Kanala katıldım, seni dinliyorum!' });

        // Dinleme mekanizmasını başlat
        handleVoiceListening(connection);
    }

    if (commandName === 'leave') {
        // İlgili bağlantıyı bul ve çık
        const { getVoiceConnection } = require('@discordjs/voice');
        const connection = getVoiceConnection(guild.id);
        if (connection) {
            connection.destroy();
            await interaction.reply('Kanaldan ayrıldım.');
        } else {
            await interaction.reply({ content: 'Zaten bir ses kanalında değilim.', ephemeral: true });
        }
    }
});

// --- SES DİNLEME VE İŞLEME DÖNGÜSÜ ---
function handleVoiceListening(connection) {
    const receiver = connection.receiver;

    // Bir kullanıcı konuşmaya başladığında tetiklenir
    receiver.speaking.on('start', (userId) => {
        console.log(`Kullanıcı ses veriyor: ${userId}`);

        // Kullanıcının ses akışını (PCM formatında) yakala
        const audioStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1500 // 1.5 saniye susulduğunda konuşmanın bittiğini anlar
            }
        });

        const bufferData = [];
        // Gelen PCM paketlerini topla
        audioStream.on('data', (chunk) => {
            bufferData.push(chunk);
        });

        audioStream.on('end', async () => {
            console.log('Konuşma bitti, işleniyor...');
            const buffer = Buffer.concat(bufferData);
            
            // Whisper'ın ham PCM yerine standart bir format istemesinden dolayı WAV/MP3 dönüşümü
            const pcmPath = path.join(__dirname, `temp_${userId}.pcm`);
            const wavPath = path.join(__dirname, `temp_${userId}.wav`);

            fs.writeFileSync(pcmPath, buffer);

            // Prism-media kullanarak PCM -> WAV dönüşümü (16-bit, 48kHz, Stereo standardı)
            const transcoder = new prism.FFmpeg({
                args: [
                    '-f', 's16le',
                    '-ar', '48000',
                    '-ac', '2',
                    '-i', pcmPath,
                    wavPath
                ]
            });

            transcoder.on('close', async () => {
                // Geçici PCM dosyasını temizle
                if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);

                try {
                    // 1. ADIM: Speech-to-Text (Whisper)
                    const transcription = await openai.audio.transcriptions.create({
                        file: fs.createReadStream(wavPath),
                        model: "whisper-1",
                    });
                    
                    const userText = transcription.text;
                    console.log(`Whisper Çıktısı: ${userText}`);

                    if (!userText || userText.trim().length === 0) return;

                    // 2. ADIM: AI ile Cevap Üretme (GPT-4o / GPT-4o-mini)
                    const aiResponse = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "Sen bir Discord sesli asistanısın. Kısa, samimi ve konuşma diline uygun cevaplar ver." },
                            { role: "user", content: userText }
                        ],
                    });

                    const replyText = aiResponse.choices[0].message.content;
                    console.log(`AI Cevabı: ${replyText}`);

                    // 3. ADIM: Text-to-Speech (OpenAI TTS)
                    const mp3Tts = await openai.audio.speech.create({
                        model: "tts-1",
                        voice: "alloy", // alloy, echo, fable, onyx, nova, shimmer seçilebilir
                        input: replyText,
                    });

                    const responseAudioPath = path.join(__dirname, `response_${userId}.mp3`);
                    const audioBuffer = Buffer.from(await mp3Tts.arrayBuffer());
                    fs.writeFileSync(responseAudioPath, audioBuffer);

                    // 4. ADIM: Sesi Kanala Basma
                    const resource = createAudioResource(responseAudioPath);
                    player.play(resource);

                    player.once(AudioPlayerStatus.Idle, () => {
                        // Ses çalması bittikten sonra temizlik yap
                        if (fs.existsSync(responseAudioPath)) fs.unlinkSync(responseAudioPath);
                    });

                } catch (err) {
                    console.error("Pipeline hatası:", err);
                } finally {
                    // Geçici ses kaydını temizle
                    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
                }
            });
        });
    });
}

client.login(process.env.DISCORD_TOKEN);
