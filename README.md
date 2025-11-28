```markdown
# Vercel WhatsApp Cloud API Webhook Bot

This is a minimal stateless webhook bot designed to run on Vercel and integrate with the WhatsApp Cloud API (Meta).

Features:
- /ping  -> replies "pong"
- /help
- /translate <lang_code>|<text> -> uses LibreTranslate (configurable)
- /tts <lang_code>|<text> -> returns TTS audio (google-tts-api) and sends as audio-by-link
- /start -> onboarding message with channel and group links

Required environment variables (set in Vercel Project Settings):
- WHATSAPP_TOKEN            : Meta Graph API bearer token (WhatsApp Cloud API access token)
- WHATSAPP_PHONE_NUMBER_ID  : the phone-number-id from Meta Cloud API
- WHATSAPP_VERIFY_TOKEN     : webhook verify token you choose
- LIBRETRANSLATE_URL        : optional, default: https://libretranslate.de/translate
- BOT_NAME                  : default BRIAN-XMD
- CREATOR                   : default "Brian 254768116434"
- CHANNEL_LINK              : channel invite link
- GROUP_LINK                : group invite link

Deploy steps:
1. Push this branch (vercel-whatsapp-bot) to Github.
2. In Vercel, import the repository and set the required environment variables in Project Settings.
3. In Meta for Developers -> WhatsApp product -> Webhooks, set the callback URL:
   https://<your-vercel-domain>/api/webhook
   and the verify token to the same WHATSAPP_VERIFY_TOKEN you set in Vercel.
4. Test by sending messages to the WhatsApp phone number associated with your phone-number-id.

Notes and limitations:
- Stateless: heavy media processing (ffmpeg, stickers) should be offloaded to a worker host.
- LibreTranslate public instance may have rate limits; consider a paid translation provider for production.
- TTS uses google-tts-api and returns a link hosted by the provider.
```
