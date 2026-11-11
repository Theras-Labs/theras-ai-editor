// Saved AI conversations ("chat folders"). The panel talks only to ChatHistoryStore, so the
// browser storage below can be swapped for a server or database store later:
// call setChatHistoryStore(yourStore) once at start-up.
import type { CopilotMessage } from "./types";
import { otherTabsOpen } from "@/lib/tab-session";

export type ConversationMeta = { id: string; title: string; createdAt: number; updatedAt: number; messageCount: number };
export type Conversation = ConversationMeta & { messages: CopilotMessage[] };

export interface ChatHistoryStore {
  list(): ConversationMeta[];
  load(id: string): Conversation | null;
  save(conversation: Conversation): void;
  remove(id: string): void;
  getCurrentId(): string | null;
  setCurrentId(id: string | null): void;
}

// Each project has its own list and its own open chat. The scope is the project slug; set it
// with setChatScope when a project opens. Chats saved before scopes existed (the old
// "theras:chats:index") are not shown in any project.
let scope = "untitled-scene";
const indexKey = () => `theras:chats:p:${scope}:index`;
const currentKey = () => `theras:chats:p:${scope}:current`;
const chatKey = (id: string) => `theras:chats:${id}`;

/** sessionStorage and localStorage, when the browser gives them (not in tests, not when blocked). */
function browserStores(): Storage[] {
  const out: Storage[] = [];
  try {
    out.push(sessionStorage);
  } catch {
    // none
  }
  try {
    out.push(localStorage);
  } catch {
    // none
  }
  return out;
}

export function setChatScope(next: string) {
  scope = next || "untitled-scene";
}

export function chatScope() {
  return scope;
}
const MAX_CONVERSATIONS = 50;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Browser storage (localStorage). Per viewer; it can be cleared by the browser. */
export const localChatHistory: ChatHistoryStore = {
  list() {
    return readJson<ConversationMeta[]>(indexKey(), []).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  load(id) {
    return readJson<Conversation | null>(chatKey(id), null);
  },
  save(conversation) {
    const meta: ConversationMeta = {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length
    };
    const write = (c: Conversation) => localStorage.setItem(chatKey(c.id), JSON.stringify(c));
    try {
      write(conversation);
    } catch {
      // Storage full: keep the text, drop the provider's raw reasoning parts, and try again.
      try {
        write({ ...conversation, messages: conversation.messages.map(({ rawParts: _raw, ...m }) => m) });
      } catch {
        // Still full: keep only the names of attached images.
        try {
          write({
            ...conversation,
            messages: conversation.messages.map(({ rawParts: _raw, ...m }) => ({
              ...m,
              attachments: m.attachments?.map((a) => (a.kind === "image" ? { kind: "text" as const, name: a.name, text: `[image: ${a.name}]` } : a))
            }))
          });
        } catch {
          return;
        }
      }
    }
    const index = this.list().filter((c) => c.id !== conversation.id);
    index.unshift(meta);
    for (const old of index.splice(MAX_CONVERSATIONS)) localStorage.removeItem(chatKey(old.id));
    try {
      localStorage.setItem(indexKey(), JSON.stringify(index));
    } catch {
      // index stays as it was
    }
  },
  remove(id) {
    try {
      localStorage.removeItem(chatKey(id));
      localStorage.setItem(indexKey(), JSON.stringify(this.list().filter((c) => c.id !== id)));
    } catch {
      // nothing to do
    }
  },
  // The open chat is kept per tab (sessionStorage) and per viewer (localStorage, the one
  // opened last). A reload keeps the tab's own chat. While another editor tab is open, a tab
  // with no chat of its own in this project starts a new one (the old ones stay in the list),
  // so two tabs never write into one chat.
  getCurrentId() {
    try {
      const own = sessionStorage.getItem(currentKey());
      if (own) return own;
    } catch {
      // no sessionStorage: the viewer's last chat
    }
    if (otherTabsOpen()) return null;
    try {
      return localStorage.getItem(currentKey());
    } catch {
      return null;
    }
  },
  setCurrentId(id) {
    for (const storage of browserStores()) {
      try {
        if (id) storage.setItem(currentKey(), id);
        else storage.removeItem(currentKey());
      } catch {
        // per-viewer convenience only
      }
    }
  }
};

let store: ChatHistoryStore = localChatHistory;

export function setChatHistoryStore(next: ChatHistoryStore) {
  store = next;
}

export function chatHistory(): ChatHistoryStore {
  return store;
}

export function newConversationId() {
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function titleFrom(messages: CopilotMessage[]) {
  // Leave out context chips ("[slot: 7 Gate (...)]") so the title is the question itself.
  const first = (messages.find((m) => m.role === "user")?.content ?? "").replace(/^(\s*\[[^\]]*\])+\s*/, "").trim();
  if (!first) return "New chat";
  return first.length > 48 ? `${first.slice(0, 47)}...` : first;
}
