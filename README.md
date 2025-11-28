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
