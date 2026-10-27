# Talky

Talky is a browser-based chat app with local accounts, direct messages, server workspaces, server roles, and text and voice channels.

## Run locally

```sh
npm install
npm run dev
```

For a production build, run `npm run build`.

## Voice-room testing limitation

Voice rooms request access to the current browser's microphone, show a local speaking-level indicator, and provide mute, chat-panel, and leave controls. Microphone audio is analyzed in the browser only; this version does not transmit audio or connect participants. Browser microphone access requires HTTPS or `localhost` and permission from the browser. The voice-room chat panel reuses that channel's locally stored text chat.

Older saved server channels stored as names are converted to text-channel records when loaded.
