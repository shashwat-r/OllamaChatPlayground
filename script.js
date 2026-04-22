const chatEl = document.getElementById("chat");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const modelEl = document.getElementById("model");
const modelDropdown = document.getElementById("modelDropdown");
const refreshModelsBtn = document.getElementById("refreshModelsBtn");
const hostEl = document.getElementById("host");
const apiPathEl = document.getElementById("apiPath");
const thinkToggle = document.getElementById("thinkToggle");
const streamToggle = document.getElementById("streamToggle");
const settingsSidebar = document.getElementById("settingsSidebar");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");

let messages = [];
let lastUserText = "";
let isGenerating = false;
let thinkingDefaultExpanded = true;
let abortController = null;
let durationInterval = null;

marked.setOptions({
  gfm: true,
  breaks: true
});

function renderMarkdown(md) {
  const raw = marked.parse(md || "");
  return DOMPurify.sanitize(raw);
}

function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function formatClockTime(date) {
  return new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatDuration(ms) {
  if (typeof ms !== "number" || ms < 0) return "";
  if (ms < 1000) return `${ms} ms`;

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

function updateSendButtonState() {
  if (isGenerating) {
    sendBtn.textContent = "Stop";
    sendBtn.classList.remove("primary");
  } else {
    sendBtn.textContent = "Send";
    sendBtn.classList.add("primary");
  }
}

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

function syncModelDropdownTitle() {
  const selectedOption = modelDropdown.options[modelDropdown.selectedIndex];
  modelDropdown.title = selectedOption ? selectedOption.textContent : "";
}

async function loadModelList() {
  const previousValue = modelDropdown.value;
  modelDropdown.innerHTML = `<option value="" disabled selected>Select model</option>`;
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

function createMessageCard(role, rawText, opts = {}) {
  const row = document.createElement("div");
  row.className = `row ${role}`;

  const card = document.createElement("div");
  card.className = "card";

  let thinkingBox = null;
  let thinkingContent = null;
  let thinkingBtn = null;
  let thinkingTextValue = "";
  let thinkingExpanded = thinkingDefaultExpanded;
  let hasUserManuallyToggledThisCard = false;

  let messageStartTime = opts.startTime || null;
  let messageModel = opts.modelName || "";
  let messageDurationMs = opts.durationMs ?? null;
  let messageThinkingMs = opts.thinkingMs ?? null;
  let messageGenerationMs = opts.generationMs ?? null;

  if (role === "assistant") {
    thinkingBox = document.createElement("div");
    thinkingBox.className = "thinking-box";

    const thinkingTitle = document.createElement("div");
    thinkingTitle.className = "thinking-title";
    thinkingTitle.textContent = "Thinking";

    thinkingContent = document.createElement("div");
    thinkingContent.className = "thinking-content";

    thinkingBox.appendChild(thinkingTitle);
    thinkingBox.appendChild(thinkingContent);
    card.appendChild(thinkingBox);
  }

  const content = document.createElement("div");
  content.className = "content";
  content.innerHTML = renderMarkdown(rawText);

  const toolbar = document.createElement("div");
  toolbar.className = "bottom-toolbar";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  toolbar.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "message-actions";
  toolbar.appendChild(actions);

  function renderMeta() {
    const parts = [];

    if (role === "user") {
      if (messageStartTime) {
        parts.push(`Started: ${formatClockTime(messageStartTime)}`);
      }
    } else if (role === "assistant") {
      if (messageModel) {
        parts.push(`Model: ${messageModel}`);
      }
      if (messageStartTime) {
        parts.push(`Started: ${formatClockTime(messageStartTime)}`);
      }
      if (messageThinkingMs !== null && messageThinkingMs !== undefined) {
        parts.push(`Thinking: ${formatDuration(messageThinkingMs)}`);
      }
      if (messageGenerationMs !== null && messageGenerationMs !== undefined) {
        parts.push(`Generating: ${formatDuration(messageGenerationMs)}`);
      }
      if (messageDurationMs !== null && messageDurationMs !== undefined) {
        parts.push(`Total: ${formatDuration(messageDurationMs)}`);
      }
    } else if (role === "system") {
      if (messageStartTime) {
        parts.push(`Started: ${formatClockTime(messageStartTime)}`);
      }
      if (messageDurationMs !== null && messageDurationMs !== undefined) {
        parts.push(`Took: ${formatDuration(messageDurationMs)}`);
      }
    }

    meta.innerHTML = parts.map(p => `• ${p}`).join("<br>");
  }

  renderMeta();

  const copyBtn = document.createElement("button");
  copyBtn.className = "icon-btn";
  copyBtn.title = "Copy";
  copyBtn.textContent = "⧉";
  copyBtn.onclick = () => copyText(opts.getRawText ? opts.getRawText() : rawText);
  actions.appendChild(copyBtn);

  const editBtn = document.createElement("button");
  editBtn.className = "icon-btn";
  editBtn.title = "Edit";
  editBtn.textContent = "✎";
  editBtn.onclick = () => {
    promptEl.value = opts.getRawText ? opts.getRawText() : rawText;
    promptEl.focus();
  };
  actions.appendChild(editBtn);

  if (role === "assistant") {
    thinkingBtn = document.createElement("button");
    thinkingBtn.className = "icon-btn";
    thinkingBtn.title = "Show or hide thinking";
    thinkingBtn.textContent = "🧠";
    thinkingBtn.disabled = true;
    thinkingBtn.onclick = () => {
      if (thinkingBtn.disabled) return;
      hasUserManuallyToggledThisCard = true;
      thinkingExpanded = !thinkingExpanded;
      thinkingDefaultExpanded = thinkingExpanded;
      syncThinkingVisibility();
    };
    actions.appendChild(thinkingBtn);

    const regenBtn = document.createElement("button");
    regenBtn.className = "icon-btn";
    regenBtn.title = "Regenerate";
    regenBtn.textContent = "↻";
    regenBtn.onclick = () => {
      if (!isGenerating && lastUserText.trim()) {
        regenerateLastAssistant();
      }
    };
    actions.appendChild(regenBtn);
  }

  card.appendChild(content);
  card.appendChild(toolbar);
  row.appendChild(card);
  chatEl.appendChild(row);
  scrollToBottom();

  function syncThinkingVisibility() {
    if (!thinkingBox || !thinkingBtn) return;

    const hasThinking = thinkingTextValue.trim().length > 0;
    thinkingBtn.disabled = !hasThinking;
    thinkingBtn.textContent = hasThinking
      ? (thinkingExpanded ? "🧠−" : "🧠+")
      : "🧠";

    if (hasThinking && thinkingExpanded) {
      thinkingBox.classList.add("visible");
    } else {
      thinkingBox.classList.remove("visible");
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

  let lastThinkingAt = null;
  let firstContentAt = null;

  let frozenThinkingMs = null;
  let frozenGenerationStartMs = null;

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
      const now = Date.now();
      lastThinkingAt = now;

      assistantThinking += thinkPiece;
      assistantCard.setThinkingText(assistantThinking);
    }

    if (piece) {
      const now = Date.now();

      if (firstContentAt === null) {
        firstContentAt = now;
        frozenGenerationStartMs = now;
        frozenThinkingMs = (lastThinkingAt ?? now) - requestStartedMs;
        assistantCard.setThinkingMs(frozenThinkingMs);
      }

      assistantText += piece;
      assistantCard.setRawText(assistantText);
      assistantCard.setGenerationMs(now - frozenGenerationStartMs);
    }
  }

  durationInterval = setInterval(() => {
    const now = Date.now();
    assistantCard.setDurationMs(now - requestStartedMs);

    if (frozenThinkingMs === null) {
      assistantCard.setThinkingMs(now - requestStartedMs);
      assistantCard.setGenerationMs(null);
    } else {
      assistantCard.setThinkingMs(frozenThinkingMs);
      assistantCard.setGenerationMs(now - frozenGenerationStartMs);
    }
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
    assistantCard.setDurationMs(finishedAt - requestStartedMs);

    if (frozenThinkingMs === null) {
      frozenThinkingMs = finishedAt - requestStartedMs;
      assistantCard.setThinkingMs(frozenThinkingMs);
      assistantCard.setGenerationMs(0);
    } else {
      assistantCard.setThinkingMs(frozenThinkingMs);
      assistantCard.setGenerationMs(finishedAt - frozenGenerationStartMs);
    }

    messages.push({
      role: "assistant",
      content: assistantText
    });
  } catch (err) {
    const wasAborted = err && err.name === "AbortError";

    if (wasAborted) {
      if (!assistantText.trim()) {
        assistantCard.row.remove();
      } else {
        const finishedAt = Date.now();
        assistantCard.setDurationMs(finishedAt - requestStartedMs);

        if (frozenThinkingMs === null) {
          frozenThinkingMs = finishedAt - requestStartedMs;
          assistantCard.setThinkingMs(frozenThinkingMs);
          assistantCard.setGenerationMs(0);
        } else {
          assistantCard.setThinkingMs(frozenThinkingMs);
          assistantCard.setGenerationMs(finishedAt - frozenGenerationStartMs);
        }

        messages.push({
          role: "assistant",
          content: assistantText
        });
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

sidebarToggleBtn.addEventListener("click", () => {
  settingsSidebar.classList.toggle("collapsed");
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
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

clearBtn.addEventListener("click", () => {
  if (abortController) {
    abortController.abort();
  }
  chatEl.innerHTML = "";
  promptEl.value = "";
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
  promptEl.focus();
});

const requestStartedAt = new Date();
const requestStartedMs = Date.now();

const assistantCard = createMessageCard(
  "assistant",
  `# Streaming Markdown Chat

- Assistant on the left
- User on the right
- Type a model name or pick one from Installed Models
- Settings are in the collapsible sidebar on the left
- Request Thinking toggle sends \`think: true/false\`
- Stream Response toggle sends \`stream: true/false\`
- Thinking is collapsible per message
- Thinking and streaming preferences are reused for future replies
- Errors are shown in the response and also added as \`system\` messages`,
  {
    startTime: requestStartedAt
  }
);

assistantCard.setDurationMs(Date.now() - requestStartedMs);

updateSendButtonState();
loadModelList();
