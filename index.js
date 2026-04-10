const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const { Client: WAClient, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const NOMBRE_CONTACTO_WA = 'Abraham 2';

const waClient = new WAClient({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/run/current-system/sw/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

const discordClient = new DiscordClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let waReady = false;

waClient.on('qr', (qr) => {
    console.log('📱 Escanea este QR con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

waClient.on('ready', () => {
    console.log('✅ WhatsApp conectado!');
    waReady = true;
});

waClient.on('disconnected', () => {
    console.log('❌ WhatsApp desconectado');
    waReady = false;
});

discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const contenido = message.content;
    if (contenido.startsWith('!mensaje:')) {
        const texto = contenido.slice('!mensaje:'.length).trim();
        if (!texto) {
            message.reply('⚠️ Escribe algo después de !mensaje:');
            return;
        }
        if (!waReady) {
            message.reply('❌ WhatsApp no está conectado todavía.');
            return;
        }
        try {
            const contacts = await waClient.getContacts();
            const contacto = contacts.find(c =>
                c.name === NOMBRE_CONTACTO_WA ||
                c.pushname === NOMBRE_CONTACTO_WA
            );
            if (!contacto) {
                message.reply(`❌ No encontré el contacto "${NOMBRE_CONTACTO_WA}"`);
                return;
            }
            await waClient.sendMessage(contacto.id._serialized, texto);
            message.reply(`✅ Enviado a ${NOMBRE_CONTACTO_WA}: "${texto}"`);
        } catch (error) {
            console.error('Error:', error);
            message.reply('❌ Error al enviar el mensaje.');
        }
    }
});

waClient.initialize();
discordClient.login(DISCORD_TOKEN);
