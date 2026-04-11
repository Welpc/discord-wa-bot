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
    '2': { nombre: 'LOVLY Ana 🥺❤️', comando: '!mensaje2' },
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

async function obtenerEstado(contacto) {
    try {
        const bloqueado = await contacto.isBlocked();
        const estadoBloqueo = bloqueado ? '🔴 Bloqueado' : '🟩 Desbloqueado';

        let estadoConexion = '⚫ No está en línea';
        try {
            const chat = await contacto.getChat();
            await chat.getPresence?.();
            const presencia = await waClient.getContactById(contacto.id._serialized);
            const online = presencia?.presence?.isOnline || false;
            if (online) estadoConexion = '🟢 En línea';
        } catch (e) {}

        return `${estadoConexion} | ${estadoBloqueo}`;
    } catch (err) {
        return '⚫ No está en línea | 🟩 Desbloqueado';
    }
}

waClient.on('qr', (qr) => {
    console.log('📱 Escanea este QR con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

waClient.on('ready', async () => {
    console.log('✅ WhatsApp conectado!');
    waReady = true;

    try {
        const canal = await discordClient.channels.fetch(DISCORD_CANAL_ID);
        if (!canal) return;

        const chats = await waClient.getChats();
        let hayPendientes = false;

        for (const chat of chats) {
            if (chat.unreadCount <= 0) continue;

            const contact = await chat.getContact();
            const nombreContacto = contact.name || contact.pushname || contact.number;

            const esMonitoreado = Object.values(CONTACTOS).some(c => c.nombre === nombreContacto);
            if (!esMonitoreado) continue;

            if (!hayPendientes) {
                await canal.send(`⚠️ **Mensajes pendientes mientras el bot estuvo apagado:**`);
                hayPendientes = true;
            }

            const mensajes = await chat.fetchMessages({ limit: chat.unreadCount });

            for (const msg of mensajes) {
                if (msg.fromMe) continue;

                const encabezado = `📩 **Mensaje de: ${nombreContacto}**`;

                if (msg.type === MessageTypes.LOCATION) {
                    const lat = msg.location.latitude;
                    const lng = msg.location.longitude;
                    const gmaps = `https://www.google.com/maps?q=${lat},${lng}`;
                    await canal.send(`${encabezado} : 📍 [Ubicación]\n${gmaps}`);
                    continue;
                }

                if (msg.type === MessageTypes.TEXT) {
                    await canal.send(`${encabezado} : ${msg.body}`);
                } else if (msg.hasMedia) {
                    try {
                        if (msg.isViewOnce) { msg._data.isViewOnce = false; msg.isViewOnce = false; }
                        const media = await msg.downloadMedia();
                        if (!media) { await canal.send(`${encabezado} : [No se pudo descargar archivo]`); continue; }
                        const buffer = Buffer.from(media.data, 'base64');
                        let extension = 'bin';
                        let descripcion = ` : [${msg.type}]`;
                        if (msg.type === MessageTypes.IMAGE) { extension = 'jpg'; descripcion = msg.body ? ` : ${msg.body}` : ' : 📷 [Imagen]'; }
                        else if (msg.type === MessageTypes.VIDEO) { extension = 'mp4'; descripcion = ' : 🎥 [Video]'; }
                        else if (msg.type === MessageTypes.AUDIO) { extension = 'mp3'; descripcion = ' : 🎵 [Audio]'; }
                        else if (msg.type === MessageTypes.VOICE) { extension = 'ogg'; descripcion = ' : 🎵 [Nota de voz]'; }
                        else if (msg.type === MessageTypes.STICKER) { extension = 'webp'; descripcion = ' : 🎭 [Sticker]'; }
                        else if (msg.type === MessageTypes.DOCUMENT) { extension = 'bin'; descripcion = ' : 📄 [Documento]'; }
                        const nombreArchivo = media.filename || `archivo.${extension}`;
                        const attachment = new AttachmentBuilder(buffer, { name: nombreArchivo });
                        await canal.send({ content: `${encabezado}${descripcion}`, files: [attachment] });
                    } catch (err) {
                        await canal.send(`${encabezado} : [Error al descargar archivo]`);
                    }
                } else {
                    await canal.send(`${encabezado} : [${msg.type}]`);
                }
            }
            await chat.sendSeen();
        }

        if (!hayPendientes) console.log('✅ No hay mensajes pendientes.');

    } catch (error) {
        console.error('Error revisando mensajes pendientes:', error);
    }
});

waClient.on('disconnected', () => {
    console.log('❌ WhatsApp desconectado');
    waReady = false;
});

async function descargarYEnviar(msg, canal, encabezado, descripcion, extension) {
    try {
        const media = await msg.downloadMedia();
        if (!media) { await canal.send(`${encabezado} : [No se pudo descargar]`); return; }
        const buffer = Buffer.from(media.data, 'base64');
        const nombreArchivo = media.filename || `archivo.${extension}`;
        const attachment = new AttachmentBuilder(buffer, { name: nombreArchivo });
        await canal.send({ content: `${encabezado}${descripcion}`, files: [attachment] });
    } catch (err) {
        await canal.send(`${encabezado} : [Error al descargar archivo]`);
    }
}

waClient.on('message', async (msg) => {
    try {
        if (silencio) return;

        const contact = await msg.getContact();
        const nombreContacto = contact.name || contact.pushname || contact.number;

        const esMonitoreado = Object.values(CONTACTOS).some(c => c.nombre === nombreContacto);
        if (!esMonitoreado) return;

        const canal = await discordClient.channels.fetch(DISCORD_CANAL_ID);
        if (!canal) return;

        const encabezado = `📩 **Mensaje de: ${nombreContacto}**`;

        if (msg.type === MessageTypes.LOCATION) {
            const lat = msg.location.latitude;
            const lng = msg.location.longitude;
            const gmaps = `https://www.google.com/maps?q=${lat},${lng}`;
            await canal.send(`${encabezado} : 📍 [Ubicación]\n${gmaps}`);
            return;
        }

        if (msg.type === 'live_location') {
            const lat = msg._data.lat;
            const lng = msg._data.lng;
            const gmaps = `https://www.google.com/maps?q=${lat},${lng}`;
            await canal.send(`${encabezado} : 📍 [Ubicación en tiempo real]\n${gmaps}`);
            return;
        }

        if (msg.isViewOnce) {
            try {
                msg._data.isViewOnce = false;
                msg.isViewOnce = false;
                const extension = msg.type === MessageTypes.VIDEO ? 'mp4' : 'jpg';
                const descripcion = msg.type === MessageTypes.VIDEO ? ' : 👁️ [Video de una vez]' : ' : 👁️ [Foto de una vez]';
                await descargarYEnviar(msg, canal, encabezado, descripcion, extension);
            } catch (err) {
                await canal.send(`${encabezado} : 👁️ [Foto/Video de una vez - no se pudo capturar]`);
            }
            return;
        }

        if (msg.type === MessageTypes.TEXT) {
            await canal.send(`${encabezado} : ${msg.body}`);
        } else if (msg.hasMedia) {
            let extension = 'bin';
            let descripcion = ` : [${msg.type}]`;
            if (msg.type === MessageTypes.IMAGE) { extension = 'jpg'; descripcion = msg.body ? ` : ${msg.body}` : ' : 📷 [Imagen]'; }
            else if (msg.type === MessageTypes.VIDEO) { extension = 'mp4'; descripcion = msg.body ? ` : ${msg.body}` : ' : 🎥 [Video]'; }
            else if (msg.type === MessageTypes.AUDIO) { extension = 'mp3'; descripcion = ' : 🎵 [Audio]'; }
            else if (msg.type === MessageTypes.VOICE) { extension = 'ogg'; descripcion = ' : 🎵 [Nota de voz]'; }
            else if (msg.type === MessageTypes.STICKER) { extension = 'webp'; descripcion = ' : 🎭 [Sticker]'; }
            else if (msg.type === MessageTypes.DOCUMENT) { extension = 'bin'; descripcion = ' : 📄 [Documento]'; }
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

    if (contenido === '!silencio') { silencio = true; message.reply('🔇 Modo silencio activado.'); return; }
    if (contenido === '!hablar') { silencio = false; message.reply('🔊 Modo hablar activado.'); return; }

    let contactoDestino = null;
    let textoComando = '';

    if (contenido.startsWith('!mensaje1')) { contactoDestino = CONTACTOS['1']; textoComando = contenido.slice('!mensaje1'.length).replace(/^:\s*/, '').trim(); }
    else if (contenido.startsWith('!mensaje2')) { contactoDestino = CONTACTOS['2']; textoComando = contenido.slice('!mensaje2'.length).replace(/^:\s*/, '').trim(); }
    else if (contenido.startsWith('!mensaje3')) { contactoDestino = CONTACTOS['3']; textoComando = contenido.slice('!mensaje3'.length).replace(/^:\s*/, '').trim(); }

    if (!contactoDestino) return;

    if (!textoComando && message.attachments.size === 0) {
        message.reply(`⚠️ Escribe algo o adjunta un archivo después de ${contactoDestino.comando}:`);
        return;
    }

    if (!waReady) { message.reply('❌ WhatsApp no está conectado todavía.'); return; }

    try {
        const contacts = await waClient.getContacts();
        const contacto = contacts.find(c =>
            c.name === contactoDestino.nombre ||
            c.pushname === contactoDestino.nombre
        );

        if (!contacto) { message.reply(`❌ No encontré el contacto "${contactoDestino.nombre}"`); return; }

        const estado = await obtenerEstado(contacto);

        const stikerMatch = textoComando.match(/^stiker(\d+)$/i);
        if (stikerMatch) {
            const numero = parseInt(stikerMatch[1]);
            if (numero < 1 || numero > 10) { message.reply('⚠️ Solo hay stickers del stiker1 al stiker10.'); return; }
            const stikerPath = path.join(__dirname, 'stickers', `stiker${numero}.webp`);
            if (!fs.existsSync(stikerPath)) { message.reply(`⚠️ El stiker${numero} no existe.`); return; }
            const { MessageMedia } = require('whatsapp-web.js');
            const media = MessageMedia.fromFilePath(stikerPath);
            await waClient.sendMessage(contacto.id._serialized, media, { sendMediaAsSticker: true });
            message.reply(`✅ Stiker${numero} enviado a ${contactoDestino.nombre}\n${estado}`);
            return;
        }

        const ubicacionMatch = textoComando.match(/^ubicacion:(-?\d+\.?\d*),(-?\d+\.?\d*)$/i);
        if (ubicacionMatch) {
            const lat = parseFloat(ubicacionMatch[1]);
            const lng = parseFloat(ubicacionMatch[2]);
            const { Location } = require('whatsapp-web.js');
            const location = new Location(lat, lng);
            await waClient.sendMessage(contacto.id._serialized, location);
            message.reply(`✅ Ubicación enviada a ${contactoDestino.nombre}\n${estado}`);
            return;
        }

        if (message.attachments.size > 0) {
            const { MessageMedia } = require('whatsapp-web.js');
            for (const attachment of message.attachments.values()) {
                const response = await fetch(attachment.url);
                const arrayBuffer = await response.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimetype = attachment.contentType || 'application/octet-stream';
                const filename = attachment.name || 'archivo';
                const media = new MessageMedia(mimetype, base64, filename);
                await waClient.sendMessage(contacto.id._serialized, media);
            }
            if (textoComando) await waClient.sendMessage(contacto.id._serialized, textoComando);
            message.reply(`✅ Archivo enviado a ${contactoDestino.nombre}\n${estado}`);
            return;
        }

        await waClient.sendMessage(contacto.id._serialized, textoComando);
        message.reply(`✅ Enviado a ${contactoDestino.nombre}: "${textoComando}"\n${estado}`);

    } catch (error) {
        console.error('Error:', error);
        message.reply('❌ Error al enviar el mensaje.');
    }
});

waClient.initialize();
discordClient.login(DISCORD_TOKEN);
