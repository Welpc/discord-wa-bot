const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const { Client: WAClient, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const CONTACTOS = {
    '1': { nombre: 'Abraham 2 🤑 🤙', comando: '!mensaje1' },
    '2': { nombre: 'LOVLY Ana 🥺❤️', comando: '!mensaje2' }
};

const DISCORD_CANAL_ID = process.env.CANAL_ID;

const waClient = new WAClient({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
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

// Monitor de mensajes entrantes de WhatsApp
waClient.on('message', async (msg) => {
    try {
        const contact = await msg.getContact();
        const nombreContacto = contact.name || contact.pushname || contact.number;

        const esMonitoreado = Object.values(CONTACTOS).some(c => c.nombre === nombreContacto);
        if (!esMonitoreado) return;

        let contenidoMensaje = '';

        if (msg.type === MessageTypes.TEXT) {
            contenidoMensaje = msg.body;
        } else if (msg.type === MessageTypes.IMAGE) {
            contenidoMensaje = '📷 [Imagen]';
        } else if (msg.type === MessageTypes.VIDEO) {
            contenidoMensaje = '🎥 [Video]';
        } else if (msg.type === MessageTypes.AUDIO || msg.type === MessageTypes.VOICE) {
            contenidoMensaje = '🎵 [Audio]';
        } else if (msg.type === MessageTypes.STICKER) {
            contenidoMensaje = '🎭 [Sticker]';
        } else if (msg.type === MessageTypes.DOCUMENT) {
            contenidoMensaje = '📄 [Documento]';
        } else {
            contenidoMensaje = `[${msg.type}]`;
        }

        const canal = await discordClient.channels.fetch(DISCORD_CANAL_ID);
        if (canal) {
            await canal.send(`📩 **Mensaje de: ${nombreContacto}** : ${contenidoMensaje}`);
        }
    } catch (error) {
        console.error('Error monitoreando mensaje:', error);
    }
});

// Enviar mensajes desde Discord a WhatsApp
discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const contenido = message.content;

    let contactoDestino = null;

    if (contenido.startsWith('!mensaje1')) {
        contactoDestino = CONTACTOS['1'];
    } else if (contenido.startsWith('!mensaje2')) {
        contactoDestino = CONTACTOS['2'];
    }

    if (!contactoDestino) return;

    const comando = contactoDestino.comando;
    const texto = contenido.slice(comando.length).replace(/^:\s*/, '').trim();

    if (!texto) {
        message.reply(`⚠️ Escribe algo después de ${comando}:`);
        return;
    }

    if (!waReady) {
        message.reply('❌ WhatsApp no está conectado todavía.');
        return;
    }

    try {
        const contacts = await waClient.getContacts();
        const contacto = contacts.find(c =>
            c.name === contactoDestino.nombre ||
            c.pushname === contactoDestino.nombre
        );

        if (!contacto) {
            message.reply(`❌ No encontré el contacto "${contactoDestino.nombre}"`);
            return;
        }

        await waClient.sendMessage(contacto.id._serialized, texto);
        message.reply(`✅ Enviado a ${contactoDestino.nombre}: "${texto}"`);
    } catch (error) {
        console.error('Error:', error);
        message.reply('❌ Error al enviar el mensaje.');
    }
});

waClient.initialize();
discordClient.login(DISCORD_TOKEN);
