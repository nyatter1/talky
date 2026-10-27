import React, { useCallback, useEffect, useRef, useState } from "react";
import "./local-voice.css";
import micOffIcon from "./assets/mic-off.svg";
import micIcon from "./assets/mic.svg";
import chatRoundIcon from "./assets/chat-round.svg";
import phoneIcon from "./assets/phone.svg";

export interface LocalVoiceRoomProps {
  channelName: string;
  displayName: string;
  username: string;
  avatar: string;
  chatPanel: React.ReactNode;
  onHangUp: () => void;
}

type MicrophoneState = "starting" | "ready" | "blocked" | "missing" | "error" | "left";

function MicrophoneIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      {muted ? (
        <path d="M8.46233 13.8534C8.13618 13.5981 7.66478 13.6555 7.40945 13.9817C7.15411 14.3078 7.21152 14.7792 7.53767 15.0346L8.46233 13.8534ZM17.4623 15.0346C17.7885 15.7792 17.8459 14.3078 17.5906 13.9817C17.3352 13.6555 16.8638 13.5981 16.5377 13.8534L17.4623 15.0346ZM13.25 16C13.25 15.5858 12.9142 15.25 12.5 15.25C12.0858 15.25 11.75 15.5858 11.75 16H13.25ZM11.75 19C11.75 19.4142 12.0858 19.75 12.5 19.75C12.9142 19.75 13.25 19.4142 13.25 19H11.75ZM19.5303 5.53033C19.8232 5.23744 19.8232 4.76256 19.5303 4.46967C19.2374 4.17678 18.7626 4.17678 18.4697 4.46967L19.5303 5.53033ZM10.4897 12.4497C10.1968 12.7425 10.1968 13.2174 10.4897 13.5103C10.7826 13.8032 11.2575 13.8032 11.5503 13.5103L10.4897 12.4497ZM4.46967 18.4697C4.17678 18.7626 4.17678 19.2374 4.46967 19.5303C4.76256 19.8232 5.23744 19.8232 5.53033 19.5303L4.46967 18.4697ZM11.5503 13.5103C11.8432 13.2174 11.8432 12.7425 11.5503 12.4497C11.2575 12.1569 10.7826 12.1569 10.4897 12.4497L11.5503 13.5103ZM11.526 12.4264C11.2202 12.1469 10.7458 12.1683 10.4664 12.474C10.1869 12.7798 10.2083 13.2542 10.514 13.5336L11.526 12.4264ZM12.5 13.556L12.4986 14.306C12.5037 14.306 12.5086 14.306 12.5139 14.3059L12.5 13.556ZM14.75 11.222H13.9999L14.0001 11.2355L14.75 11.222ZM15.5 9.25C15.5 8.83579 15.1642 8.5 14.75 8.5C14.3358 8.5 14 8.83579 14 9.25H15.5ZM9.5 10.274C9.5 10.6882 9.83579 11.024 10.25 11.024C10.6642 11.024 11 10.6882 11 10.274H9.5ZM10.25 7.334L11.0001 7.334L10.9999 7.32046L10.25 7.334ZM12.5 5L12.5057 4.25002C12.4991 4.24997 12.4926 4.25001 12.4861 4.25013L12.5 5ZM13.8253 6.59048C14.0061 6.96312 14.4548 7.11859 14.8275 6.93773C15.2001 6.75687 15.3556 6.30817 15.1747 5.93552L13.8253 6.59048ZM7.53767 15.0346C10.4524 17.3164 14.5476 17.3164 17.4623 15.0346L16.5377 13.8534C14.1661 15.7101 10.8339 15.7101 8.46233 13.8534L7.53767 15.0346ZM11.75 16V19H13.25V16H11.75ZM18.4697 4.46967L10.4897 12.4497L11.5503 13.5103L19.5303 5.53033L18.4697 4.46967ZM5.53033 19.5303L11.5503 13.5103L10.4897 12.4497L4.46967 18.4697L5.53033 19.5303ZM10.514 13.5336C11.0563 14.0292 11.764 14.3046 12.4986 14.306L12.5014 12.806C12.1403 12.8053 11.7925 12.67 11.526 12.4264L10.514 13.5336ZM12.5139 14.3059C14.1936 14.2746 15.5302 12.8882 15.4999 11.2085L14.0001 11.2355C14.0155 12.0873 13.3378 12.7903 12.4861 12.8061L12.5139 14.3059ZM15.5 11.222L15.5 9.25H14V11.222H15.5ZM11 10.274V7.334H9.5V10.274H11ZM10.9999 7.32046C10.9845 6.46875 11.6622 5.76571 12.5139 5.74987L12.4861 4.25013C10.8064 4.28136 9.46979 5.66785 9.50012 7.34754L10.9999 7.32046ZM12.4943 5.74998C13.0617 5.75428 13.5775 6.08003 13.8253 6.59048L15.1747 5.93552C14.6779 4.91189 13.6435 4.25864 12.5057 4.25002L12.4943 5.74998Z" fill="currentColor" />
      ) : (
        <>
          <path d="M14.75 7.33303V11.222C14.7728 12.4877 13.7657 13.5325 12.5 13.556C11.2343 13.5325 10.2271 12.4877 10.25 11.222V7.33303C10.2277 6.06772 11.2347 5.02357 12.5 5.00003C13.7653 5.02357 14.7723 6.06772 14.75 7.33303Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.46233 13.8534C8.13618 13.5981 7.66478 13.6555 7.40945 13.9817C7.15411 14.3078 7.21152 14.7792 7.53767 15.0346L8.46233 13.8534ZM17.4623 15.0346C17.7885 15.7792 17.8459 14.3078 17.5906 13.9817C17.3352 13.6555 16.8638 13.5981 16.5377 13.8534L17.4623 15.0346ZM13.25 16C13.25 15.5858 12.9142 15.25 12.5 15.25C12.0858 15.25 11.75 15.5858 11.75 16H13.25ZM11.75 19C11.75 19.4142 12.0858 19.75 12.5 19.75C12.9142 19.75 13.25 19.4142 13.25 19H11.75ZM7.53767 15.0346C10.4524 17.3164 14.5476 17.3164 17.4623 15.0346L16.5377 13.8534C14.1661 15.7101 10.8339 15.7101 8.46233 13.8534L7.53767 15.0346ZM11.75 16V19H13.25V16H11.75Z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function ChatIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M17 3.33782C15.5291 2.48697 13.8214 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22C17.5228 22 22 17.5228 22 12C22 10.1786 21.513 8.47087 20.6622 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 12h8M8 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

function PhoneIcon() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="M1 5V1H7V5L4.5 7.5L8.5 11.5L11 9H15V15H11C5.47715 15 1 10.5228 1 5Z" fill="currentColor" /></svg>;
}

function IconAsset({ src, fallback }: { src: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <>{fallback}</>
    : <img src={src} alt="" aria-hidden="true" draggable="false" onError={() => setFailed(true)} />;
}

const getMicrophoneError = (error: unknown) => {
  if (!(error instanceof DOMException)) return "Could not access your microphone. Check your device and try again.";
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Microphone access was blocked. Allow it in your browser, then try again.";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "No microphone was found. Connect one and try again.";
  }
  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return "Your microphone is busy in another app. Close that app and try again.";
  }
  return "Could not access your microphone. Check your device and try again.";
};

export function LocalVoiceRoom({
  channelName,
  displayName,
  username,
  avatar,
  chatPanel,
  onHangUp,
}: LocalVoiceRoomProps) {
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("starting");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [microphoneError, setMicrophoneError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const microphoneAttemptRef = useRef(0);
  const speakingRef = useRef(false);

  const stopMicrophone = useCallback(() => {
    microphoneAttemptRef.current += 1;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
    speakingRef.current = false;
  }, []);

  const startMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneState("missing");
      setMicrophoneEnabled(false);
      setMicrophoneError("Microphone access needs a secure page (HTTPS or localhost) and browser support.");
      return;
    }

    const attempt = ++microphoneAttemptRef.current;
    setMicrophoneState("starting");
    setMicrophoneError("");
    setIsSpeaking(false);

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (attempt !== microphoneAttemptRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("No audio input track was returned.");
      const AudioContextConstructor = window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("Audio level monitoring is unavailable in this browser.");

      audioContext = new AudioContextConstructor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      if (attempt !== microphoneAttemptRef.current) {
        stream.getTracks().forEach(item => item.stop());
        if (audioContext.state !== "closed") void audioContext.close().catch(() => undefined);
        return;
      }

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      setMicrophoneEnabled(track.enabled);
      setMicrophoneState("ready");

      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        const activeAnalyser = analyserRef.current;
        if (!activeAnalyser) return;
        activeAnalyser.getByteTimeDomainData(samples);
        let sumSquares = 0;
        for (const sample of samples) {
          const value = (sample - 128) / 128;
          sumSquares += value * value;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        const speaking = track.enabled && rms > 0.045;
        if (speaking !== speakingRef.current) {
          speakingRef.current = speaking;
          setIsSpeaking(speaking);
        }
        animationFrameRef.current = requestAnimationFrame(measure);
      };
      measure();
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch(() => undefined);
      }
      if (attempt !== microphoneAttemptRef.current) return;
      setMicrophoneState(error instanceof DOMException && error.name === "NotAllowedError" ? "blocked" : "error");
      setMicrophoneEnabled(false);
      setIsSpeaking(false);
      setMicrophoneError(getMicrophoneError(error));
    }
  }, []);

  useEffect(() => {
    void startMicrophone();
    return stopMicrophone;
  }, [startMicrophone, stopMicrophone]);

  const toggleMicrophone = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) {
      void startMicrophone();
      return;
    }
    track.enabled = !track.enabled;
    setMicrophoneEnabled(track.enabled);
    if (!track.enabled) {
      speakingRef.current = false;
      setIsSpeaking(false);
    }
  };

  const hangUp = () => {
    stopMicrophone();
    setMicrophoneState("left");
    setMicrophoneEnabled(false);
    setIsSpeaking(false);
    onHangUp();
  };

  const canRetry = microphoneState === "blocked" || microphoneState === "missing" || microphoneState === "error";
  const statusText = microphoneState === "starting"
    ? "Connecting microphone…"
    : microphoneState === "ready"
      ? microphoneEnabled ? "Microphone on" : "Microphone muted"
      : microphoneState === "left"
        ? "Disconnected"
        : "Microphone unavailable";

  return (
    <section className={`local-voice-room${chatOpen ? " has-chat" : ""}`} aria-label={`${channelName} voice channel`}>
      <main className="local-voice-stage">
        <header className="local-voice-header">
          <span className="local-voice-header-icon" aria-hidden="true">
            <IconAsset key={microphoneEnabled ? "mic-on" : "mic-off"} src={microphoneEnabled ? micIcon : micOffIcon} fallback={<MicrophoneIcon muted={!microphoneEnabled} />} />
          </span>
          <div className="local-voice-header-copy">
            <h2>{channelName}</h2>
            <span>{statusText}</span>
          </div>
          <span className="local-voice-local-badge">LOCAL TEST</span>
        </header>

        <div className="local-voice-content">
          <div className="local-voice-participant" aria-label={`${displayName}, ${statusText}`}>
            <div className={`local-voice-avatar${isSpeaking ? " is-speaking" : ""}${!microphoneEnabled ? " is-muted" : ""}`}>
              {avatar ? <img src={avatar} alt="" /> : <span>{displayName.trim().charAt(0).toUpperCase() || "?"}</span>}
              <span className={`local-voice-mic-state${microphoneEnabled ? " is-on" : ""}`} aria-hidden="true">
                <IconAsset key={microphoneEnabled ? "mic-on" : "mic-off"} src={microphoneEnabled ? micIcon : micOffIcon} fallback={<MicrophoneIcon muted={!microphoneEnabled} />} />
              </span>
            </div>
            <div className="local-voice-participant-name">{displayName}</div>
            <div className="local-voice-participant-handle">@{username}</div>
          </div>

          <div className="local-voice-status" role="status" aria-live="polite">
            {microphoneState === "starting" && <span>Requesting microphone access…</span>}
            {microphoneError && (
              <span className="local-voice-error">
                {microphoneError}
                {canRetry && (
                  <button className="local-voice-retry" type="button" onClick={() => void startMicrophone()}>
                    Try again
                  </button>
                )}
              </span>
            )}
          </div>
        </div>

        <footer className="local-voice-controls" aria-label="Voice controls">
          <button
            className={`local-voice-control${microphoneEnabled ? "" : " is-muted"}`}
            type="button"
            aria-label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
            aria-pressed={!microphoneEnabled}
            title={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
            onClick={toggleMicrophone}
          >
            <IconAsset key={microphoneEnabled ? "mic-on" : "mic-off"} src={microphoneEnabled ? micIcon : micOffIcon} fallback={<MicrophoneIcon muted={!microphoneEnabled} />} />
          </button>

          <button
            className={`local-voice-control${chatOpen ? " is-active" : ""}`}
            type="button"
            aria-label={chatOpen ? "Close voice chat" : "Open voice chat"}
            aria-pressed={chatOpen}
            title={chatOpen ? "Close voice chat" : "Open voice chat"}
            onClick={() => setChatOpen(open => !open)}
          >
            <IconAsset src={chatRoundIcon} fallback={<ChatIcon />} />
          </button>

          <button
            className="local-voice-control is-hangup"
            type="button"
            aria-label="Leave voice channel"
            title="Leave voice channel"
            onClick={hangUp}
          >
            <IconAsset src={phoneIcon} fallback={<PhoneIcon />} />
          </button>
        </footer>
      </main>

      {chatOpen && (
        <aside className="local-voice-chat-panel" aria-label={`${channelName} voice chat`}>
          {chatPanel}
        </aside>
      )}
    </section>
  );
}
