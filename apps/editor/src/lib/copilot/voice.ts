// Voice input for the AI prompt: records the microphone in the browser and sends the audio
// to the Theras server (/api/ai/transcribe), which returns the text. Recording stops by
// itself after MAX_SECONDS.
import { useCallback, useEffect, useRef, useState } from "react";
import { getTherasApiUrl } from "./server-provider";

const MAX_SECONDS = 60;

export type VoiceState = "idle" | "recording" | "transcribing";

function pickMimeType(): string | undefined {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
}

export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  /** Recent microphone levels (0..1), newest last, for a live waveform. */
  const [levels, setLevels] = useState<number[]>([]);
  /** The live microphone stream while recording (for audio-reactive visuals). */
  const [stream, setStream] = useState<MediaStream | null>(null);
  /** True after the browser refused the microphone or has none (a text prompt is then the way in). */
  const [unavailable, setUnavailable] = useState(false);
  const meterRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const transcribe = useCallback(async (blob: Blob) => {
    const base = getTherasApiUrl();
    if (!base) {
      setError("No Theras server URL for voice input.");
      setState("idle");
      return;
    }
    setState("transcribing");
    try {
      const res = await fetch(`${base}/api/ai/transcribe`, {
        method: "POST",
        headers: { "content-type": blob.type || "audio/webm" },
        body: blob
      });
      const json = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const text = (json?.text ?? "").trim();
      if (text) onTextRef.current(text);
      else setError("No speech heard.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setState("idle");
    }
  }, []);

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setUnavailable(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(stream);
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      // Live level meter for the waveform.
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
          setLevels((prev) => [...prev.slice(-31), level]);
          if (meterRef.current) meterRef.current.raf = requestAnimationFrame(tick);
        };
        meterRef.current = { ctx, raf: requestAnimationFrame(tick) };
      } catch {
        // no meter; recording still works
      }
      recorder.onstop = () => {
        if (meterRef.current) {
          cancelAnimationFrame(meterRef.current.raf);
          void meterRef.current.ctx.close();
          meterRef.current = null;
        }
        setLevels([]);
        setStream(null);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        void transcribe(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
      timerRef.current = setTimeout(stop, MAX_SECONDS * 1000);
    } catch (e) {
      setError(e instanceof Error && e.name === "NotAllowedError" ? "Microphone access was blocked." : "Could not start the microphone.");
      setState("idle");
      setUnavailable(true);
    }
  }, [stop, transcribe]);

  useEffect(() => () => stop(), [stop]);

  return { state, error, levels, stream, supported, unavailable, start, stop, toggle: () => (state === "recording" ? stop() : state === "idle" ? void start() : undefined) };
}
