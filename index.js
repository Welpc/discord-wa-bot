const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const { Client: WAClient, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const { AttachmentBuilder } = require('discord.js');
const qrcode = require('qrcode-terminal');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CANAL_ID = process.env.CANAL_ID;

const CONTACTOS = {
    '1': { nombre: 'Abraham 2 🤑 🤙', comando: '!mensaje1' },
    '2': { nombre: 'LOVLY Ana 🥺❤', comando: '!mensaje2' },
    '3': { nombre: 'Eliab 2', comando: '!mensaje3' }
};

let silencio = false;

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

waClient.on('message', async (msg) => {
    try {
        console.log('📨 Mensaje recibido tipo:', msg.type, '| de:', msg.from);
        if (silencio) return;

        const contact = await msg.getContact();
        const nombreContacto = contact.name || contact.pushname || contact.number;

        const esMonitoreado = Object.values(CONTACTOS).some(c => c.nombre === nombreContacto);
        if (!esMonitoreado) return;

        const canal = await discordClient.channels.fetch(DISCORD_CANAL_ID);
        if (!canal) return;

        const encabezado = `📩 **Mensaje de: ${nombreContacto}**`;

        if (msg.type === MessageTypes.TEXT) {
            await canal.send(`${encabezado} : ${msg.body}`);

        } else if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            if (!media) {
                await canal.send(`${encabezado} : [No se pudo descargar el archivo]`);
                return;
            }

            const buffer = Buffer.from(media.data, 'base64');

            let extension = '';
            let descripcion = '';

            if (msg.type === MessageTypes.IMAGE) {
                extension = media.mimetype.includes('png') ? 'png' : 'jpg';
                descripcion = msg.body ? ` : ${msg.body}` : ' : 📷 [Imagen]';
            } else if (msg.type === MessageTypes.VIDEO) {
                extension = 'mp4';
                descripcion = msg.body ? ` : ${msg.body}` : ' : 🎥 [Video]';
            } else if (msg.type === MessageTypes.AUDIO) {
                extension = 'mp3';
                descripcion = ' : 🎵 [Audio]';
            } else if (msg.type === MessageTypes.VOICE) {
                extension = 'ogg';
                descripcion = ' : 🎵 [Nota de voz]';
            } else if (msg.type === MessageTypes.STICKER) {
                extension = 'webp';
                descripcion = ' : 🎭 [Sticker]';
            } else if (msg.type === MessageTypes.DOCUMENT) {
                extension = media.filename ? media.filename.split('.').pop() : 'bin';
                descripcion = ` : 📄 [Documento: ${media.filename || 'archivo'}]`;
            } else {
                extension = 'bin';
                descripcion = ` : [${msg.type}]`;
            }

            const nombreArchivo = media.filename || `archivo.${extension}`;
            const attachment = new AttachmentBuilder(buffer, { name: nombreArchivo });

            await canal.send({
                content: `${encabezado}${descripcion}`,
                files: [attachment]
            });

        } else if (msg.type === MessageTypes.STICKER) {
            const media = await msg.downloadMedia();
            if (media) {
                const buffer = Buffer.from(media.data, 'base64');
                const attachment = new AttachmentBuilder(buffer, { name: 'sticker.webp' });
                await canal.send({ content: `${encabezado} : 🎭 [Sticker]`, files: [attachment] });
            }
        } else {
            await canal.send(`${encabezado} : [${msg.type}]`);
        }

    } catch (error) {
        console.error('Error monitoreando mensaje:', error);
    }
});

discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const contenido = message.content.trim();

    if (contenido === '!silencio') {
        silencio = true;
        message.reply('🔇 Modo silencio activado.');
        return;
    }

    if (contenido === '!hablar') {
        silencio = false;
        message.reply('🔊 Modo hablar activado.');
        return;
    }

    let contactoDestino = null;

    if (contenido.startsWith('!mensaje1')) {
        contactoDestino = CONTACTOS['1'];
    } else if (contenido.startsWith('!mensaje2')) {
        contactoDestino = CONTACTOS['2'];
    } else if (contenido.startsWith('!mensaje3')) {
        contactoDestino = CONTACTOS['3'];
    }

    if (!contactoDestino) return;

    const texto = contenido.slice(contactoDestino.comando.length).replace(/^:\s*/, '').trim();

    if (!texto) {
        message.reply(`⚠️ Escribe algo después de ${contactoDestino.comando}:`);
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
