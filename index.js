const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const { Client: WAClient, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const { AttachmentBuilder } = require('discord.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CANAL_ID = '1428559950627606659';

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

async function descargarYEnviar(msg, canal, encabezado, descripcion, extension) {
    try {
        const media = await msg.downloadMedia();
        if (!media) {
            await canal.send(`${encabezado} : [No se pudo descargar]`);
            return;
        }
        const buffer = Buffer.from(media.data, 'base64');
        const nombreArchivo = media.filename || `archivo.${extension}`;
        const attachment = new AttachmentBuilder(buffer, { name: nombreArchivo });
        await canal.send({ content: `${encabezado}${descripcion}`, files: [attachment] });
    } catch (err) {
        console.error('Error descargando:', err);
        await canal.send(`${encabezado} : [Error al descargar archivo]`);
    }
}

waClient.on('message_create', async (msg) => {
    // Capturar fotos de una vez aunque ya fueron vistas
});

waClient.on('message', async (msg) => {
    try {
        console.log('📨 tipo:', msg.type, '| isViewOnce:', msg.isViewOnce, '| de:', msg.from);
        if (silencio) return;

        const contact = await msg.getContact();
        const nombreContacto = contact.name || contact.pushname || contact.number;

        const esMonitoreado = Object.values(CONTACTOS).some(c => c.nombre === nombreContacto);
        if (!esMonitoreado) return;

        const canal = await discordClient.channels.fetch(DISCORD_CANAL_ID);
        if (!canal) return;

        const encabezado = `📩 **Mensaje de: ${nombreContacto}**`;

        // Fotos/videos de una sola vez
        if (msg.isViewOnce) {
            try {
                // Forzar descarga antes de que WhatsApp lo marque como visto
                msg._data.isViewOnce = false;
                msg.isViewOnce = false;
                const extension = msg.type === MessageTypes.VIDEO ? 'mp4' : 'jpg';
                const descripcion = msg.type === MessageTypes.VIDEO ? ' : 👁️ [Video de una vez]' : ' : 👁️ [Foto de una vez]';
                await descargarYEnviar(msg, canal, encabezado, descripcion, extension);
            } catch (err) {
                console.error('Error con foto de una vez:', err);
                await canal.send(`${encabezado} : 👁️ [Foto/Video de una vez - no se pudo capturar]`);
            }
            return;
        }

        if (msg.type === MessageTypes.TEXT) {
            await canal.send(`${encabezado} : ${msg.body}`);

        } else if (msg.hasMedia) {
            let extension = 'bin';
            let descripcion = ` : [${msg.type}]`;

            if (msg.type === MessageTypes.IMAGE) {
                extension = 'jpg';
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
                extension = 'bin';
                descripcion = ` : 📄 [Documento]`;
            }

            await descargarYEnviar(msg, canal, encabezado, descripcion, extension);

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
    let textoComando = '';

    if (contenido.startsWith('!mensaje1')) {
        contactoDestino = CONTACTOS['1'];
        textoComando = contenido.slice('!mensaje1'.length).replace(/^:\s*/, '').trim();
    } else if (contenido.startsWith('!mensaje2')) {
        contactoDestino = CONTACTOS['2'];
        textoComando = contenido.slice('!mensaje2'.length).replace(/^:\s*/, '').trim();
    } else if (contenido.startsWith('!mensaje3')) {
        contactoDestino = CONTACTOS['3'];
        textoComando = contenido.slice('!mensaje3'.length).replace(/^:\s*/, '').trim();
    }

    if (!contactoDestino) return;

    if (!textoComando) {
        message.reply(`⚠️ Escribe algo después de ${contactoDestino.comando}:`);
        return;
    }

    if (!waReady) {
        message.reply('❌ WhatsApp no está conectado todavía.');
        return;
    }

    // Comando de sticker
    const stikerMatch = textoComando.match(/^stiker(\d+)$/i);
    if (stikerMatch) {
        const numero = parseInt(stikerMatch[1]);
        if (numero < 1 || numero > 10) {
            message.reply('⚠️ Solo hay stickers del stiker1 al stiker10.');
            return;
        }

        const extension = numero === 1 ? 'gif' : 'webp';
        const stikerPath = path.join(__dirname, 'stickers', `stiker${numero}.${extension}`);

        if (!fs.existsSync(stikerPath)) {
            message.reply(`⚠️ El stiker${numero} no existe. Súbelo a /stickers/ en GitHub.`);
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
            const { MessageMedia } = require('whatsapp-web.js');
            const media = MessageMedia.fromFilePath(stikerPath);
            await waClient.sendMessage(contacto.id._serialized, media, { sendMediaAsSticker: true });
            message.reply(`✅ Stiker${numero} enviado a ${contactoDestino.nombre}`);
        } catch (error) {
            console.error('Error enviando sticker:', error);
            message.reply('❌ Error al enviar el sticker.');
        }
        return;
    }

    // Texto normal
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
        await waClient.sendMessage(contacto.id._serialized, textoComando);
        message.reply(`✅ Enviado a ${contactoDestino.nombre}: "${textoComando}"`);
    } catch (error) {
        console.error('Error:', error);
        message.reply('❌ Error al enviar el mensaje.');
    }
});

waClient.initialize();
discordClient.login(DISCORD_TOKEN);
