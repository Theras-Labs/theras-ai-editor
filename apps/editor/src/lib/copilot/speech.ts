// Spoken replies: the Theras server turns text into speech (/api/ai/speak); the browser
// plays it and measures the output level so the Voice Ring can move with the voice.
import { useCallback, useEffect, useRef, useState } from "react";
import { getTherasApiUrl } from "./server-provider";

/** Markdown reply -> a short plain sentence or two for speaking. */
export function speakableText(markdown: string, maxChars = 420) {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/^\s*[-\d.]+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  const cut = plain.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 80 ? cut.slice(0, end + 1) : `${cut}...`;
}

export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const levelRef = useRef(0);
  const ctxRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (ctxRef.current) {
      cancelAnimationFrame(ctxRef.current.raf);
      void ctxRef.current.ctx.close();
      ctxRef.current = null;
    }
    levelRef.current = 0;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stop();
      setError(null);
      const base = getTherasApiUrl();
      if (!base || !text.trim()) return;
      try {
        const res = await fetch(`${base}/api/ai/speak`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url);
        audioRef.current = audio;
        try {
          const ctx = new AudioContext();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          ctx.createMediaElementSource(audio).connect(analyser);
          analyser.connect(ctx.destination);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (const v of data) sum += ((v - 128) / 128) ** 2;
            levelRef.current = Math.min(1, Math.sqrt(sum / data.length) * 4);
            if (ctxRef.current) ctxRef.current.raf = requestAnimationFrame(tick);
          };
          ctxRef.current = { ctx, raf: requestAnimationFrame(tick) };
        } catch {
          // no level meter; the audio still plays
        }
        audio.onended = () => {
          URL.revokeObjectURL(url);
          stop();
        };
        setSpeaking(true);
        await audio.play();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        stop();
      }
    },
    [stop]
  );

  useEffect(() => stop, [stop]);

  return { speaking, error, speak, stop, level: () => levelRef.current };
}
