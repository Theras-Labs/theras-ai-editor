import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeImport, findProjectPaths, importProject, isPlainImportRequest, type ImportedProject } from "@/lib/projects/projects";
import { applyTemplate, projectTemplates, templateAvailable } from "@/lib/resources/templates";
import { gameStore, playerFocusPoint } from "@/lib/game/game-store";
import type { EditorCore } from "@theras/editor-core";
import type { CopilotMessage, CopilotProviderConfig, CopilotRunMetrics, CopilotSession, CopilotToolResult } from "@/lib/copilot/types";
import { runAgenticLoop, type LoopMetrics } from "@/lib/copilot/agentic-loop";
import { createCopilotProvider } from "@/lib/copilot/provider";
import { beginServerRun } from "@/lib/copilot/server-provider";
import { buildProfileSystemPrompt, buildSystemPrompt } from "@/lib/copilot/system-prompt";
import { asksForMissingTool, closingTextForStep, pickProfile, toolsForProfile, type ToolProfile } from "@/lib/copilot/tool-profiles";
import { buildSceneDigest, digestNodes } from "@/lib/copilot/scene-digest";
import { pickPlaybook, playbookToText } from "@/lib/copilot/playbooks";
import { hideGhost, resolveGhostAnchor, showGhost } from "@/lib/copilot/ghost-preview";
import { getResource } from "@/lib/resources/catalog";
import { buildInstantPlan } from "@/lib/copilot/instant-path";
import { uiStore } from "@/state/ui-store";
import { loadCopilotSettings, isCopilotConfigured, modelForStage } from "@/lib/copilot/settings";
import { runDirector, newDirectorMetrics } from "@/lib/copilot/director/run";
import { frameForSite, interiorCameraPose, roomViewOfSite } from "@/lib/copilot/frame-site";
import { vec3 } from "@theras/shared";
import { nounMatchesToText, resolveNouns } from "@/lib/copilot/director/brief";
import { scannedContext } from "@/lib/copilot/director/scanned";
import { GENERATORS } from "@/lib/copilot/director/generators";
import { COPILOT_TOOL_DECLARATIONS } from "@/lib/copilot/tool-declarations";
import { executeTool, type CopilotToolExecutionContext } from "@/lib/copilot/tool-executor";
import { hasPendingReveal, markBuildReveal } from "@/lib/build-reveal";
import { folderNameFromPrompt, groupNodes } from "@/lib/outliner";
import { chatHistory, chatScope, newConversationId, setChatScope, titleFrom, type ConversationMeta } from "@/lib/copilot/chat-history";
import { useSnapshot } from "valtio";
import { projectSessionStore } from "@/state/project-session-store";
import { attachmentsAsText, type CopilotAttachment } from "@/lib/copilot/attachments";
import type { CopilotToolCall } from "@/lib/copilot/types";

const BUILD_STEP_DELAY_MS = 140;

/** Resource kinds in the scene ("sky", "terrain", "water", "landmark", ...), for the playbook pick. */
function sceneKinds(editor: EditorCore): Set<string> {
  const kinds = new Set<string>();
  for (const node of editor.scene.nodes.values()) {
    if (node.metadata?.environment === true) kinds.add("sky");
    else if (node.metadata?.terrain === true) kinds.add("terrain");
    const resource = node.metadata?.resource;
    const kind = typeof resource === "string" ? getResource(resource)?.kind : undefined;
    if (kind) kinds.add(kind);
  }
  return kinds;
}

function msgId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The error text of a failed tool result, or null. */
function parseFailure(result: string): string | null {
  try {
    const parsed = JSON.parse(result) as { success?: boolean; error?: unknown };
    return parsed.success === false ? String(parsed.error ?? "unknown error") : null;
  } catch {
    return null;
  }
}

const EMPTY_SESSION: CopilotSession = {
  messages: [],
  status: "idle",
  iterationCount: 0
};

export function useCopilot(editor: EditorCore, toolContext: CopilotToolExecutionContext = {}) {
  // Chats belong to the open project. Set the scope during render, before any effect saves.
  const projectSlug = useSnapshot(projectSessionStore).projectSlug;
  if (chatScope() !== projectSlug) setChatScope(projectSlug);
  // Saved conversations: the last open one comes back after a reload.
  const [conversationId, setConversationId] = useState<string>(() => chatHistory().getCurrentId() ?? newConversationId());
  const [conversations, setConversations] = useState<ConversationMeta[]>(() => chatHistory().list());
  const [session, setSession] = useState<CopilotSession>(() => {
    const id = chatHistory().getCurrentId();
    const saved = id ? chatHistory().load(id) : null;
    return saved ? { messages: saved.messages, status: "idle", iterationCount: 0 } : EMPTY_SESSION;
  });
  const [configured, setConfigured] = useState(() => isCopilotConfigured());
  const abortRef = useRef<AbortController | null>(null);
  const codexThreadIdRef = useRef<string | undefined>(undefined);
  // Commands the last AI run added to the undo stack, so the whole run can be undone at once.
  const lastRunRef = useRef<Set<unknown>>(new Set());
  const [lastRunChanges, setLastRunChanges] = useState(0);
  // Message id of the last instant (Tier 0) result while that run is the last run.
  const lastInstantMessageRef = useRef<string | null>(null);

  // Save the conversation when the AI is not busy (one write per finished step).
  useEffect(() => {
    if (session.status === "thinking" || session.status === "executing") return;
    if (session.messages.length === 0) return;
    const existing = chatHistory().load(conversationId);
    chatHistory().save({
      id: conversationId,
      title: existing?.title && existing.title !== "New chat" ? existing.title : titleFrom(session.messages),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      messageCount: session.messages.length,
      messages: session.messages
    });
    chatHistory().setCurrentId(conversationId);
    setConversations(chatHistory().list());
  }, [conversationId, session.messages, session.status]);

  const busyRef = useRef(false);
  busyRef.current = session.status === "thinking" || session.status === "executing";
  // Another project opened: show that project's own chats.
  const loadedScopeRef = useRef(projectSlug);
  useEffect(() => {
    if (loadedScopeRef.current === projectSlug) return;
    console.info(`[chat] project ${loadedScopeRef.current} -> ${projectSlug}${busyRef.current ? " (AI run keeps its chat)" : ""}`);
    loadedScopeRef.current = projectSlug;
    // The AI itself opened the project (load_project, apply_template) during a run: that chat
    // belongs to the new project. Keep it open; it is saved there when the run ends.
    if (busyRef.current) return;
    hideGhost();
    abortRef.current?.abort();
    abortRef.current = null;
    codexThreadIdRef.current = undefined;
    const id = chatHistory().getCurrentId();
    const saved = id ? chatHistory().load(id) : null;
    setConversationId(saved ? saved.id : newConversationId());
    setSession(saved ? { messages: saved.messages, status: "idle", iterationCount: 0 } : EMPTY_SESSION);
    setConversations(chatHistory().list());
  }, [projectSlug]);

  useEffect(() => {
    const check = () => setConfigured(isCopilotConfigured());
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  const sendMessage = useCallback(
    async (prompt: string, attachments?: CopilotAttachment[], options: { skipInstant?: boolean } = {}) => {
      beginServerRun(); // one id for every model call of this prompt (hosted demo quota)
      const settings = loadCopilotSettings();
      const startedAt = performance.now();
      // Game mode: "here" is the point in front of the player, not the editor camera target.
      const cameraTarget = (gameStore.active ? playerFocusPoint() : undefined) ?? uiStore.viewports[uiStore.activeViewportId]?.camera.target;

      // Project import: folder paths in the message are scanned first (local server), so the
      // project's models and environment are in the library before any tool runs.
      const projectPaths = findProjectPaths(prompt);
      if (projectPaths.length > 0) {
        const base: CopilotMessage[] = [...session.messages, { id: msgId(), role: "user", content: prompt, timestamp: Date.now() }];
        setSession({ messages: base, status: "thinking", iterationCount: 0 });
        const lines: string[] = [];
        const loaded: ImportedProject[] = [];
        for (const path of projectPaths) {
          try {
            const project = await importProject(path);
            loaded.push(project);
            lines.push(describeImport(project));
          } catch (error) {
            lines.push(`Could not import ${path}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (isPlainImportRequest(prompt, projectPaths) || loaded.length === 0) {
          // Only an import: load the first project's environment at once (one undo step), no model call.
          const first = loaded[0];
          const template = first ? projectTemplates([first])[0] : undefined;
          if (template && templateAvailable(template)) {
            try {
              applyTemplate(editor, template.id, true);
              lines.push(`Loaded its environment (${template.environment?.name ?? template.name}) as a new scene. Undo brings back the scene before. It is also in Templates under "Your projects".`);
            } catch (error) {
              lines.push(`Could not load the environment: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else if (template) {
            lines.push(`Its environment (${template.environment?.name ?? template.name}) needs a place builder that is not in this build yet.`);
          } else if (first) {
            lines.push(
              first.models.length > 0
                ? `No environment builder matches this project. Its ${first.models.length} models are in the library under "Project: ${first.name}"; ask me to place them.`
                : "No environment builder or 3D model was found in this project."
            );
          }
          setSession({
            messages: [...base, { id: msgId(), role: "assistant", content: lines.join("\n\n"), timestamp: Date.now() }],
            status: "idle",
            iterationCount: 0
          });
          return;
        }
      }

      // Tier 0 (plan 4.7): a clear library match is placed at once, with no model call.
      const instant = !options.skipInstant && !attachments?.length ? buildInstantPlan(editor, prompt, cameraTarget) : null;

      if (!instant && !isCopilotConfigured(settings)) {
        setSession((prev) => ({
          ...prev,
          status: "error",
          error: settings.provider === "codex"
            ? 'Codex not configured. Run "codex login" in your terminal.'
            : "No API key configured. Open Ask Theras settings to add one."
        }));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const doneBefore = editor.commands.done.length;
      const nodesBefore = new Set(editor.scene.nodes.keys());
      setLastRunChanges(0);
      lastInstantMessageRef.current = null;

      // Run a tool and start the build reveal for every node it created.
      const runTool = (toolCall: CopilotToolCall) => {
        // Plan 5.10: the ghost ring goes away at the first tool call.
        hideGhost();
        const before = new Set(editor.scene.nodes.keys());
        const result = executeTool(editor, toolCall, toolContext);
        const added: string[] = [];
        // Tools that schedule their own reveal (slots, island) already marked their nodes.
        for (const id of editor.scene.nodes.keys()) if (!before.has(id) && !hasPendingReveal(id)) added.push(id);
        if (added.length > 0) markBuildReveal(added);
        return result;
      };

      let metrics: CopilotRunMetrics;
      let finalSession: CopilotSession | null = null;

      if (instant) {
        // Same executor, reveal and message shape as an AI step: assistant tool calls, tool results, then a short text.
        const base: CopilotMessage[] = [...session.messages, { id: msgId(), role: "user", content: prompt, timestamp: Date.now() }];
        const assistantId = msgId();
        const toolId = msgId();
        const executed: CopilotToolCall[] = [];
        const results: CopilotToolResult[] = [];
        let firstToolMs: number | null = null;
        const show = (status: CopilotSession["status"], tail: CopilotMessage[] = []) => {
          const messages: CopilotMessage[] = [
            ...base,
            { id: assistantId, role: "assistant", content: "", toolCalls: [...executed], timestamp: Date.now() },
            { id: toolId, role: "tool", content: "", toolResults: [...results], timestamp: Date.now() },
            ...tail
          ];
          const next: CopilotSession = { messages, status, iterationCount: 0 };
          setSession(next);
          return next;
        };
        for (const [i, call] of instant.calls.entries()) {
          if (controller.signal.aborted) break;
          const result = runTool(call);
          if (firstToolMs === null) firstToolMs = Math.round(performance.now() - startedAt);
          executed.push(call);
          results.push(result);
          show("executing");
          if (i < instant.calls.length - 1) await new Promise((resolve) => setTimeout(resolve, BUILD_STEP_DELAY_MS));
        }
        const failure = results.map((r) => parseFailure(r.result)).find(Boolean);
        metrics = { tier: 0, profile: "instant", model: "none", steps: 0, firstToolMs, totalMs: Math.round(performance.now() - startedAt) };
        const summaryId = msgId();
        lastInstantMessageRef.current = summaryId;
        finalSession = show(controller.signal.aborted ? "aborted" : "idle", [
          {
            id: summaryId,
            role: "assistant",
            content: failure ? `The library placement failed: ${failure}` : instant.summary,
            refinePrompt: prompt,
            metrics,
            timestamp: Date.now()
          }
        ]);
      } else {
        // Plan 5.10: a ghost ring at the anchor while the model thinks (client-only).
        const ghostNodes = digestNodes(editor);
        const ghost = resolveGhostAnchor(prompt, ghostNodes, [...editor.selection.ids], cameraTarget);
        showGhost(ghost.position, ghost.radius);
        const copilotProvider = createCopilotProvider(settings.provider);
        const isServer = settings.provider === "server";
        const providerConfig: CopilotProviderConfig = {
          apiKey: settings.provider === "gemini" ? settings.gemini.apiKey : "",
          // For "server": "" = the user's saved model (server-provider.ts), else the admin's default.
          model: settings.provider === "gemini" ? settings.gemini.model : settings.provider === "codex" ? settings.codex.model : "",
          temperature: settings.temperature
        };

        if (copilotProvider.kind === "session-based") {
          // Codex path: provider manages its own tool-calling loop
          let firstToolMs: number | null = null;
          finalSession = await copilotProvider.provider.runSession({
            messages: session.messages,
            // Codex takes text only: files go in as text (images as a short note).
            userPrompt: attachments?.length ? `${prompt}\n\n${attachmentsAsText(attachments)}` : prompt,
            tools: COPILOT_TOOL_DECLARATIONS,
            systemPrompt: buildSystemPrompt(editor),
            providerConfig,
            threadId: codexThreadIdRef.current,
            onThreadId: (threadId) => {
              codexThreadIdRef.current = threadId;
            },
            executeTool: (call) => {
              if (firstToolMs === null) firstToolMs = Math.round(performance.now() - startedAt);
              return runTool(call);
            },
            onUpdate: (updated) => {
              setSession({ ...updated, messages: [...updated.messages] });
            },
            signal: controller.signal
          });
          metrics = { tier: 2, profile: "legacy", model: providerConfig.model, steps: finalSession.iterationCount, firstToolMs, totalMs: Math.round(performance.now() - startedAt) };
        } else {
          // Theras server: the director (plan 5B) first; an "edit" brief goes to the tool loop.
          // Gemini: the tool loop unchanged (all tools, the legacy prompt, no digest).
          const selectionKinds = [...editor.selection.ids].map((id) => editor.scene.getNode(id)?.kind).filter((k): k is NonNullable<typeof k> => Boolean(k));
          const hasImage = Boolean(attachments?.some((a) => a.kind === "image"));
          const digest = isServer ? buildSceneDigest(editor, cameraTarget) : "";
          const nouns = isServer ? resolveNouns(prompt) : [];
          const nounText = isServer ? nounMatchesToText(nouns) : "";
          // Plan 6: scanned objects, only for a realistic object or a thing with no local match.
          // At most one request to the Theras server (1.5 s limit); "" in every other case.
          const scannedText = isServer ? await scannedContext(prompt, nouns) : "";

          /** The tool loop. note: director text for the context (understanding, chosen reading). */
          const runLoop = async (note?: string) => {
            const profile: ToolProfile | undefined = isServer ? pickProfile(prompt, hasImage, { kinds: selectionKinds }) : undefined;
            const tools = profile ? toolsForProfile(profile) : COPILOT_TOOL_DECLARATIONS;
            const loopMetrics: LoopMetrics = { startedAt, steps: 0, firstToolMs: null, profile: profile ?? "legacy" };
            // Plan 5.8: a design playbook goes after the scene digest (compose profile on the server only).
            const kinds = isServer && profile === "compose" ? sceneKinds(editor) : null;
            const playbook = kinds ? pickPlaybook(prompt, kinds) : null;
            if (playbook) console.info(`[AI-VIBE] playbook=${playbook.id}`);
            const loopSession = await runAgenticLoop(
              prompt,
              session.messages,
              {
                maxIterations: 25,
                provider: copilotProvider.provider,
                providerConfig: { ...providerConfig, profile },
                systemPrompt: profile ? buildProfileSystemPrompt(profile) : buildSystemPrompt(editor),
                tools,
                executeTool: runTool,
                toolDelayMs: BUILD_STEP_DELAY_MS,
                contextSuffix: isServer
                  ? [digest, nounText, ...(note ? [note] : []), ...(playbook && kinds ? [playbookToText(playbook, kinds)] : [])].join("\n\n")
                  : undefined,
                escalation:
                  profile && profile !== "full"
                    ? {
                        profile: "full",
                        systemPrompt: buildProfileSystemPrompt("full"),
                        tools: toolsForProfile("full"),
                        shouldEscalate: (text) => asksForMissingTool(text, tools)
                      }
                    : undefined,
                // Plan 9: no text-only final step after a compose step whose calls all succeeded.
                finishOnSuccess: isServer && profile === "compose" ? closingTextForStep : undefined,
                metrics: loopMetrics,
                onUpdate: (updated) => {
                  setSession({ ...updated, messages: [...updated.messages] });
                }
              },
              controller.signal,
              attachments
            );
            return { loopSession, loopMetrics, profile };
          };

          if (isServer) {
            const directorMetrics = newDirectorMetrics(startedAt);
            const kinds = sceneKinds(editor);
            const playbook = pickPlaybook(prompt, kinds);
            const outcome = await runDirector({
              editor,
              prompt,
              attachments,
              history: session.messages,
              provider: copilotProvider.provider,
              providerConfig,
              designModel: modelForStage(settings, "design") || undefined,
              context: [digest, nounText, ...(scannedText ? [scannedText] : []), ...(playbook ? [playbookToText(playbook, kinds)] : [])].join("\n\n"),
              anchor: { x: ghost.position.x, z: ghost.position.z },
              generators: GENERATORS,
              signal: controller.signal,
              onUpdate: (updated) => setSession({ ...updated, messages: [...updated.messages] }),
              onFirstStep: hideGhost,
              // The camera moves only when the present view does not show what was built.
              // An interior: the camera goes inside the room, at its entrance.
              onSite: (site) => {
                if (gameStore.active) return;
                const room = site.facts.interior ? roomViewOfSite(site.params, site.facts.interior.floorY) : null;
                for (const viewport of Object.values(uiStore.viewports)) {
                  if (viewport.projection !== "perspective") continue;
                  const pose = room ? interiorCameraPose(room) : frameForSite(viewport.camera, { center: site.facts.center, rect: site.facts.rect, height: site.facts.height });
                  if (!pose) continue;
                  viewport.camera.target = vec3(pose.target.x, pose.target.y, pose.target.z);
                  viewport.camera.position = vec3(pose.position.x, pose.position.y, pose.position.z);
                }
              },
              metrics: directorMetrics
            });
            const wait = directorMetrics.choiceWaitMs;
            if (outcome.kind === "edit") {
              const { loopSession, loopMetrics } = await runLoop(outcome.note);
              finalSession = loopSession;
              const u1 = directorMetrics.usage;
              const u2 = loopMetrics.usage;
              metrics = {
                tier: 2,
                profile: `brief>${loopMetrics.profile ?? "?"}`,
                model: loopMetrics.model ?? directorMetrics.model ?? "server",
                steps: loopMetrics.steps + directorMetrics.modelCalls,
                firstToolMs: loopMetrics.firstToolMs === null ? null : loopMetrics.firstToolMs - wait,
                totalMs: Math.round(performance.now() - startedAt) - wait,
                usage: u1 && u2 ? { input: u1.input + u2.input, cached: u1.cached + u2.cached, output: u1.output + u2.output } : (u2 ?? u1),
                briefMs: directorMetrics.briefMs ?? undefined,
                choiceWaitMs: wait
              };
            } else {
              finalSession = outcome.session;
              metrics = {
                tier: 1,
                profile: "director",
                model: directorMetrics.model ?? "server",
                steps: directorMetrics.modelCalls,
                firstToolMs: directorMetrics.firstStepMs,
                totalMs: Math.round(performance.now() - startedAt) - wait,
                usage: directorMetrics.usage,
                briefMs: directorMetrics.briefMs ?? undefined,
                choiceWaitMs: wait
              };
            }
          } else {
            const { loopSession, loopMetrics, profile } = await runLoop();
            finalSession = loopSession;
            metrics = {
              tier: profile === "compose" && !loopMetrics.escalated ? 1 : 2,
              profile: loopMetrics.profile ?? "legacy",
              model: loopMetrics.model ?? (providerConfig.model || "server"),
              steps: loopMetrics.steps,
              firstToolMs: loopMetrics.firstToolMs,
              totalMs: Math.round(performance.now() - startedAt),
              usage: loopMetrics.usage
            };
          }
        }
      }

      hideGhost();

      // Plan 4.8: one console line per prompt, and the numbers on the last assistant message.
      const u = metrics.usage;
      console.info(
        `[AI-VIBE] prompt tier=${metrics.tier} profile=${metrics.profile} model=${metrics.model} steps=${metrics.steps} ` +
          `first_tool=${metrics.firstToolMs === null ? "-" : `${metrics.firstToolMs}ms`} total=${metrics.totalMs}ms` +
          (u ? ` in=${u.input} cached=${u.cached} out=${u.output}` : "") +
          (metrics.briefMs !== undefined ? ` brief=${metrics.briefMs}ms` : "") +
          (metrics.choiceWaitMs ? ` choice_wait=${metrics.choiceWaitMs}ms(excluded)` : "") +
          ` status=${finalSession?.status ?? "?"}`
      );
      if (!instant && finalSession) {
        const messages = [...finalSession.messages];
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "user") break;
          if (messages[i].role === "assistant") {
            messages[i] = { ...messages[i], metrics };
            setSession({ ...finalSession, messages });
            break;
          }
        }
      }

      abortRef.current = null;
      // Loose top-level objects from this run go into one folder named after the prompt,
      // so the scene tree stays organized even when the AI did not group them itself.
      const loose = [...editor.scene.nodes.values()]
        .filter(
          (n) =>
            !nodesBefore.has(n.id) &&
            !n.parentId &&
            n.metadata?.environment !== true &&
            n.metadata?.terrain !== true &&
            // Folders the AI made are deliberate organization; only loose objects are collected.
            !(n.kind === "group" && typeof n.metadata?.resource !== "string")
        )
        .map((n) => n.id);
      if (loose.length >= 2) groupNodes(editor, loose, folderNameFromPrompt(prompt), { aiRun: true });
      const added = editor.commands.done.slice(doneBefore);
      lastRunRef.current = new Set(added);
      setLastRunChanges(added.length);
    },
    [editor, session.messages, toolContext]
  );

  const abort = useCallback(() => {
    hideGhost();
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  /** Starts a new, empty conversation (the old one stays in the list). */
  const clearHistory = useCallback(() => {
    hideGhost();
    abortRef.current?.abort();
    abortRef.current = null;
    codexThreadIdRef.current = undefined;
    const id = newConversationId();
    setConversationId(id);
    chatHistory().setCurrentId(id);
    setSession(EMPTY_SESSION);
  }, []);

  const openConversation = useCallback((id: string) => {
    const saved = chatHistory().load(id);
    if (!saved) return;
    hideGhost();
    abortRef.current?.abort();
    abortRef.current = null;
    codexThreadIdRef.current = undefined;
    setConversationId(id);
    chatHistory().setCurrentId(id);
    setSession({ messages: saved.messages, status: "idle", iterationCount: 0 });
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      chatHistory().remove(id);
      setConversations(chatHistory().list());
      if (id === conversationId) {
        const id2 = newConversationId();
        setConversationId(id2);
        chatHistory().setCurrentId(id2);
        setSession(EMPTY_SESSION);
      }
    },
    [conversationId]
  );

  /** Undoes every change of the last AI run that is still on top of the undo stack. */
  const undoLastRun = useCallback(() => {
    const run = lastRunRef.current;
    const done = editor.commands.done;
    while (done.length > 0 && run.has(done[done.length - 1])) editor.undo();
    lastRunRef.current = new Set();
    setLastRunChanges(0);
  }, [editor]);

  /**
   * "Refine with AI" on an instant (Tier 0) result: undo that placement when it is still the
   * last run on top of the undo stack, then send the same prompt to the model.
   */
  const refineWithAi = useCallback(
    (messageId: string, prompt: string) => {
      if (lastInstantMessageRef.current === messageId) undoLastRun();
      lastInstantMessageRef.current = null;
      void sendMessage(prompt, undefined, { skipInstant: true });
    },
    [sendMessage, undoLastRun]
  );

  const refreshConfigured = useCallback(() => {
    setConfigured(isCopilotConfigured());
  }, []);

  return useMemo(
    () => ({
      session,
      sendMessage,
      abort,
      clearHistory,
      isConfigured: configured,
      lastRunChanges,
      refreshConfigured,
      refineWithAi,
      undoLastRun,
      conversationId,
      conversations,
      openConversation,
      deleteConversation
    }),
    [abort, clearHistory, configured, conversationId, conversations, deleteConversation, lastRunChanges, openConversation, refineWithAi, refreshConfigured, sendMessage, session, undoLastRun]
  );
}
