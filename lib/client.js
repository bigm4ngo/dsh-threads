window.__ModuleLoader__.load({ id: "dsh-threads", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react11 = require("react");

// src/client/api.ts
var API_BASE = "/dsh-threads/api";
var ApiError = class extends Error {
  status;
  code;
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
};
async function requestJson(subPath, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== void 0 && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${API_BASE}${subPath}`, {
    ...init,
    headers,
    credentials: "same-origin"
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code;
    try {
      const payload = await response.json();
      if (typeof payload?.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
      if (typeof payload?.code === "string" && payload.code.trim()) {
        code = payload.code;
      }
    } catch {
      const text = await response.text().catch(() => "");
      if (text.trim()) message = text.trim();
    }
    throw new ApiError(response.status, message, code);
  }
  if (response.status === 204) {
    return void 0;
  }
  return await response.json();
}
var threadsApi = {
  fetchCatalog() {
    return requestJson("/catalog");
  },
  inspectSession(sessionId) {
    return requestJson(
      `/sessions/${encodeURIComponent(sessionId)}/inspect`
    );
  },
  fetchTree(sessionId) {
    return requestJson(
      `/sessions/${encodeURIComponent(sessionId)}/tree`
    );
  },
  async listSideChats(sessionId) {
    const res = await requestJson(
      `/side-chats?sessionId=${encodeURIComponent(sessionId)}`
    );
    return res.sideChats;
  },
  async createSideChat(payload) {
    const res = await requestJson("/side-chats", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return res.sideChat;
  },
  async sendSideChatMessage(id, payload) {
    const res = await requestJson(
      `/side-chats/${encodeURIComponent(id)}/messages`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );
    return res.sideChat;
  },
  async abortSideChat(id) {
    return requestJson(
      `/side-chats/${encodeURIComponent(id)}/abort`,
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );
  },
  async updateSideChat(id, payload) {
    const res = await requestJson(
      `/side-chats/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );
    return res.sideChat;
  },
  deleteSideChat(id) {
    return requestJson(`/side-chats/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },
  promoteSideChat(id, payload = {}) {
    return requestJson(`/side-chats/${encodeURIComponent(id)}/promote`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  forkSession(payload) {
    return requestJson("/fork", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  async linkSessions(payload) {
    const res = await requestJson("/link", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return res.edge;
  },
  editAndRetry(payload) {
    return requestJson("/edit-retry", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  previewHandoff(payload) {
    return requestJson("/handoff/preview", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  executeHandoff(payload) {
    return requestJson("/handoff/execute", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  distillSummary(payload) {
    return requestJson("/distill", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  mergeBack(payload) {
    return requestJson("/merge-back", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
};
var sseListeners = /* @__PURE__ */ new Set();
var sseReconnectListeners = /* @__PURE__ */ new Set();
var sharedSource = null;
var sseReconnectTimer;
var sseOpen = false;
var sseHasOpenedOnce = false;
var sseReconnectAttempts = 0;
function isThreadsSseOpen() {
  return sseOpen;
}
function clearSseReconnectTimer() {
  if (sseReconnectTimer !== void 0) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = void 0;
  }
}
function teardownSharedEventSource() {
  clearSseReconnectTimer();
  sseOpen = false;
  sseHasOpenedOnce = false;
  sseReconnectAttempts = 0;
  if (sharedSource) {
    sharedSource.close();
    sharedSource = null;
  }
}
function connectSharedEventSource() {
  if (typeof EventSource === "undefined" || sharedSource || sseListeners.size === 0) {
    return;
  }
  const source = new EventSource(`${API_BASE}/events`);
  sharedSource = source;
  source.onopen = () => {
    if (sharedSource !== source) return;
    const isReconnect = sseHasOpenedOnce;
    sseHasOpenedOnce = true;
    sseOpen = true;
    sseReconnectAttempts = 0;
    if (isReconnect) {
      for (const fn of [...sseReconnectListeners]) {
        try {
          fn();
        } catch {
        }
      }
    }
  };
  source.onmessage = (msg) => {
    if (sharedSource !== source) return;
    try {
      const parsed = JSON.parse(msg.data);
      if (parsed && typeof parsed.type === "string") {
        for (const fn of [...sseListeners]) {
          try {
            fn(parsed);
          } catch {
          }
        }
      }
    } catch {
    }
  };
  source.onerror = () => {
    if (sharedSource !== source) return;
    sseOpen = false;
    source.close();
    sharedSource = null;
    if (sseListeners.size === 0 || sseReconnectTimer !== void 0) return;
    sseReconnectAttempts += 1;
    const delay = sseReconnectAttempts === 1 ? 1e3 : sseReconnectAttempts === 2 ? 2e3 : 3e3;
    sseReconnectTimer = setTimeout(() => {
      sseReconnectTimer = void 0;
      connectSharedEventSource();
    }, delay);
  };
}
function subscribeThreadsEvents(listener, options) {
  if (typeof EventSource === "undefined") {
    return () => {
    };
  }
  sseListeners.add(listener);
  if (options?.onReconnect) {
    sseReconnectListeners.add(options.onReconnect);
  }
  connectSharedEventSource();
  return () => {
    sseListeners.delete(listener);
    if (options?.onReconnect) {
      sseReconnectListeners.delete(options.onReconnect);
    }
    if (sseListeners.size === 0) {
      teardownSharedEventSource();
    }
  };
}

// src/client/draft-bridge.ts
var import_react = require("react");
var pendingBySession = /* @__PURE__ */ new Map();
var listeners = /* @__PURE__ */ new Set();
function composeMergedDraft(existingDraft, addition, mode) {
  if (mode === "replace") {
    return addition;
  }
  const existingTrimmedEnd = existingDraft.trimEnd();
  if (!existingTrimmedEnd.trim()) {
    return addition;
  }
  return `${existingTrimmedEnd}

${addition}`;
}
function queueDraft(sessionId, options) {
  const mode = options.mode ?? "append";
  const existing = pendingBySession.get(sessionId);
  const text = existing && mode === "append" ? `${existing.text.trimEnd()}

${options.text}` : options.text;
  pendingBySession.set(sessionId, {
    sessionId,
    text,
    mode: existing && mode === "append" ? existing.mode : mode
  });
  for (const fn of listeners) {
    try {
      fn();
    } catch {
    }
  }
}
function takeDraft(sessionId) {
  const found = pendingBySession.get(sessionId);
  if (!found) return void 0;
  pendingBySession.delete(sessionId);
  return found;
}
function DraftRelay(props) {
  const { sessionId, inputActions, useInput } = props;
  const currentDraft = useInput?.((state) => state.draft) ?? "";
  const draftRef = (0, import_react.useRef)(currentDraft);
  draftRef.current = currentDraft;
  (0, import_react.useEffect)(() => {
    if (!sessionId || !inputActions?.setDraft) return;
    const flush = () => {
      const next = takeDraft(sessionId);
      if (!next) return;
      const finalText = composeMergedDraft(draftRef.current, next.text, next.mode);
      inputActions.setDraft?.(finalText);
    };
    flush();
    listeners.add(flush);
    return () => {
      listeners.delete(flush);
    };
  }, [sessionId, inputActions]);
  return null;
}

// src/client/HeaderControls.tsx
var import_react2 = require("react");

// src/client/ThreadsIcon.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function ThreadsIcon({ size = 16, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "4", cy: "3.5", r: "1.5", stroke: "currentColor", strokeWidth: "1.4" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "4", cy: "12.5", r: "1.5", stroke: "currentColor", strokeWidth: "1.4" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "6", r: "1.5", stroke: "currentColor", strokeWidth: "1.4" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "path",
          {
            d: "M4 5v6M4 9c0-2 1.8-3 4-3h2.5",
            stroke: "currentColor",
            strokeWidth: "1.4",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        )
      ]
    }
  );
}

// src/client/ui-bus.ts
var seqCounter = 0;
var latestIntentBySession = /* @__PURE__ */ new Map();
var listeners2 = /* @__PURE__ */ new Set();
var THREADS_TAB_KIND = "dsh-threads";
function publishThreadsIntent(intent, ctx) {
  seqCounter += 1;
  const full = { ...intent, seq: seqCounter };
  latestIntentBySession.set(intent.sessionId, full);
  for (const fn of listeners2) {
    try {
      fn();
    } catch {
    }
  }
  try {
    ctx?.sidebarRight?.openTab?.(THREADS_TAB_KIND, {
      params: {
        tab: full.tab,
        ...full.sideChatId ? { sideChatId: full.sideChatId } : {}
      }
    });
  } catch {
  }
  return full;
}
function getThreadsIntent(sessionId) {
  return latestIntentBySession.get(sessionId);
}
function subscribeThreadsIntents(listener) {
  listeners2.add(listener);
  return () => {
    listeners2.delete(listener);
  };
}

// src/client/HeaderControls.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function LineageHeaderPill({
  ctx,
  sessionId
}) {
  const [tree, setTree] = (0, import_react2.useState)(null);
  const refresh = (0, import_react2.useCallback)(() => {
    if (!sessionId) {
      setTree(null);
      return;
    }
    let cancelled = false;
    void threadsApi.fetchTree(sessionId).then((res) => {
      if (!cancelled) setTree(res);
    }).catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
  (0, import_react2.useEffect)(() => {
    const cancel = refresh();
    const unsub = subscribeThreadsEvents((ev) => {
      if (!sessionId) return;
      if (ev.type === "lineage-updated" && ev.sessionIds.includes(sessionId) || ev.type === "side-chat-updated" && ev.parentSessionId === sessionId || ev.type === "side-chat-deleted" && ev.parentSessionId === sessionId) {
        refresh();
      }
    });
    return () => {
      cancel?.();
      unsub();
    };
  }, [sessionId, refresh]);
  if (!sessionId || !tree) return null;
  const incoming = tree.edges.find((e) => e.childSessionId === sessionId);
  const childCount = tree.edges.filter((e) => e.parentSessionId === sessionId).length;
  const selfNode = tree.nodes.find((n) => n.sessionId === sessionId);
  const sideCount = selfNode?.sideChatCount ?? 0;
  if (!incoming && childCount === 0 && sideCount === 0) return null;
  const parentNode = incoming ? tree.nodes.find((n) => n.sessionId === incoming.parentSessionId) : void 0;
  let label = "";
  if (incoming) {
    const kindWord = incoming.kind === "handoff" ? "Handoff from" : incoming.kind === "edit-retry" ? "Retry of" : incoming.kind === "promoted-side" ? "Side of" : "Fork of";
    const parentName = parentNode?.title || incoming.parentSessionId.slice(0, 8);
    const turnTag = incoming.anchorTurn !== void 0 ? ` T${incoming.anchorTurn}` : "";
    label = `\u21B3 ${kindWord} ${parentName}${turnTag}`;
  } else {
    const parts = [];
    if (childCount > 0) parts.push(`${childCount} branch${childCount === 1 ? "" : "es"}`);
    if (sideCount > 0) parts.push(`${sideCount} side`);
    label = `\u2387 ${parts.join(" \xB7 ")}`;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      type: "button",
      className: "dsh-thr-lineage-pill",
      title: "Open Threads lineage tree",
      onClick: () => publishThreadsIntent(
        {
          sessionId,
          tab: "tree"
        },
        ctx
      ),
      children: label
    }
  );
}
function ThreadsHeaderButton({
  ctx,
  sessionId
}) {
  if (!sessionId) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      type: "button",
      className: "dsh-thr-header-btn",
      title: "Open Threads (Side chats, Fork tree, Edit & Retry, Handoff)",
      "aria-label": "Open Threads sidebar",
      onClick: () => publishThreadsIntent(
        {
          sessionId,
          tab: "side"
        },
        ctx
      ),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ThreadsIcon, { size: 14 }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Threads" })
      ]
    }
  );
}

// src/client/SelectionPopover.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var QUOTE_MAX = 4e3;
function readClaudeSessionFlag(ctx, sessionId) {
  if (!sessionId) return false;
  try {
    const dirApi = ctx.modelDirectories ?? ctx.get?.("modelDirectories");
    const liveProvider = dirApi?.directoryFor?.(sessionId)?.store?.getSnapshot()?.current?.provider;
    if (liveProvider !== void 0) {
      return liveProvider.startsWith("claude-code");
    }
  } catch {
  }
  const summary = ctx.sessions?.list?.getSnapshot()?.byId[sessionId];
  const sel = summary?.projectionValues?.modelSelection ?? summary?.projections?.values?.modelSelection;
  const provider = sel?.next?.provider ?? sel?.lastUsed?.provider ?? sel?.provider;
  return provider?.startsWith("claude-code") === true;
}
function useIsClaudeSession(ctx, sessionId) {
  return (0, import_react3.useSyncExternalStore)(
    (notify) => {
      const offs = [];
      try {
        const dirApi = ctx.modelDirectories ?? ctx.get?.("modelDirectories");
        const unsub = dirApi?.directoryFor?.(sessionId)?.store?.subscribe(notify);
        if (unsub) offs.push(unsub);
      } catch {
      }
      try {
        const unsub = ctx.sessions?.list?.subscribe(notify);
        if (unsub) offs.push(unsub);
      } catch {
      }
      return () => {
        for (const off of offs) off();
      };
    },
    () => readClaudeSessionFlag(ctx, sessionId),
    () => false
  );
}
function SelectionPopover(props) {
  const { ctx, sessionId = "", readText, dismiss, clearSelection, inputActions, t } = props;
  const enabled = props.useSession?.(
    (s) => !s.removed && (s.subagent === null || s.subagent === void 0 || s.subagent.address?.mode === "continuable" && s.subagent.parentAvailable === true)
  ) ?? true;
  const isClaude = useIsClaudeSession(ctx, sessionId);
  const [askPassage, setAskPassage] = (0, import_react3.useState)(null);
  const [question, setQuestion] = (0, import_react3.useState)("");
  const [asking, setAsking] = (0, import_react3.useState)(false);
  const [note, setNote] = (0, import_react3.useState)(null);
  const inputRef = (0, import_react3.useRef)(null);
  const mountedRef = (0, import_react3.useRef)(true);
  (0, import_react3.useEffect)(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  (0, import_react3.useEffect)(() => {
    if (!enabled) dismiss?.();
  }, [enabled, dismiss]);
  (0, import_react3.useEffect)(() => {
    if (askPassage !== null) {
      inputRef.current?.focus();
    }
  }, [askPassage]);
  if (!enabled || !readText || !dismiss) return null;
  const quoteLabel = t ? t("quote.add") : "Quote";
  const close = () => {
    clearSelection?.();
    dismiss();
  };
  const handleQuote = () => {
    const text = readText();
    if (text === null) {
      dismiss();
      return;
    }
    if (inputActions?.insertQuote?.(text) !== true) return;
    close();
  };
  const handleOpenSideChat = () => {
    const text = askPassage ?? readText();
    if (text === null) {
      dismiss();
      return;
    }
    if (sessionId) {
      publishThreadsIntent(
        {
          sessionId,
          tab: "side",
          quote: text.slice(0, QUOTE_MAX)
        },
        ctx
      );
    }
    close();
  };
  const handleOpenClaudeBtw = () => {
    const text = readText();
    if (text === null) {
      dismiss();
      return;
    }
    setNote(null);
    setAskPassage(text.slice(0, QUOTE_MAX));
  };
  const handleSendClaudeBtw = async () => {
    if (askPassage === null || asking || !sessionId) return;
    setAsking(true);
    setNote(null);
    try {
      const res = await fetch("/dsh-oh-my-claude/side-questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session: sessionId,
          question: question.trim(),
          quote: askPassage
        })
      });
      if (!mountedRef.current) return;
      if (res.ok) {
        close();
        return;
      }
      if (res.status === 404) {
        setNote("Oh My Claude /btw route is unavailable; open in Side chat instead.");
      } else if (res.status === 409) {
        setNote("Claude process is not running yet; open in Side chat instead.");
      } else {
        setNote("Claude /btw request failed; try Side chat instead.");
      }
    } catch {
      if (mountedRef.current) {
        setNote("Could not reach Oh My Claude; try Side chat instead.");
      }
    } finally {
      if (mountedRef.current) setAsking(false);
    }
  };
  const keepSelection = (e) => {
    e.preventDefault();
  };
  if (askPassage !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-thr-popover-panel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "div",
        {
          className: "dsh-thr-faint",
          style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
          title: askPassage,
          children: askPassage.replace(/\s+/g, " ").trim()
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: 6, alignItems: "flex-start" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "textarea",
          {
            ref: inputRef,
            className: "dsh-thr-textarea",
            rows: 1,
            value: question,
            onChange: (e) => setQuestion(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Escape" && e.nativeEvent.isComposing) {
                e.stopPropagation();
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleSendClaudeBtw();
              }
            },
            placeholder: "Ask Claude /btw (empty = explain)\u2026",
            readOnly: asking
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-popover-btn",
            onPointerDown: keepSelection,
            onClick: () => void handleSendClaudeBtw(),
            "aria-disabled": asking,
            children: asking ? "Asking\u2026" : "Ask"
          }
        )
      ] }),
      note && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-thr-row", style: { justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-thr-faint", style: { color: "var(--dsw-alias-state-error-primary, #dc2626)" }, children: note }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-popover-btn",
            onPointerDown: keepSelection,
            onClick: handleOpenSideChat,
            children: "Side chat"
          }
        )
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-thr-popover-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: "dsh-thr-popover-btn",
        onPointerDown: keepSelection,
        onClick: handleQuote,
        children: quoteLabel
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: "dsh-thr-popover-btn",
        onPointerDown: keepSelection,
        onClick: handleOpenSideChat,
        children: "Side chat"
      }
    ),
    isClaude && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: "dsh-thr-popover-btn",
        onPointerDown: keepSelection,
        onClick: handleOpenClaudeBtw,
        children: "Claude /btw"
      }
    )
  ] });
}

// src/client/styles.ts
var STYLE_ELEMENT_ID = "dsh-threads-styles";
var CSS_TEXT = `
.dsh-thr-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, inherit));
  font-size: 13px;
  line-height: 1.45;
}

.dsh-thr-subtabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  flex-shrink: 0;
  overflow-x: auto;
}

.dsh-thr-subtab {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 5px 9px 6px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dsh-thr-subtab:hover {
  color: var(--dsw-alias-label-primary, inherit);
}

.dsh-thr-subtab-active {
  color: var(--dsw-alias-label-primary, inherit);
  border-bottom-color: var(--dsw-alias-brand-primary, #3b82f6);
  font-weight: 600;
}

.dsh-thr-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-thr-card {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  border-radius: 10px;
  padding: 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.04));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-thr-card-accent {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 40%, var(--dsw-alias-border-l2, rgba(128,128,128,0.22)));
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 6%, var(--dsw-alias-bg-layer-1, transparent));
}

.dsh-thr-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dsh-thr-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dsh-thr-muted {
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  font-size: 12px;
}

.dsh-thr-faint {
  color: var(--dsw-alias-label-tertiary, rgba(128, 128, 128, 0.7));
  font-size: 11px;
}

.dsh-thr-err {
  color: var(--dsw-alias-state-error-primary, #dc2626);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 35%, transparent);
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 12px;
  white-space: normal;
  word-break: break-word;
}

.dsh-thr-warn {
  color: var(--dsw-alias-state-warn-primary, #d97706);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 35%, transparent);
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 12px;
  white-space: normal;
}

.dsh-thr-ok {
  color: var(--dsw-alias-state-success-primary, #16a34a);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 35%, transparent);
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 12px;
}

.dsh-thr-btn {
  appearance: none;
  font: inherit;
  font-size: 12px;
  line-height: 1.35;
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.dsh-thr-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
}

.dsh-thr-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dsh-thr-btn-primary {
  background: var(--dsw-alias-brand-primary, #3b82f6);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
  font-weight: 500;
}

.dsh-thr-btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
  background: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-btn-danger {
  color: var(--dsw-alias-state-error-primary, #dc2626);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 40%, transparent);
}

.dsh-thr-btn-xs {
  appearance: none;
  font: inherit;
  font-size: 11px;
  line-height: 1.2;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  cursor: pointer;
  white-space: nowrap;
}

.dsh-thr-btn-xs:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
}

.dsh-thr-btn-xs:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dsh-thr-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.26));
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  white-space: nowrap;
}

.dsh-thr-pill-brand {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 45%, transparent);
  color: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-pill-ok {
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 45%, transparent);
  color: var(--dsw-alias-state-success-primary, #16a34a);
}

.dsh-thr-pill-warn {
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 45%, transparent);
  color: var(--dsw-alias-state-warn-primary, #d97706);
}

.dsh-thr-input,
.dsh-thr-select,
.dsh-thr-textarea {
  box-sizing: border-box;
  font: inherit;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base, transparent));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  border-radius: 7px;
  padding: 5px 8px;
  min-width: 0;
}

.dsh-thr-input:focus,
.dsh-thr-select:focus,
.dsh-thr-textarea:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-textarea {
  width: 100%;
  resize: vertical;
  line-height: 1.45;
  font-family: inherit;
}

.dsh-thr-mono {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.dsh-thr-blockquote {
  margin: 0;
  padding: 4px 8px;
  border-left: 2px solid var(--dsw-alias-brand-primary, #3b82f6);
  background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.06));
  border-radius: 0 6px 6px 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  white-space: pre-wrap;
  word-break: break-word;
}

.dsh-thr-side-chips {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.dsh-thr-side-chip {
  appearance: none;
  font: inherit;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25));
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  cursor: pointer;
  white-space: nowrap;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-thr-side-chip-active {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 14%, transparent);
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
  color: var(--dsw-alias-label-primary, inherit);
  font-weight: 500;
}

.dsh-thr-msg-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-thr-msg {
  border-radius: 9px;
  padding: 8px 10px;
  font-size: 12.5px;
  word-break: break-word;
}

.dsh-thr-msg-user {
  align-self: flex-end;
  max-width: 92%;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 12%, var(--dsw-alias-bg-layer-2, transparent));
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 28%, transparent);
  white-space: pre-wrap;
}

.dsh-thr-msg-assistant {
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.05));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));
}

.dsh-thr-md {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsh-thr-p {
  margin: 0;
}

.dsh-thr-h1,
.dsh-thr-h2,
.dsh-thr-h3 {
  margin: 4px 0 2px;
  font-size: 13px;
  font-weight: 600;
}

.dsh-thr-list {
  margin: 0;
  padding-left: 18px;
}

.dsh-thr-hr {
  border: none;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));
  margin: 4px 0;
}

.dsh-thr-inline-code {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.9em;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.14);
}

.dsh-thr-codeblock {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
  border-radius: 7px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.16);
}

.dsh-thr-codeblock-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.18));
}

.dsh-thr-pre {
  margin: 0;
  padding: 7px 8px;
  overflow-x: auto;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  line-height: 1.4;
}

.dsh-thr-link {
  color: var(--dsw-alias-brand-primary, #3b82f6);
  text-decoration: underline;
}

.dsh-thr-header-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  font: inherit;
  font-size: 12px;
  padding: 3px 7px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  white-space: nowrap;
}

.dsh-thr-header-btn:hover {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
}

.dsh-thr-lineage-pill {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  font: inherit;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-thr-lineage-pill:hover {
  color: var(--dsw-alias-label-primary, inherit);
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-turntail {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dsh-thr-popover-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dsh-thr-popover-btn {
  appearance: none;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  cursor: pointer;
  white-space: nowrap;
}

.dsh-thr-popover-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.12));
}

.dsh-thr-popover-panel {
  width: 310px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #1e1e1e));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));
  border-radius: 10px;
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.25));
}

.dsh-thr-tree-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.04));
}

.dsh-thr-tree-node-current {
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 8%, transparent);
}

.dsh-thr-thinking {
  margin-bottom: 6px;
  border-left: 2px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  padding-left: 8px;
}

.dsh-thr-thinking > summary {
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  user-select: none;
}

.dsh-thr-thinking-body {
  margin-top: 4px;
  max-height: 160px;
  overflow-y: auto;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  white-space: pre-wrap;
  word-break: break-word;
}

.dsh-thr-stream-text {
  position: relative;
}

.dsh-thr-cursor {
  display: inline-block;
  width: 6px;
  height: 13px;
  margin-left: 3px;
  vertical-align: -2px;
  border-radius: 1px;
  background: var(--dsw-alias-brand-primary, #3b82f6);
  animation: dsh-thr-blink 1s steps(2, start) infinite;
}

@keyframes dsh-thr-blink {
  to {
    opacity: 0.2;
  }
}
`;
function ensureThreadsStyles() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (existing instanceof HTMLStyleElement) {
    existing.textContent = CSS_TEXT;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS_TEXT;
  document.head.appendChild(style);
}

// src/client/ThreadsTab.tsx
var import_react10 = require("react");

// src/client/ForkTreeView.tsx
var import_react5 = require("react");

// src/client/MergeBackDrawer.tsx
var import_react4 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function MergeBackDrawer({
  ctx,
  targetParentSessionId,
  targetParentTitle,
  sourceSessionIdForDistill,
  sourceSideChatId,
  sourceChildSessionId,
  edgeId,
  initialText,
  catalog,
  defaultModel,
  onClose,
  onMerged
}) {
  const [text, setText] = (0, import_react4.useState)(initialText);
  const [busy, setBusy] = (0, import_react4.useState)(false);
  const [distilling, setDistilling] = (0, import_react4.useState)(false);
  const [error, setError] = (0, import_react4.useState)(null);
  const handleDistill = async () => {
    setDistilling(true);
    setError(null);
    try {
      const res = await threadsApi.distillSummary({
        kind: "merge-back",
        sessionId: sourceSessionIdForDistill,
        ...sourceSideChatId ? { sideChatId: sourceSideChatId } : {},
        ...defaultModel ? { model: defaultModel } : {}
      });
      if (res.text.trim()) {
        setText(res.text.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDistilling(false);
    }
  };
  const submit = async (delivery) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Findings text cannot be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await threadsApi.mergeBack({
        targetParentSessionId,
        ...sourceSideChatId ? { sourceSideChatId } : {},
        ...sourceChildSessionId ? { sourceChildSessionId } : {},
        ...edgeId ? { edgeId } : {},
        text: trimmed,
        delivery,
        ...tz ? { clientTimeZone: tz } : {}
      });
      if (delivery === "draft" && res.draftText) {
        queueDraft(targetParentSessionId, { text: res.draftText, mode: "append" });
        ctx.uiWorkspace?.openSession?.(targetParentSessionId);
      }
      onMerged(delivery);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-thr-card dsh-thr-card-accent", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-thr-between", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("strong", { children: [
        "Merge findings \u2192 ",
        targetParentTitle || targetParentSessionId.slice(0, 8)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-thr-btn-xs", onClick: onClose, children: "Close" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-thr-faint", children: "Insert into draft appends below any unfinished typing in the parent composer without overwriting it." }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "textarea",
      {
        className: "dsh-thr-textarea",
        rows: 6,
        value: text,
        onChange: (e) => setText(e.target.value),
        placeholder: "Review or edit findings to send back to the parent session\u2026"
      }
    ),
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-thr-err", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-thr-between", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-thr-btn",
          disabled: busy || distilling || !catalog && !defaultModel,
          onClick: () => void handleDistill(),
          title: "Condense findings with an LLM call",
          children: distilling ? "Distilling\u2026" : "AI Distill"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-thr-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn",
            disabled: busy || distilling,
            onClick: () => void submit("draft"),
            children: "Insert into draft"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn dsh-thr-btn-primary",
            disabled: busy || distilling,
            onClick: () => void submit("send"),
            children: "Send now"
          }
        )
      ] })
    ] })
  ] });
}

// src/client/ModelPickerRow.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function modelKey(spec) {
  if (!spec) return "";
  return `${spec.provider}:::${spec.model}`;
}
function formatModelBadge(spec) {
  if (!spec) return "default";
  return `${spec.provider}/${spec.model}${spec.reasoningEffort ? ` (${spec.reasoningEffort})` : ""}`;
}
function ModelPickerRow({
  catalog,
  value,
  onChange,
  disabled,
  compact
}) {
  const groups = catalog?.groups ?? [];
  const selectedGroup = groups.find((g) => g.id === value?.provider);
  const selectedModel = selectedGroup?.models.find((m) => m.id === value?.model);
  const efforts = selectedModel?.reasoning?.efforts ?? [];
  const handleModelChange = (encoded) => {
    const sep = encoded.indexOf(":::");
    if (sep <= 0) return;
    const provider = encoded.slice(0, sep);
    const model = encoded.slice(sep + 3);
    const grp = groups.find((g) => g.id === provider);
    const mdl = grp?.models.find((m) => m.id === model);
    const defaultEffort = mdl?.reasoning?.defaultEffort ?? mdl?.reasoning?.efforts?.[0]?.id;
    onChange({
      provider,
      model,
      ...defaultEffort ? { reasoningEffort: defaultEffort } : {}
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-thr-row", style: { gap: compact ? 4 : 6 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      "select",
      {
        className: "dsh-thr-select",
        style: { flex: "1 1 160px", maxWidth: "100%" },
        disabled: disabled || groups.length === 0,
        value: modelKey(value),
        onChange: (e) => handleModelChange(e.target.value),
        "aria-label": "Model",
        children: [
          !value && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: "Select model\u2026" }),
          value && !selectedModel && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("option", { value: modelKey(value), children: [
            value.provider,
            " / ",
            value.model
          ] }),
          groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("optgroup", { label: group.name || group.id, children: group.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: `${group.id}:::${m.id}`, children: m.displayName || m.name || m.id }, `${group.id}:::${m.id}`)) }, group.id))
        ]
      }
    ),
    efforts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "select",
      {
        className: "dsh-thr-select",
        style: { flex: "0 0 auto", width: compact ? 86 : 104 },
        disabled,
        value: value?.reasoningEffort ?? selectedModel?.reasoning?.defaultEffort ?? efforts[0].id,
        onChange: (e) => {
          if (!value) return;
          onChange({
            ...value,
            reasoningEffort: e.target.value || void 0
          });
        },
        "aria-label": "Reasoning effort",
        children: efforts.map((eff) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: eff.id, children: eff.name || eff.id }, eff.id))
      }
    )
  ] });
}

// src/client/ForkTreeView.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function buildTreeRows(tree) {
  const byParent = /* @__PURE__ */ new Map();
  for (const edge of tree.edges) {
    const list = byParent.get(edge.parentSessionId) ?? [];
    list.push(edge);
    byParent.set(edge.parentSessionId, list);
  }
  const nodeMap = new Map(tree.nodes.map((n) => [n.sessionId, n]));
  const rows = [];
  const visited = /* @__PURE__ */ new Set();
  const walk = (id, depth, incoming) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodeMap.get(id) ?? {
      sessionId: id,
      title: `Session ${id.slice(0, 8)}`,
      running: false,
      sideChatCount: 0
    };
    rows.push({ node, depth, incoming });
    for (const edge of byParent.get(id) ?? []) {
      walk(edge.childSessionId, depth + 1, edge);
    }
  };
  walk(tree.rootSessionId, 0);
  for (const n of tree.nodes) {
    if (!visited.has(n.sessionId)) {
      walk(n.sessionId, 0);
    }
  }
  return rows;
}
function kindLabel(kind) {
  switch (kind) {
    case "handoff":
      return "Handoff";
    case "edit-retry":
      return "Edit-Retry";
    case "promoted-side":
      return "Promoted Side";
    default:
      return "Fork";
  }
}
function ForkTreeView({
  ctx,
  sessionId,
  sessionTitle,
  defaultModel,
  catalog,
  gitInfo,
  turns,
  sideChats,
  tree,
  initialAnchorTurn,
  initialAnchorSeq,
  onRefresh,
  onSelectSideTab
}) {
  const [workspaceMode, setWorkspaceMode] = (0, import_react5.useState)("same");
  const [branchModel, setBranchModel] = (0, import_react5.useState)(defaultModel);
  const [anchorTurn, setAnchorTurn] = (0, import_react5.useState)(initialAnchorTurn ?? "");
  const [branchNote, setBranchNote] = (0, import_react5.useState)("");
  const [busy, setBusy] = (0, import_react5.useState)(false);
  const [runningConflict, setRunningConflict] = (0, import_react5.useState)(false);
  const [error, setError] = (0, import_react5.useState)(null);
  const [linkChildId, setLinkChildId] = (0, import_react5.useState)("");
  const [mergeTarget, setMergeTarget] = (0, import_react5.useState)(null);
  const handleFork = async (delivery, extra = {}) => {
    setBusy(true);
    setError(null);
    setRunningConflict(false);
    const mode = extra.workspaceMode ?? workspaceMode;
    try {
      const pickedTurn = typeof anchorTurn === "number" ? turns.find((t) => t.turn === anchorTurn) : void 0;
      const res = await threadsApi.forkSession({
        sessionId,
        atSeq: pickedTurn?.turnEndSeq ?? initialAnchorSeq,
        ...pickedTurn ? { anchorTurn: pickedTurn.turn } : {},
        workspaceMode: mode,
        ...branchModel ?? defaultModel ? { model: branchModel ?? defaultModel } : {},
        ...branchNote.trim() ? { initialDraft: branchNote.trim() } : {},
        delivery,
        ...extra.stopSourceIfRunning ? { stopSourceIfRunning: true } : {}
      });
      if (delivery === "draft" && res.draftText) {
        queueDraft(res.sessionId, { text: res.draftText, mode: "replace" });
      }
      setBranchNote("");
      onRefresh();
      ctx.uiWorkspace?.openSession?.(res.sessionId);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SOURCE_RUNNING") {
        setRunningConflict(true);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };
  const handleLink = async () => {
    const childId = linkChildId.trim();
    if (!childId) return;
    setError(null);
    try {
      await threadsApi.linkSessions({
        parentSessionId: sessionId,
        childSessionId: childId,
        kind: "fork"
      });
      setLinkChildId("");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const rows = tree ? buildTreeRows(tree) : [];
  const nodeMap = new Map((tree?.nodes ?? []).map((n) => [n.sessionId, n]));
  const sessionsSnap = ctx.sessions?.list?.getSnapshot();
  const otherSessions = (sessionsSnap?.ids ?? []).filter((id) => id !== sessionId && !nodeMap.has(id)).slice(0, 25);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-between", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("strong", { children: [
          "Branch from ",
          sessionTitle
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className: "dsh-thr-btn-xs", onClick: onSelectSideTab, children: [
          sideChats.length,
          " side chat",
          sideChats.length === 1 ? "" : "s"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-thr-faint", children: "At turn:" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "select",
          {
            className: "dsh-thr-select",
            value: anchorTurn,
            onChange: (e) => {
              const v = e.target.value;
              setAnchorTurn(v === "" ? "" : Number(v));
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "Latest completed turn" }),
              turns.map((t) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: t.turn, children: [
                "T",
                t.turn,
                ": ",
                t.userText.slice(0, 42) || "(attachment)"
              ] }, t.turn))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        ModelPickerRow,
        {
          catalog,
          value: branchModel ?? defaultModel,
          onChange: setBranchModel,
          disabled: busy,
          compact: true
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-thr-row", style: { cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              type: "radio",
              name: "dsh-thr-fork-mode",
              checked: workspaceMode === "same",
              onChange: () => setWorkspaceMode("same")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "Same workspace" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-thr-row", style: { cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              type: "radio",
              name: "dsh-thr-fork-mode",
              checked: workspaceMode === "worktree",
              disabled: !gitInfo?.isGitRepo || !gitInfo?.headCommit,
              onChange: () => setWorkspaceMode("worktree")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "New isolated Git worktree" })
        ] })
      ] }),
      workspaceMode === "worktree" && gitInfo?.dirty && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-warn", children: [
        "Uncommitted local changes stay in this checkout; the new worktree starts from HEAD (",
        gitInfo.headShort,
        ")."
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "textarea",
        {
          className: "dsh-thr-textarea",
          rows: 2,
          value: branchNote,
          onChange: (e) => setBranchNote(e.target.value),
          placeholder: "Optional first prompt or note for the branched session\u2026"
        }
      ),
      runningConflict && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-warn", children: [
        "Current session is still running in this workspace.",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-row", style: { marginTop: 6 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn dsh-thr-btn-danger",
              onClick: () => void handleFork("draft", { stopSourceIfRunning: true }),
              children: "Stop current & fork here"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn",
              disabled: !gitInfo?.isGitRepo || !gitInfo?.headCommit,
              onClick: () => void handleFork("draft", { workspaceMode: "worktree" }),
              children: "Use isolated worktree"
            }
          )
        ] })
      ] }),
      error && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-thr-err", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-row", style: { justifyContent: "flex-end" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn",
            disabled: busy,
            onClick: () => void handleFork("draft"),
            children: "Branch (Draft)"
          }
        ),
        branchNote.trim() && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn dsh-thr-btn-primary",
            disabled: busy,
            onClick: () => void handleFork("send"),
            children: "Branch & Send"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-between", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("strong", { children: [
        "Lineage Tree (",
        rows.length,
        ")"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-thr-btn-xs", onClick: onRefresh, children: "Refresh" })
    ] }),
    rows.length <= 1 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-thr-muted", children: "No branches or handoffs linked to this session yet." }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: rows.map(({ node, depth, incoming }) => {
      const isCurrent = node.sessionId === sessionId;
      const parentNode = incoming ? nodeMap.get(incoming.parentSessionId) : void 0;
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        "div",
        {
          style: { marginLeft: Math.min(depth * 14, 56) },
          className: `dsh-thr-tree-node ${isCurrent ? "dsh-thr-tree-node-current" : ""}`,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-between", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-row", style: { minWidth: 0, flex: 1 }, children: [
                depth > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-thr-faint", children: "\u21B3" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-thr-btn-xs",
                    style: {
                      border: "none",
                      padding: 0,
                      fontWeight: isCurrent ? 600 : 500,
                      color: "var(--dsw-alias-label-primary, inherit)",
                      textAlign: "left"
                    },
                    onClick: () => ctx.uiWorkspace?.openSession?.(node.sessionId),
                    title: `Open ${node.sessionId}`,
                    children: node.title
                  }
                ),
                isCurrent && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-thr-pill dsh-thr-pill-brand", children: "Current" }),
                node.running && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-thr-pill dsh-thr-pill-warn", children: "Running" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-row", children: [
                incoming && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-thr-btn-xs",
                    onClick: () => setMergeTarget({ edge: incoming, parentNode, childNode: node }),
                    children: "Merge back"
                  }
                ),
                !isCurrent && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-thr-btn-xs",
                    onClick: () => ctx.uiWorkspace?.openSession?.(node.sessionId),
                    children: "Open"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-row", children: [
              incoming && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-thr-pill", children: kindLabel(incoming.kind) }),
              incoming?.anchorTurn !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-thr-pill", children: [
                "T",
                incoming.anchorTurn
              ] }),
              incoming?.mergedBackAt && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-thr-pill dsh-thr-pill-ok", children: "Merged" }),
              (incoming?.toModel || node.model) && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-thr-faint", children: formatModelBadge(incoming?.toModel ?? node.model) }),
              node.sideChatCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-thr-faint", children: [
                node.sideChatCount,
                " side"
              ] }),
              incoming?.worktree && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-thr-faint dsh-thr-mono", title: incoming.worktree.path, children: [
                "\u2387 ",
                incoming.worktree.branch
              ] })
            ] })
          ]
        },
        node.sessionId
      );
    }) }),
    mergeTarget && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      MergeBackDrawer,
      {
        ctx,
        targetParentSessionId: mergeTarget.edge.parentSessionId,
        targetParentTitle: mergeTarget.parentNode?.title,
        sourceSessionIdForDistill: mergeTarget.edge.childSessionId,
        sourceChildSessionId: mergeTarget.edge.childSessionId,
        edgeId: mergeTarget.edge.id,
        initialText: `Summary from ${mergeTarget.childNode?.title || mergeTarget.edge.childSessionId.slice(0, 8)}:
`,
        catalog,
        defaultModel: mergeTarget.childNode?.model ?? defaultModel,
        onClose: () => setMergeTarget(null),
        onMerged: () => {
          setMergeTarget(null);
          onRefresh();
        }
      }
    ),
    otherSessions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-thr-faint", children: "Link an existing forked session as a child of this thread:" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-thr-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "select",
          {
            className: "dsh-thr-select",
            style: { flex: 1 },
            value: linkChildId,
            onChange: (e) => setLinkChildId(e.target.value),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "Select session\u2026" }),
              otherSessions.map((id) => {
                const entry = sessionsSnap?.byId[id];
                return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: id, children: entry?.displayTitle || entry?.title || id.slice(0, 12) }, id);
              })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn",
            disabled: !linkChildId,
            onClick: () => void handleLink(),
            children: "Link"
          }
        )
      ] })
    ] })
  ] });
}

// src/client/HandoffView.tsx
var import_react6 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
function HandoffView({
  ctx,
  sessionId,
  defaultModel,
  catalog,
  gitInfo,
  turns,
  initialNote,
  onRefresh
}) {
  const [toModel, setToModel] = (0, import_react6.useState)(defaultModel);
  const [workspaceMode, setWorkspaceMode] = (0, import_react6.useState)("same");
  const [turnScope, setTurnScope] = (0, import_react6.useState)("all");
  const [customTurns, setCustomTurns] = (0, import_react6.useState)([]);
  const [nextInstruction, setNextInstruction] = (0, import_react6.useState)(initialNote ?? "");
  const [preview, setPreview] = (0, import_react6.useState)(null);
  const [packetText, setPacketText] = (0, import_react6.useState)("");
  const [loadingPreview, setLoadingPreview] = (0, import_react6.useState)(false);
  const [distilling, setDistilling] = (0, import_react6.useState)(false);
  const [executing, setExecuting] = (0, import_react6.useState)(false);
  const [runningConflict, setRunningConflict] = (0, import_react6.useState)(false);
  const [error, setError] = (0, import_react6.useState)(null);
  (0, import_react6.useEffect)(() => {
    if (!toModel && (catalog?.defaultModel || defaultModel)) {
      setToModel(catalog?.defaultModel ?? defaultModel);
    }
  }, [catalog, defaultModel, toModel]);
  (0, import_react6.useEffect)(() => {
    if (initialNote) {
      setNextInstruction(initialNote);
    }
  }, [initialNote]);
  const selectedTurnNumbers = turnScope === "all" ? void 0 : turnScope === "last5" ? turns.slice(-5).map((t) => t.turn) : customTurns;
  (0, import_react6.useEffect)(() => {
    if (!toModel) return;
    let cancelled = false;
    setLoadingPreview(true);
    setError(null);
    void threadsApi.previewHandoff({
      sessionId,
      toModel,
      workspaceMode,
      ...selectedTurnNumbers ? { selectedTurnNumbers } : {},
      ...nextInstruction.trim() ? { nextInstruction: nextInstruction.trim() } : {}
    }).then((res) => {
      if (cancelled) return;
      setPreview(res);
      setPacketText(res.packetText);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (!cancelled) setLoadingPreview(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    sessionId,
    toModel?.provider,
    toModel?.model,
    toModel?.reasoningEffort,
    workspaceMode,
    turnScope,
    customTurns.join(","),
    nextInstruction
  ]);
  const handleDistill = async () => {
    if (!toModel) return;
    setDistilling(true);
    setError(null);
    try {
      const res = await threadsApi.distillSummary({
        kind: "handoff",
        sessionId,
        ...selectedTurnNumbers ? { selectedTurnNumbers } : {},
        model: defaultModel ?? toModel,
        ...nextInstruction.trim() ? { nextInstruction: nextInstruction.trim() } : {}
      });
      if (res.text.trim()) {
        setPacketText(res.text.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDistilling(false);
    }
  };
  const handleExecute = async (delivery, extra = {}) => {
    if (!toModel || !packetText.trim()) return;
    setExecuting(true);
    setError(null);
    setRunningConflict(false);
    const mode = extra.workspaceMode ?? workspaceMode;
    try {
      const res = await threadsApi.executeHandoff({
        sessionId,
        toModel,
        workspaceMode: mode,
        delivery,
        packetText: packetText.trim(),
        ...preview?.manifest ? { manifest: preview.manifest } : {},
        ...extra.stopSourceIfRunning ? { stopSourceIfRunning: true } : {}
      });
      if (delivery === "draft" && res.draftText) {
        queueDraft(res.sessionId, { text: res.draftText, mode: "replace" });
      }
      onRefresh();
      ctx.uiWorkspace?.openSession?.(res.sessionId);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SOURCE_RUNNING") {
        setRunningConflict(true);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setExecuting(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "1. Target model & provider" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-faint", children: [
        "Current: ",
        formatModelBadge(defaultModel)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        ModelPickerRow,
        {
          catalog,
          value: toModel,
          onChange: setToModel,
          disabled: executing
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "2. Workspace mode" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { className: "dsh-thr-row", style: { cursor: "pointer" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "input",
          {
            type: "radio",
            name: "dsh-thr-handoff-ws",
            checked: workspaceMode === "same",
            onChange: () => setWorkspaceMode("same")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "Same workspace (sequential baton pass \u2014 preserves uncommitted edits)" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { className: "dsh-thr-row", style: { cursor: "pointer" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "input",
          {
            type: "radio",
            name: "dsh-thr-handoff-ws",
            checked: workspaceMode === "worktree",
            disabled: !gitInfo?.isGitRepo || !gitInfo?.headCommit,
            onChange: () => setWorkspaceMode("worktree")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "New isolated Git worktree (safe if current session keeps running)" })
      ] }),
      workspaceMode === "same" && preview?.sourceRunning && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-thr-warn", children: "This session is currently running. Stop it before handing off here, or switch to an isolated Git worktree." }),
      workspaceMode === "worktree" && gitInfo?.dirty && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-warn", children: [
        "Source checkout has uncommitted changes; the new worktree starts from HEAD (",
        gitInfo.headShort,
        ")."
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-between", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "3. Context & Transfer Manifest" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            "select",
            {
              className: "dsh-thr-select",
              value: turnScope,
              onChange: (e) => {
                const mode = e.target.value;
                setTurnScope(mode);
                if (mode === "custom" && customTurns.length === 0) {
                  setCustomTurns(turns.slice(-3).map((t) => t.turn));
                }
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("option", { value: "all", children: [
                  "All turns (",
                  turns.length,
                  ")"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "last5", children: "Last 5 turns" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "custom", children: "Custom turns\u2026" })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn-xs",
              disabled: distilling || executing || !toModel,
              onClick: () => void handleDistill(),
              children: distilling ? "Distilling\u2026" : "AI Distill"
            }
          )
        ] })
      ] }),
      turnScope === "custom" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-thr-row", children: turns.map((t) => {
        const checked = customTurns.includes(t.turn);
        return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { className: "dsh-thr-pill", style: { cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            "input",
            {
              type: "checkbox",
              checked,
              onChange: (e) => {
                setCustomTurns(
                  (prev) => e.target.checked ? [...prev, t.turn].sort((a, b) => a - b) : prev.filter((x) => x !== t.turn)
                );
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
            "T",
            t.turn
          ] })
        ] }, t.turn);
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "input",
        {
          type: "text",
          className: "dsh-thr-input",
          value: nextInstruction,
          onChange: (e) => setNextInstruction(e.target.value),
          placeholder: "Optional next instruction for the receiving model\u2026"
        }
      ),
      preview?.manifest && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
        "div",
        {
          style: {
            borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
            paddingTop: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-faint", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "Moves:" }),
              " ",
              preview.manifest.includedTurnNumbers.length,
              " turn(s),",
              " ",
              preview.manifest.includedToolDigestCount,
              " tool outcome digest(s)"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-faint", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "Stays behind:" }),
              " ",
              preview.manifest.excludedItems.join(" \xB7 ")
            ] }),
            preview.manifest.warnings.map((w, i) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-thr-warn", children: w }, i))
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "textarea",
        {
          className: "dsh-thr-textarea",
          rows: 9,
          value: packetText,
          onChange: (e) => setPacketText(e.target.value),
          placeholder: loadingPreview ? "Building handoff packet\u2026" : "Handoff packet preview\u2026"
        }
      )
    ] }),
    runningConflict && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-warn", children: [
      "Source session is running in this workspace. Choose how to proceed:",
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-row", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn dsh-thr-btn-danger",
            onClick: () => void handleExecute("draft", { stopSourceIfRunning: true }),
            children: "Stop source & open draft"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn",
            disabled: !gitInfo?.isGitRepo || !gitInfo?.headCommit,
            onClick: () => void handleExecute("draft", { workspaceMode: "worktree" }),
            children: "Switch to isolated worktree"
          }
        )
      ] })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-thr-err", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-thr-row", style: { justifyContent: "flex-end" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-thr-btn",
          disabled: executing || distilling || !toModel || !packetText.trim(),
          onClick: () => void handleExecute("draft"),
          children: "Open in typing box"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-thr-btn dsh-thr-btn-primary",
          disabled: executing || distilling || !toModel || !packetText.trim(),
          onClick: () => void handleExecute("send"),
          children: executing ? "Handing off\u2026" : "Handoff & Send now"
        }
      )
    ] })
  ] });
}

// src/client/SideChatView.tsx
var import_react8 = require("react");

// src/client/markdown.tsx
var import_react7 = require("react");
var import_jsx_runtime8 = require("react/jsx-runtime");
function CodeBlock({ language, code }) {
  const [copied, setCopied] = (0, import_react7.useState)(false);
  const handleCopy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-thr-codeblock", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-thr-codeblock-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: language || "code" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: "dsh-thr-btn-xs", onClick: handleCopy, children: copied ? "Copied" : "Copy" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("pre", { className: "dsh-thr-pre", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { children: code }) })
  ] });
}
function isSafeHref(href) {
  const trimmed = href.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://") || trimmed.startsWith("#") || trimmed.startsWith("/");
}
function renderInline(text, keyPrefix) {
  const nodes = [];
  const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\(([^)\s]+)\)|\*[^*\n]+\*)/g;
  let lastIndex = 0;
  let match;
  let tokenIndex = 0;
  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${tokenIndex++}`;
    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { className: "dsh-thr-inline-code", children: token.slice(1, -1) }, key)
      );
    } else if (token.startsWith("**") && token.endsWith("**") || token.startsWith("__") && token.endsWith("__")) {
      nodes.push(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { children: token.slice(2, -2) }, key));
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("em", { children: token.slice(1, -1) }, key));
    } else if (token.startsWith("[")) {
      const splitIdx = token.indexOf("](");
      const label = splitIdx > 1 ? token.slice(1, splitIdx) : token;
      const href = match[2] ?? "";
      if (isSafeHref(href)) {
        nodes.push(
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "a",
            {
              href,
              target: href.startsWith("http") ? "_blank" : void 0,
              rel: href.startsWith("http") ? "noopener noreferrer" : void 0,
              className: "dsh-thr-link",
              children: label
            },
            key
          )
        );
      } else {
        nodes.push(label);
      }
    } else {
      nodes.push(token);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
function SimpleMarkdown({ text }) {
  if (!text) return null;
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks = [];
  let i = 0;
  let keyCounter = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^```([^`\s]*)\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1] ?? "";
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && /^```\s*$/.test(lines[i])) {
        i += 1;
      }
      blocks.push(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)(CodeBlock, { language, code: codeLines.join("\n") }, `b-${keyCounter++}`));
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("hr", { className: "dsh-thr-hr" }, `b-${keyCounter++}`));
      i += 1;
      continue;
    }
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2], `h-${keyCounter}`);
      const key = `b-${keyCounter++}`;
      if (level === 1) blocks.push(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: "dsh-thr-h1", children: content }, key));
      else if (level === 2) blocks.push(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { className: "dsh-thr-h2", children: content }, key));
      else blocks.push(/* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h5", { className: "dsh-thr-h3", children: content }, key));
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("blockquote", { className: "dsh-thr-blockquote", children: renderInline(quoteLines.join(" "), `q-${keyCounter}`) }, `b-${keyCounter++}`)
      );
      continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push(
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "dsh-thr-list", children: items.map((item, idx) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("li", { children: renderInline(item, `ul-${keyCounter}-${idx}`) }, idx)) }, `b-${keyCounter++}`)
      );
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ol", { className: "dsh-thr-list", children: items.map((item, idx) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("li", { children: renderInline(item, `ol-${keyCounter}-${idx}`) }, idx)) }, `b-${keyCounter++}`)
      );
      continue;
    }
    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^#{1,4}\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^[-*+]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) && !/^[-*_]{3,}\s*$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i += 1;
    }
    const k = `p-${keyCounter++}`;
    blocks.push(
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsh-thr-p", children: paraLines.map((pl, idx) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
        idx > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("br", {}) : null,
        renderInline(pl, `${k}-${idx}`)
      ] }, idx)) }, k)
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-thr-md", children: blocks });
}

// src/client/SideChatView.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function SideChatView({
  ctx,
  sessionId,
  sessionTitle,
  defaultModel,
  catalog,
  gitInfo,
  sideChats,
  selectedSideChatId,
  onSelectSideChat,
  pendingQuote,
  pendingAnchorTurn,
  pendingAnchorSeq,
  onClearPendingQuote,
  onRefresh,
  onSideChatUpsert,
  streamingBuffers
}) {
  const activeChat = sideChats.find((c) => c.id === selectedSideChatId) ?? sideChats[0] ?? null;
  const [composer, setComposer] = (0, import_react8.useState)("");
  const [newModel, setNewModel] = (0, import_react8.useState)(defaultModel);
  const [creating, setCreating] = (0, import_react8.useState)(false);
  const [sending, setSending] = (0, import_react8.useState)(false);
  const [stopping, setStopping] = (0, import_react8.useState)(false);
  const [error, setError] = (0, import_react8.useState)(null);
  const [showMergeBack, setShowMergeBack] = (0, import_react8.useState)(false);
  const [showPromote, setShowPromote] = (0, import_react8.useState)(false);
  const [promoteMode, setPromoteMode] = (0, import_react8.useState)("same");
  const [promoteRunningConflict, setPromoteRunningConflict] = (0, import_react8.useState)(false);
  const bottomRef = (0, import_react8.useRef)(null);
  const nearBottomRef = (0, import_react8.useRef)(true);
  (0, import_react8.useEffect)(() => {
    if (!newModel && defaultModel) {
      setNewModel(defaultModel);
    }
  }, [defaultModel, newModel]);
  (0, import_react8.useEffect)(() => {
    setShowMergeBack(false);
    setShowPromote(false);
    setPromoteRunningConflict(false);
    setStopping(false);
    setError(null);
    nearBottomRef.current = true;
  }, [activeChat?.id]);
  const activeIsStreaming = !pendingQuote && Boolean(activeChat?.messages.some((m) => m.streaming));
  const streamingMsg = activeIsStreaming ? activeChat?.messages.find((m) => m.streaming) : void 0;
  const activeStreamBuf = streamingMsg ? streamingBuffers[streamingMsg.id] : void 0;
  (0, import_react8.useEffect)(() => {
    if (!activeIsStreaming) {
      setStopping(false);
    }
  }, [activeIsStreaming]);
  (0, import_react8.useEffect)(() => {
    const container = bottomRef.current?.closest(".dsh-thr-body");
    if (!container) return;
    const updateNearBottom = () => {
      nearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= 90;
    };
    updateNearBottom();
    container.addEventListener("scroll", updateNearBottom, { passive: true });
    return () => {
      container.removeEventListener("scroll", updateNearBottom);
    };
  }, [activeChat?.id]);
  (0, import_react8.useEffect)(() => {
    const container = bottomRef.current?.closest(".dsh-thr-body");
    if (container) {
      nearBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
    }
  }, [activeChat?.id, activeChat?.messages.length]);
  (0, import_react8.useEffect)(() => {
    if (!nearBottomRef.current) return;
    const container = bottomRef.current?.closest(".dsh-thr-body");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [activeStreamBuf?.text, activeStreamBuf?.reasoning]);
  const handleNewChat = async () => {
    setCreating(true);
    setError(null);
    try {
      const created = await threadsApi.createSideChat({
        parentSessionId: sessionId,
        ...pendingQuote ? { quote: pendingQuote } : {},
        ...pendingAnchorTurn !== void 0 ? { anchorTurn: pendingAnchorTurn } : {},
        ...pendingAnchorSeq !== void 0 ? { anchorSeq: pendingAnchorSeq } : {},
        ...newModel ?? defaultModel ? { model: newModel ?? defaultModel } : {}
      });
      onClearPendingQuote?.();
      onSideChatUpsert(created);
      onSelectSideChat(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };
  const handleSend = async () => {
    const text = composer.trim();
    if (!text || sending || activeIsStreaming) return;
    setSending(true);
    setError(null);
    try {
      if (!activeChat || pendingQuote) {
        const created = await threadsApi.createSideChat({
          parentSessionId: sessionId,
          question: text,
          ...pendingQuote ? { quote: pendingQuote } : {},
          ...pendingAnchorTurn !== void 0 ? { anchorTurn: pendingAnchorTurn } : {},
          ...pendingAnchorSeq !== void 0 ? { anchorSeq: pendingAnchorSeq } : {},
          ...newModel ?? defaultModel ? { model: newModel ?? defaultModel } : {}
        });
        setComposer("");
        onClearPendingQuote?.();
        onSideChatUpsert(created);
        onSelectSideChat(created.id);
      } else {
        const updated = await threadsApi.sendSideChatMessage(activeChat.id, {
          text,
          model: activeChat.model
        });
        setComposer("");
        onSideChatUpsert(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };
  const handleModelSwitch = async (next) => {
    setNewModel(next);
    if (activeChat && !pendingQuote) {
      try {
        await threadsApi.updateSideChat(activeChat.id, { model: next });
        onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };
  const handleDelete = async (id) => {
    setError(null);
    try {
      await threadsApi.deleteSideChat(id);
      if (activeChat?.id === id) onSelectSideChat(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const handlePromote = async (delivery, extra = {}) => {
    if (!activeChat) return;
    setError(null);
    setPromoteRunningConflict(false);
    const mode = extra.workspaceMode ?? promoteMode;
    try {
      const res = await threadsApi.promoteSideChat(activeChat.id, {
        workspaceMode: mode,
        delivery,
        model: activeChat.model,
        ...extra.stopSourceIfRunning ? { stopSourceIfRunning: true } : {}
      });
      if (delivery === "draft" && res.draftText) {
        queueDraft(res.sessionId, { text: res.draftText, mode: "replace" });
      }
      setShowPromote(false);
      onRefresh();
      ctx.uiWorkspace?.openSession?.(res.sessionId);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SOURCE_RUNNING") {
        setPromoteRunningConflict(true);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const defaultMergeBrief = activeChat ? (() => {
    const lastAssistant = [...activeChat.messages].reverse().find((m) => m.role === "assistant" && m.text.trim());
    if (lastAssistant) return lastAssistant.text.trim();
    return activeChat.messages.filter((m) => m.text.trim()).map((m) => `${m.role === "user" ? "Q" : "A"}: ${m.text.trim()}`).join("\n\n");
  })() : "";
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-between", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-thr-muted", children: "Read-only Q&A side chats (kept out of main history & sidebar)" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-thr-btn",
          disabled: creating,
          onClick: () => void handleNewChat(),
          children: "+ New"
        }
      )
    ] }),
    sideChats.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-thr-side-chips", children: sideChats.map((chat) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "button",
      {
        type: "button",
        className: `dsh-thr-side-chip ${activeChat?.id === chat.id && !pendingQuote ? "dsh-thr-side-chip-active" : ""}`,
        onClick: () => {
          onClearPendingQuote?.();
          onSelectSideChat(chat.id);
        },
        title: chat.title,
        children: chat.title
      },
      chat.id
    )) }),
    pendingQuote && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-card dsh-thr-card-accent", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-between", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-thr-pill dsh-thr-pill-brand", children: "Selected passage attached" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn-xs",
            onClick: () => onClearPendingQuote?.(),
            children: "Discard quote"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("blockquote", { className: "dsh-thr-blockquote", children: pendingQuote })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-between", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-thr-faint", children: "Side-chat model" }),
        activeChat && !pendingQuote && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-row", children: [
          activeChat.mergedBackAt && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-thr-pill dsh-thr-pill-ok", children: "Merged" }),
          activeChat.promotedSessionId && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn-xs",
              onClick: () => ctx.uiWorkspace?.openSession?.(activeChat.promotedSessionId),
              children: "Open promoted \u2197"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn-xs dsh-thr-btn-danger",
              onClick: () => void handleDelete(activeChat.id),
              children: "Delete"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        ModelPickerRow,
        {
          catalog,
          value: (!pendingQuote ? activeChat?.model : void 0) ?? newModel ?? defaultModel,
          onChange: (next) => void handleModelSwitch(next),
          disabled: activeIsStreaming || sending,
          compact: true
        }
      ),
      activeChat && !pendingQuote && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-faint", children: [
        "Context: ",
        activeChat.contextTurnCount,
        " parent turn(s)",
        activeChat.anchorTurn !== void 0 ? ` \xB7 anchored at T${activeChat.anchorTurn}` : ""
      ] })
    ] }),
    activeChat && !pendingQuote && activeChat.quote && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("blockquote", { className: "dsh-thr-blockquote", children: activeChat.quote }),
    activeChat && !pendingQuote && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-msg-list", children: [
      activeChat.messages.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-thr-muted", children: "Ask a question below to start this side chat." }) : activeChat.messages.map((msg) => {
        const liveBuf = msg.streaming ? streamingBuffers[msg.id] : void 0;
        const displayText = liveBuf ? liveBuf.text : msg.text;
        const displayReasoning = liveBuf ? liveBuf.reasoning : msg.reasoning ?? "";
        return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "div",
          {
            className: `dsh-thr-msg ${msg.role === "user" ? "dsh-thr-msg-user" : "dsh-thr-msg-assistant"}`,
            children: msg.role === "user" ? msg.text : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-between", style: { marginBottom: 4 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-thr-faint", children: formatModelBadge(msg.model ?? activeChat.model) }),
                msg.streaming && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-thr-pill dsh-thr-pill-brand", children: "Streaming\u2026" })
              ] }),
              displayReasoning && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
                "details",
                {
                  className: "dsh-thr-thinking",
                  open: Boolean(msg.streaming && !displayText),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("summary", { children: msg.streaming && !displayText ? "Thinking\u2026" : "Thought process" }),
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-thr-thinking-body", children: displayReasoning })
                  ]
                }
              ),
              displayText ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-stream-text", children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(SimpleMarkdown, { text: displayText }),
                msg.streaming && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-thr-cursor", "aria-hidden": "true" })
              ] }) : msg.streaming && !displayReasoning ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-thr-faint", children: "Thinking\u2026" }) : null,
              msg.error && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-thr-err", children: msg.error })
            ] })
          },
          msg.id
        );
      }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { ref: bottomRef })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-thr-err", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "textarea",
        {
          className: "dsh-thr-textarea",
          rows: 2,
          value: composer,
          onChange: (e) => setComposer(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleSend();
            }
          },
          placeholder: pendingQuote ? "Ask about the selected passage\u2026 (Enter sends)" : "Ask a side question without touching the main session\u2026",
          disabled: sending
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-between", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-thr-row", children: activeChat && !pendingQuote && activeChat.messages.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn-xs",
              onClick: () => {
                setShowPromote(false);
                setShowMergeBack((v) => !v);
              },
              children: "Add findings to parent"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn-xs",
              onClick: () => {
                setShowMergeBack(false);
                setShowPromote((v) => !v);
              },
              children: "Promote to session"
            }
          )
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-row", children: [
          activeIsStreaming && activeChat && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn dsh-thr-btn-danger",
              disabled: stopping,
              onClick: () => {
                setStopping(true);
                void threadsApi.abortSideChat(activeChat.id).catch(() => {
                  setStopping(false);
                });
              },
              children: stopping ? "Stopping\u2026" : "Stop"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn dsh-thr-btn-primary",
              disabled: !composer.trim() || sending || activeIsStreaming,
              onClick: () => void handleSend(),
              children: sending ? "Sending\u2026" : "Ask"
            }
          )
        ] })
      ] })
    ] }),
    showMergeBack && activeChat && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      MergeBackDrawer,
      {
        ctx,
        targetParentSessionId: sessionId,
        targetParentTitle: sessionTitle,
        sourceSessionIdForDistill: sessionId,
        sourceSideChatId: activeChat.id,
        initialText: defaultMergeBrief,
        catalog,
        defaultModel: activeChat.model,
        onClose: () => setShowMergeBack(false),
        onMerged: () => {
          setShowMergeBack(false);
          onRefresh();
        }
      }
    ),
    showPromote && activeChat && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-card dsh-thr-card-accent", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-between", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: "Promote side chat to full DSH session" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn-xs",
            onClick: () => setShowPromote(false),
            children: "Close"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "dsh-thr-row", style: { cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "input",
            {
              type: "radio",
              name: `promote-mode-${activeChat.id}`,
              checked: promoteMode === "same",
              onChange: () => setPromoteMode("same")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "Same workspace" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "dsh-thr-row", style: { cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "input",
            {
              type: "radio",
              name: `promote-mode-${activeChat.id}`,
              checked: promoteMode === "worktree",
              disabled: !gitInfo?.isGitRepo || !gitInfo?.headCommit,
              onChange: () => setPromoteMode("worktree")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "New isolated Git worktree" })
        ] })
      ] }),
      promoteMode === "worktree" && gitInfo?.dirty && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-warn", children: [
        "Source checkout has uncommitted changes; worktree starts from HEAD (",
        gitInfo.headShort,
        ")."
      ] }),
      promoteRunningConflict && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-warn", children: [
        "Parent session is currently running in this workspace.",
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-row", style: { marginTop: 6 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn dsh-thr-btn-danger",
              onClick: () => void handlePromote("draft", { stopSourceIfRunning: true }),
              children: "Stop parent & open draft"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-thr-btn",
              disabled: !gitInfo?.isGitRepo || !gitInfo?.headCommit,
              onClick: () => void handlePromote("draft", { workspaceMode: "worktree" }),
              children: "Use isolated worktree"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-thr-row", style: { justifyContent: "flex-end" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn",
            onClick: () => void handlePromote("draft"),
            children: "Open in typing box"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-thr-btn dsh-thr-btn-primary",
            onClick: () => void handlePromote("send"),
            children: "Promote & Send now"
          }
        )
      ] })
    ] })
  ] });
}

// src/client/TurnsView.tsx
var import_react9 = require("react");
var import_jsx_runtime10 = require("react/jsx-runtime");
function formatTime(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function TurnsView({
  ctx,
  sessionId,
  defaultModel,
  catalog,
  gitInfo,
  turns,
  initialAnchorTurn,
  isClaudeSession,
  onRefresh
}) {
  const [editingTurn, setEditingTurn] = (0, import_react9.useState)(initialAnchorTurn ?? null);
  const [editedPrompt, setEditedPrompt] = (0, import_react9.useState)("");
  const [retryModel, setRetryModel] = (0, import_react9.useState)(defaultModel);
  const [workspaceMode, setWorkspaceMode] = (0, import_react9.useState)("same");
  const [busy, setBusy] = (0, import_react9.useState)(false);
  const [runningConflict, setRunningConflict] = (0, import_react9.useState)(false);
  const [error, setError] = (0, import_react9.useState)(null);
  const [notice, setNotice] = (0, import_react9.useState)(null);
  const openEditorFor = (turn) => {
    setEditingTurn(turn.turn);
    setEditedPrompt(turn.userText);
    setRetryModel(turn.model ?? defaultModel);
    setWorkspaceMode("same");
    setRunningConflict(false);
    setError(null);
    setNotice(null);
  };
  (0, import_react9.useEffect)(() => {
    if (initialAnchorTurn === void 0) return;
    const match = turns.find((t) => t.turn === initialAnchorTurn);
    if (match) {
      openEditorFor(match);
    }
  }, [initialAnchorTurn, turns.length]);
  const submitRetry = async (turn, delivery, extra = {}) => {
    const trimmed = editedPrompt.trim();
    if (!trimmed) {
      setError("Edited prompt must not be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setRunningConflict(false);
    const mode = extra.workspaceMode ?? workspaceMode;
    try {
      const res = await threadsApi.editAndRetry({
        sessionId,
        turnNumber: turn.turn,
        prompt: trimmed,
        delivery,
        workspaceMode: mode,
        ...retryModel ?? turn.model ?? defaultModel ? { model: retryModel ?? turn.model ?? defaultModel } : {},
        ...extra.stopSourceIfRunning ? { stopSourceIfRunning: true } : {}
      });
      if (res.attachmentWarning) {
        setNotice(res.attachmentWarning);
      }
      if (delivery === "draft" && res.draftText) {
        queueDraft(res.sessionId, { text: res.draftText, mode: "replace" });
      }
      setEditingTurn(null);
      onRefresh();
      ctx.uiWorkspace?.openSession?.(res.sessionId);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SOURCE_RUNNING") {
        setRunningConflict(true);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };
  const handleQuickFork = async (turn) => {
    setBusy(true);
    setError(null);
    try {
      const res = await threadsApi.forkSession({
        sessionId,
        atSeq: turn.turnEndSeq,
        anchorTurn: turn.turn,
        workspaceMode: "same",
        ...turn.model ?? defaultModel ? { model: turn.model ?? defaultModel } : {},
        delivery: "draft"
      });
      onRefresh();
      ctx.uiWorkspace?.openSession?.(res.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  if (turns.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dsh-thr-muted", children: "No completed or started turns in this session yet." });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dsh-thr-muted", children: "Fork-and-edit is non-destructive (conversation history only; files on disk stay untouched)." }),
    isClaudeSession && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-faint", children: [
      "Using Claude Code: for in-place conversation + file checkpoint rollback, open Oh My Claude's Rewind tab (",
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("kbd", { children: "Esc" }),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("kbd", { children: "Esc" }),
      " in an empty composer or the Spark button)."
    ] }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dsh-thr-warn", children: notice }),
    error && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dsh-thr-err", children: error }),
    turns.map((turn) => {
      const isEditing = editingTurn === turn.turn;
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "div",
        {
          className: `dsh-thr-card ${isEditing ? "dsh-thr-card-accent" : ""}`,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-between", children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("strong", { children: [
                  "Turn ",
                  turn.turn
                ] }),
                turn.model && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dsh-thr-faint", children: formatModelBadge(turn.model) }),
                turn.toolSummary.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "dsh-thr-pill", children: [
                  turn.toolSummary.length,
                  " tool",
                  turn.toolSummary.length === 1 ? "" : "s"
                ] }),
                turn.userAttachments.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "dsh-thr-pill dsh-thr-pill-warn", children: [
                  turn.userAttachments.length,
                  " attachment",
                  turn.userAttachments.length === 1 ? "" : "s"
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dsh-thr-faint", children: formatTime(turn.time) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
              "div",
              {
                className: "dsh-thr-muted",
                style: {
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 68,
                  overflow: "hidden"
                },
                children: turn.userText || "(attachment-only prompt)"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-thr-btn-xs",
                  onClick: () => isEditing ? setEditingTurn(null) : openEditorFor(turn),
                  children: isEditing ? "Cancel edit" : "Edit & Retry"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dsh-thr-btn-xs",
                  disabled: busy,
                  onClick: () => void handleQuickFork(turn),
                  children: [
                    "Fork after T",
                    turn.turn
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-thr-btn-xs",
                  onClick: () => publishThreadsIntent(
                    {
                      sessionId,
                      tab: "side",
                      anchorTurn: turn.turn,
                      anchorSeq: turn.turnEndSeq
                    },
                    ctx
                  ),
                  children: "Side chat"
                }
              )
            ] }),
            isEditing && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
              "div",
              {
                style: {
                  borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.22))",
                  paddingTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                },
                children: [
                  turn.prevCompletedEndSeq === null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dsh-thr-faint", children: "Turn 1 has no prior history; retrying starts a fresh session with your edited prompt." }),
                  turn.userAttachments.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-warn", children: [
                    "Attachments (",
                    turn.userAttachments.map((a) => a.name ?? a.kind).join(", "),
                    ") are not automatically copied; use Open in typing box if you need to re-attach files."
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                    "textarea",
                    {
                      className: "dsh-thr-textarea",
                      rows: 4,
                      value: editedPrompt,
                      onChange: (e) => setEditedPrompt(e.target.value),
                      disabled: busy
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                    ModelPickerRow,
                    {
                      catalog,
                      value: retryModel ?? turn.model ?? defaultModel,
                      onChange: setRetryModel,
                      disabled: busy,
                      compact: true
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-row", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { className: "dsh-thr-row", style: { cursor: "pointer" }, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                        "input",
                        {
                          type: "radio",
                          name: `retry-ws-${turn.turn}`,
                          checked: workspaceMode === "same",
                          onChange: () => setWorkspaceMode("same")
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "Same workspace" })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { className: "dsh-thr-row", style: { cursor: "pointer" }, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                        "input",
                        {
                          type: "radio",
                          name: `retry-ws-${turn.turn}`,
                          checked: workspaceMode === "worktree",
                          disabled: !gitInfo?.isGitRepo || !gitInfo?.headCommit,
                          onChange: () => setWorkspaceMode("worktree")
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "New Git worktree" })
                    ] })
                  ] }),
                  workspaceMode === "worktree" && gitInfo?.dirty && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-warn", children: [
                    "New worktree starts from committed HEAD (",
                    gitInfo.headShort,
                    "); uncommitted edits stay in this checkout."
                  ] }),
                  runningConflict && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-warn", children: [
                    "Source session is running in this workspace.",
                    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-row", style: { marginTop: 6 }, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                        "button",
                        {
                          type: "button",
                          className: "dsh-thr-btn dsh-thr-btn-danger",
                          onClick: () => void submitRetry(turn, "draft", { stopSourceIfRunning: true }),
                          children: "Stop source & open draft"
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                        "button",
                        {
                          type: "button",
                          className: "dsh-thr-btn",
                          disabled: !gitInfo?.isGitRepo || !gitInfo?.headCommit,
                          onClick: () => void submitRetry(turn, "draft", { workspaceMode: "worktree" }),
                          children: "Use isolated worktree"
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-thr-row", style: { justifyContent: "flex-end" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                      "button",
                      {
                        type: "button",
                        className: "dsh-thr-btn",
                        disabled: busy || !editedPrompt.trim(),
                        onClick: () => void submitRetry(turn, "draft"),
                        children: "Open in typing box"
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                      "button",
                      {
                        type: "button",
                        className: "dsh-thr-btn dsh-thr-btn-primary",
                        disabled: busy || !editedPrompt.trim(),
                        onClick: () => void submitRetry(turn, "send"),
                        children: busy ? "Forking\u2026" : "Fork & Send now"
                      }
                    )
                  ] })
                ]
              }
            )
          ]
        },
        turn.turn
      );
    })
  ] });
}

// src/client/ThreadsTab.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
function mergeSideChatPreservingFinal(existing, incoming) {
  if (!existing) return incoming;
  const existingById = new Map(existing.messages.map((m) => [m.id, m]));
  let keptFinal = false;
  const mergedMessages = incoming.messages.map((m) => {
    const prev = existingById.get(m.id);
    if (prev && !prev.streaming && m.streaming) {
      keptFinal = true;
      return prev;
    }
    return m;
  });
  if (keptFinal && existing.messages.length >= incoming.messages.length) {
    return existing;
  }
  if (existing.updatedAt > incoming.updatedAt && existing.messages.length >= incoming.messages.length) {
    return existing;
  }
  return keptFinal ? { ...incoming, messages: mergedMessages } : incoming;
}
function isClaudeModel(provider) {
  if (!provider) return false;
  return provider === "claude-code" || provider.startsWith("claude");
}
function ThreadsTabTitle({ useTabInfo }) {
  useTabInfo?.();
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(ThreadsIcon, { size: 13 }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: "Threads" })
  ] });
}
function ThreadsTabBody(props) {
  const { ctx, sessionId, useTabInfo } = props;
  const tabInfo = useTabInfo?.();
  const navParams = tabInfo?.tab.navigation.params;
  const [subTab, setSubTab] = (0, import_react10.useState)("side");
  const [selectedSideChatId, setSelectedSideChatId] = (0, import_react10.useState)(null);
  const [pendingQuote, setPendingQuote] = (0, import_react10.useState)(void 0);
  const [pendingAnchorTurn, setPendingAnchorTurn] = (0, import_react10.useState)(void 0);
  const [pendingAnchorSeq, setPendingAnchorSeq] = (0, import_react10.useState)(void 0);
  const [handoffNote, setHandoffNote] = (0, import_react10.useState)(void 0);
  const [inspect, setInspect] = (0, import_react10.useState)(null);
  const [catalog, setCatalog] = (0, import_react10.useState)(null);
  const [loading, setLoading] = (0, import_react10.useState)(false);
  const [error, setError] = (0, import_react10.useState)(null);
  const [streamingBuffers, setStreamingBuffers] = (0, import_react10.useState)({});
  const latestSeqByMsgRef = (0, import_react10.useRef)({});
  const sessionIdRef = (0, import_react10.useRef)(sessionId);
  sessionIdRef.current = sessionId;
  const syncBuffersForChats = (0, import_react10.useCallback)(
    (chats, scope = "all") => {
      setStreamingBuffers((prev) => {
        let next = null;
        const ensureNext = () => {
          if (!next) next = { ...prev };
          return next;
        };
        const activeIds = /* @__PURE__ */ new Set();
        const finishedIds = /* @__PURE__ */ new Set();
        for (const chat of chats) {
          for (const msg of chat.messages) {
            if (msg.streaming) {
              activeIds.add(msg.id);
              const serverSeq = msg.streamSeq ?? 0;
              const cur = prev[msg.id];
              if (!cur) {
                if (msg.text || msg.reasoning || serverSeq > 0) {
                  latestSeqByMsgRef.current[msg.id] = Math.max(
                    latestSeqByMsgRef.current[msg.id] ?? 0,
                    serverSeq
                  );
                  ensureNext()[msg.id] = {
                    text: msg.text,
                    reasoning: msg.reasoning ?? "",
                    seq: serverSeq
                  };
                }
              } else if (serverSeq > cur.seq) {
                latestSeqByMsgRef.current[msg.id] = Math.max(
                  latestSeqByMsgRef.current[msg.id] ?? 0,
                  serverSeq
                );
                ensureNext()[msg.id] = {
                  text: msg.text,
                  reasoning: msg.reasoning ?? cur.reasoning,
                  seq: serverSeq
                };
              }
            } else {
              finishedIds.add(msg.id);
            }
          }
        }
        if (scope === "all") {
          for (const msgId of Object.keys(prev)) {
            if (!activeIds.has(msgId)) {
              delete latestSeqByMsgRef.current[msgId];
              delete ensureNext()[msgId];
            }
          }
        } else {
          for (const msgId of finishedIds) {
            if (msgId in latestSeqByMsgRef.current) {
              delete latestSeqByMsgRef.current[msgId];
            }
            if (msgId in prev) {
              delete ensureNext()[msgId];
            }
          }
        }
        return next ?? prev;
      });
    },
    []
  );
  const upsertSideChat = (0, import_react10.useCallback)(
    (incoming) => {
      let mergedForSync = incoming;
      setInspect((prev) => {
        if (!prev) return prev;
        const existing = prev.sideChats.find((c) => c.id === incoming.id);
        const merged = mergeSideChatPreservingFinal(existing, incoming);
        mergedForSync = merged;
        const nextChats = existing ? prev.sideChats.map((c) => c.id === incoming.id ? merged : c) : [merged, ...prev.sideChats];
        return { ...prev, sideChats: nextChats };
      });
      syncBuffersForChats([mergedForSync], "partial");
    },
    [syncBuffersForChats]
  );
  const refreshSideChats = (0, import_react10.useCallback)(async () => {
    const targetSessionId = sessionIdRef.current;
    if (!targetSessionId) return;
    try {
      const chats = await threadsApi.listSideChats(targetSessionId);
      if (sessionIdRef.current !== targetSessionId) return;
      let mergedChats = chats;
      setInspect((prev) => {
        if (!prev || prev.sessionId !== targetSessionId) return prev;
        const prevById = new Map(prev.sideChats.map((c) => [c.id, c]));
        mergedChats = chats.map((c) => mergeSideChatPreservingFinal(prevById.get(c.id), c));
        return { ...prev, sideChats: mergedChats };
      });
      syncBuffersForChats(mergedChats, "all");
    } catch {
    }
  }, [syncBuffersForChats]);
  (0, import_react10.useEffect)(() => {
    latestSeqByMsgRef.current = {};
    setStreamingBuffers({});
  }, [sessionId]);
  (0, import_react10.useEffect)(() => {
    const paramTab = navParams?.tab;
    if (paramTab === "side" || paramTab === "tree" || paramTab === "turns" || paramTab === "handoff") {
      setSubTab(paramTab);
    }
    if (typeof navParams?.sideChatId === "string") {
      setSelectedSideChatId(navParams.sideChatId);
    }
  }, [tabInfo?.tab.navigation.revision, navParams?.tab, navParams?.sideChatId]);
  (0, import_react10.useEffect)(() => {
    if (!sessionId) return;
    const applyIntent = () => {
      const intent = getThreadsIntent(sessionId);
      if (!intent) return;
      setSubTab(intent.tab);
      if (intent.sideChatId !== void 0) setSelectedSideChatId(intent.sideChatId);
      if (intent.quote !== void 0) setPendingQuote(intent.quote);
      if (intent.anchorTurn !== void 0) setPendingAnchorTurn(intent.anchorTurn);
      if (intent.anchorSeq !== void 0) setPendingAnchorSeq(intent.anchorSeq);
      if (intent.note !== void 0) setHandoffNote(intent.note);
    };
    applyIntent();
    return subscribeThreadsIntents(applyIntent);
  }, [sessionId]);
  const loadAll = (0, import_react10.useCallback)(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      threadsApi.inspectSession(sessionId),
      threadsApi.fetchCatalog().catch(() => null)
    ]).then(([insp, cat]) => {
      if (cancelled) return;
      setInspect((prev) => {
        if (!prev || prev.sessionId !== insp.sessionId) {
          return insp;
        }
        const prevById = new Map(prev.sideChats.map((c) => [c.id, c]));
        return {
          ...insp,
          sideChats: insp.sideChats.map(
            (c) => mergeSideChatPreservingFinal(prevById.get(c.id), c)
          )
        };
      });
      syncBuffersForChats(insp.sideChats, "all");
      if (cat) setCatalog(cat);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, syncBuffersForChats]);
  (0, import_react10.useEffect)(() => {
    const cancel = loadAll();
    const bindCleanup = tabInfo?.tab.actions.bindCommands?.({
      refresh: () => {
        loadAll();
      }
    });
    return () => {
      cancel?.();
      bindCleanup?.();
    };
  }, [loadAll, tabInfo?.tab.actions]);
  (0, import_react10.useEffect)(() => {
    if (!sessionId) return;
    return subscribeThreadsEvents(
      (ev) => {
        if (ev.type === "side-chat-delta" && ev.parentSessionId === sessionId) {
          const prevSeq = latestSeqByMsgRef.current[ev.messageId] ?? 0;
          if (ev.seq !== void 0 && prevSeq >= ev.seq) {
            return;
          }
          const missedSeq = ev.seq !== void 0 && prevSeq > 0 && ev.seq > prevSeq + 1;
          if (ev.seq !== void 0) {
            latestSeqByMsgRef.current[ev.messageId] = ev.seq;
          }
          setStreamingBuffers((prev) => {
            const cur = prev[ev.messageId] ?? { text: "", reasoning: "", seq: 0 };
            if (ev.seq !== void 0 && cur.seq >= ev.seq) return prev;
            const nextSeq = ev.seq ?? cur.seq + 1;
            return {
              ...prev,
              [ev.messageId]: {
                text: ev.channel === "reasoning" ? cur.text : `${cur.text}${ev.delta}`,
                reasoning: ev.channel === "reasoning" ? `${cur.reasoning}${ev.delta}` : cur.reasoning,
                seq: nextSeq
              }
            };
          });
          if (missedSeq) {
            void refreshSideChats();
          }
          return;
        }
        if (ev.type === "side-chat-updated" && ev.parentSessionId === sessionId) {
          upsertSideChat(ev.sideChat);
          return;
        }
        if (ev.type === "side-chat-deleted" && ev.parentSessionId === sessionId) {
          setInspect((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              sideChats: prev.sideChats.filter((c) => c.id !== ev.sideChatId)
            };
          });
          return;
        }
        if (ev.type === "lineage-updated" && ev.sessionIds.includes(sessionId)) {
          loadAll();
        }
      },
      {
        onReconnect: () => {
          void refreshSideChats();
        }
      }
    );
  }, [sessionId, loadAll, upsertSideChat, refreshSideChats]);
  const hasStreamingSideChat = Boolean(
    inspect?.sideChats.some((c) => c.messages.some((m) => m.streaming))
  );
  (0, import_react10.useEffect)(() => {
    if (!sessionId || !hasStreamingSideChat) return;
    const timer = setInterval(() => {
      if (!isThreadsSseOpen()) {
        void refreshSideChats();
      }
    }, 1500);
    return () => {
      clearInterval(timer);
    };
  }, [sessionId, hasStreamingSideChat, refreshSideChats]);
  if (!sessionId) {
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-thr-root", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-thr-body", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-thr-muted", children: "Open a session to use Threads." }) }) });
  }
  const sideChats = inspect?.sideChats ?? [];
  const turns = inspect?.turns ?? [];
  const tree = inspect?.tree ?? null;
  const branchCount = Math.max(0, (tree?.nodes.length ?? 1) - 1);
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-thr-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-thr-subtabs", role: "tablist", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": subTab === "side",
          className: `dsh-thr-subtab ${subTab === "side" ? "dsh-thr-subtab-active" : ""}`,
          onClick: () => setSubTab("side"),
          children: [
            "Side Chats",
            sideChats.length > 0 ? ` (${sideChats.length})` : ""
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": subTab === "tree",
          className: `dsh-thr-subtab ${subTab === "tree" ? "dsh-thr-subtab-active" : ""}`,
          onClick: () => setSubTab("tree"),
          children: [
            "Fork Tree",
            branchCount > 0 ? ` (${branchCount})` : ""
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": subTab === "turns",
          className: `dsh-thr-subtab ${subTab === "turns" ? "dsh-thr-subtab-active" : ""}`,
          onClick: () => setSubTab("turns"),
          children: [
            "Turns",
            turns.length > 0 ? ` (${turns.length})` : ""
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": subTab === "handoff",
          className: `dsh-thr-subtab ${subTab === "handoff" ? "dsh-thr-subtab-active" : ""}`,
          onClick: () => setSubTab("handoff"),
          children: "Handoff"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-thr-body", children: [
      loading && !inspect && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-thr-muted", children: "Loading session state\u2026" }),
      error && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-thr-err", children: error }),
      subTab === "side" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        SideChatView,
        {
          ctx,
          sessionId,
          sessionTitle: inspect?.title || `Session ${sessionId.slice(0, 8)}`,
          defaultModel: inspect?.model ?? catalog?.defaultModel,
          catalog,
          gitInfo: inspect?.gitInfo ?? null,
          sideChats,
          selectedSideChatId,
          onSelectSideChat: setSelectedSideChatId,
          pendingQuote,
          pendingAnchorTurn,
          pendingAnchorSeq,
          onClearPendingQuote: () => {
            setPendingQuote(void 0);
            setPendingAnchorTurn(void 0);
            setPendingAnchorSeq(void 0);
          },
          onRefresh: loadAll,
          onSideChatUpsert: upsertSideChat,
          streamingBuffers
        }
      ),
      subTab === "tree" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        ForkTreeView,
        {
          ctx,
          sessionId,
          sessionTitle: inspect?.title || `Session ${sessionId.slice(0, 8)}`,
          defaultModel: inspect?.model ?? catalog?.defaultModel,
          catalog,
          gitInfo: inspect?.gitInfo ?? null,
          turns,
          sideChats,
          tree,
          initialAnchorTurn: pendingAnchorTurn,
          initialAnchorSeq: pendingAnchorSeq,
          onRefresh: loadAll,
          onSelectSideTab: () => setSubTab("side")
        }
      ),
      subTab === "turns" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        TurnsView,
        {
          ctx,
          sessionId,
          defaultModel: inspect?.model ?? catalog?.defaultModel,
          catalog,
          gitInfo: inspect?.gitInfo ?? null,
          turns,
          initialAnchorTurn: pendingAnchorTurn,
          isClaudeSession: isClaudeModel(inspect?.model?.provider),
          onRefresh: loadAll
        }
      ),
      subTab === "handoff" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        HandoffView,
        {
          ctx,
          sessionId,
          defaultModel: inspect?.model ?? catalog?.defaultModel,
          catalog,
          gitInfo: inspect?.gitInfo ?? null,
          turns,
          initialNote: handoffNote,
          onRefresh: loadAll
        }
      )
    ] })
  ] });
}

// src/client/TurnTailControls.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
function TurnTailControls({
  ctx,
  sessionId,
  turn,
  seq
}) {
  if (!sessionId) return null;
  const turnNumber = typeof turn === "number" ? turn : turn?.turn;
  if (typeof turnNumber !== "number" || !Number.isFinite(turnNumber)) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsh-thr-turntail", "data-dsh-threads-turntail": turnNumber, children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "button",
      {
        type: "button",
        className: "dsh-thr-btn-xs",
        title: "Ask a side question anchored at this turn",
        onClick: () => publishThreadsIntent(
          {
            sessionId,
            tab: "side",
            anchorTurn: turnNumber,
            ...typeof seq === "number" ? { anchorSeq: seq } : {}
          },
          ctx
        ),
        children: "Side chat"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "button",
      {
        type: "button",
        className: "dsh-thr-btn-xs",
        title: "Edit this turn's prompt and retry in a new fork or worktree",
        onClick: () => publishThreadsIntent(
          {
            sessionId,
            tab: "turns",
            anchorTurn: turnNumber,
            ...typeof seq === "number" ? { anchorSeq: seq } : {}
          },
          ctx
        ),
        children: "Edit & Retry"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "button",
      {
        type: "button",
        className: "dsh-thr-btn-xs",
        title: "Branch or track lineage from this turn",
        onClick: () => publishThreadsIntent(
          {
            sessionId,
            tab: "tree",
            anchorTurn: turnNumber,
            ...typeof seq === "number" ? { anchorSeq: seq } : {}
          },
          ctx
        ),
        children: "Branch"
      }
    )
  ] });
}

// src/client/index.ts
var name = "dsh-threads";
var inject = [
  "slots",
  "sessions",
  "workspaces",
  "uiWorkspace",
  "uiSession",
  "uiConversation",
  "sidebarRight",
  "sidebarRightTabs"
];
function apply(ctx) {
  ensureThreadsStyles();
  const disposers = [];
  if (ctx.sidebarRightTabs) {
    disposers.push(
      ctx.sidebarRightTabs.register({
        id: THREADS_TAB_KIND,
        kind: THREADS_TAB_KIND,
        priority: "extension",
        title: () => "Threads",
        guide: [
          {
            id: "threads",
            order: 25,
            title: () => "Threads",
            description: () => "Side chats, fork tree, edit & retry, and provider handoff",
            icon: ThreadsIcon
          }
        ]
      })
    );
  }
  disposers.push(
    ctx.slots.inject(
      "sidebar.right.pane.tab",
      () => ctx.slots.register(
        {
          name: "sidebar.right.pane.tab",
          key: THREADS_TAB_KIND
        },
        (props) => (0, import_react11.createElement)(ThreadsTabBody, { ...props, ctx })
      )
    )
  );
  disposers.push(
    ctx.slots.inject(
      "sidebar.right.pane.tab.title",
      () => ctx.slots.register(
        {
          name: "sidebar.right.pane.tab.title",
          key: THREADS_TAB_KIND
        },
        (props) => (0, import_react11.createElement)(ThreadsTabTitle, { ...props, ctx })
      )
    )
  );
  disposers.push(
    ctx.slots.inject(
      "conversation.input.dock",
      () => ctx.slots.register(
        {
          name: "conversation.input.dock",
          id: "dsh-threads-draft-relay",
          order: 90
        },
        DraftRelay
      )
    )
  );
  disposers.push(
    ctx.slots.inject(
      "conversation.session.header.actions",
      () => ctx.slots.register(
        {
          name: "conversation.session.header.actions",
          id: "dsh-threads-lineage",
          order: 20
        },
        (props) => (0, import_react11.createElement)(LineageHeaderPill, { sessionId: props.sessionId, ctx })
      )
    )
  );
  disposers.push(
    ctx.slots.inject(
      "conversation.session.header.utilities",
      () => ctx.slots.register(
        {
          name: "conversation.session.header.utilities",
          id: "dsh-threads-trigger",
          order: 30
        },
        (props) => (0, import_react11.createElement)(ThreadsHeaderButton, { sessionId: props.sessionId, ctx })
      )
    )
  );
  disposers.push(
    ctx.slots.inject(
      "conversation.chat.turnTail",
      () => ctx.slots.register(
        {
          name: "conversation.chat.turnTail",
          id: "dsh-threads-turn-actions",
          order: 40
        },
        (props) => (0, import_react11.createElement)(TurnTailControls, { ...props, ctx })
      )
    )
  );
  disposers.push(
    ctx.slots.inject("conversation.chat.text-interaction", () => {
      try {
        return ctx.slots.register(
          {
            name: "conversation.chat.text-interaction",
            key: "quote",
            priority: -2,
            locale: "messageQuotes"
          },
          (props) => (0, import_react11.createElement)(SelectionPopover, { ...props, ctx })
        );
      } catch (err) {
        console.warn("[dsh-threads] selection popover not registered:", err);
        return () => {
        };
      }
    })
  );
  disposers.push(
    subscribeThreadsEvents((ev) => {
      if (ev.type === "open-ui") {
        publishThreadsIntent(
          {
            sessionId: ev.sessionId,
            tab: ev.tab,
            ...ev.sideChatId ? { sideChatId: ev.sideChatId } : {},
            ...ev.quote ? { quote: ev.quote } : {},
            ...ev.anchorTurn !== void 0 ? { anchorTurn: ev.anchorTurn } : {},
            ...ev.anchorSeq !== void 0 ? { anchorSeq: ev.anchorSeq } : {},
            ...ev.note ? { note: ev.note } : {}
          },
          ctx
        );
      }
    })
  );
  return () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch {
      }
    }
  };
}
return module.exports; } });
//# sourceMappingURL=client.js.map
