import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface EmojiOption {
  emoji: string;
  name: string;
}

interface EmojiShortcode {
  shortcode: string;
  emoji: string;
}

interface ServerImage {
  id: string;
  name: string;
  dataUrl: string;
}

interface ServerReply {
  messageId: string;
  author: string;
  preview: string;
}

interface ServerReaction {
  emoji: string;
  userIds: string[];
}

interface ServerMessage {
  id: string;
  author: string;
  time: string;
  text: string;
  images: ServerImage[];
  replyTo: ServerReply | null;
  reactions: ServerReaction[];
}

interface EmojiPickerState {
  messageId: string | null;
  left: number;
  top: number;
  placement: "top" | "bottom";
}

interface ImageViewerState {
  images: ServerImage[];
  index: number;
}

const MESSAGE_DB_NAME = "talky_media_store_v5";

const imageKey = (storageKey: string, messageId: string, attachmentId: string) =>
  `${storageKey}::image::${messageId}::${attachmentId}`;

const openMessageMediaDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!("indexedDB" in window)) {
    reject(new Error("Image storage is unavailable."));
    return;
  }
  const request = indexedDB.open(MESSAGE_DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains("media")) request.result.createObjectStore("media");
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const saveMessageImage = async (key: string, dataUrl: string) => {
  const db = await openMessageMediaDb();
  try {
    const transaction = db.transaction("media", "readwrite");
    transaction.objectStore("media").put(dataUrl, key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
};

const loadMessageImage = async (key: string): Promise<string> => {
  const db = await openMessageMediaDb();
  try {
    const transaction = db.transaction("media", "readonly");
    const request = transaction.objectStore("media").get(key);
    const result = await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? "");
      request.onerror = () => reject(request.error);
    });
    return typeof result === "string" ? result : "";
  } finally {
    db.close();
  }
};

const getMessagePreview = (message: Pick<ServerMessage, "text" | "images">) => {
  const text = message.text.trim();
  if (text) return text;
  if (message.images.length) return `${message.images.length} image${message.images.length === 1 ? "" : "s"}`;
  return "Message";
};

const readMessages = (storageKey: string): ServerMessage[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item.id === "string" && typeof item.author === "string")
      .map(item => ({
        id: item.id,
        author: item.author,
        time: typeof item.time === "string" ? item.time : "",
        text: typeof item.text === "string" ? item.text : "",
        images: Array.isArray(item.images)
          ? item.images.filter((image: any) => image && typeof image.id === "string")
            .map((image: any) => ({ id: image.id, name: typeof image.name === "string" ? image.name : "Image", dataUrl: "" }))
          : [],
        replyTo: item.replyTo && typeof item.replyTo.messageId === "string"
          ? {
              messageId: item.replyTo.messageId,
              author: typeof item.replyTo.author === "string" ? item.replyTo.author : "User",
              preview: typeof item.replyTo.preview === "string" ? item.replyTo.preview : "Message",
            }
          : null,
        reactions: Array.isArray(item.reactions)
          ? item.reactions.filter((reaction: any) => reaction && typeof reaction.emoji === "string")
            .map((reaction: any) => ({
              emoji: reaction.emoji,
              userIds: Array.isArray(reaction.userIds)
                ? reaction.userIds.filter((id: unknown): id is string => typeof id === "string")
                : [],
            }))
          : [],
      }));
  } catch {
    return [];
  }
};

const findCompletion = (text: string, cursor: number) => {
  const beforeCursor = text.slice(0, cursor);
  const match = beforeCursor.match(/:[a-z0-9_+-]{0,24}$/i);
  if (!match) return null;
  const start = cursor - match[0].length;
  const previousCharacter = beforeCursor.slice(0, start).slice(-1);
  if (previousCharacter && /[a-z0-9_]/i.test(previousCharacter)) return null;
  return { start, end: cursor, query: match[0].slice(1).toLowerCase() };
};

const readImageFile = (file: File): Promise<ServerImage> => new Promise((resolve, reject) => {
  if (!file.type.startsWith("image/")) {
    reject(new Error("Choose an image file."));
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    reject(new Error("Images must be 8 MB or smaller."));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== "string") {
      reject(new Error("Could not read that image."));
      return;
    }
    resolve({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, name: file.name || "Image", dataUrl: reader.result });
  };
  reader.onerror = () => reject(new Error("Could not read that image."));
  reader.readAsDataURL(file);
});

export function ServerChat({
  storageOwner,
  userId,
  serverId,
  channel,
  author,
  avatar,
  emojiOptions,
  emojiShortcodes,
  expandEmojiShortcodes,
}: {
  storageOwner: string;
  userId: string;
  serverId: string;
  channel: string;
  author: string;
  avatar: string;
  emojiOptions: EmojiOption[];
  emojiShortcodes: EmojiShortcode[];
  expandEmojiShortcodes: (text: string) => string;
}) {
  const storageKey = `talky_server_messages_v1_${encodeURIComponent(storageOwner)}_${encodeURIComponent(serverId)}_${encodeURIComponent(channel)}`;
  const [messages, setMessages] = useState<ServerMessage[]>(() => readMessages(storageKey));
  const [composerText, setComposerText] = useState("");
  const [composerSelection, setComposerSelection] = useState({ start: 0, end: 0 });
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ServerImage[]>([]);
  const [replyDraft, setReplyDraft] = useState<ServerReply | null>(null);
  const [emojiPicker, setEmojiPicker] = useState<EmojiPickerState | null>(null);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [imageError, setImageError] = useState("");
  const messageListRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const emojiCompletion = composerSelection.start === composerSelection.end
    ? findCompletion(composerText, composerSelection.end)
    : null;
  const emojiSuggestions = emojiCompletion
    ? emojiShortcodes.filter(option => option.shortcode.startsWith(emojiCompletion.query)).slice(0, 8)
    : [];
  const emojiAutocompleteOpen = Boolean(emojiCompletion && emojiSuggestions.length && !suggestionsDismissed);
  const activeSuggestionIndex = emojiSuggestions.length ? suggestionIndex % emojiSuggestions.length : 0;
  const activeSuggestion = emojiSuggestions[activeSuggestionIndex] ?? null;
  const filteredEmojis = emojiOptions.filter(option =>
    `${option.name} ${option.emoji}`.toLowerCase().includes(emojiSearch.trim().toLowerCase())
  );

  useEffect(() => {
    let cancelled = false;
    const stored = readMessages(storageKey);
    Promise.all(stored.map(async message => ({
      id: message.id,
      images: await Promise.all(message.images.map(async image => ({
        id: image.id,
        dataUrl: await loadMessageImage(imageKey(storageKey, message.id, image.id)).catch(() => ""),
      }))),
    }))).then(restored => {
      if (cancelled) return;
      const imageMap = new Map(restored.map(message => [message.id, new Map(message.images.map(image => [image.id, image.dataUrl]))]));
      setMessages(current => current.map(message => ({
        ...message,
        images: message.images.map(image => ({
          ...image,
          dataUrl: imageMap.get(message.id)?.get(image.id) || image.dataUrl,
        })),
      })));
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    try {
      const metadata = messages.slice(-500).map(message => ({
        ...message,
        images: message.images.map(({ id, name }) => ({ id, name })),
      }));
      localStorage.setItem(storageKey, JSON.stringify(metadata));
    } catch (error) {
      console.warn("Server message save error", error);
    }
  }, [messages, storageKey]);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, storageKey]);

  useEffect(() => {
    if (!emojiPicker) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && emojiPickerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".message-reaction-trigger, .server-composer-emoji-button")) return;
      setEmojiPicker(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [emojiPicker]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (imageViewer) setImageViewer(null);
        if (emojiPicker) setEmojiPicker(null);
      }
      if (imageViewer && imageViewer.images.length > 1) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setImageViewer(current => current ? { ...current, index: (current.index - 1 + current.images.length) % current.images.length } : current);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          setImageViewer(current => current ? { ...current, index: (current.index + 1) % current.images.length } : current);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageViewer, emojiPicker]);

  const openEmojiPicker = (messageId: string | null, event: React.MouseEvent<HTMLButtonElement>) => {
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

  const addReaction = (messageId: string, emoji: string) => {
    setMessages(current => current.map(message => {
      if (message.id !== messageId) return message;
      const existing = message.reactions.find(reaction => reaction.emoji === emoji);
      if (existing?.userIds.includes(userId)) return message;
      if (existing) return {
        ...message,
        reactions: message.reactions.map(reaction => reaction.emoji === emoji
          ? { ...reaction, userIds: [...reaction.userIds, userId] }
          : reaction),
      };
      return { ...message, reactions: [...message.reactions, { emoji, userIds: [userId] }] };
    }));
    setEmojiPicker(null);
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    setMessages(current => current.map(message => {
      if (message.id !== messageId) return message;
      const existing = message.reactions.find(reaction => reaction.emoji === emoji);
      if (!existing) return { ...message, reactions: [...message.reactions, { emoji, userIds: [userId] }] };
      if (!existing.userIds.includes(userId)) return {
        ...message,
        reactions: message.reactions.map(reaction => reaction.emoji === emoji
          ? { ...reaction, userIds: [...reaction.userIds, userId] }
          : reaction),
      };
      const remaining = existing.userIds.filter(id => id !== userId);
      return {
        ...message,
        reactions: remaining.length
          ? message.reactions.map(reaction => reaction.emoji === emoji ? { ...reaction, userIds: remaining } : reaction)
          : message.reactions.filter(reaction => reaction.emoji !== emoji),
      };
    }));
  };

  const insertAtCursor = (emoji: string, range?: { start: number; end: number }) => {
    const textarea = composerRef.current;
    const start = range?.start ?? textarea?.selectionStart ?? composerText.length;
    const end = range?.end ?? textarea?.selectionEnd ?? composerText.length;
    const nextText = `${composerText.slice(0, start)}${emoji}${composerText.slice(end)}`;
    const nextCursor = start + emoji.length;
    setComposerText(nextText);
    setComposerSelection({ start: nextCursor, end: nextCursor });
    setSuggestionIndex(0);
    setSuggestionsDismissed(false);
    window.requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const chooseEmoji = (emoji: string) => {
    if (emojiPicker?.messageId) addReaction(emojiPicker.messageId, emoji);
    else {
      setEmojiPicker(null);
      insertAtCursor(emoji);
    }
  };

  const insertSuggestion = (suggestion: EmojiShortcode) => {
    if (!emojiCompletion) return;
    insertAtCursor(suggestion.emoji, { start: emojiCompletion.start, end: emojiCompletion.end });
  };

  const startReply = (message: ServerMessage) => {
    setReplyDraft({ messageId: message.id, author: message.author, preview: getMessagePreview(message) });
    setEmojiPicker(null);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const sendMessage = async () => {
    const text = expandEmojiShortcodes(composerText.trim());
    if (!text && pendingAttachments.length === 0) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await Promise.all(pendingAttachments.map(image =>
      saveMessageImage(imageKey(storageKey, id, image.id), image.dataUrl).catch(error => {
        console.warn("Server image save error", error);
      })
    ));
    const message: ServerMessage = {
      id,
      author,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      text,
      images: pendingAttachments,
      replyTo: replyDraft,
      reactions: [],
    };
    setMessages(current => [...current, message].slice(-500));
    setComposerText("");
    setComposerSelection({ start: 0, end: 0 });
    setSuggestionIndex(0);
    setSuggestionsDismissed(false);
    setPendingAttachments([]);
    setReplyDraft(null);
  };

  const selectImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []).filter(file => file.type.startsWith("image/"));
    input.value = "";
    if (!files.length) return;
    const results = await Promise.all(files.map(file => readImageFile(file).catch(error => {
      setImageError(error instanceof Error ? error.message : "Could not read that image.");
      return null;
    })));
    const readable = results.filter((image): image is ServerImage => image !== null);
    if (readable.length) {
      setPendingAttachments(current => [...current, ...readable]);
      setImageError("");
    }
  };

  const removePendingImage = (imageId: string) => setPendingAttachments(current => current.filter(image => image.id !== imageId));

  return (
    <>
      {messages.length > 0 ? (
        <div className="message-list server-message-list" id="server-message-list" ref={messageListRef}>
          {messages.map(message => (
            <article key={message.id} id={`server-message-${message.id}`} className="message-row">
              <span className="profile-avatar message-avatar">
                {avatar ? <img src={avatar} alt="" /> : <span>{author.charAt(0).toUpperCase() || "?"}</span>}
              </span>
              <div className="message-body">
                <div className="message-actions" role="group" aria-label={`Actions for ${message.author}'s message`}>
                  <button
                    className="message-action-button message-reaction-trigger"
                    type="button"
                    aria-label="Add reaction"
                    title="Add reaction"
                    onClick={event => openEmojiPicker(message.id, event)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8.5 14.2c.8 1.2 2 1.8 3.5 1.8s2.7-.6 3.5-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <circle cx="9" cy="9.5" r=".9" fill="currentColor" /><circle cx="15" cy="9.5" r=".9" fill="currentColor" />
                    </svg>
                  </button>
                  <button className="message-action-button" type="button" aria-label="Reply" title="Reply" onClick={() => startReply(message)}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M9.5 7 4 12l5.5 5M4.5 12H14a5 5 0 0 1 5 5v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                <div className="message-meta">
                  <strong className="message-author">{message.author}</strong>
                  <span className="message-time">{message.time}</span>
                </div>
                {message.replyTo && (
                  <button
                    className="message-reply-preview"
                    type="button"
                    aria-label={`Jump to ${message.replyTo.author}'s message`}
                    onClick={() => document.getElementById(`server-message-${message.replyTo!.messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  >
                    <span className="reply-preview-connector" aria-hidden="true" />
                    <strong className="reply-preview-author">{message.replyTo.author}</strong>
                    <span className="reply-preview-text">{message.replyTo.preview}</span>
                  </button>
                )}
                {message.text && <p className="message-text">{message.text}</p>}
                {message.images.length > 0 && (
                  <div className="message-image-grid" data-count={message.images.length}>
                    {message.images.slice(0, 4).map((image, index) => (
                      <button
                        key={image.id}
                        className="message-image-button"
                        type="button"
                        aria-label={`View image ${index + 1} of ${message.images.length}: ${image.name}`}
                        onClick={() => setImageViewer({ images: message.images, index })}
                      >
                        {image.dataUrl ? <img src={image.dataUrl} alt={image.name} /> : <span className="server-image-loading">Loading image…</span>}
                        {index === 3 && message.images.length > 4 && <span className="message-image-more">+{message.images.length - 4}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {message.reactions.length > 0 && (
                  <div className="message-reactions" role="group" aria-label="Message reactions">
                    {message.reactions.map(reaction => {
                      const hasReacted = reaction.userIds.includes(userId);
                      return (
                        <button
                          key={reaction.emoji}
                          className={`message-reaction${hasReacted ? " is-reacted" : ""}`}
                          type="button"
                          aria-pressed={hasReacted}
                          aria-label={`${reaction.emoji}, ${reaction.userIds.length} reaction${reaction.userIds.length === 1 ? "" : "s"}`}
                          onClick={() => toggleReaction(message.id, reaction.emoji)}
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
      ) : (
        <div className="server-channel-empty-state">
          <div className="server-channel-empty-hash" aria-hidden="true">#</div>
          <h2>Welcome to #{channel}!</h2>
          <p>This is the beginning of this channel.</p>
        </div>
      )}

      <div className="composer-wrap server-composer-wrap">
        {replyDraft && (
          <div className="reply-draft" role="status" aria-label={`Replying to ${replyDraft.author}`}>
            <div className="reply-draft-copy">
              <div className="reply-draft-label">Replying to {replyDraft.author}</div>
              <div className="reply-draft-text">{replyDraft.preview}</div>
            </div>
            <button className="reply-draft-dismiss" type="button" aria-label="Cancel reply" onClick={() => setReplyDraft(null)}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        )}
        {pendingAttachments.length > 0 && (
          <div className="attachment-tray" role="group" aria-label="Images ready to send">
            {pendingAttachments.map(image => (
              <div className="attachment-preview" key={image.id}>
                <img src={image.dataUrl} alt={image.name} />
                <button className="attachment-remove" type="button" aria-label={`Remove ${image.name}`} onClick={() => removePendingImage(image.id)}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                </button>
              </div>
            ))}
            <span className="attachment-count">{pendingAttachments.length} image{pendingAttachments.length === 1 ? "" : "s"}</span>
          </div>
        )}
        {imageError && <div className="server-image-error" role="alert">{imageError}</div>}
        <div className="composer-row server-composer-row">
          {emojiAutocompleteOpen && (
            <div className="emoji-autocomplete">
              <div className="emoji-autocomplete-header">
                <span className="emoji-autocomplete-title">Emoji suggestions</span>
                <span className="emoji-autocomplete-hint">Tab or ↑↓ to browse · Enter to insert</span>
              </div>
              <div className="emoji-autocomplete-list" role="listbox" aria-label="Emoji shortcuts">
                {emojiSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.shortcode}
                    className={`emoji-autocomplete-option${index === activeSuggestionIndex ? " is-active" : ""}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => insertSuggestion(suggestion)}
                  >
                    <span className="emoji-autocomplete-symbol" aria-hidden="true">{suggestion.emoji}</span>
                    <span className="emoji-autocomplete-code">:{suggestion.shortcode}:</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button className="attach-image-button" type="button" aria-label="Attach images" title="Attach images" onClick={() => attachmentInputRef.current?.click()}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></svg>
          </button>
          <input ref={attachmentInputRef} type="file" accept="image/*" multiple hidden aria-label="Choose images to attach" onChange={selectImages} />
          <textarea
            ref={composerRef}
            className="message-composer"
            placeholder={`Message #${channel}`}
            rows={1}
            value={composerText}
            aria-autocomplete={emojiAutocompleteOpen ? "list" : "none"}
            aria-expanded={emojiAutocompleteOpen}
            onChange={event => {
              const value = event.currentTarget.value;
              setComposerText(value);
              setComposerSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd });
              setSuggestionIndex(0);
              setSuggestionsDismissed(false);
            }}
            onClick={event => setComposerSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
            onKeyUp={event => {
              setComposerSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd });
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                setSuggestionIndex(0);
                setSuggestionsDismissed(false);
              }
            }}
            onKeyDown={event => {
              if (emojiAutocompleteOpen && emojiSuggestions.length) {
                if (event.key === "Tab" || event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const direction = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
                  setSuggestionIndex(current => (current + direction + emojiSuggestions.length) % emojiSuggestions.length);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setSuggestionsDismissed(true);
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (emojiAutocompleteOpen && activeSuggestion) insertSuggestion(activeSuggestion);
                else void sendMessage();
              }
            }}
          />
          <button className="server-composer-emoji-button" type="button" aria-label="Insert emoji" title="Insert emoji" onClick={event => openEmojiPicker(null, event)}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8.5 14c.8 1.2 2 1.8 3.5 1.8s2.7-.6 3.5-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="9" cy="9.5" r=".9" fill="currentColor" /><circle cx="15" cy="9.5" r=".9" fill="currentColor" />
            </svg>
          </button>
          <button className="server-send-button" type="button" aria-label="Send message" title="Send message" onClick={() => void sendMessage()}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      {imageViewer && (
        <div
          className="image-viewer-overlay server-image-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`Image ${imageViewer.index + 1} of ${imageViewer.images.length}`}
          onClick={() => setImageViewer(null)}
        >
          <button className="image-viewer-close" type="button" aria-label="Close image viewer" onClick={() => setImageViewer(null)}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
          {imageViewer.images.length > 1 && (
            <button className="image-viewer-nav image-viewer-prev" type="button" aria-label="Previous image" onClick={event => {
              event.stopPropagation();
              setImageViewer(current => current ? { ...current, index: (current.index - 1 + current.images.length) % current.images.length } : current);
            }}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          <div className="image-viewer-content" onClick={event => event.stopPropagation()}>
            <img className="image-viewer-image" src={imageViewer.images[imageViewer.index].dataUrl} alt={imageViewer.images[imageViewer.index].name} />
            {imageViewer.images.length > 1 && <div className="image-viewer-counter">{imageViewer.index + 1} / {imageViewer.images.length}</div>}
          </div>
          {imageViewer.images.length > 1 && (
            <button className="image-viewer-nav image-viewer-next" type="button" aria-label="Next image" onClick={event => {
              event.stopPropagation();
              setImageViewer(current => current ? { ...current, index: (current.index + 1) % current.images.length } : current);
            }}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>
      )}

      {emojiPicker && createPortal(
        <div className="emoji-picker" role="dialog" aria-label={emojiPicker.messageId ? "Choose a reaction emoji" : "Insert an emoji"} data-placement={emojiPicker.placement} ref={emojiPickerRef} style={{ left: emojiPicker.left, top: emojiPicker.top }}>
          <div className="emoji-picker-header">
            <span className="emoji-picker-title">{emojiPicker.messageId ? "Pick a reaction" : "Insert emoji"}</span>
            <span className="emoji-picker-total">{filteredEmojis.length} emoji</span>
          </div>
          <div className="emoji-search-wrap">
            <input className="emoji-search" type="search" placeholder="Search emoji" aria-label="Search emoji" autoComplete="off" value={emojiSearch} onChange={event => setEmojiSearch(event.target.value)} />
          </div>
          {filteredEmojis.length > 0 ? (
            <div className="emoji-picker-grid" role="grid" aria-label="Available emojis">
              {filteredEmojis.map(option => (
                <button key={`${option.emoji}-${option.name}`} className="emoji-option" type="button" role="gridcell" aria-label={`${option.name}: ${option.emoji}`} title={option.name} onClick={() => chooseEmoji(option.emoji)}>
                  {option.emoji}
                </button>
              ))}
            </div>
          ) : <div className="emoji-picker-empty">No emoji found</div>}
        </div>,
        document.body
      )}
    </>
  );
}
