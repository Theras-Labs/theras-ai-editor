// Ask Theras: the AI panel. Layout follows shadcn AI Elements (Message, Bubble, Trace,
// Prompt Input on Input Group with Attachment chips). Status and voice visuals come from
// libraries.dev: Thinking Orbs (AI status), Voice Ring (bubble mode) and Voice Glow
// (glow around the prompt while you speak); the spoken-input waveform is ElevenLabs UI.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  ArrowUpIcon,
  CircleAlert,
  FileText,
  History,
  Maximize2,
  MessageCircle,
  Mic,
  PanelRight,
  PictureInPicture2,
  PlusIcon,
  RectangleHorizontal,
  Square,
  SquarePen,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  Wrench,
  X
} from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { VoiceBeam } from "voice-glow";
import { VoiceRing } from "voice-ring";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { LiveWaveform } from "@/components/ui/elevenlabs/live-waveform";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from "@/components/ui/message-scroller";
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";
import { ChoicePopup, useChoiceRequest } from "@/components/editor-shell/ChoicePopup";
import { CopilotSettingsDialog } from "@/components/editor-shell/CopilotSettingsDialog";
import { PromptModelPicker } from "@/components/editor-shell/PromptModelPicker";
import { TherasIcon } from "@/components/editor-shell/icons";
import { contextToText, readAiContext, type AiContextItem } from "@/lib/ai-context";
import { ACCEPTED_FILES, readAttachment, type CopilotAttachment } from "@/lib/copilot/attachments";
import type { ConversationMeta } from "@/lib/copilot/chat-history";
import type { CopilotMessage, CopilotSession, CopilotToolCall } from "@/lib/copilot/types";
import { useVoiceInput } from "@/lib/copilot/voice";
import { openAskPrompt, type CopilotLayout } from "@/state/ask-theras";
import { speakableText, useSpeaker } from "@/lib/copilot/speech";
import { cn } from "@/lib/utils";

/** Where Ask Theras lives: beside the viewport, a window, a prompt bar only, or a bubble. */
export type { CopilotLayout } from "@/state/ask-theras";

export const ASSISTANT_NAME = "Ask Theras";

export type AskTherasProps = {
  layout?: CopilotLayout;
  onSetLayout?: (layout: CopilotLayout) => void;
  /** Floating mode: starts a window drag from the header. */
  onHeaderPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClose: () => void;
  /** Number of changes the last AI run made (the header undo icon). */
  lastRunChanges?: number;
  onUndoLastRun?: () => void;
  onSendMessage: (prompt: string, attachments?: CopilotAttachment[]) => void;
  /** "Refine with AI" on an instant library result: sends its prompt to the model. */
  onRefine?: (messageId: string, prompt: string) => void;
  onAbort: () => void;
  /** Starts a new chat; the current one stays in the history. */
  onClearHistory: () => void;
  onSettingsChanged: () => void;
  session: CopilotSession;
  isConfigured: boolean;
  conversations?: ConversationMeta[];
  conversationId?: string;
  onOpenConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
};

const SURFACE = "bg-[#0a1210]/60 backdrop-blur-2xl backdrop-saturate-150";
const BORDER = "border-white/10";

const LAYOUTS: { id: CopilotLayout; label: string; icon: typeof PanelRight }[] = [
  { id: "docked", label: "Dock beside the viewport", icon: PanelRight },
  { id: "floating", label: "Float as a window", icon: PictureInPicture2 },
  { id: "bar", label: "Prompt bar only", icon: RectangleHorizontal },
  { id: "bubble", label: "Voice orb: speak instead of typing", icon: MessageCircle }
];

const SUGGESTIONS = [
  "Make a cozy island with a windmill on the hill",
  "Set a golden hour sky and add lanterns",
  "Organize the scene tree into folders"
];

function busyOf(session: CopilotSession) {
  return session.status === "thinking" || session.status === "executing";
}

type NextStep = NonNullable<CopilotMessage["suggestions"]>[number];

/** The next steps of the latest message, if it is an assistant message that has them. */
function latestSuggestions(messages: CopilotMessage[]): { id: string; items: NextStep[] } | null {
  let last: CopilotMessage | undefined;
  for (let i = messages.length - 1; i >= 0 && !last; i--) if (messages[i].role !== "tool") last = messages[i];
  if (!last || last.role !== "assistant" || !last.suggestions?.length) return null;
  return { id: last.id, items: last.suggestions };
}

/** "Next" chips under the latest reply. A click sends the prompt like the text input does. */
function NextChips({ items, disabled, onPick, className }: { items: NextStep[]; disabled?: boolean; onPick: (prompt: string) => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <span className="mr-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground/80 uppercase">Next</span>
      {items.map((item, i) => (
        <button
          className={cn(
            "max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] text-foreground/80 transition-colors hover:border-emerald-300/40 hover:bg-emerald-400/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
            BORDER
          )}
          disabled={disabled}
          key={`${i}:${item.label}`}
          onClick={() => onPick(item.prompt)}
          title={item.prompt}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Compact segmented icon group, reui style: one border, thin dividers, 28 px buttons. */
function IconGroup({ children }: { children: ReactNode }) {
  return <div className={cn("flex items-center divide-x divide-white/10 overflow-hidden rounded-lg border bg-white/[0.03]", BORDER)}>{children}</div>;
}

function IconAction({ title, onClick, active, children, className }: { title: string; onClick?: () => void; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      className={cn(
        "relative flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground [&_svg]:size-3.5",
        active && "bg-white/10 text-foreground",
        className
      )}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function LayoutGroup({ layout, onSetLayout }: { layout: CopilotLayout; onSetLayout?: (l: CopilotLayout) => void }) {
  if (!onSetLayout) return null;
  return (
    <IconGroup>
      {LAYOUTS.map(({ id, label, icon: Icon }) => (
        <IconAction active={layout === id} key={id} onClick={() => onSetLayout(id)} title={label}>
          <Icon />
        </IconAction>
      ))}
    </IconGroup>
  );
}

/** The AI's state as a Thinking Orb: searching while it thinks, shaping while it builds. */
function StatusOrb({ session, size = 20 }: { session: CopilotSession; size?: 20 | 64 }) {
  const state = session.status === "executing" ? "shaping" : session.status === "thinking" ? "searching" : "breathing";
  return <ThinkingOrb size={size} state={state} theme="dark" />;
}

// ── Prompt input ─────────────────────────────────────────────

/** shadcn Prompt Input: Input Group with context chips (Attachment), voice and send. */
export function PromptInput({
  isActive,
  isConfigured,
  onSend,
  onAbort,
  autoFocus,
  className,
  onSettingsChanged
}: {
  isActive: boolean;
  isConfigured: boolean;
  onSend: (text: string, attachments?: CopilotAttachment[]) => void;
  onAbort: () => void;
  autoFocus?: boolean;
  className?: string;
  /** Called after the provider or model picker saved a change. */
  onSettingsChanged?: () => void;
}) {
  const [input, setInput] = useState("");
  const [chips, setChips] = useState<AiContextItem[]>([]);
  const [files, setFiles] = useState<CopilotAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Images, video frames, code and 3D model outlines the model can read (lib/copilot/attachments.ts).
  const addFiles = async (list: FileList | File[]) => {
    setFileError(null);
    setReading(true);
    try {
      for (const file of Array.from(list)) {
        try {
          const parts = await readAttachment(file);
          setFiles((current) => [...current, ...parts].slice(0, 12));
        } catch (e) {
          setFileError(e instanceof Error ? e.message : String(e));
        }
      }
    } finally {
      setReading(false);
    }
  };
  const [dragOver, setDragOver] = useState(false);
  const voice = useVoiceInput((text) => setInput((current) => (current.trim() ? `${current.trim()} ${text}` : text)));
  const recording = voice.state === "recording";

  const submit = () => {
    const text = input.trim();
    if ((!text && chips.length === 0 && files.length === 0) || isActive || reading) return;
    const prefix = contextToText(chips);
    const body = text || (chips.length ? "What is this and how do I use it?" : "Look at the attached files.");
    onSend(prefix ? `${prefix} ${body}` : body, files.length ? files : undefined);
    setInput("");
    setChips([]);
    setFiles([]);
  };

  const field = (
    <InputGroup
      className={cn("rounded-xl border-white/12 bg-white/[0.05] transition-colors", dragOver && "border-emerald-300/60 bg-emerald-400/10", className)}
      onDragLeave={() => setDragOver(false)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-theras-context") || e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDrop={(e) => {
        setDragOver(false);
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          void addFiles(e.dataTransfer.files);
          return;
        }
        const item = readAiContext(e.dataTransfer);
        if (!item) return;
        e.preventDefault();
        setChips((current) => [...current.filter((c) => c.label !== item.label || c.kind !== item.kind), item]);
      }}
      onPaste={(e) => {
        const pasted = Array.from(e.clipboardData.files);
        if (pasted.length) {
          e.preventDefault();
          void addFiles(pasted);
        }
      }}
    >
      {chips.length > 0 || files.length > 0 ? (
        <InputGroupAddon align="block-start" className="pb-0">
          <AttachmentGroup className="flex flex-wrap gap-1">
            {files.map((file, i) => (
              <Attachment className="h-7 rounded-md bg-white/8 pr-0.5" key={`file:${file.name}:${i}`} size="xs" title={file.name}>
                <AttachmentMedia className="overflow-hidden">
                  {file.kind === "image" ? <img alt="" className="size-full object-cover" src={file.dataUrl} /> : <FileText />}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle className="max-w-32 truncate text-[11px]">{file.name}</AttachmentTitle>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction aria-label="Remove" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}>
                    <X />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
            {chips.map((chip, i) => (
              <Attachment className="h-7 rounded-md bg-emerald-500/12 pr-0.5" key={`${chip.kind}:${chip.label}:${i}`} size="xs" title={chip.detail}>
                <AttachmentContent>
                  <AttachmentTitle className="max-w-40 truncate text-[11px]">
                    <span className="text-emerald-300/80">{chip.kind}</span> {chip.label}
                  </AttachmentTitle>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction aria-label="Remove" onClick={() => setChips((c) => c.filter((_, j) => j !== i))}>
                    <X />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
          </AttachmentGroup>
        </InputGroupAddon>
      ) : null}

      {recording ? (
        <div className="flex h-11 w-full items-center px-3">
          <LiveWaveform active barColor="#6ee7b7" barGap={2} barWidth={2} className="w-full" height={28} mode="scrolling" />
        </div>
      ) : (
        <InputGroupTextarea
          autoFocus={autoFocus}
          data-theras-prompt
          className="max-h-32 min-h-11 text-[13px]"
          disabled={isActive || !isConfigured}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={isConfigured ? (chips.length ? "Ask about it, or say what to change" : "Describe what to build...") : "Set up the AI in settings first"}
          value={input}
        />
      )}

      <InputGroupAddon align="block-end" className="gap-1 pt-0">
        <InputGroupButton
          className="text-muted-foreground"
          disabled={reading}
          onClick={() => fileInputRef.current?.click()}
          size="icon-xs"
          title="Attach images, videos, code or glTF models. You can also drop files, paste images, or drag scene objects, slots and tools here."
          variant="ghost"
        >
          <PlusIcon />
        </InputGroupButton>
        <input
          accept={ACCEPTED_FILES}
          className="hidden"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />
        <PromptModelPicker onChanged={onSettingsChanged} />
        {reading ? <span className="text-[10px] text-muted-foreground">Reading files...</span> : null}
        {fileError ? <span className="flex items-center gap-1 truncate text-[10px] text-rose-300"><CircleAlert className="size-3 shrink-0" />{fileError}</span> : null}
        {voice.error ? <span className="flex items-center gap-1 text-[10px] text-rose-300"><CircleAlert className="size-3" />{voice.error}</span> : null}
        {recording ? <span className="text-[10px] text-emerald-300">Listening... click stop when done</span> : null}
        {voice.state === "transcribing" ? <span className="text-[10px] text-muted-foreground">Turning speech into text...</span> : null}
        <div className="ml-auto flex items-center gap-1">
          {voice.supported ? (
            <InputGroupButton
              className={cn(recording ? "bg-rose-500/80 text-white hover:bg-rose-500" : "text-muted-foreground")}
              disabled={isActive || !isConfigured || voice.state === "transcribing"}
              onClick={voice.toggle}
              size="icon-xs"
              title={recording ? "Stop and turn speech into text" : "Speak your prompt"}
              variant="ghost"
            >
              {recording ? <Square /> : <Mic />}
            </InputGroupButton>
          ) : null}
          {isActive ? (
            <InputGroupButton onClick={onAbort} size="icon-xs" title="Stop the AI" variant="destructive">
              <Square />
            </InputGroupButton>
          ) : (
            <InputGroupButton disabled={(!input.trim() && chips.length === 0 && files.length === 0) || !isConfigured || reading} onClick={submit} size="icon-xs" title="Send (Enter)" variant="default">
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </div>
      </InputGroupAddon>
    </InputGroup>
  );

  // Voice Glow: the field glows with your voice while recording.
  return recording && voice.stream ? (
    <VoiceBeam stream={voice.stream} type="pill">
      {field}
    </VoiceBeam>
  ) : (
    field
  );
}

// ── Messages ─────────────────────────────────────────────────

const CHIP_PREFIX = /^(\s*\[[^\]]*\])+\s*/;

function splitChips(text: string) {
  const match = CHIP_PREFIX.exec(text);
  if (!match) return { chips: [] as string[], body: text };
  const chips = [...match[0].matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]!.replace(/\s*\(.*\)$/, ""));
  return { chips, body: text.slice(match[0].length) };
}

function describeCall(call: CopilotToolCall) {
  const a = call.args as Record<string, unknown>;
  const name = typeof a.name === "string" ? a.name : typeof a.label === "string" ? a.label : typeof a.id === "string" ? a.id : "";
  return name ? `${call.name.replace(/_/g, " ")}: ${name}` : call.name.replace(/_/g, " ");
}

function ToolTrace({ calls, failed }: { calls: CopilotToolCall[]; failed: Set<string> }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of calls) m.set(c.name, (m.get(c.name) ?? 0) + 1);
    return [...m].map(([n, k]) => (k > 1 ? `${n.replace(/_/g, " ")} x${k}` : n.replace(/_/g, " "))).join(", ");
  }, [calls]);
  const errors = calls.filter((c) => failed.has(c.id)).length;
  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={errors ? "error" : undefined}>
            <TraceIcon>
              <Wrench />
            </TraceIcon>
            <TraceTitle>
              {calls.length} {calls.length === 1 ? "action" : "actions"}
              {errors ? `, ${errors} failed` : ""}
            </TraceTitle>
            <TraceDescription className="truncate">{counts}</TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="max-h-40 overflow-y-auto">
          {calls.map((call) => (
            <TraceLine className="text-xs" key={call.id} status={failed.has(call.id) ? "error" : undefined}>
              <TraceTitle>{describeCall(call)}</TraceTitle>
            </TraceLine>
          ))}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}

function MessageList({
  session,
  isConfigured,
  compact,
  onSuggest,
  onRefine
}: {
  session: CopilotSession;
  isConfigured: boolean;
  compact?: boolean;
  onSuggest?: (text: string) => void;
  onRefine?: (messageId: string, prompt: string) => void;
}) {
  const isActive = busyOf(session);
  const failed = useMemo(() => {
    const set = new Set<string>();
    for (const m of session.messages)
      for (const r of m.toolResults ?? []) {
        try {
          if ((JSON.parse(r.result) as { success?: boolean }).success === false) set.add(r.callId);
        } catch {
          // not JSON
        }
      }
    return set;
  }, [session.messages]);
  const visible = session.messages.filter((m) => m.role !== "tool");
  const shown = compact ? visible.slice(-2) : visible;
  const next = isActive || !onSuggest ? null : latestSuggestions(session.messages);

  if (visible.length === 0 && !isActive) {
    if (compact) return null;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <ThinkingOrb size={64} state="breathing" theme="dark" />
        <div>
          <div className="text-sm font-medium text-foreground/90">What should we build?</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{isConfigured ? "Describe a world, or drop objects here to ask about them." : "Set up the AI in settings to get started."}</div>
        </div>
        {onSuggest && isConfigured ? (
          <div className="flex flex-col gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button className={cn("rounded-lg border px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-white/6 hover:text-foreground", BORDER)} key={s} onClick={() => onSuggest(s)} type="button">
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <MessageScrollerProvider>
      <MessageScroller className={compact ? "max-h-56" : "min-h-0 flex-1"}>
        <MessageScrollerViewport>
          <MessageScrollerContent className="gap-4 px-3 py-3">
            {shown.map((message) => (
              <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
                <ChatMessage failed={failed} message={message} onRefine={isActive ? undefined : onRefine} />
                {next && next.id === message.id && onSuggest ? <NextChips className="mt-2" disabled={isActive} items={next.items} onPick={onSuggest} /> : null}
              </MessageScrollerItem>
            ))}
            {isActive ? (
              <MessageScrollerItem messageId="__status">
                <TraceLine status="running">
                  <TraceIcon>
                    <StatusOrb session={session} size={20} />
                  </TraceIcon>
                  <TraceTitle>
                    {session.status === "executing" ? "Building" : "Thinking"}
                    {session.iterationCount > 1 ? ` (step ${session.iterationCount})` : ""}
                  </TraceTitle>
                </TraceLine>
              </MessageScrollerItem>
            ) : null}
            {session.status === "error" && session.error ? (
              <MessageScrollerItem messageId="__error">
                <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {session.error}
                </div>
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

/** Short metrics line for the chat trace (plan 4.8). */
function metricsLine(m: NonNullable<CopilotMessage["metrics"]>) {
  const parts = [m.tier === 0 ? "instant" : `tier ${m.tier}`, m.profile, m.model];
  if (m.steps) parts.push(`${m.steps} step${m.steps === 1 ? "" : "s"}`);
  if (m.firstToolMs !== null) parts.push(`first ${(m.firstToolMs / 1000).toFixed(1)} s`);
  parts.push(`total ${(m.totalMs / 1000).toFixed(1)} s`);
  if (m.usage) parts.push(`${m.usage.input} in / ${m.usage.cached} cached / ${m.usage.output} out`);
  return parts.join(" · ");
}

function ChatMessage({ message, failed, onRefine }: { message: CopilotMessage; failed: Set<string>; onRefine?: (messageId: string, prompt: string) => void }) {
  if (message.role === "user") {
    const { chips, body } = splitChips(message.content);
    return (
      <Message align="end">
        <MessageContent className="items-end gap-1">
          {chips.length ? (
            <div className="flex flex-wrap justify-end gap-1">
              {chips.map((c) => (
                <span className="rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[10px] text-emerald-200" key={c}>
                  {c}
                </span>
              ))}
            </div>
          ) : null}
          {message.attachments?.length ? (
            <div className="flex flex-wrap justify-end gap-1">
              {message.attachments.map((a, i) =>
                a.kind === "image" ? (
                  <img alt={a.name} className={cn("size-16 rounded-lg border object-cover", BORDER)} key={`${a.name}:${i}`} src={a.dataUrl} title={a.name} />
                ) : (
                  <span className="flex items-center gap-1 rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] text-foreground/80" key={`${a.name}:${i}`}>
                    <FileText className="size-3" />
                    {a.name}
                  </span>
                )
              )}
            </div>
          ) : null}
          <Bubble align="end" variant="muted">
            <BubbleContent className="bg-white/10 text-[13px] text-foreground">{body}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }
  return (
    <Message>
      <MessageContent className="gap-2">
        {message.toolCalls?.length ? <ToolTrace calls={message.toolCalls} failed={failed} /> : null}
        {message.content ? <Markdown content={message.content} /> : null}
        {message.refinePrompt && onRefine ? (
          <button
            className={cn("self-start rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-white/6 hover:text-foreground", BORDER)}
            onClick={() => onRefine(message.id, message.refinePrompt!)}
            title="Undo this placement and ask the AI to build it"
            type="button"
          >
            Refine with AI
          </button>
        ) : null}
        {message.metrics ? <div className="text-[10px] text-muted-foreground/70">{metricsLine(message.metrics)}</div> : null}
      </MessageContent>
    </Message>
  );
}

function Markdown({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return <div className="copilot-markdown text-[13px] leading-relaxed text-foreground/85" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── History ──────────────────────────────────────────────────

function ConversationList({
  conversations,
  currentId,
  onOpen,
  onDelete,
  onNew
}: {
  conversations: ConversationMeta[];
  currentId?: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <Button className="w-full justify-start" onClick={onNew} size="sm" variant="outline">
          <SquarePen /> New chat
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">No saved chats yet.</p> : null}
        {conversations.map((c) => (
          <div className={cn("group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5", c.id === currentId ? "bg-white/8" : "hover:bg-white/5")} key={c.id} onClick={() => onOpen(c.id)}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-foreground/90">{c.title}</div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(c.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {c.messageCount}
              </div>
            </div>
            <button
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:text-rose-300 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
              title="Delete this chat"
              type="button"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────

function Header(props: AskTherasProps & { historyOpen: boolean; onToggleHistory: () => void; draggable?: boolean }) {
  const { session, lastRunChanges = 0, onUndoLastRun } = props;
  const isActive = busyOf(session);
  return (
    <div
      className={cn("flex h-11 shrink-0 items-center gap-2 border-b px-2.5", BORDER, props.draggable && "cursor-grab select-none active:cursor-grabbing")}
      onPointerDown={props.onHeaderPointerDown}
    >
      <TherasIcon className="size-4 shrink-0 text-emerald-300" />
      <span className="truncate text-[13px] font-medium text-foreground/90">{ASSISTANT_NAME}</span>
      {isActive ? <StatusOrb session={session} /> : null}
      <div className="ml-auto flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <IconGroup>
          {props.onOpenConversation ? (
            <IconAction active={props.historyOpen} onClick={props.onToggleHistory} title="Chat history">
              <History />
            </IconAction>
          ) : null}
          <IconAction onClick={props.onClearHistory} title="New chat">
            <SquarePen />
          </IconAction>
          {lastRunChanges > 0 && !isActive && onUndoLastRun ? (
            <IconAction onClick={onUndoLastRun} title={`Undo the last AI run (${lastRunChanges} changes)`}>
              <Undo2 />
              <span className="absolute right-0.5 top-0.5 min-w-3 rounded-full bg-emerald-400 px-0.5 text-[7px] font-bold leading-3 text-black">{lastRunChanges > 99 ? "99" : lastRunChanges}</span>
            </IconAction>
          ) : null}
          <CopilotSettingsDialog onSaved={props.onSettingsChanged} />
        </IconGroup>
        <LayoutGroup layout={props.layout ?? "docked"} onSetLayout={props.onSetLayout} />
        <IconGroup>
          <IconAction onClick={props.onClose} title="Close">
            <X />
          </IconAction>
        </IconGroup>
      </div>
    </div>
  );
}

// ── Layouts ──────────────────────────────────────────────────

/** Full panel (docked or floating window). */
export function CopilotPanel(props: AskTherasProps) {
  const { layout = "docked", session, isConfigured } = props;
  const [historyOpen, setHistoryOpen] = useState(false);
  const isActive = busyOf(session);
  return (
    <div
      className={cn(
        "relative flex h-full flex-col text-foreground",
        SURFACE,
        layout === "floating" ? cn("overflow-hidden rounded-xl border shadow-[0_20px_60px_rgba(0,0,0,0.5)]", BORDER) : cn("border-l", BORDER)
      )}
    >
      <Header {...props} draggable={layout === "floating"} historyOpen={historyOpen} onToggleHistory={() => setHistoryOpen(!historyOpen)} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <MessageList isConfigured={isConfigured} onRefine={props.onRefine} onSuggest={props.onSendMessage} session={session} />
        {historyOpen && props.conversations && props.onOpenConversation ? (
          <div className={cn("absolute inset-0 z-10", SURFACE, "bg-[#0a1210]/90")}>
            <ConversationList
              conversations={props.conversations}
              currentId={props.conversationId}
              onDelete={(id) => props.onDeleteConversation?.(id)}
              onNew={() => {
                props.onClearHistory();
                setHistoryOpen(false);
              }}
              onOpen={(id) => {
                props.onOpenConversation?.(id);
                setHistoryOpen(false);
              }}
            />
          </div>
        ) : null}
        {/* Choice popup over the bottom of the messages; the wrapper lets clicks through above the card. */}
        <ChoicePopup placement="panel" />
      </div>
      <div className="shrink-0 p-2.5 pt-0">
        <PromptInput autoFocus isActive={isActive} isConfigured={isConfigured} onAbort={props.onAbort} onSend={props.onSendMessage} onSettingsChanged={props.onSettingsChanged} />
        <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
          <span>Enter to send, Shift Enter for a new line</span>
          <span className="flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> prompt bar
          </span>
        </div>
      </div>
    </div>
  );
}

/** Prompt bar only: the input plus the latest reply, above the build dock. */
export function PromptBar(props: AskTherasProps) {
  const { session, isConfigured } = props;
  const isActive = busyOf(session);
  const hasReplies = session.messages.some((m) => m.role !== "tool");
  // While the choice popup is open, it takes the place of the replies so the bar stays on screen.
  const choiceOpen = !!useChoiceRequest();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-32 z-40 flex justify-center px-3">
      <div className={cn("pointer-events-auto flex w-[min(640px,100%)] flex-col overflow-hidden rounded-xl border shadow-[0_20px_60px_rgba(0,0,0,0.5)]", SURFACE, BORDER)}>
        {(hasReplies || isActive) && !choiceOpen ? (
          <MessageList compact isConfigured={isConfigured} onRefine={props.onRefine} onSuggest={props.onSendMessage} session={session} />
        ) : null}
        <ChoicePopup className="px-2.5 pt-2.5" placement="bar" />
        <div className="flex items-center gap-2 px-2.5 pt-2">
          <TherasIcon className="size-3.5 text-emerald-300" />
          <span className="text-[11px] font-medium text-foreground/80">{ASSISTANT_NAME}</span>
          {isActive ? <StatusOrb session={session} size={20} /> : null}
          <div className="ml-auto flex items-center gap-1.5">
            <IconGroup>
              <IconAction onClick={() => props.onSetLayout?.("floating")} title="Open the full panel">
                <Maximize2 />
              </IconAction>
            </IconGroup>
            <LayoutGroup layout="bar" onSetLayout={props.onSetLayout} />
            <IconGroup>
              <IconAction onClick={props.onClose} title="Close">
                <X />
              </IconAction>
            </IconGroup>
          </div>
        </div>
        <div className="p-2.5">
          <PromptInput autoFocus isActive={isActive} isConfigured={isConfigured} onAbort={props.onAbort} onSend={props.onSendMessage} onSettingsChanged={props.onSettingsChanged} />
        </div>
      </div>
    </div>
  );
}

/** The level (0 to 1) that moves the voice ring while it waits: two slow waves, like breathing. */
function idleRingLevel(): number {
  const t = performance.now() / 1000;
  return 0.24 + 0.15 * Math.sin(t * 0.9) + 0.08 * Math.sin(t * 2.3 + 1.3);
}

/**
 * Voice orb (bubble mode): click and speak; it sends your words to the AI and speaks the
 * reply. Right-click opens the layout menu. The Voice Ring follows your voice while it
 * listens and the AI's voice while it answers.
 */
export function PromptBubble(props: AskTherasProps) {
  const { session } = props;
  const busy = busyOf(session);
  const speaker = useSpeaker();
  const [caption, setCaption] = useState<{ who: "you" | "ai"; text: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(() => {
    try {
      return localStorage.getItem("theras:voice-replies") !== "off";
    } catch {
      return true;
    }
  });
  // Set when a spoken question is sent: the message count at that time, and whether the run has started.
  // The reply is spoken only after the run started and ended, and only if it is newer than the question.
  const awaitingReply = useRef<{ since: number; started: boolean } | null>(null);
  const heardSpeech = useRef(false);
  const quietSince = useRef(0);

  // Spoken words and "Next" chips go the same way: show them, send them, speak the reply.
  const send = (text: string) => {
    setCaption({ who: "you", text });
    awaitingReply.current = { since: session.messages.length, started: false };
    props.onSendMessage(text);
  };
  const voice = useVoiceInput(send);
  const listening = voice.state === "recording";

  // No microphone (the browser blocked it, or there is none): the orb cannot hear, so the
  // text prompt opens instead. The user is never left with a control that does nothing.
  useEffect(() => {
    if (!voice.unavailable) return;
    toast("The microphone is not available here. The text prompt is open instead.");
    openAskPrompt();
  }, [voice.unavailable]);

  // Stop listening by itself after a short silence that follows speech.
  useEffect(() => {
    if (!listening) {
      heardSpeech.current = false;
      quietSince.current = 0;
      return;
    }
    const level = voice.levels[voice.levels.length - 1] ?? 0;
    if (level > 0.12) {
      heardSpeech.current = true;
      quietSince.current = 0;
    } else if (heardSpeech.current) {
      if (!quietSince.current) quietSince.current = performance.now();
      else if (performance.now() - quietSince.current > 1300) voice.stop();
    }
  }, [listening, voice, voice.levels]);

  // When the AI has answered, show the reply and speak it.
  useEffect(() => {
    const waiting = awaitingReply.current;
    if (!waiting) return;
    if (session.status === "error") {
      awaitingReply.current = null;
      setCaption({ who: "ai", text: session.error ?? "Something went wrong." });
      return;
    }
    if (busy) {
      waiting.started = true;
      return;
    }
    if (!waiting.started || session.status !== "idle") return;
    awaitingReply.current = null;
    const last = session.messages.slice(waiting.since).reverse().find((m) => m.role === "assistant" && m.content.trim());
    if (!last) return;
    const text = speakableText(last.content);
    setCaption({ who: "ai", text });
    if (voiceReplies) void speaker.speak(text);
  }, [busy, session.error, session.messages, session.status, speaker, voiceReplies]);

  const state = listening ? "listening" : speaker.speaking ? "speaking" : busy || voice.state === "transcribing" ? "processing" : "idle";
  const status =
    state === "listening"
      ? "Listening..."
      : voice.state === "transcribing"
        ? "Got it..."
        : busy
          ? session.status === "executing"
            ? "Building..."
            : "Thinking..."
          : state === "speaking"
            ? null
            : null;

  const onClick = () => {
    setMenu(null);
    if (speaker.speaking) return speaker.stop();
    if (listening) return voice.stop();
    if (busy || voice.state === "transcribing") return;
    if (!voice.supported) {
      toast("This browser cannot record voice. The text prompt is open instead.");
      return openAskPrompt();
    }
    setCaption(null);
    void voice.start();
  };

  const toggleReplies = () => {
    const next = !voiceReplies;
    setVoiceReplies(next);
    try {
      localStorage.setItem("theras:voice-replies", next ? "on" : "off");
    } catch {
      // per-viewer convenience only
    }
    if (!next) speaker.stop();
  };

  const menuItem = "flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-[12px] text-foreground/85 hover:bg-white/8";
  const next = busy || listening ? null : latestSuggestions(session.messages);
  const showCaption = status || caption || voice.error || speaker.error || next;

  return (
    <div className="pointer-events-none fixed bottom-32 right-5 z-40 flex items-center gap-3">
      <ChoicePopup placement="bubble" />
      {showCaption ? (
        <div className={cn("pointer-events-auto max-w-72 rounded-xl border px-3 py-2 text-[12px] shadow-lg", SURFACE, BORDER)}>
          {status ? <div className="text-[11px] font-medium text-emerald-300">{status}</div> : null}
          {caption ? (
            <div className="line-clamp-4 text-foreground/85">
              <span className="text-muted-foreground">{caption.who === "you" ? "You: " : ""}</span>
              {caption.text}
            </div>
          ) : null}
          {voice.error || speaker.error ? <div className="text-[11px] text-rose-300">{voice.error ?? speaker.error}</div> : null}
          {next ? <NextChips className={caption || status ? "mt-1.5" : undefined} disabled={busy} items={next.items} onPick={send} /> : null}
        </div>
      ) : null}
      <button
        aria-label={`${ASSISTANT_NAME} voice`}
        // The ring is the whole control: no plate, border or shadow around it.
        className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-transparent outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-emerald-300/40"
        data-no-ai-drag
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        title={
          listening
            ? "Listening. Click to send now."
            : speaker.speaking
              ? "Click to stop speaking"
              : "Click and speak to Ask Theras. Right-click for more."
        }
        type="button"
      >
        <VoiceRing
          // Waiting: the library's own "idle" state is a drift too small to see at 64 px, so the
          // ring looked like a still picture. While it waits, the ring gets a slow level of its
          // own (idleRingLevel) and bends and turns a little. A real voice moves it much more.
          level={speaker.speaking ? speaker.level : state === "idle" ? idleRingLevel : undefined}
          size={64}
          state={state === "idle" ? "speaking" : state}
          stream={listening ? (voice.stream ?? undefined) : undefined}
          theme="dark"
        />
      </button>
      {menu
        ? createPortal(
            <div className="fixed inset-0 z-[90]" onPointerDown={() => setMenu(null)}>
              <div
                className={cn("fixed w-max min-w-52 overflow-hidden rounded-xl border py-1 shadow-2xl", SURFACE, BORDER, "bg-[#0a1210]/90")}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ left: Math.min(menu.x - 220, window.innerWidth - 230), top: Math.max(8, menu.y - 230) }}
              >
                {LAYOUTS.filter((l) => l.id !== "bubble").map(({ id, label, icon: Icon }) => (
                  <button className={menuItem} key={id} onClick={() => { setMenu(null); props.onSetLayout?.(id); }} type="button">
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
                <div className="my-1 h-px bg-white/10" />
                <button className={menuItem} onClick={toggleReplies} type="button">
                  {voiceReplies ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                  {voiceReplies ? "Turn spoken replies off" : "Turn spoken replies on"}
                </button>
                <button className={menuItem} onClick={() => { setMenu(null); props.onClearHistory(); setCaption(null); }} type="button">
                  <SquarePen className="size-3.5" /> New chat
                </button>
                <button className={menuItem} onClick={() => { setMenu(null); speaker.stop(); props.onClose(); }} type="button">
                  <X className="size-3.5" /> Close
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);

  // headings
  html = html.replace(/^#### (.+)$/gm, '<h4 class="mt-2 mb-0.5 text-[11px] font-semibold text-foreground/80">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="mt-2 mb-0.5 text-xs font-semibold text-foreground/85">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="mt-2 mb-0.5 text-xs font-bold text-foreground/90">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="mt-2 mb-0.5 text-[13px] font-bold text-foreground/92">$1</h1>');

  // code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre class="my-1 rounded-lg bg-white/[0.06] px-2 py-1.5 text-[10px] leading-snug overflow-x-auto"><code>${code.trim()}</code></pre>`
  );

  // inline code
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-white/[0.08] px-1 py-px text-[10px] text-emerald-200">$1</code>');

  // bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground/88">$1</strong>');

  // italic
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  // unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ml-3 list-disc">$1</li>');
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="my-1 space-y-0.5">$1</ul>');

  // ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-3 list-decimal">$1</li>');
  html = html.replace(/((?:<li class="ml-3 list-decimal">.*<\/li>\n?)+)/g, '<ul class="my-1 space-y-0.5">$1</ul>');

  // paragraphs (double newlines)
  html = html.replace(/\n\n+/g, '</p><p class="mt-1.5">');
  html = `<p>${html}</p>`;

  // single newlines to <br> (but not inside pre)
  html = html.replace(/(?<!<\/pre>)\n(?!<)/g, "<br>");

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

