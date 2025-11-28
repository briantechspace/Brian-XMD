/**
 * Single-file Vercel webhook for WhatsApp Cloud API (Meta)
 *
 * - Stateless handler that responds to meta webhook GET (verification) and POST (messages).
 * - Implements a small modular command system (internal map) with commands:
 *     start, ping, help, translate, tts, echo
 * - Onboarding: sends the channel + group invite links and bot signature (BOT_NAME / CREATOR).
 *
 * Required environment variables (set in Vercel Project Settings):
 * - WHATSAPP_TOKEN            (Meta Graph API bearer token)
 * - WHATSAPP_PHONE_NUMBER_ID  (WhatsApp phone-number-id)
 * - WHATSAPP_VERIFY_TOKEN     ( webhook verify token )
 *
 * Optional:
 * - LIBRETRANSLATE_URL        (default: https://libretranslate.de/translate)
 * - BOT_NAME                  (default: BRIAN-XMD)
 * - CREATOR                   (default: Brian 254768116434)
 * - CHANNEL_LINK              (default provided)
 * - GROUP_LINK                (default provided)
 *
 * Notes:
 * - You cannot auto-join/auto-follow users into Channel/Group: this code sends clickable links only.
 * - Heavy/long-running tasks (ffmpeg, sticker conversion) should be offloaded to a worker.
 *
 * Deploy: add this file and package.json + vercel.json, push to GitHub, import into Vercel,
 * set env vars, then configure Meta webhook callback URL to:
 *   https://<your-vercel-domain>/api/webhook
 */

const googleTTS = require("google-tts-api"); // dependency in package.json

// Environment config
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || "https://libretranslate.de/translate";
const BOT_NAME = process.env.BOT_NAME || "BRIAN-XMD";
const CREATOR = process.env.CREATOR || "Brian 254768116434";
const CHANNEL_LINK = process.env.CHANNEL_LINK || "https://whatsapp.com/channel/0029VbC173IDDmFVlhcSOZ0Q";
const GROUP_LINK = process.env.GROUP_LINK || "https://chat.whatsapp.com/JUhD5e6E18t3ABopwuwEMC";

if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID || !VERIFY_TOKEN) {
  console.warn("Missing one or more required environment variables: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN");
}

// Helper: send payload to Meta Graph API
async function sendToMeta(payload) {
  const url = `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

// Helper: simple text message
async function sendText(to, text) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text }
  };
  return sendToMeta(payload);
}

// Helper: send audio via link
async function sendAudioLink(to, audioUrl) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "audio",
    audio: { link: audioUrl }
  };
  return sendToMeta(payload);
}

// Helper: translate via LibreTranslate (or configured host)
async function translateText(text, target) {
  try {
    const res = await fetch(LIBRETRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target,
        format: "text"
      })
    });
    const data = await res.json();
    return data.translatedText || null;
  } catch (e) {
    console.error("translate error", e);
    return null;
  }
}

/**
 * Commands registry (in-one-file approach).
 * Each command: { name, description, aliases, execute(ctx) }
 * ctx contains: { from, raw, args, sendText, sendAudioLink, translateText, googleTTS, commands }
 */
const commands = new Map();

// register command helper
function register(cmd) {
  if (!cmd || !cmd.name || typeof cmd.execute !== "function") return;
  commands.set(cmd.name, cmd);
  if (Array.isArray(cmd.aliases)) {
    for (const a of cmd.aliases) commands.set(a, cmd);
  }
}

/* --- Commands --- */

// /start or greeting: onboarding
register({
  name: "start",
  description: "Welcome message + channel/group join links",
  aliases: ["welcome", "begin"],
  execute: async ({ from, raw, args, sendText }) => {
    const welcome = `${BOT_NAME}\ncreated by ${CREATOR}\n\nWelcome! I can help with commands. Type /help for available commands.`;
    const links = `Join our WhatsApp Channel:\n${CHANNEL_LINK}\n\nJoin our WhatsApp Group:\n${GROUP_LINK}\n\nTap the link(s) above to join — you must accept/join on your device.`;
    await sendText(from, welcome);
    // give a short pause/second message — just send another text message
    await sendText(from, links);
  }
});

// /ping
register({
  name: "ping",
  description: "Replies with pong",
  aliases: ["p"],
  execute: async ({ from, sendText }) => {
    await sendText(from, "pong");
  }
});

// /help
register({
  name: "help",
  description: "List available commands",
  aliases: ["h"],
  execute: async ({ from, sendText }) => {
    // Build unique commands by canonical name (ignore aliases duplicates)
    const seen = new Set();
    const list = [];
    for (const cmd of commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        list.push(`/${cmd.name} — ${cmd.description}`);
      }
    }
    await sendText(from, "Commands:\n" + list.join("\n"));
  }
});

// /translate <lang>|<text>
register({
  name: "translate",
  description: "Translate text: /translate <lang_code>|<text>",
  aliases: ["tr"],
  execute: async ({ from, args, sendText, translateText }) => {
    if (!args || !args.includes("|")) {
      return sendText(from, "Usage: /translate <lang_code>|<text>\nExample: /translate id|Hello world");
    }
    const [lang, ...rest] = args.split("|");
    const txt = rest.join("|").trim();
    if (!txt) return sendText(from, "No text to translate provided.");
    const target = (lang || "en").trim();
    const translated = await translateText(txt, target);
    if (translated) {
      await sendText(from, `Translated (${target}): ${translated}`);
    } else {
      await sendText(from, "Translation failed.");
    }
  }
});

// /tts <lang>|<text> -> sends audio link
register({
  name: "tts",
  description: "Generate TTS: /tts <lang_code>|<text> (sends audio link)",
  aliases: ["voice"],
  execute: async ({ from, args, sendText, sendAudioLink, googleTTS }) => {
    if (!args || !args.includes("|")) {
      return sendText(from, "Usage: /tts <lang_code>|<text>\nExample: /tts en|Hello world");
    }
    const [lang, ...rest] = args.split("|");
    const txt = rest.join("|").trim();
    if (!txt) return sendText(from, "No text provided.");
    const langCode = (lang || "en").trim();
    try {
      const url = googleTTS.getAudioUrl(txt, {
        lang: langCode || "en",
        slow: false,
        host: "https://translate.google.com"
      });
      await sendAudioLink(from, url);
    } catch (e) {
      console.error("TTS error", e);
      await sendText(from, "TTS failed.");
    }
  }
});

// /echo <text>
register({
  name: "echo",
  description: "Echo back the text",
  aliases: [],
  execute: async ({ from, args, raw, sendText }) => {
    const toEcho = args || raw || "";
    await sendText(from, `Echo: ${toEcho}`);
  }
});

/* --- Dispatcher helpers --- */

async function dispatchCommandByName(name, ctx) {
  if (!name) return false;
  const cmd = commands.get(name);
  if (!cmd) return false;
  try {
    // pass the same ctx but also some helpers
    await cmd.execute({
      ...ctx,
      sendText: ctx.sendText,
      sendAudioLink: ctx.sendAudioLink,
      translateText: ctx.translateText,
      googleTTS: ctx.googleTTS,
      commands
    });
  } catch (err) {
    console.error("Command execution error", name, err);
    try {
      await ctx.sendText(ctx.from, `Command error: ${err.message || "internal error"}`);
    } catch (_) {}
  }
  return true;
}

/* --- Main exported handler --- */

module.exports = async function (req, res) {
  try {
    if (req.method === "GET") {
      // Verification: Meta sends hub.mode, hub.verify_token, hub.challenge
      const mode = req.query["hub.mode"] || req.query["mode"];
      const token = req.query["hub.verify_token"] || req.query["verify_token"];
      const challenge = req.query["hub.challenge"] || req.query["challenge"];

      if (mode && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge || "OK");
      }
      return res.status(403).send("Invalid verify token");
    }

    if (req.method === "POST") {
      const body = req.body;
      if (!body || !Array.isArray(body.entry)) {
        return res.status(400).send("No valid body");
      }

      // Process entries -> changes -> messages
      for (const entry of body.entry) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value || {};
          const messages = value.messages || [];
          for (const message of messages) {
            const from = message.from;
            const type = message.type;

            // Build a lightweight context for command handlers
            const ctxBase = {
              from,
              sendText: sendText.bind(null),
              sendAudioLink: sendAudioLink.bind(null),
              translateText: translateText.bind(null),
              googleTTS
            };

            if (type === "text" && message.text && message.text.body) {
              const text = message.text.body.trim();
              const tokens = text.split(" ").filter(Boolean);
              const first = tokens[0] || "";

              // Onboarding triggers: /start, start, hi, hello, hey
              const lcFirst = first.toLowerCase();
              if (["/start", "start", "hi", "hello", "hey"].includes(lcFirst)) {
                const argsRaw = tokens.slice(1).join(" ");
                const ctx = { ...ctxBase, raw: text, args: argsRaw };
                const did = await dispatchCommandByName("start", ctx);
                if (!did) {
                  // fallback built-in welcome
                  await sendText(from, `${BOT_NAME}\ncreated by ${CREATOR}\n\nWelcome! Type /help for commands.`);
                  await sendText(from, `Join our Channel: ${CHANNEL_LINK}\nJoin our Group: ${GROUP_LINK}`);
                }
                continue;
              }

              // Command parsing: prefix / or !
              let cmdName = null;
              let argsRaw = "";
              if (first.startsWith("/") || first.startsWith("!")) {
                cmdName = first.slice(1).toLowerCase();
                argsRaw = tokens.slice(1).join(" ");
              } else {
                const maybe = first.toLowerCase();
                if (commands.has(maybe)) {
                  cmdName = maybe;
                  argsRaw = tokens.slice(1).join(" ");
                }
              }

              if (cmdName && commands.has(cmdName)) {
                const ctx = { ...ctxBase, raw: text, args: argsRaw };
                await dispatchCommandByName(cmdName, ctx);
              } else {
                // Not a command: default echo/help pointer
                await sendText(from, `You said: ${text}\nType /help for available commands.`);
              }
            } else {
              // Non-text messages: simple response
              await sendText(from, "Received non-text message. This demo handles text commands only. Type /help for commands.");
            }
          }
        }
      }

      // Always respond 200 quickly to Meta
      return res.status(200).send("EVENT_RECEIVED");
    }

    return res.status(405).send("Method Not Allowed");
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Server error");
  }
};
