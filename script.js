// ========================================
// DOM REFERENCES
// ========================================
const chatEl = document.getElementById("chat");
const emptyStateEl = document.getElementById("emptyState");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const modelEl = document.getElementById("model");
const modelDropdown = document.getElementById("modelDropdown");
const installedModelsLabel = document.getElementById("installedModelsLabel");
const refreshModelsBtn = document.getElementById("refreshModelsBtn");
const pullModelBtn = document.getElementById("pullModelBtn");
const hostEl = document.getElementById("host");
const apiPathEl = document.getElementById("apiPath");
const thinkToggle = document.getElementById("thinkToggle");
const streamToggle = document.getElementById("streamToggle");
const settingsSidebar = document.getElementById("settingsSidebar");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");

const sidebarResizeHandle = document.getElementById("sidebarResizeHandle");
const composerResizeHandle = document.getElementById("composerResizeHandle");
const composerEl = document.getElementById("composer");

// ========================================
// APP STATE
// ========================================
let messages = [];
let lastUserText = "";
let isGenerating = false;
let thinkingDefaultExpanded = true;
let abortController = null;
let durationInterval = null;

// ========================================
// LAYOUT CONSTANTS
// ========================================
const SIDEBAR_COLLAPSED_WIDTH = 0;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 700;

const COMPOSER_DEFAULT_HEIGHT = 180;
const COMPOSER_TEXTAREA_MIN_HEIGHT = 100;
const COMPOSER_MAX_HEIGHT_RATIO = 0.7;

let expandedSidebarWidth = SIDEBAR_DEFAULT_WIDTH;

// ========================================
// MARKDOWN SETUP
// ========================================
marked.setOptions({
  gfm: true,
  breaks: true
});

// ========================================
// RENDERING HELPERS
// ========================================
function renderMarkdown(md) {
  const raw = marked.parse(md || "");
  return DOMPurify.sanitize(raw);
}

function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ========================================
// FORMAT HELPERS
// ========================================
function formatClockTime(date) {
  return new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatDuration(ms) {
  if (typeof ms !== "number" || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;

  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)} s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function formatBytes(bytes) {
  if (typeof bytes !== "number" || bytes <= 0) return "";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;

  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }

  return `${bytes.toFixed(1)} ${units[i]}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ========================================
// UI STATE HELPERS
// ========================================
function updateEmptyState() {
  const hasMessages = chatEl.querySelector(".row");
  const emptyStateEl = document.getElementById("emptyState");
  if (hasMessages) {
    emptyStateEl.style.display = "none";
  } else {
    emptyStateEl.style.display = "flex";
  }
}

function updateSendButtonState() {
  if (isGenerating) {
    sendBtn.textContent = "Stop";
    sendBtn.classList.remove("primary");
  } else {
    sendBtn.textContent = "Send";
    sendBtn.classList.add("primary");
  }
}

// ========================================
// CLIPBOARD / ERROR HELPERS
// ========================================
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    alert("Could not copy text.");
  }
}

async function extractErrorFromResponse(response) {
  const raw = await response.text();

  try {
    const data = JSON.parse(raw);
    if (data && typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch (_) {}

  const text = raw.trim();
  if (text) return text;

  return `HTTP ${response.status} ${response.statusText}`;
}

// ========================================
// URL / API HELPERS
// ========================================
function normalizeHost(host) {
  return (host || "").trim().replace(/\/+$/, "");
}

function normalizePath(path) {
  const trimmed = (path || "").trim();
  if (!trimmed) return "/api/chat";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function buildEndpointUrl() {
  return `${normalizeHost(hostEl.value)}${normalizePath(apiPathEl.value)}`;
}

function buildTagsUrl() {
  const host = normalizeHost(hostEl.value);
  const apiPath = normalizePath(apiPathEl.value);

  if (apiPath.endsWith("/chat")) {
    return `${host}${apiPath.slice(0, -"/chat".length)}/tags`;
  }

  if (apiPath.endsWith("/generate")) {
    return `${host}${apiPath.slice(0, -"/generate".length)}/tags`;
  }

  if (apiPath.endsWith("/tags")) {
    return `${host}${apiPath}`;
  }

  if (apiPath.endsWith("/api")) {
    return `${host}${apiPath}/tags`;
  }

  return `${host}/api/tags`;
}

function buildPullUrl() {
  const host = normalizeHost(hostEl.value);
  const apiPath = normalizePath(apiPathEl.value);

  if (apiPath.endsWith("/chat")) {
    return `${host}${apiPath.slice(0, -"/chat".length)}/pull`;
  }

  if (apiPath.endsWith("/generate")) {
    return `${host}${apiPath.slice(0, -"/generate".length)}/pull`;
  }

  if (apiPath.endsWith("/tags")) {
    return `${host}${apiPath.slice(0, -"/tags".length)}/pull`;
  }

  if (apiPath.endsWith("/pull")) {
    return `${host}${apiPath}`;
  }

  if (apiPath.endsWith("/api")) {
    return `${host}${apiPath}/pull`;
  }

  return `${host}/api/pull`;
}

function syncModelDropdownTitle() {
  const selectedOption = modelDropdown.options[modelDropdown.selectedIndex];
  modelDropdown.title = selectedOption ? selectedOption.textContent : "";
}

function updateInstalledModelsLabel(count) {
  if (!installedModelsLabel) return;
  installedModelsLabel.textContent = `Installed Models (${count})`;
}

// ========================================
// KEYBOARD / FOCUS HELPERS
// ========================================
function isEditableElement(el) {
  if (!el) return false;

  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function shouldRedirectKeyToPrompt(e) {
  if (e.defaultPrevented) return false;
  if (e.isComposing) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;

  const ignoredKeys = new Set([
    "Shift",
    "Control",
    "Alt",
    "Meta",
    "Fn",
    "Tab",
    "CapsLock",
    "Escape"
  ]);

  if (ignoredKeys.has(e.key)) return false;

  return true;
}

function scrollChatToTop() {
  chatEl.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollChatToBottom() {
  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" });
}

// ========================================
// SIDEBAR / COMPOSER SIZE HELPERS
// ========================================
function applySidebarWidth(width) {
  const safeWidth = clamp(width, SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.floor(window.innerWidth / 2)));
  expandedSidebarWidth = safeWidth;

  if (!settingsSidebar.classList.contains("collapsed")) {
    settingsSidebar.style.width = `${safeWidth}px`;
    settingsSidebar.style.minWidth = `${safeWidth}px`;
    settingsSidebar.style.maxWidth = `${safeWidth}px`;
  }
}

function setSidebarCollapsedStyles() {
  settingsSidebar.style.width = `${SIDEBAR_COLLAPSED_WIDTH}px`;
  settingsSidebar.style.minWidth = `${SIDEBAR_COLLAPSED_WIDTH}px`;
  settingsSidebar.style.maxWidth = `${SIDEBAR_COLLAPSED_WIDTH}px`;
}

function syncSidebarResizeAvailability() {
  if (!sidebarResizeHandle) return;
  const collapsed = settingsSidebar.classList.contains("collapsed");
  sidebarResizeHandle.style.display = collapsed ? "none" : "block";
}

function getComposerMinHeight() {
  if (!composerEl) return COMPOSER_TEXTAREA_MIN_HEIGHT;

  const composerStyles = window.getComputedStyle(composerEl);
  const inputWrap = composerEl.querySelector(".input-wrap");
  const helperText = inputWrap?.querySelector(".muted");
  const composerActions = composerEl.querySelector(".composer-actions");

  const paddingTop = parseFloat(composerStyles.paddingTop) || 0;
  const paddingBottom = parseFloat(composerStyles.paddingBottom) || 0;
  const rowGap = parseFloat(composerStyles.gap) || 0;

  const inputWrapStyles = inputWrap ? window.getComputedStyle(inputWrap) : null;
  const inputGap = inputWrapStyles ? (parseFloat(inputWrapStyles.gap) || 0) : 0;

  const helperHeight = helperText ? helperText.getBoundingClientRect().height : 0;
  const actionsHeight = composerActions ? composerActions.getBoundingClientRect().height : 0;

  return Math.ceil(
    paddingTop +
    paddingBottom +
    rowGap +
    COMPOSER_TEXTAREA_MIN_HEIGHT +
    inputGap +
    helperHeight +
    actionsHeight
  );
}

function getComposerMaxHeight() {
  return Math.floor(window.innerHeight * COMPOSER_MAX_HEIGHT_RATIO);
}

function applyComposerHeight(height) {
  if (!composerEl) return;
  const safeHeight = clamp(height, getComposerMinHeight(), getComposerMaxHeight());
  composerEl.style.height = `${safeHeight}px`;
}

function ensureComposerHeightFitsViewport() {
  if (!composerEl) return;
  const currentHeight = composerEl.getBoundingClientRect().height || COMPOSER_DEFAULT_HEIGHT;
  applyComposerHeight(currentHeight);
}

// ========================================
// MODEL LOADING
// ========================================
async function loadModelList() {
  const previousValue = modelDropdown.value;
  modelDropdown.innerHTML = `<option value="" disabled selected>Select model</option>`;
  updateInstalledModelsLabel(0);
  modelDropdown.disabled = true;
  refreshModelsBtn.disabled = true;

  try {
    const response = await fetch(buildTagsUrl());

    if (!response.ok) {
      const serverError = await extractErrorFromResponse(response);
      throw new Error(serverError);
    }

    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];

    modelDropdown.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select model";
    placeholder.disabled = true;
    placeholder.selected = true;
    modelDropdown.appendChild(placeholder);

    if (!models.length) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "No models found";
      empty.disabled = true;
      modelDropdown.appendChild(empty);
      return;
    }

    const modelEntries = models
      .map(item => ({
        name: item?.name || item?.model,
        size: item?.size
      }))
      .filter(m => m.name);

    updateInstalledModelsLabel(modelEntries.length);

    for (const m of modelEntries) {
      const option = document.createElement("option");
      option.value = m.name;

      const sizeLabel = m.size ? ` (${formatBytes(m.size)})` : "";
      option.textContent = `${m.name}${sizeLabel}`;

      modelDropdown.appendChild(option);
    }

    const names = modelEntries.map(m => m.name);
    const typed = modelEl.value.trim();

    if (names.includes(typed)) {
      modelDropdown.value = typed;
    } else if (names.includes(previousValue)) {
      modelDropdown.value = previousValue;
    } else {
      modelDropdown.value = "";
    }

    syncModelDropdownTitle();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    modelDropdown.innerHTML = `<option value="" disabled selected>Select model</option>`;
    updateInstalledModelsLabel(0);

    messages.push({
      role: "system",
      content: `Loading model list failed.\n\nError:\n${message}`
    });

    createMessageCard("system", `**Error loading model list:** ${message}`, {
      getRawText: () => `Error loading model list: ${message}`,
      startTime: new Date()
    });
  } finally {
    modelDropdown.disabled = false;
    refreshModelsBtn.disabled = false;
  }
}

async function pullModel() {
  const modelName = modelEl.value.trim();

  if (!modelName) {
    createMessageCard("system", "**Pull model failed:** Please enter a model name first.", {
      getRawText: () => "Pull model failed: Please enter a model name first.",
      startTime: new Date()
    });
    return;
  }

  const startedAt = new Date();
  const startedMs = Date.now();

  if (pullModelBtn) {
    pullModelBtn.disabled = true;
  }

  try {
    const response = await fetch(buildPullUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: modelName,
        stream: false
      })
    });

    if (!response.ok) {
      const serverError = await extractErrorFromResponse(response);
      throw new Error(serverError);
    }

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    const statusText = data?.status ? `\n\nStatus: ${data.status}` : "";
    const digestText = data?.digest ? `\nDigest: ${data.digest}` : "";

    messages.push({
      role: "system",
      content: `Pulled model: ${modelName}${statusText}${digestText}`
    });

    createMessageCard("system", `**Pulled model:** ${modelName}${statusText}${digestText}`, {
      getRawText: () => `Pulled model: ${modelName}${statusText.replaceAll("\n", " ")}${digestText.replaceAll("\n", " ")}`,
      startTime: startedAt,
      durationMs: Date.now() - startedMs
    });

    await loadModelList();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    messages.push({
      role: "system",
      content: `Pulling model failed.\n\nModel:\n${modelName}\n\nError:\n${message}`
    });

    createMessageCard("system", `**Error pulling model:** ${message}`, {
      getRawText: () => `Error pulling model: ${message}`,
      startTime: startedAt,
      durationMs: Date.now() - startedMs
    });
  } finally {
    if (pullModelBtn) {
      pullModelBtn.disabled = false;
    }
  }
}

// ========================================
// MESSAGE CARD FACTORY
// ========================================
function createMessageCard(role, rawText, opts = {}) {
  const row = document.createElement("div");
  row.className = `row ${role}`;

  const cardShell = document.createElement("div");
  cardShell.className = "card-shell";

  const card = document.createElement("div");
  card.className = "card";

  const cardBody = document.createElement("div");
  cardBody.className = "card-body";

  const sideActions = document.createElement("div");
  sideActions.className = "side-actions";

  let thinkingBox = null;
  let thinkingContent = null;
  let thinkingCopyBtn = null;
  let thinkingTextValue = "";
  let thinkingExpanded = thinkingDefaultExpanded;
  let hasUserManuallyToggledThisCard = false;

  let messageStartTime = opts.startTime || null;
  let messageModel = opts.modelName || "";
  let messageDurationMs = opts.durationMs ?? null;
  let messageLoadingMs = opts.loadingMs ?? null;
  let messageThinkingMs = opts.thinkingMs ?? null;
  let messageGenerationMs = opts.generationMs ?? null;

  const meta = document.createElement("div");
  meta.className = "message-meta top-message-meta";
  cardShell.appendChild(meta);

  function renderMeta() {
    const hasDuration = messageDurationMs !== null && messageDurationMs !== undefined;
    const hasLoading = messageLoadingMs !== null && messageLoadingMs !== undefined;
    const hasThinking = messageThinkingMs !== null && messageThinkingMs !== undefined && messageThinkingMs > 0;
    const hasGeneration = messageGenerationMs !== null && messageGenerationMs !== undefined;
    const startLabel = messageStartTime ? formatClockTime(messageStartTime) : "";

    if (role === "user") {
      meta.innerHTML = ["You", startLabel].filter(Boolean).join(" • ");
      return;
    }

    if (role === "assistant") {
      const firstLine = [
        "Model",
        messageModel,
        startLabel,
        hasDuration ? formatDuration(messageDurationMs) : ""
      ].filter(Boolean).join(" • ");

      const secondLineParts = [];
      if (hasLoading) {
        secondLineParts.push(`⏳ ${formatDuration(messageLoadingMs)}`);
      }
      if (hasThinking) {
        secondLineParts.push(`💭 ${formatDuration(messageThinkingMs)}`);
      }
      if (hasGeneration) {
        secondLineParts.push(`💬 ${formatDuration(messageGenerationMs)}`);
      }

      const secondLine = secondLineParts.join(" • ");
      meta.innerHTML = secondLine ? `${firstLine}<br>${secondLine}` : firstLine;
      return;
    }

    if (role === "system") {
      meta.innerHTML = [
        "System",
        startLabel,
        hasDuration ? formatDuration(messageDurationMs) : ""
      ].filter(Boolean).join(" • ");
    }
  }

  renderMeta();

  const messageUnit = document.createElement("div");
  messageUnit.className = "message-unit";

  if (role === "assistant") {
    thinkingBox = document.createElement("div");
    thinkingBox.className = "thinking-box";

    const thinkingHeader = document.createElement("div");
    thinkingHeader.className = "thinking-header";

    const thinkingTitle = document.createElement("button");
    thinkingTitle.className = "thinking-title";
    thinkingTitle.type = "button";
    thinkingTitle.textContent = "Thinking";
    thinkingTitle.title = "Show/Hide";

    function toggleThinkingPanel() {
      if (!thinkingTextValue.trim()) return;
      hasUserManuallyToggledThisCard = true;
      thinkingExpanded = !thinkingExpanded;
      thinkingDefaultExpanded = thinkingExpanded;
      syncThinkingVisibility();
    }

    thinkingHeader.title = "Show/Hide";
    thinkingHeader.onclick = toggleThinkingPanel;
    thinkingTitle.onclick = (e) => {
      e.stopPropagation();
      toggleThinkingPanel();
    };

    thinkingCopyBtn = document.createElement("button");
    thinkingCopyBtn.className = "icon-btn block-copy-btn";
    thinkingCopyBtn.title = "Copy thinking";
    thinkingCopyBtn.textContent = "⧉";
    thinkingCopyBtn.disabled = true;
    thinkingCopyBtn.onclick = (e) => {
      e.stopPropagation();
      copyText(thinkingTextValue);
    };

    thinkingHeader.appendChild(thinkingTitle);
    thinkingHeader.appendChild(thinkingCopyBtn);

    thinkingContent = document.createElement("div");
    thinkingContent.className = "thinking-content";

    const endThinkingPanel = document.createElement("button");
    endThinkingPanel.className = "end-thinking-panel";
    endThinkingPanel.type = "button";
    endThinkingPanel.textContent = "End Of Thinking";
    endThinkingPanel.title = "Show/Hide";
    endThinkingPanel.onclick = () => {
      if (!thinkingTextValue.trim()) return;
      hasUserManuallyToggledThisCard = true;
      thinkingExpanded = false;
      thinkingDefaultExpanded = false;
      syncThinkingVisibility();
    };

    thinkingBox.appendChild(thinkingHeader);
    thinkingBox.appendChild(thinkingContent);
    thinkingBox.appendChild(endThinkingPanel);
    messageUnit.appendChild(thinkingBox);
  }

  const outputBlock = document.createElement("div");
  outputBlock.className = "output-block";

  const outputHeader = document.createElement("div");
  outputHeader.className = "output-header";

  const outputTitle = document.createElement("div");
  outputTitle.className = "output-title";
  outputTitle.textContent = role === "assistant" ? "Response" : role === "user" ? "Message" : "System";

  const outputCopyBtn = document.createElement("button");
  outputCopyBtn.className = "icon-btn block-copy-btn";
  outputCopyBtn.title = "Copy";
  outputCopyBtn.textContent = "⧉";
  outputCopyBtn.onclick = () => copyText(opts.getRawText ? opts.getRawText() : rawText);

  outputHeader.appendChild(outputTitle);
  outputHeader.appendChild(outputCopyBtn);

  const content = document.createElement("div");
  content.className = "content";
  content.innerHTML = renderMarkdown(rawText);

  outputBlock.appendChild(outputHeader);
  outputBlock.appendChild(content);
  messageUnit.appendChild(outputBlock);

  cardBody.appendChild(messageUnit);

  if (role === "user") {
    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.title = "Edit";
    editBtn.textContent = "✎";
    editBtn.onclick = () => {
      promptEl.value = opts.getRawText ? opts.getRawText() : rawText;
      promptEl.focus();
    };
    sideActions.appendChild(editBtn);
  }

  if (role === "assistant") {
    const regenBtn = document.createElement("button");
    regenBtn.className = "icon-btn";
    regenBtn.title = "Regenerate";
    regenBtn.textContent = "↻";
    regenBtn.onclick = () => {
      if (!isGenerating && lastUserText.trim()) {
        regenerateLastAssistant();
      }
    };
    sideActions.appendChild(regenBtn);
  }

  card.appendChild(cardBody);
  card.appendChild(sideActions);
  cardShell.appendChild(card);
  row.appendChild(cardShell);
  chatEl.appendChild(row);
  scrollToBottom();
  updateEmptyState();

  function syncThinkingVisibility() {
    if (!thinkingBox || !thinkingCopyBtn) return;

    const hasThinking = thinkingTextValue.trim().length > 0;
    thinkingCopyBtn.disabled = !hasThinking;

    if (hasThinking) {
      thinkingBox.classList.add("has-thinking");
    } else {
      thinkingBox.classList.remove("has-thinking");
    }

    if (hasThinking && thinkingExpanded) {
      thinkingBox.classList.add("visible");
      thinkingBox.classList.remove("collapsed");
    } else if (hasThinking) {
      thinkingBox.classList.add("visible", "collapsed");
    } else {
      thinkingBox.classList.remove("visible", "collapsed");
    }
  }

  const api = {
    row,
    card,
    content,
    setRawText(newText) {
      content.innerHTML = renderMarkdown(newText);
      scrollToBottom();
    },
    setThinkingText(newThinking) {
      if (!thinkingContent) return;

      thinkingTextValue = newThinking || "";
      thinkingContent.innerHTML = renderMarkdown(thinkingTextValue);

      if (!hasUserManuallyToggledThisCard) {
        thinkingExpanded = thinkingDefaultExpanded;
      }

      syncThinkingVisibility();
      scrollToBottom();
    },
    getThinkingText() {
      return thinkingTextValue;
    },
    setStartTime(newStartTime) {
      messageStartTime = newStartTime;
      renderMeta();
    },
    setModelName(newModelName) {
      messageModel = newModelName || "";
      renderMeta();
    },
    setDurationMs(newDurationMs) {
      messageDurationMs = newDurationMs;
      renderMeta();
    },
    setLoadingMs(newLoadingMs) {
      messageLoadingMs = newLoadingMs;
      renderMeta();
    },
    setThinkingMs(newThinkingMs) {
      messageThinkingMs = newThinkingMs;
      renderMeta();
    },
    setGenerationMs(newGenerationMs) {
      messageGenerationMs = newGenerationMs;
      renderMeta();
    },
    setTyping(isTyping) {
      if (isTyping) {
        content.classList.add("streaming-cursor");
      } else {
        content.classList.remove("streaming-cursor");
      }
    }
  };

  syncThinkingVisibility();
  return api;
}

// ========================================
// MESSAGE CLEANUP HELPERS
// ========================================
function removeLastAssistantFromState() {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      messages.splice(i, 1);
      return;
    }
  }
}

function removeLastAssistantFromUI() {
  const rows = [...chatEl.querySelectorAll(".row.assistant")];
  if (rows.length) {
    rows[rows.length - 1].remove();
  }
}

// ========================================
// CHAT REQUEST / STREAMING
// ========================================
async function streamChat(userText, isRegenerate = false) {
  const trimmed = userText.trim();
  if (!trimmed || isGenerating) return;

  const requestStartedAt = new Date();
  const requestStartedMs = Date.now();
  const activeModelName = modelEl.value.trim();

  isGenerating = true;
  abortController = new AbortController();
  sendBtn.disabled = false;
  updateSendButtonState();

  if (!isRegenerate) {
    lastUserText = trimmed;
    messages.push({ role: "user", content: trimmed });

    createMessageCard("user", trimmed, {
      getRawText: () => trimmed,
      startTime: requestStartedAt
    });
  }

  let assistantText = "";
  let assistantThinking = "";

  let firstThinkingAt = null;
  let firstContentAt = null;

  let frozenLoadingMs = null;
  let frozenThinkingMs = null;
  let frozenGenerationStartMs = null;
  let thinkingHappened = false;

  function appendInterruptedMarker(text) {
    const marker = "⚠️ Interrupted...";
    const current = text || "";
    if (current.includes(marker)) return current;
    return current.trim() ? `${current} ${marker}` : marker;
  }

  function finalizeAssistantTiming(finishedAt) {
    assistantCard.setDurationMs(finishedAt - requestStartedMs);

    if (firstContentAt === null) {
      if (firstThinkingAt !== null) {
        frozenThinkingMs = finishedAt - firstThinkingAt;
        assistantCard.setLoadingMs(frozenLoadingMs);
        assistantCard.setThinkingMs(frozenThinkingMs);
        assistantCard.setGenerationMs(0);
      } else {
        frozenLoadingMs = finishedAt - requestStartedMs;
        assistantCard.setLoadingMs(frozenLoadingMs);
        assistantCard.setThinkingMs(null);
        assistantCard.setGenerationMs(0);
      }
    } else {
      assistantCard.setLoadingMs(frozenLoadingMs);
      assistantCard.setThinkingMs(thinkingHappened ? frozenThinkingMs : null);
      assistantCard.setGenerationMs(finishedAt - frozenGenerationStartMs);
    }
  }

  const assistantCard = createMessageCard("assistant", "", {
    getRawText: () => assistantText,
    startTime: requestStartedAt,
    modelName: activeModelName
  });

  assistantCard.setTyping(true);

  function applyChunk(chunk) {
    if (!chunk) return;

    if (chunk.error) {
      throw new Error(chunk.error);
    }

    const piece = chunk?.message?.content || "";
    const thinkPiece = chunk?.message?.thinking || "";

    if (thinkPiece) {
      assistantCard.setTyping(false);
      const now = Date.now();

      if (firstThinkingAt === null) {
        firstThinkingAt = now;
        frozenLoadingMs = now - requestStartedMs;
        thinkingHappened = true;
        assistantCard.setLoadingMs(frozenLoadingMs);
        assistantCard.setThinkingMs(0);
      }

      assistantThinking += thinkPiece;
      assistantCard.setThinkingText(assistantThinking);

      if (firstContentAt === null) {
        assistantCard.setThinkingMs(now - firstThinkingAt);
      }
    }

    if (piece) {
      const now = Date.now();

      if (firstContentAt === null) {
        firstContentAt = now;
        frozenGenerationStartMs = now;

        if (firstThinkingAt !== null) {
          frozenThinkingMs = now - firstThinkingAt;
          assistantCard.setThinkingMs(frozenThinkingMs);
        } else {
          frozenLoadingMs = now - requestStartedMs;
          assistantCard.setLoadingMs(frozenLoadingMs);
        }
      }

      assistantText += piece;
      assistantCard.setRawText(assistantText);
      assistantCard.setGenerationMs(now - frozenGenerationStartMs);
    }
  }

  durationInterval = setInterval(() => {
    const now = Date.now();
    assistantCard.setDurationMs(now - requestStartedMs);

    if (firstThinkingAt === null && firstContentAt === null) {
      assistantCard.setLoadingMs(now - requestStartedMs);
      assistantCard.setThinkingMs(null);
      assistantCard.setGenerationMs(null);
      return;
    }

    if (firstThinkingAt !== null && firstContentAt === null) {
      assistantCard.setLoadingMs(frozenLoadingMs);
      assistantCard.setThinkingMs(now - firstThinkingAt);
      assistantCard.setGenerationMs(null);
      return;
    }

    assistantCard.setLoadingMs(frozenLoadingMs);
    assistantCard.setThinkingMs(thinkingHappened ? frozenThinkingMs : null);
    assistantCard.setGenerationMs(now - frozenGenerationStartMs);
  }, 250);

  try {
    const response = await fetch(buildEndpointUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: modelEl.value.trim(),
        messages,
        stream: streamToggle.checked,
        think: thinkToggle.checked
      })
    });

    if (!response.ok) {
      const serverError = await extractErrorFromResponse(response);
      throw new Error(serverError);
    }

    if (!streamToggle.checked) {
      const chunk = await response.json();
      applyChunk(chunk);
    } else {
      if (!response.body) {
        throw new Error("Streaming response body not available.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          let chunk;
          try {
            chunk = JSON.parse(trimmedLine);
          } catch (_) {
            continue;
          }

          applyChunk(chunk);
        }
      }

      if (buffer.trim()) {
        let chunk;
        try {
          chunk = JSON.parse(buffer.trim());
        } catch (_) {
          chunk = null;
        }

        applyChunk(chunk);
      }
    }

    if (!assistantText.trim()) {
      assistantText = "_No response received._";
      assistantCard.setRawText(assistantText);
    }

    const finishedAt = Date.now();
    finalizeAssistantTiming(finishedAt);

    messages.push({
      role: "assistant",
      content: assistantText
    });
  } catch (err) {
    const wasAborted = err && err.name === "AbortError";

    if (wasAborted) {
      const hasResponseOutput = assistantText.trim().length > 0;
      const hasThinkingOutput = assistantThinking.trim().length > 0;

      if (!hasResponseOutput && !hasThinkingOutput) {
        assistantCard.row.remove();
      } else {
        const finishedAt = Date.now();
        assistantCard.setTyping(false);
        finalizeAssistantTiming(finishedAt);

        if (firstContentAt !== null || hasResponseOutput) {
          interruptedAssistantText = appendInterruptedMarker(assistantText);
          assistantCard.setRawText(interruptedAssistantText);

        messages.push({
          role: "assistant",
          content: assistantText
        });

          messages.push({
            role: "system",
            content: "⚠️ Interrupted during response generation."
          });

        } else {
          interruptedAssistantThinking = appendInterruptedMarker(assistantThinking);
          assistantCard.setThinkingText(interruptedAssistantThinking);

          messages.push({
            role: "system",
            content: "⚠️ Interrupted during thinking."
          });
        }
      }
    } else {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorText =
        `**Error:** ${errorMessage}\n\n` +
        `- Make sure Ollama is running\n` +
        `- Make sure the model exists\n` +
        `- Make sure the page is served from a local web server\n` +
        `- Make sure Ollama allows your origin`;

      assistantCard.row.remove();

      messages.push({
        role: "system",
        content:
          `Previous Ollama request failed.\n\n` +
          `User input:\n${trimmed}\n\n` +
          `Error:\n${errorMessage}`
      });

      createMessageCard("system", errorText, {
        getRawText: () => errorText,
        startTime: requestStartedAt,
        durationMs: Date.now() - requestStartedMs
      });
    }
  } finally {
    assistantCard.setTyping(false);

    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }

    isGenerating = false;
    abortController = null;
    sendBtn.disabled = false;
    updateSendButtonState();
  }
}

async function regenerateLastAssistant() {
  removeLastAssistantFromState();
  removeLastAssistantFromUI();
  await streamChat(lastUserText, true);
}

// ========================================
// RESIZER BINDINGS
// ========================================
function bindSidebarResizer() {
  if (!sidebarResizeHandle) return;

  let startX = 0;
  let startWidth = expandedSidebarWidth;
  let dragging = false;

  const onMouseMove = (e) => {
    if (!dragging) return;
    const dx = startX - e.clientX;
    applySidebarWidth(startWidth - dx);
  };

  const onMouseUp = () => {
    dragging = false;
    document.body.classList.remove("is-resizing");
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  sidebarResizeHandle.addEventListener("mousedown", (e) => {
    if (settingsSidebar.classList.contains("collapsed")) return;

    dragging = true;
    startX = e.clientX;
    startWidth = settingsSidebar.getBoundingClientRect().width || expandedSidebarWidth;

    document.body.classList.add("is-resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  });
}

function bindComposerResizer() {
  if (!composerResizeHandle || !composerEl) return;

  let startY = 0;
  let startHeight = COMPOSER_DEFAULT_HEIGHT;
  let dragging = false;

  const onMouseMove = (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY;
    applyComposerHeight(startHeight + dy);
  };

  const onMouseUp = () => {
    dragging = false;
    document.body.classList.remove("is-resizing");
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  composerResizeHandle.addEventListener("mousedown", (e) => {
    dragging = true;
    startY = e.clientY;
    startHeight = composerEl.getBoundingClientRect().height || COMPOSER_DEFAULT_HEIGHT;

    document.body.classList.add("is-resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  });
}

// ========================================
// CONTROL EVENT BINDINGS
// ========================================
sidebarToggleBtn.addEventListener("click", () => {
  const willCollapse = !settingsSidebar.classList.contains("collapsed");
  settingsSidebar.classList.toggle("collapsed");

  if (willCollapse) {
    setSidebarCollapsedStyles();
  } else {
    applySidebarWidth(expandedSidebarWidth);
  }

  syncSidebarResizeAvailability();
});

modelDropdown.addEventListener("change", () => {
  if (modelDropdown.value) {
    modelEl.value = modelDropdown.value;
  }
  syncModelDropdownTitle();
});

modelEl.addEventListener("input", () => {
  const typed = modelEl.value.trim();
  const options = [...modelDropdown.options]
    .map(opt => opt.value)
    .filter(Boolean);

  if (options.includes(typed)) {
    modelDropdown.value = typed;
  } else {
    modelDropdown.value = "";
  }
  syncModelDropdownTitle();
});

refreshModelsBtn.addEventListener("click", loadModelList);

if (pullModelBtn) {
  pullModelBtn.addEventListener("click", pullModel);
}

sendBtn.addEventListener("click", async () => {
  if (isGenerating) {
    if (abortController) {
      abortController.abort();
    }
    return;
  }

  const text = promptEl.value;
  if (!text.trim()) return;
  promptEl.value = "";
  await streamChat(text, false);
});

promptEl.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    promptEl.blur();
    return;
  }

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

// ========================================
// DOCUMENT-LEVEL KEYBOARD BINDINGS
// ========================================
document.addEventListener("keydown", (e) => {
  const active = document.activeElement;

  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      scrollChatToTop();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      scrollChatToBottom();
      return;
    }
  }

  if (isEditableElement(active)) return;
  if (!shouldRedirectKeyToPrompt(e)) return;

  promptEl.focus();

  if (e.key.length === 1) {
    e.preventDefault();

    const start = promptEl.selectionStart ?? promptEl.value.length;
    const end = promptEl.selectionEnd ?? promptEl.value.length;
    const value = promptEl.value;

    promptEl.value = value.slice(0, start) + e.key + value.slice(end);
    const caret = start + e.key.length;
    promptEl.setSelectionRange(caret, caret);
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    return;
  }

  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();

    const start = promptEl.selectionStart ?? promptEl.value.length;
    const end = promptEl.selectionEnd ?? promptEl.value.length;
    const value = promptEl.value;

    if (start !== end) {
      promptEl.value = value.slice(0, start) + value.slice(end);
      promptEl.setSelectionRange(start, start);
      return;
    }

    if (e.key === "Backspace" && start > 0) {
      promptEl.value = value.slice(0, start - 1) + value.slice(end);
      promptEl.setSelectionRange(start - 1, start - 1);
    } else if (e.key === "Delete" && start < value.length) {
      promptEl.value = value.slice(0, start) + value.slice(start + 1);
      promptEl.setSelectionRange(start, start);
    }
  }
});

// ========================================
// CLEAR ACTION
// ========================================
clearBtn.addEventListener("click", () => {
  if (abortController) {
    abortController.abort();
  }

  chatEl.innerHTML = `
    <div id="emptyState" class="empty-state">
      <img src="favicon.png" alt="Ollama Chat Playground Icon" class="empty-icon" />
      <div class="empty-text">
        Welcome to Ollama Chat Playground 👋
      </div>
    </div>
  `;

  messages = [];
  lastUserText = "";
  isGenerating = false;
  abortController = null;

  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }

  sendBtn.disabled = false;
  updateSendButtonState();

  promptEl.value = "";
  promptEl.focus();

  updateEmptyState();
});

// ========================================
// WINDOW-LEVEL EVENTS
// ========================================
window.addEventListener("resize", () => {
  if (!settingsSidebar.classList.contains("collapsed")) {
    applySidebarWidth(expandedSidebarWidth);
  } else {
    setSidebarCollapsedStyles();
  }

  ensureComposerHeightFitsViewport();
});

// ========================================
// APP INITIALIZATION
// ========================================
updateSendButtonState();
applySidebarWidth(expandedSidebarWidth);
syncSidebarResizeAvailability();
applyComposerHeight(COMPOSER_DEFAULT_HEIGHT);
bindSidebarResizer();
bindComposerResizer();
updateEmptyState();
