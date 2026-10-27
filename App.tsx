import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CreateServerModal,
  ServerMemberCard,
  ServerRailItems,
  ServerSettingsPage,
  ServerWorkspace,
  type ServerMember,
  type ServerRole,
  type ServerRoleAssignments,
  type ServerChannel,
  type TalkyServer,
} from './Servers';
import { ServerChat } from './ServerChat';
import { LocalVoiceRoom } from './LocalVoiceRoom';
import './servers.css';

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const PROFILE_KEY = "talky_profile";
const ACCOUNTS_KEY = "talky_accounts_v3";
const ACTIVE_USER_KEY = "talky_active_user_id";
const DB_NAME = "talky_media_store_v5";
const SERVER_CHANNELS = ["general", "announcements", "off-topic"];
const defaultServerChannels = (): ServerChannel[] => SERVER_CHANNELS.map(name => ({
  id: `text-${name}`,
  name,
  type: "text",
}));
const serverListStorageKey = (owner: string) => `talky_servers_v1_${owner}`;
const selectedServerStorageKey = (owner: string) => `talky_selected_server_v1_${owner}`;
const serverMediaStorageKey = (owner: string, serverId: string, type: "icon" | "banner") =>
  `server_${type}_${owner}_${serverId}`;

const readServerList = (owner: string): TalkyServer[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(serverListStorageKey(owner)) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(item => item && typeof item.id === "string" && typeof item.name === "string")
      .map(item => {
        const roles: ServerRole[] = Array.isArray(item.roles)
          ? item.roles.filter((role: unknown): role is ServerRole => Boolean(
            role && typeof role === "object" &&
            typeof (role as ServerRole).id === "string" &&
            typeof (role as ServerRole).name === "string" &&
            typeof (role as ServerRole).color === "string"
          )).map((role: ServerRole) => ({ id: role.id, name: role.name.slice(0, 32), color: role.color }))
          : [];
        const roleIds = new Set(roles.map(role => role.id));
        const savedAssignments = item.roleAssignments && typeof item.roleAssignments === "object" && !Array.isArray(item.roleAssignments)
          ? item.roleAssignments as Record<string, unknown>
          : {};
        const roleAssignments: ServerRoleAssignments = Object.fromEntries(
          Object.entries(savedAssignments).map(([memberId, assigned]) => [
            memberId,
            Array.isArray(assigned) ? [...new Set(assigned.filter((roleId): roleId is string => typeof roleId === "string" && roleIds.has(roleId)))] : [],
          ])
        );
        const channels: ServerChannel[] = Array.isArray(item.channels)
          ? item.channels.slice(0, 40).flatMap((channel: unknown, index: number): ServerChannel[] => {
            if (typeof channel === "string") {
              const name = channel.trim().slice(0, 48);
              return name ? [{ id: `text-${name}-${index}`, name, type: "text" }] : [];
            }
            if (!channel || typeof channel !== "object") return [];
            const savedChannel = channel as Partial<ServerChannel>;
            if (typeof savedChannel.name !== "string" || !savedChannel.name.trim()) return [];
            const type = savedChannel.type === "voice" ? "voice" : "text";
            return [{
              id: typeof savedChannel.id === "string" && savedChannel.id ? savedChannel.id : `${type}-${index}-${savedChannel.name}`,
              name: savedChannel.name.trim().slice(0, 48),
              type,
            }];
          })
          : [];
        return {
          id: item.id,
          name: item.name,
          description: typeof item.description === "string" ? item.description : "",
          icon: "",
          banner: "",
          channels: channels.length ? channels : defaultServerChannels(),
          roles,
          roleAssignments,
        };
      });
  } catch {
    return [];
  }
};

const readSelectedServerId = (owner: string) => {
  try {
    return localStorage.getItem(selectedServerStorageKey(owner)) || null;
  } catch {
    return null;
  }
};
const VERIFIED_BADGE_IMAGE_URL = "https://imgs.search.brave.com/67qwCRcJYffdVNjMC4A0gMoMIfrA0Nng5OdJms8KOYc/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wbmcu/cG5ndHJlZS5jb20v/cG5nLXZlY3Rvci8y/MDI2MDMyMy9vdXJt/aWQvcG5ndHJlZS1i/bHVlLXZlcmlmaWVk/LWJhZGdlLWljb24t/c29jaWFsLW1lZGlh/LXZlY3Rvci1wbmct/aW1hZ2VfMTg4MDQ1/MDIud2VicA";

interface AccountProfile {
  displayName: string;
  username: string;
  pronouns: string;
  bio: string;
  email: string;
  pfp: string;
  banner: string;
  verifiedBadgeEquipped: boolean;
}

interface ChatImageAttachment {
  id: string;
  name: string;
  dataUrl: string;
}

interface ChatMessage {
  id: string;
  author: string;
  time: string;
  text: string;
  images: ChatImageAttachment[];
  replyTo: ChatReplyReference | null;
  reactions: ChatReaction[];
}

interface ChatReplyReference {
  messageId: string;
  author: string;
  preview: string;
}

interface ChatReaction {
  emoji: string;
  userIds: string[];
}

interface ImageViewerState {
  images: ChatImageAttachment[];
  index: number;
}

interface EmojiPickerState {
  messageId: string;
  left: number;
  top: number;
  placement: "top" | "bottom";
}

interface EmojiShortcode {
  shortcode: string;
  emoji: string;
}

interface EmojiCompletion {
  start: number;
  end: number;
  query: string;
}

const EMOJI_OPTIONS = [
  { emoji: "😀", name: "grinning face" }, { emoji: "😃", name: "grinning face with big eyes" },
  { emoji: "😄", name: "smiling face with smiling eyes" }, { emoji: "😁", name: "beaming face" },
  { emoji: "😆", name: "grinning squinting face" }, { emoji: "😅", name: "grinning face with sweat" },
  { emoji: "😂", name: "face with tears of joy laugh" }, { emoji: "🤣", name: "rolling on the floor laughing" },
  { emoji: "🥲", name: "smiling face with tear" }, { emoji: "🥹", name: "face holding back tears" },
  { emoji: "😊", name: "smiling face with smiling eyes" }, { emoji: "😇", name: "smiling face with halo" },
  { emoji: "🙂", name: "slightly smiling face" }, { emoji: "🙃", name: "upside down face" },
  { emoji: "😉", name: "winking face" }, { emoji: "😌", name: "relieved face" },
  { emoji: "😍", name: "heart eyes love" }, { emoji: "🥰", name: "smiling face with hearts" },
  { emoji: "😘", name: "face blowing a kiss" }, { emoji: "😗", name: "kissing face" },
  { emoji: "😋", name: "face savoring food" }, { emoji: "😛", name: "face with tongue" },
  { emoji: "😜", name: "winking face with tongue" }, { emoji: "🤪", name: "zany face" },
  { emoji: "😝", name: "squinting face with tongue" }, { emoji: "🤑", name: "money mouth face" },
  { emoji: "🤗", name: "hugging face" }, { emoji: "🤭", name: "face with hand over mouth" },
  { emoji: "🫢", name: "face with open eyes and hand over mouth" }, { emoji: "🫣", name: "face peeking" },
  { emoji: "🤫", name: "shushing face" }, { emoji: "🤔", name: "thinking face" },
  { emoji: "🫡", name: "saluting face" }, { emoji: "🤐", name: "zipper mouth face" },
  { emoji: "🤨", name: "face with raised eyebrow" }, { emoji: "😐", name: "neutral face" },
  { emoji: "😑", name: "expressionless face" }, { emoji: "😶", name: "face without mouth" },
  { emoji: "🫥", name: "dotted line face" }, { emoji: "😏", name: "smirking face" },
  { emoji: "😒", name: "unamused face" }, { emoji: "🙄", name: "face with rolling eyes" },
  { emoji: "😬", name: "grimacing face" }, { emoji: "🤥", name: "lying face" },
  { emoji: "😮", name: "face with open mouth" }, { emoji: "😯", name: "hushed face" },
  { emoji: "😲", name: "astonished face" }, { emoji: "😳", name: "flushed face" },
  { emoji: "🥺", name: "pleading face" }, { emoji: "😦", name: "frowning face with open mouth" },
  { emoji: "😨", name: "fearful face" }, { emoji: "😰", name: "anxious face with sweat" },
  { emoji: "😥", name: "sad but relieved face" }, { emoji: "😢", name: "crying face" },
  { emoji: "😭", name: "loudly crying face" }, { emoji: "😱", name: "face screaming in fear" },
  { emoji: "😖", name: "confounded face" }, { emoji: "😣", name: "persevering face" },
  { emoji: "😞", name: "disappointed face" }, { emoji: "😓", name: "downcast face with sweat" },
  { emoji: "😩", name: "weary face" }, { emoji: "😫", name: "tired face" },
  { emoji: "🥱", name: "yawning face" }, { emoji: "😤", name: "face with steam from nose" },
  { emoji: "😡", name: "pouting angry face" }, { emoji: "🤬", name: "face with symbols on mouth" },
  { emoji: "😈", name: "smiling face with horns" }, { emoji: "💀", name: "skull" },
  { emoji: "☠️", name: "skull and crossbones" }, { emoji: "💩", name: "pile of poo" },
  { emoji: "🤡", name: "clown face" }, { emoji: "👻", name: "ghost" },
  { emoji: "👽", name: "alien" }, { emoji: "🤖", name: "robot" },
  { emoji: "😺", name: "grinning cat" }, { emoji: "😸", name: "grinning cat with smiling eyes" },
  { emoji: "😻", name: "heart eyes cat" }, { emoji: "🙈", name: "see no evil monkey" },
  { emoji: "🙉", name: "hear no evil monkey" }, { emoji: "🙊", name: "speak no evil monkey" },
  { emoji: "💋", name: "kiss mark" }, { emoji: "💌", name: "love letter" },
  { emoji: "💘", name: "heart with arrow" }, { emoji: "💝", name: "heart with ribbon" },
  { emoji: "💖", name: "sparkling heart" }, { emoji: "💗", name: "growing heart" },
  { emoji: "💓", name: "beating heart" }, { emoji: "💞", name: "revolving hearts" },
  { emoji: "💕", name: "two hearts" }, { emoji: "💟", name: "heart decoration" },
  { emoji: "❤️", name: "red heart" }, { emoji: "🧡", name: "orange heart" },
  { emoji: "💛", name: "yellow heart" }, { emoji: "💚", name: "green heart" },
  { emoji: "💙", name: "blue heart" }, { emoji: "💜", name: "purple heart" },
  { emoji: "🖤", name: "black heart" }, { emoji: "🤍", name: "white heart" },
  { emoji: "🤎", name: "brown heart" }, { emoji: "💔", name: "broken heart" },
  { emoji: "👍", name: "thumbs up like" }, { emoji: "👎", name: "thumbs down dislike" },
  { emoji: "👏", name: "clapping hands" }, { emoji: "🙌", name: "raising hands celebration" },
  { emoji: "🫶", name: "heart hands" }, { emoji: "🤝", name: "handshake" },
  { emoji: "🙏", name: "folded hands please thanks" }, { emoji: "✌️", name: "victory hand peace" },
  { emoji: "🤞", name: "crossed fingers luck" }, { emoji: "🤟", name: "love you gesture" },
  { emoji: "🤘", name: "sign of the horns" }, { emoji: "👌", name: "OK hand" },
  { emoji: "💪", name: "flexed biceps strong" },
  { emoji: "🦾", name: "mechanical arm" }, { emoji: "🫰", name: "hand with index finger and thumb crossed" },
  { emoji: "👀", name: "eyes looking" }, { emoji: "💯", name: "hundred points" },
  { emoji: "🔥", name: "fire hot lit" }, { emoji: "✨", name: "sparkles" },
  { emoji: "⭐", name: "star" }, { emoji: "🌟", name: "glowing star" },
  { emoji: "🎉", name: "party popper celebration" }, { emoji: "🎊", name: "confetti ball" },
  { emoji: "✅", name: "check mark button" }, { emoji: "❌", name: "cross mark" },
  { emoji: "⚡", name: "high voltage lightning" }, { emoji: "💤", name: "zzz sleeping" },
  { emoji: "☕", name: "hot beverage coffee" }, { emoji: "🍕", name: "pizza" },
  { emoji: "🍰", name: "shortcake cake" }, { emoji: "🚀", name: "rocket" },
  { emoji: "🌈", name: "rainbow" }, { emoji: "🎵", name: "musical note" },
  { emoji: "🐱", name: "cat" }, { emoji: "🐶", name: "dog" },
  { emoji: "🐸", name: "frog" }, { emoji: "🦋", name: "butterfly" },
  { emoji: "🌻", name: "sunflower" }, { emoji: "🍀", name: "four leaf clover" },
];

const EMOJI_SHORTCODES: EmojiShortcode[] = [
  { shortcode: "smile", emoji: "😄" }, { shortcode: "smiley", emoji: "😃" },
  { shortcode: "happy", emoji: "😊" }, { shortcode: "grin", emoji: "😁" },
  { shortcode: "grinning", emoji: "😀" }, { shortcode: "laugh", emoji: "😆" },
  { shortcode: "joy", emoji: "😂" }, { shortcode: "rofl", emoji: "🤣" },
  { shortcode: "wink", emoji: "😉" }, { shortcode: "blush", emoji: "😊" },
  { shortcode: "heart_eyes", emoji: "😍" }, { shortcode: "love", emoji: "🥰" },
  { shortcode: "kiss", emoji: "😘" }, { shortcode: "thinking", emoji: "🤔" },
  { shortcode: "think", emoji: "🤔" }, { shortcode: "shrug", emoji: "🤷" },
  { shortcode: "confused", emoji: "😕" }, { shortcode: "neutral", emoji: "😐" },
  { shortcode: "smirk", emoji: "😏" }, { shortcode: "roll_eyes", emoji: "🙄" },
  { shortcode: "sweat_smile", emoji: "😅" }, { shortcode: "cry", emoji: "😢" },
  { shortcode: "crying", emoji: "😢" }, { shortcode: "sob", emoji: "😭" },
  { shortcode: "sad", emoji: "😞" }, { shortcode: "pleading", emoji: "🥺" },
  { shortcode: "tired", emoji: "😫" }, { shortcode: "yawn", emoji: "🥱" },
  { shortcode: "angry", emoji: "😡" }, { shortcode: "rage", emoji: "🤬" },
  { shortcode: "scream", emoji: "😱" }, { shortcode: "hug", emoji: "🤗" },
  { shortcode: "salute", emoji: "🫡" }, { shortcode: "eyes", emoji: "👀" },
  { shortcode: "heart", emoji: "❤️" }, { shortcode: "red_heart", emoji: "❤️" },
  { shortcode: "orange_heart", emoji: "🧡" }, { shortcode: "yellow_heart", emoji: "💛" },
  { shortcode: "green_heart", emoji: "💚" }, { shortcode: "blue_heart", emoji: "💙" },
  { shortcode: "purple_heart", emoji: "💜" }, { shortcode: "black_heart", emoji: "🖤" },
  { shortcode: "white_heart", emoji: "🤍" }, { shortcode: "brown_heart", emoji: "🤎" },
  { shortcode: "broken_heart", emoji: "💔" }, { shortcode: "thumbsup", emoji: "👍" },
  { shortcode: "thumbs_up", emoji: "👍" }, { shortcode: "+1", emoji: "👍" },
  { shortcode: "thumbsdown", emoji: "👎" }, { shortcode: "thumbs_down", emoji: "👎" },
  { shortcode: "-1", emoji: "👎" }, { shortcode: "clap", emoji: "👏" },
  { shortcode: "raised_hands", emoji: "🙌" }, { shortcode: "heart_hands", emoji: "🫶" },
  { shortcode: "pray", emoji: "🙏" }, { shortcode: "fire", emoji: "🔥" },
  { shortcode: "sparkle", emoji: "✨" }, { shortcode: "sparkles", emoji: "✨" },
  { shortcode: "star", emoji: "⭐" }, { shortcode: "tada", emoji: "🎉" },
  { shortcode: "party", emoji: "🎉" }, { shortcode: "confetti", emoji: "🎊" },
  { shortcode: "check", emoji: "✅" }, { shortcode: "x", emoji: "❌" },
  { shortcode: "zap", emoji: "⚡" }, { shortcode: "zzz", emoji: "💤" },
  { shortcode: "coffee", emoji: "☕" }, { shortcode: "pizza", emoji: "🍕" },
  { shortcode: "cake", emoji: "🍰" }, { shortcode: "rocket", emoji: "🚀" },
  { shortcode: "rainbow", emoji: "🌈" }, { shortcode: "music", emoji: "🎵" },
  { shortcode: "cat", emoji: "🐱" }, { shortcode: "dog", emoji: "🐶" },
  { shortcode: "frog", emoji: "🐸" }, { shortcode: "butterfly", emoji: "🦋" },
  { shortcode: "sunflower", emoji: "🌻" }, { shortcode: "clover", emoji: "🍀" },
  { shortcode: "ghost", emoji: "👻" }, { shortcode: "alien", emoji: "👽" },
  { shortcode: "robot", emoji: "🤖" }, { shortcode: "skull", emoji: "💀" },
  { shortcode: "poop", emoji: "💩" }, { shortcode: "clown", emoji: "🤡" },
];

const EMOJI_BY_SHORTCODE = Object.fromEntries(
  EMOJI_SHORTCODES.map(({ shortcode, emoji }) => [shortcode, emoji])
) as Record<string, string>;

const findEmojiCompletion = (text: string, cursor: number): EmojiCompletion | null => {
  const beforeCursor = text.slice(0, cursor);
  const match = beforeCursor.match(/:[a-z0-9_+-]{0,24}$/i);
  if (!match) return null;

  const start = cursor - match[0].length;
  const previousCharacter = beforeCursor.slice(0, start).slice(-1);
  if (previousCharacter && /[a-z0-9_]/i.test(previousCharacter)) return null;

  return { start, end: cursor, query: match[0].slice(1).toLowerCase() };
};

const expandEmojiShortcodes = (text: string) => text.replace(
  /:([a-z0-9_+-]+):/gi,
  (match, shortcode: string) => EMOJI_BY_SHORTCODE[shortcode.toLowerCase()] ?? match
);

const getMessagePreview = (message: Pick<ChatMessage, "text" | "images">) => {
  const text = message.text.trim();
  if (text) return text;
  const imageCount = message.images.length;
  return imageCount > 0 ? `${imageCount} image${imageCount === 1 ? "" : "s"}` : "Message";
};

const defaultAccount: AccountProfile = {
  displayName: "Talky User",
  username: "talkyuser",
  pronouns: "",
  bio: "",
  email: "",
  pfp: "",
  banner: "",
  verifiedBadgeEquipped: false,
};

const VerifiedBadge = ({ className = "", title = "Verified" }: { className?: string; title?: string }) => (
  <img
    className={className}
    src={VERIFIED_BADGE_IMAGE_URL}
    alt="Verified badge"
    title={title}
    draggable={false}
  />
);

// --- IndexedDB for animated GIF and banner storage across accounts ---
const openMediaDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveMediaItem = async (key: string, data: string) => {
  try {
    const db = await openMediaDB();
    const tx = db.transaction("media", "readwrite");
    tx.objectStore("media").put(data, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("IndexedDB save error", err);
  }
};

const loadMediaItem = async (key: string): Promise<string | null> => {
  try {
    const db = await openMediaDB();
    const tx = db.transaction("media", "readonly");
    const req = tx.objectStore("media").get(key);
    const result = await new Promise<unknown>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return typeof result === "string" ? result : null;
  } catch (error) {
    console.warn("IndexedDB load error", error);
    return null;
  }
};

const deleteMediaItem = async (key: string) => {
  try {
    const db = await openMediaDB();
    const tx = db.transaction("media", "readwrite");
    tx.objectStore("media").delete(key);
    db.close();
  } catch (error) {
    console.warn("IndexedDB delete error", error);
  }
};

export default function App() {
  // --- Routing & Session State ---
  const [route, setRoute] = useState<string>("landing");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [session, setSession] = useState<boolean>(false);
  const [activeUserId, setActiveUserId] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_USER_KEY) || "";
    } catch {
      return "";
    }
  });

  // --- Saved Profile State ---
  const [profile, setProfile] = useState<AccountProfile>(() => {
    try {
      const activeId = localStorage.getItem(ACTIVE_USER_KEY);
      const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
      if (activeId && accounts[activeId]) {
        return { ...defaultAccount, ...accounts[activeId] };
      }
      const legacy = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      if (legacy && legacy.displayName) {
        return { ...defaultAccount, ...legacy };
      }
    } catch (error) {
      console.warn("Profile loading error", error);
    }
    return { ...defaultAccount };
  });

  const [mediaUrls, setMediaUrls] = useState<{ pfp: string; banner: string }>({
    pfp: profile.pfp || "",
    banner: profile.banner || ""
  });

  // --- Draft Profile State (for Settings Editing & Live Preview) ---
  const [draftProfile, setDraftProfile] = useState<AccountProfile>(profile);
  const [draftMedia, setDraftMedia] = useState<{ pfp: string; banner: string }>(mediaUrls);

  // Sync draft whenever profile or media changes from storage
  useEffect(() => {
    setDraftProfile(profile);
    setDraftMedia(mediaUrls);
  }, [profile, mediaUrls]);

  // Load animated media from IndexedDB
  useEffect(() => {
    async function restoreMedia() {
      const userId = activeUserId || "default";
      const pfp = await loadMediaItem(`pfp_${userId}`);
      const banner = await loadMediaItem(`banner_${userId}`);
      if (pfp || banner) {
        setMediaUrls(current => ({
          pfp: pfp || current.pfp,
          banner: banner || current.banner
        }));
        setDraftMedia(current => ({
          pfp: pfp || current.pfp,
          banner: banner || current.banner
        }));
      }
    }
    restoreMedia();
  }, [activeUserId]);

  // Check if user has unsaved changes in Settings
  const hasUnsavedChanges = 
    draftProfile.displayName !== profile.displayName ||
    draftProfile.username !== profile.username ||
    draftProfile.pronouns !== profile.pronouns ||
    draftProfile.bio !== profile.bio ||
    draftProfile.verifiedBadgeEquipped !== profile.verifiedBadgeEquipped ||
    draftMedia.pfp !== mediaUrls.pfp ||
    draftMedia.banner !== mediaUrls.banner;

  // --- Auth / Signup Form State ---
  const [loginIdentity, setLoginIdentity] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupDisplayName, setSignupDisplayName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [selectedDate, setSelectedDate] = useState({ month: "", day: "", year: "" });
  
  // Dropdown states for DOB
  const [openDropdown, setOpenDropdown] = useState<"month" | "day" | "year" | null>(null);
  const [dropdownSearches, setDropdownSearches] = useState({ month: "", day: "", year: "" });

  // --- App Shell & Chat State ---
  const [hasDms, setHasDms] = useState(false);
  const [hasChat, setHasChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composerText, setComposerText] = useState("");
  const [composerSelection, setComposerSelection] = useState({ start: 0, end: 0 });
  const [emojiSuggestionIndex, setEmojiSuggestionIndex] = useState(0);
  const [emojiSuggestionsDismissed, setEmojiSuggestionsDismissed] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatImageAttachment[]>([]);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [replyDraft, setReplyDraft] = useState<ChatReplyReference | null>(null);
  const [emojiPicker, setEmojiPicker] = useState<EmojiPickerState | null>(null);
  const [emojiSearch, setEmojiSearch] = useState("");

  // --- Local server system (kept separate from DM, auth, and user-settings state) ---
  const serverOwnerKey = activeUserId || "default";
  const [servers, setServers] = useState<TalkyServer[]>(() => readServerList(serverOwnerKey));
  const [selectedServerId, setSelectedServerId] = useState<string | null>(() => readSelectedServerId(serverOwnerKey));
  const [serverStorageUserKey, setServerStorageUserKey] = useState(serverOwnerKey);
  const [serverCreateOpen, setServerCreateOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [selectedServerMember, setSelectedServerMember] = useState<ServerMember | null>(null);
  const [selectedServerChannel, setSelectedServerChannel] = useState(defaultServerChannels()[0].id);

  // --- Settings State ---
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"profiles" | "badges">("profiles");

  const messageListRef = useRef<HTMLDivElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);
  const messageComposerRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const currentServer = servers.find(server => server.id === selectedServerId) || null;
  const currentChannel = currentServer?.channels.find(channel => channel.id === selectedServerChannel) || currentServer?.channels[0] || null;

  useEffect(() => {
    const owner = activeUserId || "default";
    setServerStorageUserKey("");
    setServers([]);
    setSelectedServerId(null);
    setServerMenuOpen(false);
    setServerSettingsOpen(false);
    setSelectedServerMember(null);

    const storedServers = readServerList(owner);
    const savedSelection = readSelectedServerId(owner);
    setServers(storedServers);
    setSelectedServerId(storedServers.some(server => server.id === savedSelection) ? savedSelection : null);
    setServerStorageUserKey(owner);

    let cancelled = false;
    Promise.all(storedServers.map(async server => {
      const [icon, banner] = await Promise.all([
        loadMediaItem(serverMediaStorageKey(owner, server.id, "icon")),
        loadMediaItem(serverMediaStorageKey(owner, server.id, "banner")),
      ]);
      return { ...server, icon: icon || "", banner: banner || "" };
    })).then(restoredServers => {
      if (!cancelled) setServers(restoredServers);
    });
    return () => { cancelled = true; };
  }, [activeUserId]);

  useEffect(() => {
    if (serverStorageUserKey !== serverOwnerKey) return;
    try {
      const metadata = servers.map(({ icon: _icon, banner: _banner, ...server }) => server);
      localStorage.setItem(serverListStorageKey(serverOwnerKey), JSON.stringify(metadata));
    } catch (error) {
      console.warn("Server save error", error);
    }
  }, [servers, serverOwnerKey, serverStorageUserKey]);

  useEffect(() => {
    if (serverStorageUserKey !== serverOwnerKey) return;
    try {
      if (selectedServerId && servers.some(server => server.id === selectedServerId)) {
        localStorage.setItem(selectedServerStorageKey(serverOwnerKey), selectedServerId);
      } else {
        localStorage.removeItem(selectedServerStorageKey(serverOwnerKey));
      }
    } catch (error) {
      console.warn("Server selection save error", error);
    }
  }, [selectedServerId, servers, serverOwnerKey, serverStorageUserKey]);

  // Current display name for topbar/chat
  const currentName = profile.displayName.trim() || "Your name";
  const serverMembers: ServerMember[] = currentServer ? [
    {
      id: "current-user",
      displayName: currentName,
      username: profile.username || "username",
      avatar: mediaUrls.pfp,
      bio: profile.bio,
      pronouns: profile.pronouns,
      isCurrentUser: true,
      roleIds: currentServer.roleAssignments["current-user"] || [],
    },
  ] : [];
  const emojiCompletion = composerSelection.start === composerSelection.end
    ? findEmojiCompletion(composerText, composerSelection.end)
    : null;
  const emojiSuggestions = emojiCompletion
    ? EMOJI_SHORTCODES.filter(option => option.shortcode.startsWith(emojiCompletion.query)).slice(0, 8)
    : [];
  const emojiAutocompleteOpen = Boolean(emojiCompletion && emojiSuggestions.length > 0 && !emojiSuggestionsDismissed);
  const activeEmojiSuggestionIndex = emojiSuggestions.length
    ? emojiSuggestionIndex % emojiSuggestions.length
    : 0;
  const activeEmojiSuggestion = emojiSuggestions[activeEmojiSuggestionIndex] ?? null;
  const filteredEmojis = EMOJI_OPTIONS.filter(option =>
    `${option.name} ${option.emoji}`.toLowerCase().includes(emojiSearch.trim().toLowerCase())
  );
  const todayYear = new Date().getFullYear();

  const optionSets = {
    month: MONTH_NAMES.map((label, index) => ({ label, value: String(index + 1) })),
    day: Array.from({ length: 31 }, (_, index) => ({ label: String(index + 1), value: String(index + 1) })),
    year: Array.from({ length: todayYear - 1899 }, (_, index) => {
      const year = String(todayYear - index);
      return { label: year, value: year };
    })
  };

  const getDayCount = () => {
    const m = Number(selectedDate.month);
    const y = Number(selectedDate.year) || 2024;
    return m ? new Date(y, m, 0).getDate() : 31;
  };

  const calculateAge = () => {
    const y = Number(selectedDate.year);
    const m = Number(selectedDate.month);
    const d = Number(selectedDate.day);
    if (!y || !m || !d) return "You are: — years old";
    const birthDate = new Date(y, m - 1, d);
    const validDate = birthDate.getFullYear() === y && birthDate.getMonth() === m - 1 && birthDate.getDate() === d;
    const today = new Date();
    if (!validDate || birthDate > today) return "You are: — years old";
    let age = today.getFullYear() - y;
    if (today.getMonth() < m - 1 || (today.getMonth() === m - 1 && today.getDate() < d)) age -= 1;
    return `You are: ${age} years old`;
  };

  // Session & Cookie checks
  useEffect(() => {
    const getCookie = (name: string) => {
      const entry = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`));
      return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
    };
    const active = getCookie("talky_session") === "1" || (window.location.protocol === "file:" && localStorage.getItem("talky_file_session") === "1");
    setSession(active);
  }, []);

  // Sync route with hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1).toLowerCase();
      if (session) {
        setRoute("app");
      } else if (hash === "auth" || hash === "login" || hash === "signup") {
        setRoute("auth");
        setAuthMode(hash === "signup" ? "signup" : "login");
      } else {
        setRoute("landing");
      }
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, [session]);

  // Escape closes overlays; the arrow keys cycle through an open image gallery.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (serverSettingsOpen) setServerSettingsOpen(false);
        if (serverCreateOpen) setServerCreateOpen(false);
        if (serverMenuOpen) setServerMenuOpen(false);
        if (selectedServerMember) setSelectedServerMember(null);
        if (settingsOpen) setSettingsOpen(false);
        if (imageViewer) setImageViewer(null);
        if (emojiPicker) setEmojiPicker(null);
      }
      if (imageViewer && imageViewer.images.length > 1) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setImageViewer(current => current ? {
            ...current,
            index: (current.index - 1 + current.images.length) % current.images.length
          } : current);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setImageViewer(current => current ? {
            ...current,
            index: (current.index + 1) % current.images.length
          } : current);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen, imageViewer, emojiPicker, serverSettingsOpen, serverCreateOpen, serverMenuOpen, selectedServerMember]);

  useEffect(() => {
    if (!emojiPicker) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && emojiPickerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".message-reaction-trigger")) return;
      setEmojiPicker(null);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [emojiPicker]);

  const navigateTo = (newRoute: string, mode?: "login" | "signup") => {
    if (mode) setAuthMode(mode);
    window.location.hash = `#${newRoute}`;
  };

  const createSessionForAccount = async (userId: string, accProfile: AccountProfile) => {
    const normalizedProfile = { ...defaultAccount, ...accProfile };
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `talky_session=1; Max-Age=2592000; Path=/; SameSite=Lax${secure}`;
    if (window.location.protocol === "file:") localStorage.setItem("talky_file_session", "1");
    
    setActiveUserId(userId);
    try {
      localStorage.setItem(ACTIVE_USER_KEY, userId);
      const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
      accounts[userId] = { ...normalizedProfile, pfp: "", banner: "" };
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      localStorage.setItem(PROFILE_KEY, JSON.stringify(accounts[userId]));
    } catch (error) {
      console.warn("Account storage error", error);
    }

    const savedPfp = await loadMediaItem(`pfp_${userId}`);
    const savedBanner = await loadMediaItem(`banner_${userId}`);

    setProfile(normalizedProfile);
    setDraftProfile(normalizedProfile);
    const media = {
      pfp: savedPfp || normalizedProfile.pfp || "",
      banner: savedBanner || normalizedProfile.banner || ""
    };
    setMediaUrls(media);
    setDraftMedia(media);

    setSession(true);
    navigateTo("app");
  };

  const handleLogin = async () => {
    const identity = loginIdentity.trim().toLowerCase();
    if (!identity) return;

    try {
      const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
      const matchedKey = Object.keys(accounts).find(k => {
        const acc = accounts[k];
        return (
          k.toLowerCase() === identity ||
          (acc.email && acc.email.toLowerCase() === identity) ||
          (acc.username && acc.username.toLowerCase() === identity.replace(/^@/, ""))
        );
      });

      if (matchedKey && accounts[matchedKey]) {
        await createSessionForAccount(matchedKey, accounts[matchedKey]);
      } else {
        const cleanHandle = identity.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") || "user";
        const newAcc: AccountProfile = {
          ...defaultAccount,
          displayName: identity.split("@")[0],
          username: cleanHandle,
          email: identity.includes("@") ? identity : "",
        };
        await createSessionForAccount(identity, newAcc);
      }
    } catch {
      await createSessionForAccount(identity, { ...defaultAccount, displayName: identity });
    }
  };

  const handleSignup = async () => {
    const email = signupEmail.trim().toLowerCase();
    const name = signupDisplayName.trim() || "User";
    const cleanHandle = name.toLowerCase().replace(/[^a-zA-Z0-9_]/g, "") || "user";
    const userId = email || cleanHandle;

    const newAcc: AccountProfile = {
      ...defaultAccount,
      displayName: name,
      username: cleanHandle,
      email: email,
      bio: "",
      pronouns: "",
      pfp: "",
      banner: "",
    };

    await createSessionForAccount(userId, newAcc);
  };

  const logOut = () => {
    setSettingsOpen(false);

    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `talky_session=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
    try {
      localStorage.removeItem("talky_file_session");
      localStorage.removeItem(ACTIVE_USER_KEY);
    } catch (error) {
      console.warn("Session cleanup error", error);
    }

    setActiveUserId("");
    setSession(false);
    setHasDms(false);
    setHasChat(false);
    setPendingAttachments([]);
    setReplyDraft(null);
    setEmojiPicker(null);
    setLoginIdentity("");
    setLoginPassword("");
    setSignupDisplayName("");
    setSignupEmail("");
    setSignupPassword("");
    setSelectedDate({ month: "", day: "", year: "" });

    setProfile({ ...defaultAccount });
    setDraftProfile({ ...defaultAccount });
    setMediaUrls({ pfp: "", banner: "" });
    setDraftMedia({ pfp: "", banner: "" });

    window.location.hash = "";
    setRoute("landing");
  };

  // Instant upload for PFP or Banner without resizing/cropping
  const handleInstantUpload = (type: "pfp" | "banner", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setDraftMedia(prev => ({ ...prev, [type]: result }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Save changes button action (commits draft to saved state and IndexedDB)
  const handleSaveChanges = async () => {
    const userId = activeUserId || "default";

    // Commit draft
    setProfile(draftProfile);
    setMediaUrls(draftMedia);

    try {
      const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
      accounts[userId] = { ...draftProfile, pfp: "", banner: "" };
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      localStorage.setItem(PROFILE_KEY, JSON.stringify(accounts[userId]));
    } catch (error) {
      console.warn("Profile save error", error);
    }

    if (draftMedia.pfp) {
      await saveMediaItem(`pfp_${userId}`, draftMedia.pfp);
    } else {
      await deleteMediaItem(`pfp_${userId}`);
    }

    if (draftMedia.banner) {
      await saveMediaItem(`banner_${userId}`, draftMedia.banner);
    } else {
      await deleteMediaItem(`banner_${userId}`);
    }
  };

  // Reset changes button action (reverts draft to saved state)
  const handleResetChanges = () => {
    setDraftProfile(profile);
    setDraftMedia(mediaUrls);
  };

  const removeMediaDraft = (type: "pfp" | "banner") => {
    setDraftMedia(prev => ({ ...prev, [type]: "" }));
  };

  const selectServer = (serverId: string) => {
    const server = servers.find(item => item.id === serverId);
    if (!server) return;
    setSelectedServerId(serverId);
    setSelectedServerChannel(server.channels[0]?.id || defaultServerChannels()[0].id);
    setServerMenuOpen(false);
    setServerSettingsOpen(false);
    setSelectedServerMember(null);
  };

  const returnToDirectMessages = () => {
    setSelectedServerId(null);
    setHasDms(true);
    setServerMenuOpen(false);
    setServerSettingsOpen(false);
    setSelectedServerMember(null);
  };

  const createServer = async (name: string, icon: string) => {
    const owner = serverOwnerKey;
    const id = `server-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const server: TalkyServer = {
      id,
      name: name.trim().slice(0, 64) || "My Server",
      description: "",
      icon,
      banner: "",
      channels: defaultServerChannels(),
      roles: [],
      roleAssignments: {},
    };
    if (icon) await saveMediaItem(serverMediaStorageKey(owner, id, "icon"), icon);
    setServers(current => [...current, server]);
    setSelectedServerId(id);
    setSelectedServerChannel(server.channels[0].id);
    setServerCreateOpen(false);
    setServerMenuOpen(false);
  };

  const updateServer = (serverId: string, patch: Partial<Pick<TalkyServer, "name" | "description" | "icon" | "banner" | "channels" | "roles" | "roleAssignments">>) => {
    const owner = serverOwnerKey;
    if (Object.prototype.hasOwnProperty.call(patch, "icon")) {
      if (patch.icon) void saveMediaItem(serverMediaStorageKey(owner, serverId, "icon"), patch.icon);
      else void deleteMediaItem(serverMediaStorageKey(owner, serverId, "icon"));
    }
    if (Object.prototype.hasOwnProperty.call(patch, "banner")) {
      if (patch.banner) void saveMediaItem(serverMediaStorageKey(owner, serverId, "banner"), patch.banner);
      else void deleteMediaItem(serverMediaStorageKey(owner, serverId, "banner"));
    }
    setServers(current => current.map(server => server.id === serverId ? { ...server, ...patch } : server));
  };

  const toggleServerMemberRole = (memberId: string, roleId: string) => {
    if (!currentServer || !currentServer.roles.some(role => role.id === roleId)) return;
    const currentRoleIds = currentServer.roleAssignments[memberId] || [];
    const nextRoleIds = currentRoleIds.includes(roleId)
      ? currentRoleIds.filter(id => id !== roleId)
      : [...currentRoleIds, roleId];
    updateServer(currentServer.id, {
      roleAssignments: { ...currentServer.roleAssignments, [memberId]: nextRoleIds },
    });
  };

  const createServerChannel = (name: string, type: ServerChannel["type"]) => {
    if (!currentServer) return;
    const channel: ServerChannel = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      type,
    };
    updateServer(currentServer.id, { channels: [...currentServer.channels, channel] });
    setSelectedServerChannel(channel.id);
  };

  const sendLocalMessage = () => {
    const text = expandEmojiShortcodes(composerText.trim());
    if (!text && pendingAttachments.length === 0) return;
    const newMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: currentName,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      text,
      images: pendingAttachments,
      replyTo: replyDraft,
      reactions: []
    };
    setMessages(prev => [...prev, newMessage]);
    setComposerText("");
    setComposerSelection({ start: 0, end: 0 });
    setEmojiSuggestionIndex(0);
    setEmojiSuggestionsDismissed(false);
    setPendingAttachments([]);
    setReplyDraft(null);
    setTimeout(() => {
      if (messageListRef.current) {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      }
    }, 50);
  };

  const insertEmojiSuggestion = (suggestion: EmojiShortcode) => {
    if (!emojiCompletion) return;
    const nextText = `${composerText.slice(0, emojiCompletion.start)}${suggestion.emoji}${composerText.slice(emojiCompletion.end)}`;
    const nextCursor = emojiCompletion.start + suggestion.emoji.length;
    setComposerText(nextText);
    setComposerSelection({ start: nextCursor, end: nextCursor });
    setEmojiSuggestionIndex(0);
    setEmojiSuggestionsDismissed(false);
    window.requestAnimationFrame(() => {
      const composer = messageComposerRef.current;
      if (!composer) return;
      composer.focus();
      composer.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const syncComposerSelection = (composer: HTMLTextAreaElement) => {
    setComposerSelection({ start: composer.selectionStart, end: composer.selectionEnd });
  };

  const startReply = (message: ChatMessage) => {
    setReplyDraft({
      messageId: message.id,
      author: message.author,
      preview: getMessagePreview(message)
    });
    setEmojiPicker(null);
    window.requestAnimationFrame(() => messageComposerRef.current?.focus());
  };

  const openEmojiPicker = (messageId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (emojiPicker?.messageId === messageId) {
      setEmojiPicker(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const pickerWidth = Math.min(344, window.innerWidth - 24);
    const pickerHeight = Math.min(392, window.innerHeight - 24);
    const spaceAbove = rect.top - 8;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const placement = spaceBelow >= pickerHeight || spaceBelow >= spaceAbove ? "bottom" : "top";
    const top = placement === "top"
      ? Math.max(12, rect.top - pickerHeight - 8)
      : Math.min(window.innerHeight - pickerHeight - 12, rect.bottom + 8);
    const left = Math.max(12, Math.min(window.innerWidth - pickerWidth - 12, rect.right - pickerWidth));

    setEmojiSearch("");
    setEmojiPicker({ messageId, left, top, placement });
  };

  const addMessageReaction = (messageId: string, emoji: string) => {
    const userId = activeUserId || profile.username || currentName;
    setMessages(current => current.map(message => {
      if (message.id !== messageId) return message;
      const existing = message.reactions.find(reaction => reaction.emoji === emoji);
      if (existing?.userIds.includes(userId)) return message;
      if (existing) {
        return {
          ...message,
          reactions: message.reactions.map(reaction => reaction.emoji === emoji
            ? { ...reaction, userIds: [...reaction.userIds, userId] }
            : reaction)
        };
      }
      return { ...message, reactions: [...message.reactions, { emoji, userIds: [userId] }] };
    }));
    setEmojiPicker(null);
  };

  const toggleMessageReaction = (messageId: string, emoji: string) => {
    const userId = activeUserId || profile.username || currentName;
    setMessages(current => current.map(message => {
      if (message.id !== messageId) return message;
      const existing = message.reactions.find(reaction => reaction.emoji === emoji);
      if (!existing) {
        return { ...message, reactions: [...message.reactions, { emoji, userIds: [userId] }] };
      }
      if (!existing.userIds.includes(userId)) {
        return {
          ...message,
          reactions: message.reactions.map(reaction => reaction.emoji === emoji
            ? { ...reaction, userIds: [...reaction.userIds, userId] }
            : reaction)
        };
      }
      const remainingUsers = existing.userIds.filter(id => id !== userId);
      return {
        ...message,
        reactions: remainingUsers.length > 0
          ? message.reactions.map(reaction => reaction.emoji === emoji
            ? { ...reaction, userIds: remainingUsers }
            : reaction)
          : message.reactions.filter(reaction => reaction.emoji !== emoji)
      };
    }));
  };

  const scrollToMessage = (messageId: string) => {
    document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleImageSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []).filter(file => file.type.startsWith("image/"));
    input.value = "";
    if (files.length === 0) return;

    try {
      const attachments = await Promise.all(files.map(file => new Promise<ChatImageAttachment | null>(resolve => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            resolve(null);
            return;
          }
          resolve({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name || "Image",
            dataUrl: reader.result
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      })));
      const readableAttachments = attachments.filter(
        (attachment): attachment is ChatImageAttachment => attachment !== null
      );
      setPendingAttachments(current => [...current, ...readableAttachments]);
      if (readableAttachments.length < files.length) {
        console.warn("One or more image attachments could not be read.");
      }
    } catch (error) {
      console.warn("Image attachment read error", error);
    }
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments(current => current.filter(attachment => attachment.id !== attachmentId));
  };

  return (
    <>
      <style>{`
        :root {
          color-scheme: dark;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-synthesis: none;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background: #090a0b;
          color: #f4f4f5;
        }
        *, *::before, *::after { box-sizing: border-box; }
        body {
          min-width: 320px;
          min-height: 100vh;
          margin: 0;
          background: radial-gradient(ellipse 54rem 34rem at 50% 48%, rgba(115,119,126,0.075), rgba(57,60,65,0.025) 46%, transparent 75%),
                      linear-gradient(155deg, #0b0c0d 0%, #090a0b 48%, #08090a 100%);
        }

        /* --- Landing Page --- */
        .page { display: grid; min-height: 100vh; grid-template-rows: auto 1fr; isolation: isolate; }
        .topbar { display: flex; align-items: center; justify-content: space-between; padding: 28px clamp(22px, 4.1vw, 64px); }
        .brand-lockup { display: flex; align-items: center; gap: 10px; }
        .landing-logo { display: block; width: 30px; height: 30px; border: 1px solid rgba(230,232,236,0.14); border-radius: 9px; object-fit: cover; box-shadow: 0 4px 14px rgba(0,0,0,0.24); }
        .wordmark { color: rgba(247,247,248,0.94); font-size: 17px; font-weight: 620; letter-spacing: -0.045em; line-height: 1; }
        .login-button { min-height: 38px; padding: 0 15px; border: 1px solid rgba(230,232,236,0.14); border-radius: 12px; background: rgba(255,255,255,0.045); box-shadow: inset 0 1px 0 rgba(255,255,255,0.035), 0 5px 18px rgba(0,0,0,0.15); color: rgba(239,240,242,0.78); font: inherit; font-size: 13px; font-weight: 510; letter-spacing: -0.012em; backdrop-filter: blur(18px) saturate(115%); -webkit-backdrop-filter: blur(18px) saturate(115%); cursor: pointer; transition: transform 180ms cubic-bezier(.2,.8,.2,1), background 180ms ease, border-color 180ms ease; }
        .login-button:hover { transform: translateY(-1px); border-color: rgba(230,232,236,0.24); background: rgba(255,255,255,0.085); }
        .login-button:active { transform: translateY(0) scale(0.97); }
        .hero { display: flex; align-items: center; justify-content: center; padding: 24px 22px 72px; text-align: center; }
        .hero-content { width: 100%; max-width: 820px; transform: translateY(-10px); }
        h1 { margin: 0; color: #f5f5f6; font-size: clamp(82px, 14vw, 176px); font-weight: 650; letter-spacing: -0.092em; line-height: 0.92; }
        .tagline { margin: 27px 0 0; color: rgba(232,233,235,0.84); font-size: clamp(17px, 2.15vw, 21px); font-weight: 450; letter-spacing: -0.035em; line-height: 1.4; }
        .supporting-copy { margin: 11px 0 0; color: rgba(167,169,174,0.78); font-size: 14px; font-weight: 400; letter-spacing: -0.012em; line-height: 1.6; }
        [hidden] { display: none !important; }

        /* --- Auth Page --- */
        .auth-page { position: fixed; z-index: 10; inset: 0; display: flex; align-items: center; justify-content: center; overflow-y: auto; padding: 28px 16px; background: radial-gradient(ellipse 48rem 34rem at 18% 18%, rgba(140,144,152,0.095), transparent 72%), radial-gradient(ellipse 42rem 32rem at 84% 82%, rgba(89,93,101,0.1), transparent 70%), linear-gradient(155deg, #0b0c0d 0%, #090a0b 52%, #08090a 100%); color: #f2f3f5; }
        .auth-card { width: min(100%, 480px); margin: auto; padding: 32px; border: 1px solid rgba(238,240,244,0.13); border-radius: 18px; background: rgba(39,41,45,0.68); box-shadow: inset 0 1px 0 rgba(255,255,255,0.075), 0 24px 80px rgba(0,0,0,0.42); backdrop-filter: blur(28px) saturate(125%); -webkit-backdrop-filter: blur(28px) saturate(125%); }
        .auth-heading { margin: 0 0 22px; text-align: center; }
        .auth-heading h2 { margin: 0; color: #f2f3f5; font-size: 24px; font-weight: 600; letter-spacing: 0; line-height: 1.25; }
        .auth-heading p { margin: 8px 0 0; color: #b9bbbe; font-size: 16px; font-weight: 400; line-height: 1.35; }
        .auth-fields { display: grid; gap: 18px; }
        .auth-field label { display: block; margin: 0 0 8px; color: #b9bbbe; font-size: 11px; font-weight: 700; letter-spacing: 0.035em; line-height: 1.2; text-transform: uppercase; }
        .auth-input, .select-trigger { width: 100%; height: 40px; padding: 0 10px; border: 1px solid rgba(238,240,244,0.11); border-radius: 10px; outline: none; background: rgba(255,255,255,0.045); box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); color: #e3e4e6; font: inherit; font-size: 16px; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
        .auth-input:focus, .select-trigger:focus-visible, .select-search:focus-visible { border-color: rgba(240,242,246,0.32); box-shadow: 0 0 0 3px rgba(230,232,236,0.035), inset 0 1px 0 rgba(255,255,255,0.04); }
        .date-row { display: grid; grid-template-columns: 1.15fr 0.8fr 1fr; gap: 8px; }
        .search-select { position: relative; min-width: 0; }
        .select-trigger { display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left; cursor: pointer; transition: background 160ms ease, border-color 160ms ease; }
        .select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .select-chevron { width: 7px; height: 7px; flex: 0 0 auto; border-right: 1.5px solid rgba(232,233,235,0.7); border-bottom: 1.5px solid rgba(232,233,235,0.7); transform: translateY(-2px) rotate(45deg); transition: transform 160ms ease; }
        .select-menu { position: absolute; z-index: 20; top: calc(100% + 8px); left: 0; width: min(240px, calc(100vw - 48px)); padding: 8px; border: 1px solid rgba(238,240,244,0.14); border-radius: 12px; background: rgba(31,33,36,0.92); box-shadow: 0 18px 48px rgba(0,0,0,0.45); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }
        .select-search { width: 100%; min-height: 36px; margin: 0 0 7px; padding: 0 10px; border: 1px solid rgba(238,240,244,0.1); border-radius: 8px; outline: none; background: rgba(255,255,255,0.055); color: #f2f3f5; font: inherit; font-size: 16px; }
        .select-options { max-height: min(190px, 30vh); overflow: auto; }
        .select-option { display: block; width: 100%; min-height: 36px; padding: 8px 10px; border: 0; border-radius: 7px; background: transparent; color: #d5d6d8; font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
        .select-option:hover { background: rgba(255,255,255,0.095); color: #fff; }
        .age-copy { margin: 9px 0 0; color: #b9bbbe; font-size: 13px; line-height: 1.35; }
        .auth-submit { width: 100%; min-height: 44px; margin-top: 20px; padding: 0 16px; border: 1px solid rgba(238,240,244,0.14); border-radius: 10px; background: rgba(255,255,255,0.085); box-shadow: inset 0 1px 0 rgba(255,255,255,0.055), 0 6px 18px rgba(0,0,0,0.12); color: #f2f3f5; font: inherit; font-size: 16px; font-weight: 500; cursor: pointer; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); transition: transform 170ms ease, background 170ms ease; }
        .auth-submit:hover { transform: translateY(-1px); border-color: rgba(238,240,244,0.24); background: rgba(255,255,255,0.13); }
        .auth-switch { margin: 13px 0 0; color: #b9bbbe; font-size: 14px; line-height: 1.4; text-align: center; }
        .mode-button { padding: 0; border: 0; background: none; color: #d1d2d4; font: inherit; cursor: pointer; text-decoration: underline; }

        /* --- App Shell & Rail --- */
        .app-page { position: fixed; z-index: 15; inset: 0; overflow: hidden; background: #36393f; color: #dcddde; }
        .app-shell { display: grid; width: 100%; height: 100%; grid-template-columns: 72px minmax(0, 1fr); overflow: hidden; }
        .app-shell.has-dms { grid-template-columns: 72px 248px minmax(0, 1fr); }
        .app-shell.has-chat { grid-template-columns: 72px minmax(0, 1fr) 300px; }
        .app-shell.has-dms.has-chat { grid-template-columns: 72px 248px minmax(0, 1fr) 300px; }
        .server-rail { display: flex; align-items: center; flex-direction: column; gap: 8px; padding: 12px 0; background: #202225; }
        .home-logo-button { position: relative; display: grid; width: 48px; height: 48px; place-items: center; padding: 0; overflow: hidden; border: 0; border-radius: 16px; background: #36393f; cursor: pointer; transition: border-radius 140ms ease, transform 160ms ease; }
        .home-logo-button:hover { transform: translateY(-1px) scale(1.03); border-radius: 15px; }
        .home-logo-button img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .rail-divider { width: 32px; height: 2px; border-radius: 1px; background: #36393f; }
        .dm-sidebar { display: flex; min-width: 0; flex-direction: column; background: #2f3136; }
        .dm-heading { display: flex; min-height: 48px; align-items: center; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,0.18); color: #f2f3f5; font-size: 14px; font-weight: 600; }
        .self-dm-button { display: flex; min-height: 44px; align-items: center; gap: 12px; margin: 8px; padding: 6px 8px; border: 0; border-radius: 4px; background: transparent; color: #b9bbbe; font: inherit; font-size: 15px; text-align: left; cursor: pointer; transition: background 150ms ease, color 150ms ease; }
        .self-dm-button:hover, .self-dm-button[aria-selected="true"] { background: #393c43; color: #fff; }

        /* Profile Area at bottom of sidebar */
        .user-profile-area { position: relative; display: flex; min-height: 54px; align-items: center; gap: 10px; margin: auto 8px 8px; padding: 6px 8px; overflow: hidden; border: 0; border-radius: 6px; background: rgba(41, 43, 47, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #f2f3f5; font: inherit; text-align: left; cursor: pointer; transition: background 150ms ease; border: 1px solid rgba(255,255,255,0.05); }
        .user-profile-area:hover { background: rgba(57, 60, 67, 0.85); border-color: rgba(255,255,255,0.12); }
        .user-profile-info { min-width: 0; flex: 1; display: flex; flex-direction: column; justify-content: center; }
        .user-profile-name { overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; color: #fff; }
        .user-profile-handle { font-size: 11px; color: #949ba4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Requested exact settings icon */
        .profile-gear-icon {
          width: 18px;
          height: 18px;
          flex: 0 0 18px;
          filter: invert(0.85);
          opacity: 0.85;
          transition: opacity 140ms ease, filter 140ms ease, transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .user-profile-area:hover .profile-gear-icon {
          opacity: 1;
          filter: invert(1);
          transform: rotate(25deg);
        }

        /* Standard Avatar Circles (100% full circle, zero gaps) */
        .profile-avatar {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          overflow: hidden;
          border-radius: 50%;
          background: #2b2d31;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
        }
        .profile-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          border-radius: 50%;
          display: block;
        }

        /* --- Chat Pane --- */
        .chat-pane { display: flex; min-width: 0; min-height: 0; flex-direction: column; background: #36393f; }
        .chat-header { display: flex; min-height: 48px; align-items: center; gap: 12px; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,0.18); box-shadow: 0 1px 2px rgba(0,0,0,0.12); }
        .chat-header h2 { margin: 0; color: #f2f3f5; font-size: 16px; font-weight: 600; }
        .message-list { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 16px; overflow: auto; padding: 20px 16px; }
        .message-row { position: relative; display: flex; align-items: flex-start; gap: 16px; scroll-margin: 32px; }
        .message-avatar { width: 40px; height: 40px; flex: 0 0 40px; }
        .message-body { position: relative; min-width: 0; flex: 1; padding-top: 2px; }
        .message-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
        .message-author { color: #f2f3f5; font-size: 15px; font-weight: 600; }
        .message-time { color: #a3a6aa; font-size: 11px; }
        .message-text { margin: 0; color: #dcddde; font-size: 15px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
        .message-actions { position: absolute; z-index: 6; top: -15px; right: 0; display: flex; align-items: center; gap: 3px; padding: 4px; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background: #2b2d31; box-shadow: 0 6px 18px rgba(0,0,0,0.28); opacity: 0; pointer-events: none; transform: translateY(3px); transition: opacity 120ms ease, transform 120ms ease; }
        .message-row:hover .message-actions, .message-row:focus-within .message-actions { opacity: 1; pointer-events: auto; transform: none; }
        .message-action-button { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #b9bbbe; cursor: pointer; transition: background 120ms ease, color 120ms ease; }
        .message-action-button:hover { background: #40444b; color: #fff; }
        .message-action-button svg { display: block; width: 18px; height: 18px; }
        .message-reply-preview { display: flex; max-width: min(100%, 560px); align-items: center; gap: 7px; margin: 0 0 5px; padding: 0; overflow: hidden; border: 0; background: transparent; color: #b9bbbe; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
        .message-reply-preview:hover .reply-preview-author, .message-reply-preview:hover .reply-preview-text { color: #fff; }
        .reply-preview-connector { width: 20px; height: 15px; flex: 0 0 20px; align-self: flex-end; margin-left: 3px; border-top: 2px solid #4f545c; border-left: 2px solid #4f545c; border-radius: 6px 0 0; }
        .reply-preview-author { flex: 0 0 auto; max-width: 140px; overflow: hidden; color: #c7c9cc; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .reply-preview-text { min-width: 0; overflow: hidden; color: #949ba4; text-overflow: ellipsis; white-space: nowrap; }
        .message-reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
        .message-reaction { display: inline-flex; min-width: 44px; min-height: 30px; align-items: center; justify-content: center; gap: 6px; padding: 3px 8px; border: 1px solid rgba(255,255,255,0.09); border-radius: 999px; background: #2f3136; color: #dcddde; font: inherit; font-size: 13px; cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }
        .message-reaction:hover { border-color: rgba(255,255,255,0.2); background: #393c43; }
        .message-reaction.is-reacted { border-color: rgba(88,101,242,0.72); background: rgba(88,101,242,0.18); color: #e4e7ff; }
        .message-reaction-emoji { font-size: 16px; line-height: 1; }
        .message-reaction-count { min-width: 7px; font-size: 12px; font-weight: 600; }
        .composer-wrap { padding: 0 16px 24px; }
        .message-composer { display: block; width: 100%; min-height: 44px; max-height: 160px; resize: none; padding: 12px 14px; border: 0; border-radius: 8px; outline: none; background: #40444b; color: #dcddde; font: inherit; font-size: 16px; line-height: 1.4; }
        .reply-draft { display: flex; min-height: 50px; align-items: center; gap: 12px; margin-bottom: 8px; padding: 7px 10px 7px 14px; border-left: 3px solid #5865f2; border-radius: 6px; background: #2b2d31; }
        .reply-draft-copy { min-width: 0; flex: 1; }
        .reply-draft-label { overflow: hidden; color: #c7c9cc; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
        .reply-draft-text { overflow: hidden; margin-top: 2px; color: #949ba4; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        .reply-draft-dismiss { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #b9bbbe; cursor: pointer; }
        .reply-draft-dismiss:hover { background: #40444b; color: #fff; }
        .reply-draft-dismiss svg { display: block; width: 16px; height: 16px; }
        .attachment-tray { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 8px; overflow-x: auto; border-radius: 8px; background: #2b2d31; }
        .attachment-preview { position: relative; width: 68px; height: 68px; flex: 0 0 68px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background: #202225; }
        .attachment-preview img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .attachment-remove { position: absolute; top: 3px; right: 3px; display: grid; width: 24px; height: 24px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: rgba(0,0,0,0.72); color: #fff; cursor: pointer; }
        .attachment-remove svg { display: block; width: 13px; height: 13px; }
        .attachment-remove:hover { background: #ed4245; }
        .attachment-count { margin-left: auto; flex: 0 0 auto; padding: 0 6px; color: #b9bbbe; font-size: 12px; white-space: nowrap; }
        .composer-row { position: relative; display: flex; align-items: flex-end; gap: 8px; }
        .composer-row .message-composer { width: 0; min-width: 0; flex: 1; }
        .emoji-autocomplete { position: absolute; z-index: 25; right: 0; bottom: calc(100% + 8px); left: auto; display: flex; width: min(320px, calc(100vw - 24px)); max-height: min(260px, calc(100dvh - 120px)); flex-direction: column; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); border-radius: 9px; background: #2b2d31; box-shadow: 0 12px 32px rgba(0,0,0,0.42); color: #dcddde; }
        .emoji-autocomplete-header { display: flex; min-height: 34px; align-items: center; justify-content: space-between; gap: 10px; padding: 0 10px; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .emoji-autocomplete-title { color: #949ba4; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
        .emoji-autocomplete-hint { color: #777d86; font-size: 10px; white-space: nowrap; }
        .emoji-autocomplete-list { display: grid; gap: 2px; overflow-y: auto; padding: 4px; }
        .emoji-autocomplete-option { display: flex; min-height: 36px; align-items: center; gap: 10px; padding: 4px 9px; border: 0; border-radius: 5px; background: transparent; color: #dcddde; font: inherit; text-align: left; cursor: pointer; }
        .emoji-autocomplete-option:hover, .emoji-autocomplete-option.is-active { background: #40444b; }
        .emoji-autocomplete-option.is-active { box-shadow: inset 2px 0 #5865f2; }
        .emoji-autocomplete-symbol { display: grid; width: 24px; flex: 0 0 24px; place-items: center; font-size: 19px; line-height: 1; }
        .emoji-autocomplete-code { color: #f2f3f5; font-size: 13px; font-weight: 600; }
        .attach-image-button { display: grid; width: 44px; height: 44px; flex: 0 0 44px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: #40444b; color: #b9bbbe; cursor: pointer; transition: background 140ms ease, color 140ms ease, transform 140ms ease; }
        .attach-image-button svg { display: block; width: 20px; height: 20px; }
        .attach-image-button:hover { transform: translateY(-1px); background: #4a4e55; color: #fff; }
        .attach-image-button:focus-visible, .attachment-remove:focus-visible, .message-image-button:focus-visible, .image-viewer-overlay button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .message-image-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 184px)); gap: 4px; max-width: 372px; margin-top: 8px; }
        .message-image-grid[data-count="1"] { grid-template-columns: min(360px, 100%); max-width: 360px; }
        .message-image-button { position: relative; display: block; min-width: 0; aspect-ratio: 1; padding: 0; overflow: hidden; border: 0; border-radius: 8px; background: #202225; cursor: zoom-in; }
        .message-image-button img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .message-image-grid[data-count="1"] .message-image-button { aspect-ratio: auto; }
        .message-image-grid[data-count="1"] .message-image-button img { height: auto; max-height: 360px; object-fit: contain; }
        .message-image-more { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,0.58); color: #fff; font-size: 24px; font-weight: 700; }
        .image-viewer-overlay { position: absolute; z-index: 60; inset: 0; display: flex; align-items: center; justify-content: center; padding: 64px 76px; background: rgba(0,0,0,0.88); cursor: zoom-out; }
        .image-viewer-content { display: flex; max-width: 100%; max-height: 100%; flex-direction: column; align-items: center; gap: 12px; cursor: default; }
        .image-viewer-image { display: block; width: auto; height: auto; max-width: 100%; max-height: calc(100vh - 138px); border-radius: 6px; object-fit: contain; box-shadow: 0 18px 60px rgba(0,0,0,0.5); }
        .image-viewer-counter { padding: 6px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; background: #202225; color: #dcddde; font-size: 13px; }
        .image-viewer-close, .image-viewer-nav { position: absolute; display: grid; place-items: center; padding: 0; border: 1px solid rgba(255,255,255,0.14); border-radius: 50%; background: rgba(32,34,37,0.92); color: #fff; cursor: pointer; transition: background 140ms ease, transform 140ms ease; }
        .image-viewer-close { top: 20px; right: 20px; width: 44px; height: 44px; }
        .image-viewer-close svg { display: block; width: 17px; height: 17px; }
        .image-viewer-nav { top: 50%; width: 48px; height: 48px; transform: translateY(-50%); }
        .image-viewer-nav svg { display: block; width: 22px; height: 22px; }
        .image-viewer-close:hover, .image-viewer-nav:hover { background: #4a4e55; }
        .image-viewer-nav:hover { transform: translateY(-50%) scale(1.04); }
        .image-viewer-prev { left: 20px; }
        .image-viewer-next { right: 20px; }
        .emoji-picker { position: fixed; z-index: 90; display: flex; width: min(344px, calc(100vw - 24px)); height: min(392px, calc(100dvh - 24px)); flex-direction: column; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; background: #2b2d31; box-shadow: 0 16px 44px rgba(0,0,0,0.48); color: #dcddde; }
        .emoji-picker-header { display: flex; min-height: 40px; align-items: center; justify-content: space-between; padding: 0 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .emoji-picker-title { color: #f2f3f5; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
        .emoji-picker-total { color: #949ba4; font-size: 11px; }
        .emoji-search-wrap { padding: 10px 10px 6px; }
        .emoji-search { width: 100%; height: 36px; padding: 0 10px; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; outline: none; background: #202225; color: #f2f3f5; font: inherit; font-size: 16px; }
        .emoji-search:focus { border-color: rgba(255,255,255,0.28); }
        .emoji-picker-grid { display: grid; min-height: 0; grid-template-columns: repeat(8, minmax(0, 1fr)); align-content: start; gap: 2px; overflow-y: auto; padding: 6px 10px 10px; }
        .emoji-option { display: grid; min-width: 0; aspect-ratio: 1; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; font-family: inherit; font-size: 23px; line-height: 1; cursor: pointer; }
        .emoji-option:hover, .emoji-option:focus-visible { outline: none; background: #40444b; }
        .emoji-picker-empty { display: grid; flex: 1; place-items: center; padding: 16px; color: #949ba4; font-size: 13px; text-align: center; }
        @media (max-width: 640px) {
          .composer-wrap { padding: 0 10px 14px; }
          .emoji-autocomplete-hint { display: none; }
          .image-viewer-overlay { padding: 56px 52px; }
          .image-viewer-close { top: 10px; right: 10px; }
          .image-viewer-prev { left: 4px; }
          .image-viewer-next { right: 4px; }
        }
        @media (hover: none) {
          .message-actions { opacity: 1; pointer-events: auto; transform: none; }
          .message-action-button { width: 40px; height: 40px; flex-basis: 40px; }
        }
        .dm-profile-panel { display: flex; min-width: 0; min-height: 0; flex-direction: column; gap: 12px; overflow-y: auto; padding: 18px 16px; border-left: 1px solid rgba(0,0,0,0.2); background: #2f3136; }
        .dm-profile-panel .discord-card-preview { width: 100%; }
        @media (max-width: 980px) {
          .app-shell.has-chat { grid-template-columns: 72px minmax(0, 1fr); }
          .app-shell.has-dms.has-chat { grid-template-columns: 72px 248px minmax(0, 1fr); }
          .dm-profile-panel { display: none; }
        }

        /* ==========================================================================
           CLASSIC DISCORD USER SETTINGS - CLEAN FROSTED GRAY GLASS THEME (NO GLOW)
           ========================================================================== */
        .settings-page {
          position: fixed;
          z-index: 50;
          inset: 0;
          overflow: hidden;
          background: rgba(18, 19, 23, 0.78);
          backdrop-filter: blur(28px) saturate(110%);
          -webkit-backdrop-filter: blur(28px) saturate(110%);
          color: #dcddde;
          display: flex;
        }

        .settings-layout {
          display: grid;
          width: 100%;
          height: 100%;
          grid-template-columns: 240px minmax(0, 1fr);
          background: transparent;
        }

        /* Settings Sidebar - Profiles, Badges, and Log Out */
        .settings-nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 60px 16px 28px;
          overflow-y: auto;
          background: rgba(22, 23, 27, 0.72);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-right: 1px solid rgba(255, 255, 255, 0.06);
        }

        .settings-nav-title {
          margin: 0 8px 10px;
          padding: 0 4px 8px;
          color: #949ba4;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .settings-nav-item {
          display: flex;
          align-items: center;
          min-height: 38px;
          padding: 0 12px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #949ba4;
          font: inherit;
          font-size: 15px;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease;
        }

        .settings-nav-item[aria-current="page"] {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-weight: 600;
        }

        .settings-nav-logout {
          display: flex;
          align-items: center;
          min-height: 38px;
          margin-top: auto;
          padding: 0 12px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #f23f43;
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease;
        }
        .settings-nav-logout:hover {
          background: rgba(242, 63, 67, 0.12);
          color: #fa777a;
        }

        /* Settings Main Area */
        .settings-main {
          position: relative;
          min-width: 0;
          overflow-y: auto;
          padding: 50px clamp(24px, 5vw, 68px) 80px;
          background: rgba(28, 30, 34, 0.45);
        }

        .settings-inner {
          width: min(100%, 1160px);
          margin: 0 auto;
        }

        .settings-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          margin: 0 0 28px;
        }

        .settings-title-group h1 {
          margin: 0;
          color: #f2f3f5;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1.2;
        }

        .settings-close-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .settings-close {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border: 2px solid rgba(181, 186, 193, 0.6);
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.2);
          color: #b5bac1;
          cursor: pointer;
          transition: transform 180ms ease, border-color 150ms ease, color 150ms ease;
        }
        .settings-close:hover {
          transform: rotate(90deg);
          border-color: #fff;
          color: #fff;
        }
        .settings-close svg { width: 16px; height: 16px; }
        .settings-close-hint {
          color: #949ba4;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.03em;
        }

        /* Profiles Grid: Form on Left, Live Profile Card Preview on Right */
        .profile-settings-grid {
          display: grid;
          grid-template-columns: minmax(320px, 1fr) minmax(300px, 360px);
          align-items: start;
          gap: clamp(32px, 4.5vw, 56px);
        }

        .profile-form {
          display: grid;
          gap: 24px;
          min-width: 0;
        }

        .profile-field {
          display: grid;
          gap: 8px;
        }

        .profile-field-label {
          color: #b5bac1;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .profile-field-input, .profile-field-textarea {
          width: 100%;
          min-height: 40px;
          padding: 10px 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          outline: none;
          background: rgba(18, 19, 23, 0.65);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          color: #f2f3f5;
          font: inherit;
          font-size: 15px;
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.25);
          transition: border-color 140ms ease;
        }
        .profile-field-input:focus, .profile-field-textarea:focus {
          border-color: rgba(255, 255, 255, 0.3);
        }

        .profile-field-textarea {
          min-height: 100px;
          resize: vertical;
          line-height: 1.45;
        }

        .profile-field-hint {
          color: #949ba4;
          font-size: 12px;
          margin-top: 2px;
        }

        .profile-media-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        /* Classic Gray Buttons (No neon blurple/glow) */
        .discord-button-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          padding: 0 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 4px;
          background: #4e5058;
          color: #fff;
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
          transition: background 140ms ease, transform 140ms ease, border-color 140ms ease;
        }
        .discord-button-primary:hover {
          background: #5d6069;
          border-color: rgba(255, 255, 255, 0.22);
          transform: translateY(-1px);
        }
        .discord-button-primary:active {
          transform: translateY(0);
          background: #404249;
        }

        .discord-button-danger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          padding: 0 14px;
          border: 0;
          border-radius: 4px;
          background: transparent;
          color: #f23f43;
          font: inherit;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 140ms ease;
        }
        .discord-button-danger:hover {
          background: rgba(242, 63, 67, 0.12);
          color: #fa777a;
        }

        /* --- Classic Discord Profile Card Preview (Frosted Gray Glass, Edge-to-Edge Avatar) --- */
        .preview-column {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .preview-header-label {
          color: #b5bac1;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .discord-card-preview {
          width: 100%;
          border-radius: 12px;
          overflow: hidden;
          background: rgba(30, 32, 36, 0.68);
          backdrop-filter: blur(24px) saturate(110%);
          -webkit-backdrop-filter: blur(24px) saturate(110%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.45);
        }

        .discord-card-banner {
          position: relative;
          width: 100%;
          height: 125px;
          overflow: hidden;
          background: #1e1f22;
        }

        .discord-card-banner img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
        }

        .discord-card-body {
          position: relative;
          padding: 50px 16px 18px;
        }

        /* Clean Discord Avatar Circle - Fills 100% of the circle, NO black gap around Goku/avatar */
        .preview-avatar-container {
          position: absolute;
          top: -40px;
          left: 16px;
          width: 80px;
          height: 80px;
        }

        .preview-avatar-circle {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 6px solid #232428;
          background: #2b2d31;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .preview-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          border-radius: 50%;
        }

        .preview-status-dot {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #23a55a;
          border: 4px solid #232428;
          z-index: 2;
        }

        .discord-card-names {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .discord-card-displayname {
          color: #f2f3f5;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .discord-card-handle {
          color: #b5bac1;
          font-size: 14px;
          font-weight: 400;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }

        .discord-card-handle-line {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
        }

        .discord-card-verified-badge {
          display: inline-block;
          width: 17px;
          height: 17px;
          flex: 0 0 17px;
          object-fit: contain;
          vertical-align: middle;
        }

        .badge-settings-page {
          width: min(100%, 760px);
          margin: 24px auto 0;
        }

        .badge-settings-heading {
          margin: 0;
          color: #f2f3f5;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .badge-settings-description {
          margin: 8px 0 28px;
          color: #b5bac1;
          font-size: 14px;
          line-height: 1.5;
        }

        .badge-list-heading {
          margin: 0 0 10px;
          color: #b5bac1;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .badge-item {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 16px;
          padding: 18px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          background: rgba(22, 23, 27, 0.62);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
        }

        .badge-image-frame {
          display: grid;
          width: 64px;
          height: 64px;
          flex: 0 0 64px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
        }

        .badge-image {
          display: block;
          width: 48px;
          height: 48px;
          object-fit: contain;
        }

        .badge-item-copy {
          min-width: 0;
          flex: 1;
        }

        .badge-item-title-row {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .badge-item-title {
          margin: 0;
          color: #f2f3f5;
          font-size: 16px;
          font-weight: 650;
        }

        .badge-equipped-label {
          padding: 3px 7px;
          border: 1px solid rgba(35, 165, 90, 0.32);
          border-radius: 999px;
          background: rgba(35, 165, 90, 0.12);
          color: #75d99d;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.035em;
          line-height: 1.2;
          text-transform: uppercase;
        }

        .badge-item-description {
          margin: 5px 0 0;
          color: #949ba4;
          font-size: 13px;
          line-height: 1.45;
        }

        .badge-equip-button {
          flex: 0 0 auto;
        }

        .discord-card-pronouns {
          display: inline-block;
          margin-top: 6px;
          color: #dbdee1;
          font-size: 13px;
          font-weight: 500;
        }

        .discord-card-divider {
          height: 1px;
          margin: 14px 0;
          background: rgba(255, 255, 255, 0.07);
        }

        .discord-card-section-title {
          color: #b5bac1;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .discord-card-bio {
          margin: 0;
          color: #dbdee1;
          font-size: 13.5px;
          line-height: 1.45;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .discord-card-empty-bio {
          color: #72767d;
          font-size: 13px;
          font-style: italic;
        }

        /* ==========================================================================
           CLASSIC DISCORD UNSAVED CHANGES FLOATING BAR
           ========================================================================== */
        .unsaved-notice-container {
          position: fixed;
          bottom: 24px;
          left: 240px;
          right: 0;
          display: flex;
          justify-content: center;
          padding: 0 clamp(16px, 4vw, 40px);
          z-index: 100;
          pointer-events: none;
        }

        .unsaved-notice-bar {
          pointer-events: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          width: min(100%, 780px);
          padding: 10px 16px;
          border-radius: 8px;
          background: rgba(17, 18, 20, 0.94);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.65);
          animation: slideNoticeUp 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        @keyframes slideNoticeUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .unsaved-notice-text {
          color: #f2f3f5;
          font-size: 15px;
          font-weight: 500;
        }

        .unsaved-notice-actions {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .unsaved-reset-btn {
          border: 0;
          background: transparent;
          color: #ffffff;
          font: inherit;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          padding: 6px 8px;
        }
        .unsaved-reset-btn:hover {
          text-decoration: underline;
        }

        .unsaved-save-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 36px;
          padding: 0 20px;
          border: 0;
          border-radius: 4px;
          background: #248046;
          color: #ffffff;
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 140ms ease;
        }
        .unsaved-save-btn:hover {
          background: #1a6334;
        }
        .unsaved-save-btn:active {
          background: #155229;
        }

        @media (max-width: 760px) {
          .settings-layout {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: auto minmax(0, 1fr);
          }
          .settings-nav {
            flex-direction: row;
            align-items: center;
            gap: 5px;
            padding: 12px;
            overflow-x: auto;
            border-right: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          }
          .settings-nav-title {
            flex: 0 0 auto;
            margin: 0 8px 0 0;
            padding: 0;
            white-space: nowrap;
          }
          .settings-nav-item {
            min-height: 40px;
            flex: 0 0 auto;
            white-space: nowrap;
          }
          .settings-nav-logout {
            min-height: 40px;
            flex: 0 0 auto;
            margin: 0 0 0 auto;
            white-space: nowrap;
          }
          .settings-main {
            padding: 24px 18px 88px;
          }
          .profile-settings-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 28px;
          }
          .unsaved-notice-container {
            right: 0;
            bottom: 12px;
            left: 0;
            padding: 0 12px;
          }
        }

        @media (max-width: 480px) {
          .badge-item {
            align-items: flex-start;
            gap: 12px;
            padding: 14px;
            flex-wrap: wrap;
          }
          .badge-image-frame {
            width: 56px;
            height: 56px;
            flex-basis: 56px;
          }
          .badge-image {
            width: 42px;
            height: 42px;
          }
          .badge-item-copy {
            min-height: 56px;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .badge-equip-button {
            margin-left: 68px;
          }
          .unsaved-notice-bar {
            gap: 10px;
            padding: 9px 11px;
          }
          .unsaved-notice-text {
            font-size: 13px;
          }
          .unsaved-notice-actions {
            gap: 4px;
          }
        }
      `}</style>

      {/* --- Landing Page --- */}
      <div className="page" id="landing-page" hidden={route !== "landing"}>
        <header className="topbar" aria-label="Talky">
          <div className="brand-lockup">
            <img className="landing-logo" src="https://i.postimg.cc/PPWj43yf/logo.png" alt="" />
            <div className="wordmark">Talky</div>
          </div>
          <button className="login-button" id="open-auth" type="button" onClick={() => navigateTo("auth", "login")}>
            Log in
          </button>
        </header>
        <main className="hero">
          <section className="hero-content" aria-labelledby="hero-title">
            <h1 id="hero-title">Talky</h1>
            <p className="tagline">Chat. Connect. Stay close.</p>
            <p className="supporting-copy">A quieter space for your conversations.</p>
          </section>
        </main>
      </div>

      {/* --- Auth Page --- */}
      <main className="auth-page" id="auth-page" hidden={route !== "auth"}>
        <section className="auth-card" aria-label="Account access">
          {/* Login Panel */}
          <div id="login-panel" hidden={authMode !== "login"}>
            <header className="auth-heading">
              <h2>Welcome back!</h2>
              <p>We're so excited to see you again!</p>
            </header>
            <div className="auth-fields">
              <div className="auth-field">
                <label htmlFor="login-identity">Email or Username</label>
                <input
                  className="auth-input"
                  id="login-identity"
                  name="identity"
                  type="text"
                  autoComplete="username"
                  value={loginIdentity}
                  onChange={e => setLoginIdentity(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="login-password">Password</label>
                <input
                  className="auth-input"
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                />
              </div>
            </div>
            <button className="auth-submit" type="button" onClick={handleLogin}>Log In</button>
            <p className="auth-switch">
              Need an account?{' '}
              <button className="mode-button" type="button" onClick={() => setAuthMode("signup")}>Register</button>
            </p>
          </div>

          {/* Signup Panel */}
          <div id="signup-panel" hidden={authMode !== "signup"}>
            <header className="auth-heading">
              <h2>Create an account</h2>
            </header>
            <div className="auth-fields">
              <div className="auth-field">
                <label htmlFor="display-name">Display name</label>
                <input
                  className="auth-input"
                  id="display-name"
                  name="displayName"
                  type="text"
                  autoComplete="nickname"
                  required
                  value={signupDisplayName}
                  onChange={e => setSignupDisplayName(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="signup-email">Email</label>
                <input
                  className="auth-input"
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={signupEmail}
                  onChange={e => setSignupEmail(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="signup-password">Password</label>
                <input
                  className="auth-input"
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={signupPassword}
                  onChange={e => setSignupPassword(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="month-trigger">Date of birth</label>
                <div className="date-row" role="group" aria-label="Date of birth">
                  {/* Month */}
                  <div className="search-select">
                    <button
                      className="select-trigger"
                      id="month-trigger"
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === "month" ? null : "month")}
                    >
                      <span className="select-value">
                        {selectedDate.month ? optionSets.month[Number(selectedDate.month) - 1].label : "Month"}
                      </span>
                      <span className="select-chevron"></span>
                    </button>
                    <div className="select-menu" hidden={openDropdown !== "month"}>
                      <input
                        className="select-search"
                        placeholder="Search months"
                        value={dropdownSearches.month}
                        onChange={e => setDropdownSearches({ ...dropdownSearches, month: e.target.value })}
                      />
                      <div className="select-options">
                        {optionSets.month
                          .filter(opt => opt.label.toLowerCase().includes(dropdownSearches.month.toLowerCase()))
                          .map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              className="select-option"
                              onClick={() => {
                                setSelectedDate(prev => ({ ...prev, month: opt.value }));
                                setOpenDropdown(null);
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Day */}
                  <div className="search-select">
                    <button
                      className="select-trigger"
                      id="day-trigger"
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === "day" ? null : "day")}
                    >
                      <span className="select-value">{selectedDate.day || "Day"}</span>
                      <span className="select-chevron"></span>
                    </button>
                    <div className="select-menu" hidden={openDropdown !== "day"}>
                      <input
                        className="select-search"
                        placeholder="Search days"
                        value={dropdownSearches.day}
                        onChange={e => setDropdownSearches({ ...dropdownSearches, day: e.target.value })}
                      />
                      <div className="select-options">
                        {optionSets.day
                          .slice(0, getDayCount())
                          .filter(opt => opt.label.includes(dropdownSearches.day))
                          .map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              className="select-option"
                              onClick={() => {
                                setSelectedDate(prev => ({ ...prev, day: opt.value }));
                                setOpenDropdown(null);
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Year */}
                  <div className="search-select">
                    <button
                      className="select-trigger"
                      id="year-trigger"
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === "year" ? null : "year")}
                    >
                      <span className="select-value">{selectedDate.year || "Year"}</span>
                      <span className="select-chevron"></span>
                    </button>
                    <div className="select-menu" hidden={openDropdown !== "year"}>
                      <input
                        className="select-search"
                        placeholder="Search years"
                        value={dropdownSearches.year}
                        onChange={e => setDropdownSearches({ ...dropdownSearches, year: e.target.value })}
                      />
                      <div className="select-options">
                        {optionSets.year
                          .filter(opt => opt.label.startsWith(dropdownSearches.year))
                          .map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              className="select-option"
                              onClick={() => {
                                setSelectedDate(prev => ({ ...prev, year: opt.value }));
                                setOpenDropdown(null);
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="age-copy">{calculateAge()}</div>
              </div>
            </div>
            <button className="auth-submit" type="button" onClick={handleSignup}>Continue</button>
            <p className="auth-switch">
              Already have an account?{' '}
              <button className="mode-button" type="button" onClick={() => setAuthMode("login")}>Log In</button>
            </p>
          </div>
        </section>
      </main>

      {/* --- Main App Page --- */}
      <section className="app-page" id="app-page" hidden={route !== "app"}>
        <div className={`app-shell ${hasDms ? "has-dms" : ""} ${hasChat ? "has-chat" : ""}`} id="app-shell" hidden={Boolean(currentServer)}>
          {/* Server Rail */}
          <nav className="server-rail" aria-label="Servers">
            <button
              className="home-logo-button"
              id="talky-home"
              type="button"
              aria-label="Direct Messages"
              onClick={() => selectedServerId ? returnToDirectMessages() : setHasDms(!hasDms)}
            >
              <img src="https://i.postimg.cc/PPWj43yf/logo.png" alt="Talky" />
            </button>
            <div className="rail-divider"></div>
            <ServerRailItems
              servers={servers}
              selectedServerId={selectedServerId}
              onSelectServer={selectServer}
              onCreateServer={() => setServerCreateOpen(true)}
            />
          </nav>

          {/* DM Sidebar */}
          <aside className="dm-sidebar" id="dm-sidebar" hidden={!hasDms}>
            <div className="dm-heading">Direct Messages</div>
            <button
              className="self-dm-button"
              id="open-self-dm"
              type="button"
              aria-selected={hasChat}
              onClick={() => setHasChat(true)}
            >
              <span className="profile-avatar">
                {mediaUrls.pfp ? (
                  <img src={mediaUrls.pfp} alt="" />
                ) : (
                  <span>{currentName.charAt(0).toUpperCase() || "?"}</span>
                )}
              </span>
              <span>{currentName}</span>
            </button>
            
            {/* User Profile Area with exact requested icon */}
            <button
              className="user-profile-area"
              id="open-settings"
              type="button"
              aria-label="User Settings"
              onClick={() => {
                setDraftProfile(profile);
                setDraftMedia(mediaUrls);
                setSettingsSection("profiles");
                setEmojiPicker(null);
                setSettingsOpen(true);
              }}
            >
              <span className="profile-avatar">
                {mediaUrls.pfp ? (
                  <img src={mediaUrls.pfp} alt="" />
                ) : (
                  <span>{currentName.charAt(0).toUpperCase() || "?"}</span>
                )}
              </span>
              <div className="user-profile-info">
                <span className="user-profile-name">{currentName}</span>
                <span className="user-profile-handle">@{profile.username || "username"}</span>
              </div>
              <img
                src="https://img.icons8.com/?size=100&id=364&format=png&color=000000"
                alt="Settings"
                className="profile-gear-icon"
              />
            </button>
          </aside>

          {/* Chat Pane */}
          <main className="chat-pane" id="chat-pane" hidden={!hasChat}>
            <header className="chat-header">
              <h2>{currentName}</h2>
            </header>
            <div className="message-list" id="message-list" ref={messageListRef}>
              {messages.map(msg => (
                <article key={msg.id} id={`message-${msg.id}`} className="message-row">
                  <span className="profile-avatar message-avatar">
                    {mediaUrls.pfp ? (
                      <img src={mediaUrls.pfp} alt="" />
                    ) : (
                      <span>{currentName.charAt(0).toUpperCase() || "?"}</span>
                    )}
                  </span>
                  <div className="message-body">
                    <div className="message-actions" role="group" aria-label={`Actions for ${msg.author}'s message`}>
                      <button
                        className="message-action-button message-reaction-trigger"
                        type="button"
                        aria-label="Add reaction"
                        title="Add reaction"
                        aria-expanded={emojiPicker?.messageId === msg.id}
                        onClick={event => openEmojiPicker(msg.id, event)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
                          <path d="M8.5 14.2c.8 1.2 2 1.8 3.5 1.8s2.7-.6 3.5-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          <circle cx="9" cy="9.5" r=".9" fill="currentColor" />
                          <circle cx="15" cy="9.5" r=".9" fill="currentColor" />
                        </svg>
                      </button>
                      <button
                        className="message-action-button message-reply-trigger"
                        type="button"
                        aria-label="Reply"
                        title="Reply"
                        onClick={() => startReply(msg)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M9.5 7 4 12l5.5 5M4.5 12H14a5 5 0 0 1 5 5v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                    <div className="message-meta">
                      <strong className="message-author">{msg.author}</strong>
                      <span className="message-time">{msg.time}</span>
                    </div>
                    {msg.replyTo && (
                      <button
                        className="message-reply-preview"
                        type="button"
                        aria-label={`Jump to ${msg.replyTo.author}'s message`}
                        onClick={() => scrollToMessage(msg.replyTo!.messageId)}
                      >
                        <span className="reply-preview-connector" aria-hidden="true" />
                        <strong className="reply-preview-author">{msg.replyTo.author}</strong>
                        <span className="reply-preview-text">{msg.replyTo.preview}</span>
                      </button>
                    )}
                    {msg.text && <p className="message-text">{msg.text}</p>}
                    {msg.images.length > 0 && (
                      <div className="message-image-grid" data-count={msg.images.length}>
                        {msg.images.slice(0, 4).map((image, index) => (
                          <button
                            key={image.id}
                            className="message-image-button"
                            type="button"
                            aria-label={`View image ${index + 1} of ${msg.images.length}: ${image.name}`}
                            onClick={() => setImageViewer({ images: msg.images, index })}
                          >
                            <img src={image.dataUrl} alt={image.name} />
                            {index === 3 && msg.images.length > 4 && (
                              <span className="message-image-more">+{msg.images.length - 4}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {msg.reactions.length > 0 && (
                      <div className="message-reactions" role="group" aria-label="Message reactions">
                        {msg.reactions.map(reaction => {
                          const hasReacted = reaction.userIds.includes(activeUserId || profile.username || currentName);
                          return (
                            <button
                              key={reaction.emoji}
                              className={`message-reaction${hasReacted ? " is-reacted" : ""}`}
                              type="button"
                              aria-pressed={hasReacted}
                              aria-label={`${reaction.emoji}, ${reaction.userIds.length} reaction${reaction.userIds.length === 1 ? "" : "s"}${hasReacted ? ", remove your reaction" : ""}`}
                              title={hasReacted ? "Remove your reaction" : "React with this emoji"}
                              onClick={() => toggleMessageReaction(msg.id, reaction.emoji)}
                            >
                              <span className="message-reaction-emoji" aria-hidden="true">{reaction.emoji}</span>
                              <span className="message-reaction-count">{reaction.userIds.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="composer-wrap">
              {replyDraft && (
                <div className="reply-draft" role="status" aria-label={`Replying to ${replyDraft.author}`}>
                  <div className="reply-draft-copy">
                    <div className="reply-draft-label">Replying to {replyDraft.author}</div>
                    <div className="reply-draft-text">{replyDraft.preview}</div>
                  </div>
                  <button
                    className="reply-draft-dismiss"
                    type="button"
                    aria-label="Cancel reply"
                    title="Cancel reply"
                    onClick={() => setReplyDraft(null)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
              {pendingAttachments.length > 0 && (
                <div className="attachment-tray" role="group" aria-label="Images ready to send">
                  {pendingAttachments.map(image => (
                    <div className="attachment-preview" key={image.id}>
                      <img src={image.dataUrl} alt={image.name} />
                      <button
                        className="attachment-remove"
                        type="button"
                        aria-label={`Remove ${image.name}`}
                        onClick={() => removePendingAttachment(image.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <span className="attachment-count">
                    {pendingAttachments.length} image{pendingAttachments.length === 1 ? "" : "s"}
                  </span>
                </div>
              )}
              <div className="composer-row">
                {emojiAutocompleteOpen && (
                  <div className="emoji-autocomplete">
                    <div className="emoji-autocomplete-header">
                      <span className="emoji-autocomplete-title">Emoji suggestions</span>
                      <span className="emoji-autocomplete-hint">Tab or ↑↓ to browse · Enter to insert</span>
                    </div>
                    <div className="emoji-autocomplete-list" id="emoji-autocomplete-list" role="listbox" aria-label="Emoji shortcuts">
                      {emojiSuggestions.map((suggestion, index) => (
                        <button
                          key={suggestion.shortcode}
                          id={`emoji-shortcode-option-${index}`}
                          className={`emoji-autocomplete-option${index === activeEmojiSuggestionIndex ? " is-active" : ""}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeEmojiSuggestionIndex}
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => insertEmojiSuggestion(suggestion)}
                        >
                          <span className="emoji-autocomplete-symbol" aria-hidden="true">{suggestion.emoji}</span>
                          <span className="emoji-autocomplete-code">:{suggestion.shortcode}:</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  className="attach-image-button"
                  type="button"
                  aria-label="Attach images"
                  title="Attach images"
                  onClick={() => attachmentFileInputRef.current?.click()}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
                  </svg>
                </button>
                <input
                  ref={attachmentFileInputRef}
                  id="attachment-input"
                  type="file"
                  accept="image/*"
                  multiple
                  aria-label="Choose images to attach"
                  style={{ display: "none" }}
                  onChange={handleImageSelection}
                />
                <textarea
                  ref={messageComposerRef}
                  className="message-composer"
                  placeholder={`Message @${currentName}`}
                  rows={1}
                  value={composerText}
                  aria-autocomplete={emojiAutocompleteOpen ? "list" : "none"}
                  aria-controls={emojiAutocompleteOpen ? "emoji-autocomplete-list" : undefined}
                  aria-expanded={emojiAutocompleteOpen}
                  aria-activedescendant={emojiAutocompleteOpen ? `emoji-shortcode-option-${activeEmojiSuggestionIndex}` : undefined}
                  onChange={e => {
                    const value = e.currentTarget.value;
                    const cursor = e.currentTarget.selectionStart;
                    setComposerText(value);
                    setComposerSelection({ start: cursor, end: e.currentTarget.selectionEnd });
                    setEmojiSuggestionIndex(0);
                    setEmojiSuggestionsDismissed(false);
                  }}
                  onClick={e => {
                    syncComposerSelection(e.currentTarget);
                    setEmojiSuggestionIndex(0);
                    setEmojiSuggestionsDismissed(false);
                  }}
                  onKeyUp={e => {
                    syncComposerSelection(e.currentTarget);
                    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                      setEmojiSuggestionIndex(0);
                      setEmojiSuggestionsDismissed(false);
                    }
                  }}
                  onKeyDown={e => {
                    if (emojiAutocompleteOpen && emojiSuggestions.length > 0) {
                      if (e.key === "Tab" || e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        const direction = e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey) ? -1 : 1;
                        setEmojiSuggestionIndex(current =>
                          (current + direction + emojiSuggestions.length) % emojiSuggestions.length
                        );
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setEmojiSuggestionsDismissed(true);
                        return;
                      }
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (emojiAutocompleteOpen && activeEmojiSuggestion) {
                        insertEmojiSuggestion(activeEmojiSuggestion);
                        return;
                      }
                      sendLocalMessage();
                    }
                  }}
                />
              </div>
            </div>
          </main>

          {hasChat && (
            <aside className="dm-profile-panel" aria-label="DM profile">
              <div className="preview-header-label">PROFILE</div>
              <div className="discord-card-preview">
                <div className="discord-card-banner">
                  {mediaUrls.banner ? <img src={mediaUrls.banner} alt="Profile banner" /> : null}
                </div>
                <div className="discord-card-body">
                  <div className="preview-avatar-container">
                    <div className="preview-avatar-circle">
                      {mediaUrls.pfp ? (
                        <img className="preview-avatar-img" src={mediaUrls.pfp} alt="" />
                      ) : (
                        <span style={{ fontSize: "32px", color: "#fff", fontWeight: 700 }}>
                          {currentName.charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div className="preview-status-dot" title="Online" />
                  </div>
                  <div className="discord-card-names">
                    <div className="discord-card-displayname">{currentName}</div>
                    <div className="discord-card-handle-line">
                      <div className="discord-card-handle">@{profile.username || "username"}</div>
                      {profile.verifiedBadgeEquipped && (
                        <VerifiedBadge className="discord-card-verified-badge" />
                      )}
                    </div>
                  </div>
                  {Boolean(profile.pronouns) && (
                    <div className="discord-card-pronouns">{profile.pronouns}</div>
                  )}
                  <div className="discord-card-divider" />
                  <div className="discord-card-section-title">ABOUT ME</div>
                  {profile.bio.trim() ? (
                    <p className="discord-card-bio">{profile.bio}</p>
                  ) : (
                    <p className="discord-card-bio discord-card-empty-bio">
                      This user hasn't added an about me yet.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
        {currentServer && (
          <ServerWorkspace
            server={currentServer}
            servers={servers}
            selectedServerId={selectedServerId}
            members={serverMembers}
            channel={currentChannel || defaultServerChannels()[0]}
            channelChat={(
              <ServerChat
                key={`${serverOwnerKey}:${currentServer.id}:${currentChannel?.id || selectedServerChannel}`}
                storageOwner={serverOwnerKey}
                userId={activeUserId || profile.username || currentName || serverOwnerKey}
                serverId={currentServer.id}
                channel={currentChannel?.name || "general"}
                author={currentName}
                avatar={mediaUrls.pfp}
                emojiOptions={EMOJI_OPTIONS}
                emojiShortcodes={EMOJI_SHORTCODES}
                expandEmojiShortcodes={expandEmojiShortcodes}
              />
            )}
            menuOpen={serverMenuOpen}
            onHome={returnToDirectMessages}
            onSelectServer={selectServer}
            onCreateServer={() => setServerCreateOpen(true)}
            onSelectChannel={setSelectedServerChannel}
            onCreateChannel={createServerChannel}
            onToggleMenu={() => setServerMenuOpen(open => !open)}
            onOpenSettings={() => {
              setServerMenuOpen(false);
              setServerSettingsOpen(true);
            }}
            onSelectMember={member => {
              const currentMember = serverMembers.find(item => item.id === member.id);
              setSelectedServerMember(currentMember || member);
            }}
            onHangUp={() => {
              const textChannel = currentServer.channels.find(channel => channel.type === "text");
              if (textChannel) setSelectedServerChannel(textChannel.id);
            }}
          />
        )}
        {currentServer && selectedServerMember && (
          <ServerMemberCard
            member={serverMembers.find(member => member.id === selectedServerMember.id) || selectedServerMember}
            roles={currentServer.roles}
            assignedRoleIds={currentServer.roleAssignments[selectedServerMember.id] || []}
            onToggleRole={roleId => toggleServerMemberRole(selectedServerMember.id, roleId)}
            onClose={() => setSelectedServerMember(null)}
          />
        )}
        <CreateServerModal
          isOpen={serverCreateOpen}
          onClose={() => setServerCreateOpen(false)}
          onCreate={createServer}
        />
        {serverSettingsOpen && currentServer && (
          <ServerSettingsPage
            server={currentServer}
            members={serverMembers}
            onClose={() => {
              setServerSettingsOpen(false);
              setServerMenuOpen(false);
            }}
            onSave={patch => updateServer(currentServer.id, patch)}
            onToggleMemberRole={toggleServerMemberRole}
          />
        )}
        {imageViewer && (
          <div
            className="image-viewer-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Image ${imageViewer.index + 1} of ${imageViewer.images.length}`}
            onClick={() => setImageViewer(null)}
          >
            <button
              className="image-viewer-close"
              type="button"
              aria-label="Close image viewer"
              onClick={() => setImageViewer(null)}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            {imageViewer.images.length > 1 && (
              <button
                className="image-viewer-nav image-viewer-prev"
                type="button"
                aria-label="Previous image"
                onClick={e => {
                  e.stopPropagation();
                  setImageViewer(current => current ? {
                    ...current,
                    index: (current.index - 1 + current.images.length) % current.images.length
                  } : current);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div className="image-viewer-content" onClick={e => e.stopPropagation()}>
              <img
                className="image-viewer-image"
                src={imageViewer.images[imageViewer.index].dataUrl}
                alt={imageViewer.images[imageViewer.index].name}
              />
              {imageViewer.images.length > 1 && (
                <div className="image-viewer-counter">
                  {imageViewer.index + 1} / {imageViewer.images.length}
                </div>
              )}
            </div>
            {imageViewer.images.length > 1 && (
              <button
                className="image-viewer-nav image-viewer-next"
                type="button"
                aria-label="Next image"
                onClick={e => {
                  e.stopPropagation();
                  setImageViewer(current => current ? {
                    ...current,
                    index: (current.index + 1) % current.images.length
                  } : current);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        )}
        {emojiPicker && createPortal(
          <div
            className="emoji-picker"
            role="dialog"
            aria-label="Choose a reaction emoji"
            data-placement={emojiPicker.placement}
            ref={emojiPickerRef}
            style={{ left: emojiPicker.left, top: emojiPicker.top }}
          >
            <div className="emoji-picker-header">
              <span className="emoji-picker-title">Pick a reaction</span>
              <span className="emoji-picker-total">{EMOJI_OPTIONS.length} emoji</span>
            </div>
            <div className="emoji-search-wrap">
              <input
                className="emoji-search"
                type="search"
                placeholder="Search emoji"
                aria-label="Search emoji"
                autoComplete="off"
                value={emojiSearch}
                onChange={event => setEmojiSearch(event.target.value)}
              />
            </div>
            {filteredEmojis.length > 0 ? (
              <div className="emoji-picker-grid" role="grid" aria-label="Available emojis">
                {filteredEmojis.map(option => (
                  <button
                    key={`${option.emoji}-${option.name}`}
                    className="emoji-option"
                    type="button"
                    role="gridcell"
                    aria-label={`${option.name}: ${option.emoji}`}
                    title={option.name}
                    onClick={() => addMessageReaction(emojiPicker.messageId, option.emoji)}
                  >
                    {option.emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div className="emoji-picker-empty">No emoji found</div>
            )}
          </div>,
          document.body
        )}
      </section>

      {/* =====================================================================
          SETTINGS PAGE - CLASSIC DISCORD USER SETTINGS
          ===================================================================== */}
      <section
        className="settings-page"
        id="settings-page"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        hidden={!settingsOpen}
      >
        <div className="settings-layout">
          {/* Settings section navigation */}
          <nav className="settings-nav" aria-label="User Settings">
            <div className="settings-nav-title">User Settings</div>
            <button
              className="settings-nav-item"
              type="button"
              aria-current={settingsSection === "profiles" ? "page" : undefined}
              onClick={() => setSettingsSection("profiles")}
            >
              Profiles
            </button>
            <button
              className="settings-nav-item"
              type="button"
              aria-current={settingsSection === "badges" ? "page" : undefined}
              onClick={() => setSettingsSection("badges")}
            >
              Badges
            </button>
            <button className="settings-nav-logout" id="logout-button" type="button" onClick={logOut}>
              Log Out
            </button>
          </nav>

          {/* Main settings area */}
          <main className="settings-main">
            <div className="settings-inner">
              <header className="settings-top">
                <div className="settings-title-group">
                  <h1 id="settings-title">{settingsSection === "profiles" ? "Profiles" : "Badges"}</h1>
                </div>
                <div className="settings-close-wrap">
                  <button
                    className="settings-close"
                    id="close-settings"
                    type="button"
                    aria-label="Close settings"
                    onClick={() => {
                      if (hasUnsavedChanges) {
                        handleResetChanges();
                      }
                      setSettingsOpen(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <div className="settings-close-hint">ESC</div>
                </div>
              </header>

              {settingsSection === "profiles" && (
              <div className="profile-settings-grid">
                {/* Profile Edit Fields */}
                <form className="profile-form" onSubmit={e => e.preventDefault()}>
                  {/* Display Name */}
                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="settings-display-name">Display Name</label>
                    <input
                      id="settings-display-name"
                      className="profile-field-input"
                      type="text"
                      maxLength={32}
                      value={draftProfile.displayName}
                      onChange={e => setDraftProfile({ ...draftProfile, displayName: e.target.value })}
                    />
                  </div>
                  
                  {/* Username / Handle */}
                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="settings-username">Username / Handle</label>
                    <input
                      id="settings-username"
                      className="profile-field-input"
                      type="text"
                      maxLength={32}
                      value={draftProfile.username}
                      onChange={e => setDraftProfile({ ...draftProfile, username: e.target.value.trim().replace(/^@/, "") })}
                    />
                  </div>

                  {/* Pronouns */}
                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="settings-pronouns">Pronouns</label>
                    <input
                      id="settings-pronouns"
                      className="profile-field-input"
                      type="text"
                      placeholder="Add pronouns"
                      maxLength={40}
                      value={draftProfile.pronouns}
                      onChange={e => setDraftProfile({ ...draftProfile, pronouns: e.target.value })}
                    />
                  </div>

                  {/* Avatar Section - Direct Instant Upload, No Rescaling */}
                  <div className="profile-field">
                    <label className="profile-field-label">Avatar</label>
                    <div className="profile-media-actions">
                      <button
                        className="discord-button-primary"
                        type="button"
                        onClick={() => avatarFileInputRef.current?.click()}
                      >
                        Change Avatar
                      </button>
                      {Boolean(draftMedia.pfp) && (
                        <button
                          className="discord-button-danger"
                          type="button"
                          onClick={() => removeMediaDraft("pfp")}
                        >
                          Remove Avatar
                        </button>
                      )}
                      <input
                        ref={avatarFileInputRef}
                        type="file"
                        accept="image/*,image/gif,image/webp,image/png,image/jpeg"
                        style={{ display: "none" }}
                        onChange={e => handleInstantUpload("pfp", e)}
                      />
                    </div>
                  </div>

                  {/* Banner Section - Direct Instant Upload, No Rescaling */}
                  <div className="profile-field">
                    <label className="profile-field-label">Banner</label>
                    <div className="profile-media-actions">
                      <button
                        className="discord-button-primary"
                        type="button"
                        onClick={() => bannerFileInputRef.current?.click()}
                      >
                        Change Banner
                      </button>
                      {Boolean(draftMedia.banner) && (
                        <button
                          className="discord-button-danger"
                          type="button"
                          onClick={() => removeMediaDraft("banner")}
                        >
                          Remove Banner
                        </button>
                      )}
                      <input
                        ref={bannerFileInputRef}
                        type="file"
                        accept="image/*,image/gif,image/webp,image/png,image/jpeg"
                        style={{ display: "none" }}
                        onChange={e => handleInstantUpload("banner", e)}
                      />
                    </div>
                  </div>

                  {/* Bio */}
                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="settings-bio">About Me</label>
                    <textarea
                      id="settings-bio"
                      className="profile-field-textarea"
                      placeholder="You can use markdown and links if you'd like."
                      maxLength={200}
                      value={draftProfile.bio}
                      onChange={e => setDraftProfile({ ...draftProfile, bio: e.target.value })}
                    />
                    <div className="profile-field-hint">
                      {200 - draftProfile.bio.length} characters left
                    </div>
                  </div>
                </form>

                {/* Right Column: Live Profile Card Preview */}
                <div className="preview-column">
                  <div className="preview-header-label">PREVIEW</div>
                  <aside className="discord-card-preview" aria-label="Profile Card Preview">
                    {/* Banner */}
                    <div className="discord-card-banner">
                      {draftMedia.banner ? (
                        <img src={draftMedia.banner} alt="Profile banner" />
                      ) : null}
                    </div>

                    {/* Card Content */}
                    <div className="discord-card-body">
                      {/* Avatar with overlapping position and online dot - fills 100% of circle, zero gap */}
                      <div className="preview-avatar-container">
                        <div className="preview-avatar-circle">
                          {draftMedia.pfp ? (
                            <img
                              className="preview-avatar-img"
                              src={draftMedia.pfp}
                              alt=""
                            />
                          ) : (
                            <span style={{ fontSize: "32px", color: "#fff", fontWeight: 700 }}>
                              {draftProfile.displayName.trim().charAt(0).toUpperCase() || "?"}
                            </span>
                          )}
                        </div>
                        <div className="preview-status-dot" title="Online" />
                      </div>

                      {/* Display name & Handle */}
                      <div className="discord-card-names">
                        <div className="discord-card-displayname">
                          {draftProfile.displayName.trim() || "Your name"}
                        </div>
                        <div className="discord-card-handle-line">
                          <div className="discord-card-handle">
                            @{draftProfile.username || "username"}
                          </div>
                          {draftProfile.verifiedBadgeEquipped && (
                            <VerifiedBadge className="discord-card-verified-badge" />
                          )}
                        </div>
                      </div>

                      {/* Pronouns */}
                      {Boolean(draftProfile.pronouns) && (
                        <div className="discord-card-pronouns">{draftProfile.pronouns}</div>
                      )}

                      <div className="discord-card-divider" />

                      {/* About Me Section */}
                      <div className="discord-card-section-title">ABOUT ME</div>
                      {draftProfile.bio.trim() ? (
                        <p className="discord-card-bio">{draftProfile.bio}</p>
                      ) : (
                        <p className="discord-card-bio discord-card-empty-bio">
                          This user hasn't added an about me yet.
                        </p>
                      )}
                    </div>
                  </aside>
                </div>
              </div>
              )}

              {settingsSection === "badges" && (
                <section className="badge-settings-page" aria-labelledby="badges-heading">
                  <h2 className="badge-settings-heading" id="badges-heading">My Badges</h2>
                  <p className="badge-settings-description">
                    Equip a badge to show it beside your handle on your DM profile card.
                  </p>
                  <h3 className="badge-list-heading">Available badges</h3>
                  <article className="badge-item">
                    <div className="badge-image-frame">
                      <VerifiedBadge className="badge-image" />
                    </div>
                    <div className="badge-item-copy">
                      <div className="badge-item-title-row">
                        <h4 className="badge-item-title">Verified</h4>
                        {draftProfile.verifiedBadgeEquipped && (
                          <span className="badge-equipped-label">Equipped</span>
                        )}
                      </div>
                      <p className="badge-item-description">
                        A blue verified badge displayed next to your username.
                      </p>
                    </div>
                    <button
                      className="discord-button-primary badge-equip-button"
                      type="button"
                      aria-pressed={draftProfile.verifiedBadgeEquipped}
                      onClick={() => setDraftProfile({
                        ...draftProfile,
                        verifiedBadgeEquipped: !draftProfile.verifiedBadgeEquipped
                      })}
                    >
                      {draftProfile.verifiedBadgeEquipped ? "Unequip" : "Equip"}
                    </button>
                  </article>
                </section>
              )}
            </div>

            {/* Classic Discord Unsaved Changes Floating Bar */}
            {hasUnsavedChanges && (
              <div className="unsaved-notice-container">
                <div className="unsaved-notice-bar" role="alert">
                  <span className="unsaved-notice-text">
                    Careful — you have unsaved changes!
                  </span>
                  <div className="unsaved-notice-actions">
                    <button
                      className="unsaved-reset-btn"
                      type="button"
                      onClick={handleResetChanges}
                    >
                      Reset
                    </button>
                    <button
                      className="unsaved-save-btn"
                      type="button"
                      onClick={handleSaveChanges}
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </section>
    </>
  );
}
