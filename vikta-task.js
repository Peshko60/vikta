// Historique conversation par écran
const screenConversations = {};

let screenUidCounter = 0;
let defaultDirHandle = null; // dossier par défaut pour "Sauvegarder"

/* ---------- Persistance du dossier de travail (IndexedDB) ---------- */
function _openDirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("vikta-dirs", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}
async function _saveDirHandle(handle) {
  try {
    const db = await _openDirDB();
    await new Promise((res, rej) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(handle, "defaultDir");
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch(e) { console.warn("saveDirHandle:", e); }
}
async function _loadDirHandle() {
  try {
    const db = await _openDirDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction("handles", "readonly");
      const req = tx.objectStore("handles").get("defaultDir");
      req.onsuccess = () => res(req.result || null);
      req.onerror   = () => rej(req.error);
    });
  } catch(e) { return null; }
}

/* ---------- Helpers DOM ---------- */
const $ = (sel) => document.querySelector(sel);
const createEl = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  });
  children.forEach((c) => el.appendChild(c));
  return el;
};
const slug = (s) =>
  (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";

/* ---------- RTE helpers ---------- */
function bindRteToolbar(wrap) {
  wrap.querySelectorAll(".rte-toolbar .btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const value = btn.dataset.value || null;
      document.execCommand(cmd, false, value);
    });
  });
}
function rteGetHtml(el) {
  return (el?.innerHTML || "").trim();
}
function rteToPlain(html) {
  if (!html) return "";
  let s = html;
  s = s
    .replace(/<\/(h[1-6]|p|div|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "- ").replace(/<\/li>/gi, "\n");
  s = s.replace(/<ol[^>]*>|<\/ol>|<ul[^>]*>|<\/ul>/gi, "");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
function sanitizeHtmlBasic(html) {
  if (!html) return "";
  let s = html;
  s = s.replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
  return s;
}

/* Helpers : strippe les fences ``` et traduction HTML robuste */
function stripCodeFences(s) {
  if (!s) return "";
  return String(s)
    .replace(/^```(?:html|HTML)?\s*/, "") // ouvreur ``` ou ```html
    .replace(/```$/, ""); // fermeur ```
}

async function safeTranslateHtml(htmlFr) {
  const clean = stripCodeFences(htmlFr);
  try {
    const htmlEn = await translateHtml(clean); // ta fonction existante
    if (htmlEn && /<html[\s>]/i.test(htmlEn)) return htmlEn; // on garde seulement un HTML complet
    throw new Error("Réponse IA non-HTML");
  } catch (e) {
    console.warn("Traduction HTML échouée, fallback FR:", e?.message || e);
    // fallback : garder la version FR pour ne pas bloquer l’export
    return (
      clean ||
      "<!doctype html><html><head><meta charset='utf-8'><title>Screen</title></head><body><p style='font-family:system-ui'>No HTML provided.</p></body></html>"
    );
  }
}

/* ---------- Utils ---------- */
function escapeCsv(val) {
  const s = String(val ?? "");
  const needs = /[",\n;]/.test(s);
  return needs ? `"${s.replace(/"/g, '""')}"` : s;
}
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
}
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensureViktaCssLink(html) {
  const cssHref = "vikta-task.css";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || "", "text/html");

    // head garanti
    let head = doc.head;
    if (!head) {
      head = doc.createElement("head");
      if (doc.body) doc.documentElement.insertBefore(head, doc.body);
      else doc.documentElement.appendChild(head);
    }

    // ajoute <link> si absent
    const hasLink = head.querySelector(
      `link[rel="stylesheet"][href="${cssHref}"]`,
    );
    if (!hasLink) {
      const link = doc.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", cssHref);
      head.appendChild(link);
    }

    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  } catch (e) {
    console.warn("ensureViktaCssLink: fallback html brut", e);
    return html;
  }
}

async function readViktaCssFromDefaultDir() {
  // Lit le contenu de vikta-task.css depuis le dossier choisi (defaultDirHandle)
  if (!defaultDirHandle) return "";

  try {
    const cssHandle = await defaultDirHandle.getFileHandle("vikta-task.css");
    const cssFile = await cssHandle.getFile();
    return await cssFile.text();
  } catch (e) {
    console.warn(
      "Impossible de lire vikta-task.css depuis le dossier de travail.",
      e,
    );
    return "";
  }
}

/* ---------- Collapsible ---------- */
function toggleSection(sec) {
  const expanded = sec.getAttribute("aria-expanded") === "true";
  sec.setAttribute("aria-expanded", expanded ? "false" : "true");
  const btn = sec.querySelector(".chevron");
  if (btn) {
    btn.setAttribute("aria-expanded", !expanded);
    const sc = btn.closest(".screen");
    if (sc) updateCollapseButton(sc);
  }
}
$("#toggleTask").addEventListener("click", () => toggleSection($("#taskCard")));

/* ---------- Validation ---------- */
function validateTaskName(showMsg = false) {
  const input = $("#taskName");
  const err = $("#taskNameError");
  const saveBtn = $("#saveAsTask");
  const ok = input.value.trim().length > 0;
  if (ok) {
    input.classList.remove("invalid");
    input.setAttribute("aria-invalid", "false");
    err.style.display = "none";
  } else {
    if (showMsg) {
      input.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
      err.style.display = "block";
    }
  }
  saveBtn.disabled = !(ok && defaultDirHandle);
  $("#exportWorkspace").disabled = !ok;
  return ok;
}
$("#taskName").addEventListener("input", () => validateTaskName(false));
$("#taskName").addEventListener("blur", () => validateTaskName(true));

/* ---------- Drag & Drop ---------- */
let dragSrc = null;
function makeDraggable(screenEl, handleEl) {
  screenEl.setAttribute("draggable", "true");
  let dragOk = false;
  handleEl.addEventListener("mousedown", () => {
    dragOk = true;
  });
  handleEl.addEventListener(
    "touchstart",
    () => {
      dragOk = true;
    },
    { passive: true },
  );
  document.addEventListener("mouseup", () => {
    dragOk = false;
  });
  document.addEventListener(
    "touchend",
    () => {
      dragOk = false;
    },
    { passive: true },
  );

  screenEl.addEventListener("dragstart", (e) => {
    if (!dragOk) {
      e.preventDefault();
      return;
    }
    dragSrc = screenEl;
    screenEl.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.style.cssText =
      "padding:6px 10px;background:#162233;color:#e6eef7;border-radius:8px;border:1px solid #243447";
    ghost.textContent = screenEl.querySelector(".screen-num").textContent;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 10, 10);
    setTimeout(() => ghost.remove(), 0);
  });

  screenEl.addEventListener("dragend", () => {
    dragSrc = null;
    screenEl.classList.remove("dragging");
    renumberScreens();
  });

  screenEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    const target = screenEl;
    if (!dragSrc || dragSrc === target) return;
    const rect = target.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    const container = $("#screens");
    if (before) container.insertBefore(dragSrc, target);
    else container.insertBefore(dragSrc, target.nextSibling);
  });

  screenEl.addEventListener("drop", (e) => {
    e.preventDefault();
    renumberScreens();
  });
}

/* ---------- IA: config ---------- */
const AI_CFG_KEY = "po_ai_cfg";
function getAiCfg() {
  try {
    return JSON.parse(localStorage.getItem(AI_CFG_KEY) || "{}");
  } catch {
    return {};
  }
}
function setAiCfg(cfg) {
  localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg || {}));
}
function openAiSettings() {
  const cfg = getAiCfg();
  const mode = cfg.mode || "direct";
  $("#modal").classList.add("open");
  document
    .querySelectorAll('input[name="aimode"]')
    .forEach((r) => (r.checked = r.value === mode));
  $("#proxyFields").style.display = mode === "proxy" ? "" : "none";
  $("#directFields").style.display = mode === "direct" ? "" : "none";
  $("#proxyUrl").value = cfg.proxyUrl || "";
  $("#openaiKey").value = cfg.openaiKey || "";
  $("#openaiModel").value = cfg.openaiModel || "gpt-4o-mini";
  $("#apiBase").value = cfg.apiBase || "";
}
function saveAiSettings() {
  const mode =
    document.querySelector('input[name="aimode"]:checked')?.value || "direct";
  const cfg = {
    mode,
    proxyUrl: $("#proxyUrl").value.trim(),
    openaiKey: $("#openaiKey").value.trim(),
    openaiModel: $("#openaiModel").value.trim() || "gpt-4o-mini",
    apiBase: $("#apiBase").value.trim(),
  };
  setAiCfg(cfg);
  $("#modal").classList.remove("open");
  toast("Paramètres IA enregistrés.");
}
function clearAiSettings() {
  setAiCfg({});
  openAiSettings();
  toast("Paramètres IA réinitialisés.");
}
function canTranslate() {
  const cfg = getAiCfg();
  const mode = cfg.mode || "direct";
  if (mode === "direct") return !!cfg.openaiKey;
  if (mode === "proxy") return !!cfg.proxyUrl;
  return false;
}

/* ---------- IA: appels ---------- */
async function chatCompletion(userPrompt) {
  const cfg = getAiCfg();
  if ((cfg.mode || "direct") === "proxy") {
    const res = await fetch(cfg.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userPrompt }),
    });
    if (!res.ok) throw new Error("Proxy: " + res.status + " " + res.statusText);
    const data = await res.json();
    return data.html || data.text || data.content || "";
  } else {
    const key = cfg.openaiKey;
    if (!key) throw new Error("Clé OpenAI manquante.");
    const base = cfg.apiBase || "https://api.openai.com";
    const model = cfg.openaiModel || "gpt-4o-mini";
    const res = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(
        "OpenAI: " + res.status + " " + res.statusText + " — " + t,
      );
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}

async function chatTextOnly(userPrompt, screenId) {
  const cfg = getAiCfg();
  const mode = cfg.mode || "direct";

  if (mode === "proxy") {
    if (!screenConversations[screenId]) {
      screenConversations[screenId] = [];
    }

    const images = getScreenImages(document.getElementById(screenId)) || [];

    const files = getScreenFiles(document.getElementById(screenId)) || [];

    const res = await fetch(cfg.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "chat",
        prompt: userPrompt,
        images,
        files,
        conversation: screenConversations[screenId] || [],
      }),
    });

    if (!res.ok) {
      throw new Error("Proxy: " + res.status);
    }

    const data = await res.json();
    return data.text || "";
  } else {
    const key = cfg.openaiKey;
    const base = cfg.apiBase || "https://api.openai.com";
    const model = cfg.openaiModel || "gpt-4o-mini";

    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant. Tu réponds en texte simple. Pas de HTML.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }
}

async function translateText(text) {
  const prompt = `Traduire en anglais (ton professionnel, concis). Ne renvoie QUE le texte traduit.\n---\n${text}`;
  return (await chatCompletion(prompt)).trim();
}
async function translateHtml(html) {
  const prompt = `Tu es un traducteur HTML. Traduis du français vers l'anglais UNIQUEMENT le CONTENU TEXTE visible pour l'utilisateur.
- Préserve STRICTEMENT toute la structure HTML, balises, attributs, classes, ids, styles, scripts et URLs.
- Ne traduis pas les noms de classes/ids, ni le JS/CSS.
- Renvoie UNIQUEMENT le HTML transformé.

HTML:
<<<HTML
${html}
HTML>>>`;
  const out = await chatCompletion(prompt);
  return out.trim();
}

/* ------- Images collées/déposées par écran ------- */
const screenImages = new WeakMap(); // Map<screenEl, string[] dataURLs>
function getScreenImages(sc) {
  if (!screenImages.has(sc)) screenImages.set(sc, []);
  return screenImages.get(sc);
}
function addImageToScreen(sc, dataUrl) {
  const arr = getScreenImages(sc);
  arr.push(dataUrl);
  renderScreenImages(sc);
}
function removeImageFromScreen(sc, idx) {
  const arr = getScreenImages(sc);
  arr.splice(idx, 1);
  renderScreenImages(sc);
}
function clearScreenImages(sc) {
  screenImages.set(sc, []);
  renderScreenImages(sc);
}
function renderScreenImages(sc) {
  const tray = sc.querySelector(".chat-images");
  if (!tray) return;
  const arr = getScreenImages(sc);
  tray.innerHTML = "";
  arr.forEach((url, i) => {
    const box = document.createElement("div");
    box.className = "chat-thumb";
    const img = new Image();
    img.src = url;
    img.alt = "image collée";
    const del = document.createElement("button");
    del.textContent = "×";
    del.title = "Retirer";
    del.addEventListener("click", () => removeImageFromScreen(sc, i));
    box.append(img, del);
    tray.appendChild(box);
  });
  tray.style.display = arr.length ? "flex" : "none";
}
/* ------- Fichiers collés/déposés par écran ------- */
const screenFiles = new WeakMap(); // Map<screenEl, File[]>

function getScreenFiles(sc) {
  if (!screenFiles.has(sc)) screenFiles.set(sc, []);
  return screenFiles.get(sc);
}

function addFileToScreen(sc, file) {
  const arr = getScreenFiles(sc);
  arr.push(file);
  renderScreenFiles(sc);
}

function removeFileFromScreen(sc, idx) {
  const arr = getScreenFiles(sc);
  arr.splice(idx, 1);
  renderScreenFiles(sc);
}

function clearScreenFiles(sc) {
  screenFiles.set(sc, []);
  renderScreenFiles(sc);
}

function renderScreenFiles(sc) {
  const tray = sc.querySelector(".chat-files");
  if (!tray) return;
  const arr = getScreenFiles(sc);
  tray.innerHTML = "";
  arr.forEach((file, i) => {
    const box = document.createElement("div");
    box.className = "chat-file";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = file.name || "fichier";

    const meta = document.createElement("span");
    meta.className = "meta";
    if (typeof file.size === "number") {
      const kb = Math.max(1, Math.round(file.size / 1024));
      meta.textContent = `(${kb} Ko)`;
    }

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.title = "Retirer";
    del.addEventListener("click", () => removeFileFromScreen(sc, i));

    box.append(name, meta, del);
    tray.appendChild(box);
  });
  tray.style.display = arr.length ? "flex" : "none";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function handlePasteOrDropImages(sc, itemsOrFiles) {
  const imageFiles = [];
  const docFiles = [];

  for (const it of itemsOrFiles) {
    let f = null;

    if (it instanceof File) {
      f = it;
    } else if (it && it.kind === "file") {
      f = it.getAsFile();
    }

    if (!f) continue;

    if (f.type && f.type.startsWith("image/")) {
      // Images : comme avant
      imageFiles.push(f);
    } else {
      // Autres fichiers : PDF, DOCX, PPTX, etc.
      docFiles.push(f);
    }
  }

  // Images -> dataURL (pour vision OpenAI)
  for (const f of imageFiles) {
    const url = await fileToDataUrl(f);
    addImageToScreen(sc, url);
  }

  // Autres fichiers -> stockés dans screenFiles pour cet écran
  for (const f of docFiles) {
    const dataUrl = await fileToDataUrl(f); // "data:application/...;base64,AAAA..."
    const base64 = String(dataUrl).split(",")[1] || "";

    const payload = {
      name: f.name || "fichier",
      type: f.type || "application/octet-stream",
      size: f.size || 0,
      data: base64,
    };

    addFileToScreen(sc, payload);
  }
}

/* ---------- IA vision: HTML complet ---------- */
function stripCodeFence(s) {
  if (!s) return s;
  const str = String(s).trim();

  // Cas 1 : bloc complet ```html ... ```
  const fullFence = /^```(?:html|HTML)?\s*\n([\s\S]*?)\n?```$/;
  const m1 = str.match(fullFence);
  if (m1) return m1[1].trim();

  // Cas 2 : commence par ```html mais sans forcément de ``` de fin
  const startFence = /^```(?:html|HTML)?\s*\n/;
  if (startFence.test(str)) {
    return str.replace(startFence, "").trim();
  }

  return str;
}

function renderChat(screenEl) {
  const chatBody = screenEl.querySelector(".chat-body");
  const conv = screenConversations[screenEl.id] || [];

  chatBody.innerHTML = "";

  conv.forEach((msg) => {
    const bubble = document.createElement("div");
    bubble.className = "chat-message " + msg.role;

    const prefix = msg.role === "user" ? "👤 " : "🤖 ";

    const pre = document.createElement("pre");
    pre.textContent = prefix + msg.content;
    pre.style.margin = "0";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.userSelect = "text";

    bubble.appendChild(pre);
    chatBody.appendChild(bubble);
  });

  chatBody.scrollTop = chatBody.scrollHeight;
}

async function generateHtmlViaAI(
  prompt,
  images = [],
  files = [],
  screenId = null,
) {
  const sys = `
Tu es un assistant qui génère des fichiers HTML complets et valides.
- Tu réponds UNIQUEMENT avec un document HTML complet (<!DOCTYPE html>, <html>, <head>, <body>...).
- Tu NE DOIS JAMAIS répondre en Markdown ni entourer le code de blocs \`\`\`.
- Tu ne renvoies aucune explication autour du code, seulement le HTML.
`;

  const cfg = getAiCfg();
  const mode = cfg.mode || "direct";

  // Assure-toi que la map existe
  if (!window.__viktaLastPromptByScreen) window.__viktaLastPromptByScreen = {};

  if (mode === "proxy") {
    // ----- Mode PROXY : appel vers /vikta-ai -----
    let filesPayload = [];
    if (files && files.length) {
      const arr = [];
      for (const f of files) {
        if (!f) continue;
        if (f.type && f.type.startsWith("image/")) continue; // images déjà dans images[]
        if (!f.data) continue;
        arr.push({
          name: f.name || "fichier",
          type: f.type || "application/octet-stream",
          size: f.size || 0,
          data: f.data,
        });
      }
      filesPayload = arr;
    }

    const payload = {
      mode: "generate", // ou "chat"
      prompt,
      images,
      files: filesPayload,
      conversation: [],
    };

    const res = await fetch(cfg.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(
        "Proxy: " + res.status + " " + res.statusText + " — " + t,
      );
    }

    const data = await res.json();
    let html = data.html || "";

    html = stripCodeFence(html);
    if (!html || !/<html[\s>]/i.test(html)) {
      throw new Error("La réponse de l'IA ne contient pas un HTML complet.");
    }

    const debugPrompt = data.debugUserText || prompt;

    if (screenId) {
      window.__viktaLastPromptByScreen[screenId] = debugPrompt;
    }

    return { html, debugPrompt };
  } else {
    // ----- Mode DIRECT : appel direct OpenAI -----
    const key = cfg.openaiKey;
    if (!key) throw new Error("Clé OpenAI manquante.");
    const base = cfg.apiBase || "https://api.openai.com";
    const model = cfg.openaiModel || "gpt-4o-mini";

    const userContent = [{ type: "text", text: prompt }];
    for (const url of images || []) {
      if (!url) continue;
      userContent.push({ type: "image_url", image_url: { url } });
    }

    const res = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userContent },
        ],
      }),
    });

    const data = await res.json();
    let html = data.choices?.[0]?.message?.content || "";
    html = stripCodeFence(html);
    if (!html || !/<html[\s>]/i.test(html)) {
      throw new Error("La réponse de l'IA ne contient pas un HTML complet.");
    }

    const debugPrompt = prompt; // en direct, pas de bloc docs rajouté côté serveur

    if (screenId) {
      window.__viktaLastPromptByScreen[screenId] = debugPrompt;
    }

    return { html, debugPrompt };
  }
}

/* ---------- Minifier HTML pour prompt (version safe) ---------- */
function minifyHtmlForPrompt(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(new RegExp("<!--[\\s\\S]*?-->", "g"), "");
  s = s.replace(new RegExp("\\s{2,}", "g"), " ");
  s = s.replace(new RegExp("\\s*<\\s*", "g"), "<");
  s = s.replace(new RegExp("\\s*>\\s*", "g"), ">");
  s = s.trim();
  const MAX = 150000;
  if (s.length > MAX) {
    s = s.slice(0, MAX) + "\n" + "<!-- [TRONQUÉ pour le prompt] -->";
  }
  return s;
}

function buildPromptForScreen(sc, includeCurrentHtml = false) {
  const idx =
    Array.from(document.querySelectorAll("#screens .screen")).indexOf(sc) + 1;
  const taskName = ($("#taskName").value || "").trim();
  const projectKey = ($("#projectKey").value || "").trim();
  const definitionTxt = rteToPlain(rteGetHtml($("#definition")));
  const title = (
    sc.querySelector(".screen-title").value || `Écran ${idx}`
  ).trim();
  const expTxt = rteToPlain(rteGetHtml(sc.querySelector(".explication .rte")));

  let currentHtml = "";
  if (includeCurrentHtml) {
    const src = (sc.querySelector(".html-source")?.value || "").trim();
    if (src) currentHtml = minifyHtmlForPrompt(src);
  }

  // Contexte "neutre" d'écran
  const coreContext = `Contexte global:
- Tâche: ${taskName || "(non renseigné)"}${projectKey ? ` — Projet: ${projectKey}` : ""}
- Définition:
${definitionTxt || "(à compléter)"}

Écran ${idx} — ${title}
- Objectif / règles:
${expTxt || "(à compléter)"}${
    includeCurrentHtml && currentHtml
      ? `
HTML ACTUEL À MODIFIER :
<<<HTML
${currentHtml}
HTML>>>`
      : ""
  }`.trim();

  const cfg = typeof getAiCfg === "function" ? getAiCfg() || {} : {};
  const mode = cfg.mode || "direct";

  if (mode === "proxy") {
    // 👉 En mode proxy, on laisse 100% des consignes système au serveur.
    // Le champ "prompt" envoyé au proxy = seulement ce coreContext
    // (auquel on ajoutera le champ "Consignes supplémentaires").
    return coreContext;
  }

  // 👉 En mode direct, on garde l’ancien prompt complet
  return `Génère un **HTML COMPLET** (<!doctype html><html>…</html>) autonome (CSS via <style>, JS inline possible), sans dépendance externe.

${coreContext}

Contraintes:
- Code propre, sémantique, responsive simple.
- Si tableau: entêtes clairs, zebra rows, hover, tri si simple.
- Si formulaire: labels associés, placeholders utiles, validation HTML5 de base.
- Aucune ressource externe (CDN).
- Police système.
- **Renvoie UNIQUEMENT l’HTML COMPLET final** (aucune explication).`;
}

/* ---------- Bandeau Focus: label + bouton Plier/Déplier ---------- */
function updateFocusInfo(sc) {
  const idx =
    Array.from(document.querySelectorAll("#screens .screen")).indexOf(sc) + 1;
  const titleVal = (
    sc.querySelector(".screen-title").value || `Écran ${idx}`
  ).trim();
  const label = sc.querySelector(".focus-info .label");
  if (label) label.textContent = `Écran ${idx} — ${titleVal}`;
  updateCollapseButton(sc);
}
function updateCollapseButton(sc) {
  const btn = sc.querySelector(".focus-info .btn-toggle");
  if (!btn) return;
  const isExpanded = sc.getAttribute("aria-expanded") === "true";
  btn.textContent = isExpanded ? "Plier l’écran" : "Déplier l’écran";
}
/* ---------- Focus: pas de bandeau supplémentaire ---------- */
function ensureFocusUI(sc, enable) {
  // On ne veut plus afficher le bandeau .focus-info.
  // Si jamais il en reste un ancien dans le DOM, on le supprime.
  const info = sc.querySelector(".focus-info");
  if (info) info.remove();
  // Rien d’autre à faire : le mode focus gère juste la classe CSS .focus-preview.
}

/* ---------- HTML par défaut + reset ---------- */
const DEFAULT_EMPTY_HTML = [
  "<!doctype html>",
  "<html lang='fr'>",
  "<head>",
  "  <meta charset='utf-8' />",
  "  <meta name='viewport' content='width=device-width,initial-scale=1' />",
  "  <title>Écran</title>",
  "  <style>",
  "    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial;margin:0;padding:24px;background:#0b0f14;color:#e8edf2}",
  "    .empty{opacity:.8}",
  "  </style>",
  "</head>",
  "<body>",
  "  <p class='empty'>Aucun HTML fourni.</p>",
  "</body>",
  "</html>",
].join("\n");

function resetScreenHtml(screenEl) {
  setScreenHtml(screenEl, DEFAULT_EMPTY_HTML);
  toast("HTML réinitialisé.");
}

function getPromptForScreen(sc) {
  const includeCurrent = sc.querySelector(
    '.inline-inc input[type="checkbox"]',
  )?.checked;
  const custom = sc.querySelector(".chat-text")?.value?.trim() || "";
  const base = buildPromptForScreen(sc, !!includeCurrent);
  return custom ? `${base}\n\nConsignes supplémentaires:\n${custom}` : base;
}

/* ---------- Écrans ---------- */
function addScreen() {
  screenUidCounter++;
  const uid = `screen-${screenUidCounter}`;

  const wrap = createEl("div", {
    class: "screen collapsible",
    id: uid,
    "aria-expanded": "true",
  });

  const handle = createEl("div", {
    class: "drag-handle",
    title: "Glisser pour réordonner",
  });
  handle.textContent = "⋮⋮";
  const numBox = createEl(
    "div",
    { class: "screen-num", "aria-label": "Numéro d'écran" },
    [document.createTextNode("Écran 0")],
  );
  const title = createEl("input", {
    class: "screen-title",
    placeholder: "Titre de l’écran",
  });

  const chevronBtn = createEl("button", {
    class: "chevron",
    "data-role": "toggle",
    title: "Plier / déplier",
    "aria-expanded": "true",
  });
  chevronBtn.addEventListener("click", () => {
    toggleSection(wrap);
    updateCollapseButton(wrap);
  });

  const focusBtn = createEl("button", {
    class: "btn",
    "data-role": "focus",
    text: "Focus aperçu",
    title: "Masquer texte et outils, garder l’aperçu en grand",
  });
  focusBtn.addEventListener("click", () => {
    const isFocus = wrap.classList.toggle("focus-preview");
    focusBtn.textContent = isFocus ? "Vue complète" : "Focus aperçu";
    ensureFocusUI(wrap, isFocus);
  });

  const delBtn = createEl("button", {
    class: "btn warn",
    "data-role": "delete",
    text: "Supprimer",
  });

  const left = createEl("div", { class: "screen-left" }, [
    handle,
    numBox,
    title,
  ]);
  const actions = createEl("div", { class: "screen-actions" }, [
    chevronBtn,
    focusBtn,
    delBtn,
  ]);
  delBtn.addEventListener("click", () => {
    wrap.remove();
    renumberScreens();
  });

  const head = createEl("div", { class: "screen-head" }, [left, actions]);

  const body = createEl("div", { class: "collapsible-body" });

  const expLabel = createEl("label", { text: "Zone explicative" });
  const expWrap = createEl("div", { class: "rte-wrap explication" });
  const expTb = createEl("div", { class: "rte-toolbar" });
  [
    "bold",
    "italic",
    "formatBlock:H2",
    "insertUnorderedList",
    "insertOrderedList",
    "removeFormat",
  ].forEach((def) => {
    const [cmd, val] = def.split(":");
    const textMap = {
      bold: "B",
      italic: "I",
      "formatBlock:H2": "H2",
      insertUnorderedList: "• Liste",
      insertOrderedList: "1. Liste",
      removeFormat: "Effacer",
    };
    const btn = createEl("button", {
      class: "btn",
      "data-cmd": cmd,
      "data-value": val || "",
      text: textMap[def],
    });
    expTb.appendChild(btn);
  });
  const expRte = createEl("div", {
    class: "rte",
    contenteditable: "true",
    "data-placeholder": "But de l’écran, règles, comportements attendus…",
  });
  expWrap.append(expTb, expRte);

  const elLabel = createEl("label", {
    text: "Discussion & éléments (génération + aperçu)",
  });

  // Chat (simple)
  const chat = createEl("div", { class: "chat" });
  const chatHead = createEl("div", { class: "chat-head" }, [
    createEl("div", { class: "title", text: "Discussion / Prompt IA" }),
  ]);
  const chatBody = createEl("div", { class: "chat-body" });
  const chatImages = createEl("div", {
    class: "chat-images",
    style: "display:none",
  });
  const chatFiles = createEl("div", {
    class: "chat-files",
    style: "display:none",
  });
  const chatInputRow = createEl("div", { class: "chat-input" }, [
    createEl("textarea", {
      class: "chat-text",
      placeholder: "Ecrire prompt ici.",
    }),
  ]);
  chat.append(chatHead, chatBody, chatImages, chatFiles, chatInputRow);

  const chatTextarea = chatInputRow.querySelector(".chat-text");
  chatTextarea.addEventListener("paste", async (e) => {
    await handlePasteOrDropImages(wrap, e.clipboardData?.items || []);
  });
  chat.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  chat.addEventListener("drop", async (e) => {
    e.preventDefault();
    await handlePasteOrDropImages(wrap, e.dataTransfer?.files || []);
  });

  // Toolbar + frame
  const btnLoad = createEl("button", {
    class: "btn brand",
    "data-role": "load",
    text: "Charger un fichier HTML…",
  });
  const btnGen = createEl("button", {
    class: "btn brand gen",
    "data-role": "gen",
    text: "Générer avec l’IA",
  });
  const btnChat = createEl("button", {
    class: "btn",
    "data-role": "chat",
    text: "💬 Discuter",
  });

  const btnClearImgs = createEl("button", {
    class: "btn warn",
    "data-role": "clear-images",
    text: "Vider images",
  });
  const btnResetHtml = createEl("button", {
    class: "btn danger",
    "data-role": "reset-html",
    text: "Vider HTML",
  });
  const btnExportHtml = createEl("button", {
    class: "btn brand gen",
    "data-role": "export-html",
    text: "Exporter HTML",
  });

  const btnEditHtml = createEl("button", {
    class: "btn",
    "data-role": "edit-html",
    text: "✏️ Éditer HTML",
  });

  /* case Inclure HTML actuel */
  const cbIncludeHtml = createEl("label", { class: "inline-inc" });
  const cb = createEl("input", {
    type: "checkbox",
    checked: "",
    id: `inc-${uid}`,
  });
  cbIncludeHtml.append(cb, document.createTextNode(" Inclure le HTML actuel"));

  const leftBar = createEl("div", { class: "toolbar-left" }, [
    cbIncludeHtml,
    btnLoad,

    btnGen,
  ]);
  const rightBar = createEl("div", { class: "toolbar-right" }, [
    btnEditHtml,
    btnExportHtml,
    btnChat,
    btnResetHtml,
  ]);

  const elToolbar = createEl("div", { class: "elements-toolbar" }, [
    leftBar,
    rightBar,
  ]);

  const frame = createEl("iframe", {
    class: "frame",
    title: "Aperçu de l’écran",
  });
  const store = createEl("textarea", {
    class: "html-source",
    style: "display:none",
  });

  btnLoad.addEventListener("click", () => loadHtmlIntoScreen(wrap));
  btnEditHtml.addEventListener("click", () =>
    toggleHtmlEditor(wrap, btnEditHtml),
  );
  btnGen.addEventListener("click", async () => {
    if (!canTranslate()) {
      openAiSettings();
      toast("Configure Paramètres IA pour générer du HTML.");
      return;
    }

    const oldLabel = btnGen.textContent;
    btnGen.disabled = true;
    btnGen.textContent = "Génération…";

    try {
      const prompt = getPromptForScreen(wrap);
      const images = getScreenImages(wrap);
      const files = getScreenFiles(wrap);

      const { html } = await generateHtmlViaAI(prompt, images, files, uid);

      setScreenHtml(wrap, html);
      toast("HTML généré.");
    } catch (e) {
      if (!screenConversations[uid]) {
        screenConversations[uid] = [];
      }

      screenConversations[uid].push({
        role: "assistant",
        content: "Erreur IA : " + e.message,
      });

      renderChat(wrap);

      console.error(e);
      alert("Erreur IA : " + e.message);
    } finally {
      btnGen.disabled = false;
      btnGen.textContent = oldLabel;
    }
  });

  btnChat.addEventListener("click", async () => {
    const prompt = chatTextarea.value.trim();
    if (!prompt) return;

    if (!screenConversations[uid]) {
      screenConversations[uid] = [];
    }

    // Message utilisateur
    screenConversations[uid].push({
      role: "user",
      content: prompt,
    });

    renderChat(wrap);

    try {
      const currentHtml = (
        wrap.querySelector(".html-source")?.value || ""
      ).trim();
      const currentHtmlMini = currentHtml
        ? minifyHtmlForPrompt(currentHtml)
        : "";

      const enrichedPrompt = currentHtmlMini
        ? `Voici le HTML actuel de l'écran (contexte). Réponds uniquement en texte.\n\n<<<HTML\n${currentHtmlMini}\nHTML>>>\n\nQuestion:\n${prompt}`
        : prompt;

      const response = await chatTextOnly(enrichedPrompt, uid);

      screenConversations[uid].push({
        role: "assistant",
        content: response,
      });

      renderChat(wrap);
    } catch (e) {
      screenConversations[uid].push({
        role: "assistant",
        content: "Erreur : " + e.message,
      });

      renderChat(wrap);
    }
  });

  btnResetHtml.addEventListener("click", () => {
    if (!confirm("Vider le HTML actuel de cet écran ?")) return;
    resetScreenHtml(wrap);
  });
  btnExportHtml.addEventListener("click", () => exportScreenHtml(wrap));
  const elements = createEl("div", { class: "elements" }, [
    elToolbar,
    frame,
    store,
  ]);

  body.append(expLabel, expWrap, elLabel, chat, elements);
  wrap.append(head, body);

  $("#screens").appendChild(wrap);

  bindRteToolbar(expWrap);
  makeDraggable(wrap, handle);
  renumberScreens();
  title.addEventListener("input", () => updateFocusInfo(wrap));
  updateCollapseButton(wrap);
  renderScreenImages(wrap);
  title.focus();

  // Mettre un HTML initial vide pour éviter un iframe vide
  resetScreenHtml(wrap);
}

function setScreenHtml(sc, html) {
  const frame = sc.querySelector(".frame");
  const store = sc.querySelector(".html-source");
  if (!frame || !store) return;

  const raw = html || "";
  const cssHref = "vikta-task.css";
  let finalHtml = raw;

  try {
    // On parse le HTML renvoyé par l'IA
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");

    if (doc && doc.documentElement) {
      let head = doc.head;

      // Si pas de <head>, on en crée un
      if (!head) {
        head = doc.createElement("head");
        // On insère le head avant le body si possible
        if (doc.body) {
          doc.documentElement.insertBefore(head, doc.body);
        } else {
          doc.documentElement.appendChild(head);
        }
      }

      // On vérifie s'il y a déjà un link vers vikta-task.css
      const hasLink = head.querySelector(
        'link[rel="stylesheet"][href="' + cssHref + '"]',
      );

      if (!hasLink) {
        const linkEl = doc.createElement("link");
        linkEl.setAttribute("rel", "stylesheet");
        linkEl.setAttribute("href", cssHref);
        head.appendChild(linkEl);
      }

      // On reconstruit un HTML complet à partir du DOM
      finalHtml = "<!doctype html>\n" + doc.documentElement.outerHTML;
    }
  } catch (e) {
    console.warn(
      "setScreenHtml: parseFromString a échoué, on garde le HTML brut.",
      e,
    );
    // fallback : on garde raw tel quel
    finalHtml = raw;
  }

  // IMPORTANT : on stocke la version enrichie (avec le <link>) dans le textarea
  store.value = finalHtml;

  // Et on affiche la même chose dans l’iframe
  frame.srcdoc = finalHtml;
}

function toggleHtmlEditor(screenEl, btn) {
  const store = screenEl.querySelector(".html-source");
  const frame = screenEl.querySelector(".frame");
  if (!store || !frame) return;

  const isEditing = screenEl.classList.toggle("editing-html");

  if (isEditing) {
    // Passage en mode édition
    store.style.display = "block";
    store.style.minHeight = "260px";
    store.style.fontFamily = "monospace";
    store.style.whiteSpace = "pre";
    store.style.width = "100%";

    // Si jamais le textarea était vide, on récupère le HTML de l’iframe
    if (!store.value && frame.srcdoc) {
      store.value = frame.srcdoc;
    }

    btn.textContent = "✅ Valider HTML";
  } else {
    // Fin d’édition → on pousse le HTML dans l’aperçu
    const html = store.value || "";
    setScreenHtml(screenEl, html);
    store.style.display = "none";
    btn.textContent = "✏️ Éditer HTML";
    toast("HTML mis à jour.");
  }
}

function renumberScreens() {
  const screens = Array.from(document.querySelectorAll("#screens .screen"));
  screens.forEach((sc, idx) => {
    const numEl = sc.querySelector(".screen-num");
    if (numEl) numEl.textContent = `Écran ${idx + 1}`;
    sc.dataset.index = String(idx + 1);
    if (sc.classList.contains("focus-preview")) updateFocusInfo(sc);
  });
}

/* ---------- Navigation depuis les iframes (Suivant / Précédent / Aller à N) ---------- */
function goToScreen(index) {
  const screens = Array.from(document.querySelectorAll("#screens .screen"));
  if (!screens.length) return;
  const clamped = Math.max(0, Math.min(index, screens.length - 1));
  const target = screens[clamped];

  // sortir du focus de tous, puis focus sur la cible
  screens.forEach((sc) => {
    sc.classList.remove("focus-preview");
    ensureFocusUI(sc, false);
  });

  target.classList.add("focus-preview");
  ensureFocusUI(target, true);

  // s'assurer que l'écran est déplié
  target.setAttribute("aria-expanded", "true");
  updateCollapseButton(target);

  // mise à jour bandeau et scroll
  updateFocusInfo(target);
  target.scrollIntoView({ behavior: "smooth", block: "start" });

  // Notifier l'iframe cible qu'elle devient active
  const targetFrame = target.querySelector(".frame");
  if (targetFrame && targetFrame.contentWindow) {
    targetFrame.contentWindow.postMessage(
      { type: "po:activate", index: clamped + 1 },
      "*"
    );
  }
}

function goToRelative(fromIdx, delta) {
  goToScreen(fromIdx + delta);
}

function getScreenIndexByFrameWindow(win) {
  const frames = Array.from(document.querySelectorAll(".screen .frame"));
  return frames.findIndex((fr) => fr.contentWindow === win);
}

window.addEventListener(
  "message",
  (e) => {
    // On accepte uniquement les messages provenant d’un iframe de l’app
    const fromIdx = getScreenIndexByFrameWindow(e.source);
    if (fromIdx === -1) return;

    const data = e.data || {};
    if (data.type !== "po:navigate") return;

    switch (data.action) {
      case "next":
        return goToRelative(fromIdx, +1);
      case "prev":
        return goToRelative(fromIdx, -1);
      case "goto":
        if (Number.isFinite(data.index)) return goToScreen(data.index - 1); // 1-based côté iframe
      case "focus": {
        const screens = Array.from(
          document.querySelectorAll("#screens .screen"),
        );
        const sc = screens[fromIdx];
        if (!sc) return;
        const enable = !!data.enable;
        screens.forEach((s) => {
          s.classList.remove("focus-preview");
          ensureFocusUI(s, false);
        });
        if (enable) {
          sc.classList.add("focus-preview");
          ensureFocusUI(sc, true);
        }
        sc.setAttribute("aria-expanded", "true");
        updateFocusInfo(sc);
        sc.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      default:
        return;
    }
  },
  false,
);

/* ---------- (Re)brancher un écran existant (après réouverture) ---------- */
function wireScreen(sc) {
  // Drag
  const handle = sc.querySelector(".drag-handle");
  if (handle) makeDraggable(sc, handle);

  // Toggle (plier/déplier)
  const btnToggle =
    sc.querySelector('[data-role="toggle"]') || sc.querySelector(".chevron");
  if (btnToggle)
    btnToggle.onclick = () => {
      toggleSection(sc);
      updateCollapseButton(sc);
    };

  // Focus
  const btnFocus = sc.querySelector('[data-role="focus"]');
  if (btnFocus) {
    btnFocus.onclick = () => {
      const isFocus = sc.classList.toggle("focus-preview");
      btnFocus.textContent = isFocus ? "Vue complète" : "Focus aperçu";
      ensureFocusUI(sc, isFocus);
    };
  }

  // Éditer HTML
  const btnEdit = sc.querySelector('[data-role="edit-html"]');
  if (btnEdit) {
    btnEdit.onclick = () => toggleHtmlEditor(sc, btnEdit);
  }

  // Delete
  const btnDelete = sc.querySelector('[data-role="delete"]');
  if (btnDelete)
    btnDelete.onclick = () => {
      sc.remove();
      renumberScreens();
    };

  // Load HTML
  const btnLoad = sc.querySelector('[data-role="load"]');
  if (btnLoad) btnLoad.onclick = () => loadHtmlIntoScreen(sc);

  // Générer IA
  const btnGen = sc.querySelector('[data-role="gen"]');
  if (btnGen)
    btnGen.onclick = async () => {
      if (!canTranslate()) {
        openAiSettings();
        toast("Configure Paramètres IA pour générer du HTML.");
        return;
      }

      const old = btnGen.textContent;
      btnGen.disabled = true;
      btnGen.textContent = "Génération…";

      try {
        const prompt = getPromptForScreen(sc);
        const images = getScreenImages(sc) || [];
        const files = getScreenFiles(sc) || [];
        const { html, debugPrompt } = await generateHtmlViaAI(
          prompt,
          images,
          files,
          sc.id,
        );

        if (!window.__viktaLastPromptByScreen)
          window.__viktaLastPromptByScreen = {};
        window.__viktaLastPromptByScreen[sc.id] = debugPrompt || prompt;

        setScreenHtml(sc, html);
        toast("HTML généré et inséré.");
      } catch (e) {
        console.error(e);
        alert("Erreur IA : " + e.message);
      } finally {
        btnGen.disabled = false;
        btnGen.textContent = old;
      }
    };

  // Vider prompt
  const btnClear = sc.querySelector('[data-role="clear"]');
  if (btnClear)
    btnClear.onclick = () => {
      const ta = sc.querySelector(".chat-text");
      if (ta) ta.value = "";
    };

  // Vider HTML
  const btnResetHtml = sc.querySelector('[data-role="reset-html"]');
  if (btnResetHtml)
    btnResetHtml.onclick = () => {
      if (!confirm("Vider le HTML actuel de cet écran ?")) return;
      resetScreenHtml(sc);
    };

  // Exporter HTML de cet écran
  const btnExport = sc.querySelector('[data-role="export-html"]');
  if (btnExport) btnExport.onclick = () => exportScreenHtml(sc);

  // Bouton "💬 Discuter"
  const btnChat = sc.querySelector('[data-role="chat"]');
  const chatTextareaForChat = sc.querySelector(".chat-text");
  if (btnChat && chatTextareaForChat) {
    btnChat.onclick = async () => {
      const prompt = chatTextareaForChat.value.trim();
      if (!prompt) return;
      const uid = sc.id;
      if (!screenConversations[uid]) screenConversations[uid] = [];
      screenConversations[uid].push({ role: "user", content: prompt });
      renderChat(sc);
      try {
        const currentHtml = (sc.querySelector(".html-source")?.value || "").trim();
        const currentHtmlMini = currentHtml ? minifyHtmlForPrompt(currentHtml) : "";
        const enrichedPrompt = currentHtmlMini
          ? `Voici le HTML actuel de l'écran (contexte). Réponds uniquement en texte.\n\n<<<HTML\n${currentHtmlMini}\nHTML>>>\n\nQuestion:\n${prompt}`
          : prompt;
        const response = await chatTextOnly(enrichedPrompt, uid);
        screenConversations[uid].push({ role: "assistant", content: response });
        renderChat(sc);
      } catch (e) {
        screenConversations[uid].push({ role: "assistant", content: "Erreur : " + e.message });
        renderChat(sc);
      }
    };
  }

  // Chat: recoller les listeners paste/drop images
  const chat = sc.querySelector(".chat");
  const chatTextarea = sc.querySelector(".chat-text");
  if (chatTextarea) {
    chatTextarea.addEventListener("paste", async (e) => {
      await handlePasteOrDropImages(sc, e.clipboardData?.items || []);
    });
  }
  if (chat) {
    chat.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    chat.addEventListener("drop", async (e) => {
      e.preventDefault();
      await handlePasteOrDropImages(sc, e.dataTransfer?.files || []);
    });
  }

  // RTE de la zone explicative
  const expWrap = sc.querySelector(".explication");
  if (expWrap) bindRteToolbar(expWrap);

  // Recharger l’aperçu
  const store = sc.querySelector(".html-source");
  if (store && store.value) {
    setScreenHtml(sc, store.value);
  }

  // Titre -> mise à jour bandeau focus
  const title = sc.querySelector(".screen-title");
  if (title) title.addEventListener("input", () => updateFocusInfo(sc));

  // Repeindre les éventuelles images/fichiers déjà présents
  renderScreenImages(sc);
  renderScreenFiles(sc);

  updateCollapseButton(sc);
}

/* ---------- Hydrater tous les écrans au chargement ---------- */
function hydrateAllScreens() {
  document.querySelectorAll("#screens .screen").forEach(wireScreen);
  renumberScreens();
}

/* ---------- Sérialisation ---------- */
function snapshotFormStateIntoAttributes(root = document) {
  root.querySelectorAll("input").forEach((inp) => {
    const type = (inp.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") {
      if (inp.checked) inp.setAttribute("checked", "");
      else inp.removeAttribute("checked");
      if (inp.value != null) inp.setAttribute("value", inp.value);
    } else {
      if (inp.value != null) inp.setAttribute("value", inp.value);
    }
  });
  root.querySelectorAll("textarea").forEach((ta) => {
    ta.textContent = ta.value ?? "";
  });
  root.querySelectorAll("select").forEach((sel) => {
    Array.from(sel.options).forEach((opt) => {
      if (opt.selected) opt.setAttribute("selected", "");
      else opt.removeAttribute("selected");
    });
  });
}

function serializeCurrentDocument() {
  snapshotFormStateIntoAttributes(document);
  const clone = document.documentElement.cloneNode(true);
  return "<!doctype html>\n" + clone.outerHTML;
}

/* ---------- Dossier par défaut ---------- */
async function pickDefaultDir() {
  if (!window.showDirectoryPicker) {
    alert("Ton navigateur ne supporte pas cette fonction.");
    return;
  }
  try {
    defaultDirHandle = await window.showDirectoryPicker({
      id: "po-default-dir",
    });
    _saveDirHandle(defaultDirHandle);
    $("#workspaceGate").style.display = "none";
    toast("Dossier de travail sélectionné.");
    validateTaskName(false);
  } catch (e) {
    if (e?.name !== "AbortError") console.error(e);
  }
}

/* ---------- Sauvegarder = Save As dans le dossier par défaut ---------- */
async function saveAsTask() {
  if (!validateTaskName(true)) {
    $("#taskName").focus();
    return;
  }
  if (!defaultDirHandle) {
    await pickDefaultDir();
    if (!defaultDirHandle) return;
  }

  const safe = slug($("#taskName").value.trim());
  const html = serializeCurrentDocument();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });

  if (window.showSaveFilePicker) {
    try {
      const opts = {
        suggestedName: safe + ".html",
        types: [
          { description: "Fichier HTML", accept: { "text/html": [".html"] } },
        ],
        startIn: defaultDirHandle,
      };
      const handle = await window.showSaveFilePicker(opts);
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      toast("Fichier sauvegardé.");
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error(err);
    }
  }

  // Fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safe + ".html";
  a.click();
  URL.revokeObjectURL(url);
  toast("Téléchargement lancé (fallback).");
}

async function exportScreenHtml(screenEl) {
  // Si aucun dossier par défaut, on le demande une fois
  if (!defaultDirHandle) {
    // réutilise la logique existante
    await pickDefaultDir();

    // Si l'utilisateur annule ou le navigateur ne supporte pas, on abandonne
    if (!defaultDirHandle) {
      return;
    }
  }

  const titleInput = screenEl.querySelector(".screen-title");
  const title = (titleInput?.value || "ecran").trim();
  const baseName = slug(title) || "ecran";

  const now = new Date();
  const stamp =
    [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("") +
    "-" +
    [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
    ].join("");

  const fileName = `${baseName}-${stamp}.html`;

  const htmlSrc =
    (screenEl.querySelector(".html-source")?.value || "").trim() ||
    DEFAULT_EMPTY_HTML;
  const blob = new Blob([htmlSrc], { type: "text/html;charset=utf-8" });

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Fichier HTML",
            accept: { "text/html": [".html"] },
          },
        ],
        startIn: defaultDirHandle, // 👉 ici on utilise bien le dossier choisi
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      toast("HTML de l’écran exporté.");
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error(err);
    }
  }

  // fallback : téléchargement direct
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  toast("Téléchargement du HTML de l’écran lancé.");
}

/* ---------- Ouvrir ---------- */
async function openTask() {
  if (window.showOpenFilePicker) {
    try {
      const opts = {
        types: [
          {
            description: "Fichier HTML",
            accept: { "text/html": [".html", ".htm"] },
          },
        ],
        multiple: false,
      };
      // 👉 si on a un dossier par défaut, on le réutilise
      if (defaultDirHandle) {
        opts.startIn = defaultDirHandle;
      }

      const [handle] = await window.showOpenFilePicker(opts);
      const file = await handle.getFile();
      const text = await file.text();
      document.open();
      document.write(text);
      document.close();
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error(err);
    }
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".html,.htm,text/html";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    document.open();
    document.write(text);
    document.close();
  });
  input.click();
}

/* ---------- Charger un HTML dans un écran ---------- */
async function loadHtmlIntoScreen(screenEl) {
  const loadFromFile = async (file) => {
    const text = await file.text();
    setScreenHtml(screenEl, text);
    toast("HTML chargé dans l’écran.");
  };
  if (window.showOpenFilePicker) {
    try {
      const opts = {
        types: [
          {
            description: "Fichier HTML",
            accept: { "text/html": [".html", ".htm"] },
          },
        ],
        multiple: false,
      };
      // 👉 même logique : repartir du dossier de travail
      if (defaultDirHandle) {
        opts.startIn = defaultDirHandle;
      }

      const [handle] = await window.showOpenFilePicker(opts);
      const file = await handle.getFile();
      await loadFromFile(file);
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.error(e);
      alert("Impossible d’ouvrir le fichier HTML (voir console).");
      return;
    }
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".html,.htm,text/html";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await loadFromFile(file);
    } catch (e) {
      console.error(e);
      alert("Erreur lors du chargement du fichier HTML.");
    }
  });
  input.click();
}

/* ---------- Build index (FR/EN), CSV Jira, Export ---------- */
function buildPureBundle(taskName, isEnglish = false) {
  const name = taskName || (isEnglish ? "Task" : "Tâche");
  const defHtml = sanitizeHtmlBasic(rteGetHtml($("#definition")));
  const screens = Array.from(document.querySelectorAll("#screens .screen"));

  const css = `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial;margin:0;padding:20px;background:#0b0f14;color:#e8edf2}
h1,h2,h3{margin:0 0 10px}
.section{background:#11161d;border:1px solid #1e2630;border-radius:12px;padding:14px;margin:14px 0}
.elements{background:#0a1118;border:1px solid #223043;border-radius:10px;padding:10px}
.rte-view ul,.rte-view ol{padding-left:22px}
.rte-view blockquote{border-left:3px solid #2a3b50;margin:6px 0;padding-left:10px;color:#b7c6d6}
.frame{width:100%;min-height:420px;border:1px solid #223043;border-radius:10px;background:#0a1118}
`;
  const js = `// JS commun — ajoute ici des comportements globaux si nécessaire
console.log("App prêt");
`;
  const defTitle = isEnglish ? "Task Definition" : "Définition de tâche";

  const head = [
    `<div class="section"><h1>${escapeHtml(name)}</h1></div>`,
    `<div class="section"><h2>${defTitle}</h2><div class="rte-view">${defHtml || (isEnglish ? "<em>to be completed</em>" : "<em>à compléter</em>")}</div></div>`,
  ];

  const blocks = screens.map((sc, i) => {
    const title =
      sc.querySelector(".screen-title").value ||
      (isEnglish ? `Screen ${i + 1}` : `Écran ${i + 1}`);
    const expHtml = sanitizeHtmlBasic(
      rteGetHtml(sc.querySelector(".explication .rte")),
    );
    const htmlSrc = sc.querySelector(".html-source").value.trim();
    const srcdoc = escapeAttr(
      htmlSrc ||
        "<!doctype html><html><head><meta charset='utf-8'><title>Écran</title></head><body><p style='font-family:system-ui'>Aucun HTML fourni.</p></body></html>",
    );
    return `<div class="section"><h3>${escapeHtml(title)}</h3><div class="rte-view">${expHtml || (isEnglish ? "<em>to be completed</em>" : "<em>à compléter</em>")}</div><div class="elements"><iframe class="frame" srcdoc="${srcdoc}"></iframe></div></div>`;
  });

  const html = `<!doctype html>
<html lang="${isEnglish ? "en" : "fr"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(name)}</title>
<link rel="stylesheet" href="vikta-task.css" />
</head>
<body>
${[...head, ...blocks].join("\n")}
<script src="app.js"><\/script>
</body>
</html>`;
  return { html, css, js };
}
function buildJiraCsv({ projectKey, summary, description }) {
  const headers = ["Project Key", "Issue Type", "Summary", "Description"];
  const row = [projectKey, "Task", summary, description]
    .map(escapeCsv)
    .join(",");
  return headers.join(",") + "\n" + row + "\n";
}
async function exportWorkspace() {
  if (!window.showDirectoryPicker) {
    alert(
      "Ton navigateur ne permet pas d'écrire plusieurs fichiers. Utilise Chrome/Edge pour l’export workspace.",
    );
    return;
  }
  if (!validateTaskName(true)) {
    $("#taskName").focus();
    return;
  }

  const taskNameFR = $("#taskName").value.trim();
  const projectKey = ($("#projectKey").value || "").trim();
  const defHtmlFR = rteGetHtml($("#definition"));
  const defTxtFR = rteToPlain(defHtmlFR);

  const now = new Date();
  const stamp =
    [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("") +
    "-" +
    [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
    ].join("");
  const rootName = `${slug(taskNameFR)}-${stamp}`;

  // S'assurer qu'on a un dossier par défaut
  if (!defaultDirHandle) {
    await pickDefaultDir();
    if (!defaultDirHandle) return;
  }

  let dir = defaultDirHandle;

  // Créer un sous-dossier timestampé
  const root = await dir.getDirectoryHandle(rootName, { create: true });

  /* FR */
  const frDir = await root.getDirectoryHandle("fr", { create: true });
  await writeFile(
    frDir,
    "original.html",
    serializeCurrentDocument(),
    "text/html",
  );
  const {
    html: indexHtmlFR,
    css: indexCssFR,
    js: indexJsFR,
  } = buildPureBundle(taskNameFR, false);
  await writeFile(frDir, "index.html", indexHtmlFR, "text/html");
  const viktaCss = await readViktaCssFromDefaultDir();
  await writeFile(frDir, "vikta-task.css", viktaCss, "text/css");
  await writeFile(frDir, "app.js", indexJsFR, "text/javascript");

  const screens = Array.from(document.querySelectorAll("#screens .screen"));
  if (screens.length) {
    const screensDirFR = await frDir.getDirectoryHandle("screens", {
      create: true,
    });
    const viktaCss = await readViktaCssFromDefaultDir();
    for (let i = 0; i < screens.length; i++) {
      const sc = screens[i];
      const index = i + 1;
      const titleFR = (
        sc.querySelector(".screen-title").value || `Écran ${index}`
      ).trim();
      const folderFR = slug(`screen ${index} - ${titleFR}`);
      const sdirFR = await screensDirFR.getDirectoryHandle(folderFR, {
        create: true,
      });
      const htmlSrcFR =
        (sc.querySelector(".html-source").value || "").trim() ||
        "<!doctype html><html><head><meta charset='utf-8'><title>Écran</title></head><body><p style='font-family:system-ui'>Aucun HTML fourni.</p></body></html>";
      // ✅ 1) injecte le <link href="vikta-task.css">
      const htmlFRwithCss = ensureViktaCssLink(htmlSrcFR);

      // ✅ 2) écrit le HTML + le CSS dans le dossier écran
      await writeFile(sdirFR, "screen.html", htmlFRwithCss, "text/html");
      await writeFile(sdirFR, "vikta-task.css", viktaCss, "text/css");

      await writeFile(
        sdirFR,
        "screen.js",
        "// JS spécifique à cet écran\n",
        "text/javascript",
      );
    }
  }

  const csvFR = buildJiraCsv({
    projectKey,
    summary: taskNameFR || "Tâche",
    description: `Définition de tâche:\n${defTxtFR}\n\n(Consulte les fichiers du workspace pour les écrans et éléments.)`,
  });
  await writeFile(frDir, "issue.csv", "\ufeff" + csvFR, "text/csv");

  /* EN (si IA dispo) */
  if (!canTranslate()) {
    toast(
      "Export FR terminé. Version EN non générée (configure Paramètres IA).",
    );
    return;
  }

  const enDir = await root.getDirectoryHandle("en", { create: true });
  const taskNameEN = await translateText(taskNameFR);
  const defHtmlEN = await translateHtml(defHtmlFR || "");

  // index EN (construit sur le DOM courant : tous les écrans y figureront)
  const {
    html: indexHtmlEN_raw,
    css: indexCssEN,
    js: indexJsEN,
  } = buildPureBundle(taskNameEN, true);
  const indexHtmlEN = indexHtmlEN_raw.replace(
    /(<h2>Task Definition<\/h2><div class="rte-view">)([\s\S]*?)(<\/div>)/,
    `$1${sanitizeHtmlBasic(defHtmlEN) || "<em>to be completed</em>"}$3`,
  );
  await writeFile(enDir, "index.html", indexHtmlEN, "text/html");

  await writeFile(enDir, "vikta-task.css", viktaCss, "text/css");
  await writeFile(enDir, "app.js", indexJsEN, "text/javascript");

  if (screens.length) {
    const screensDirEN = await enDir.getDirectoryHandle("screens", {
      create: true,
    });
    const viktaCss = await readViktaCssFromDefaultDir();
    for (let i = 0; i < screens.length; i++) {
      const sc = screens[i];
      const index = i + 1;

      const titleFR = (
        sc.querySelector(".screen-title").value || `Écran ${index}`
      ).trim();
      const htmlSrcFRraw = (
        sc.querySelector(".html-source").value || ""
      ).trim();

      // 1) Traductions robustes (avec fallback)
      let titleEN = "";
      try {
        titleEN = await translateText(titleFR);
      } catch {
        titleEN = `Screen ${index}`;
      }

      const htmlSrcEN = await safeTranslateHtml(htmlSrcFRraw);

      // 2) Écriture des fichiers EN
      const folderEN = slug(`screen ${index} - ${titleEN}`);
      const sdirEN = await screensDirEN.getDirectoryHandle(folderEN, {
        create: true,
      });

      const htmlENwithCss = ensureViktaCssLink(htmlSrcEN);

      await writeFile(sdirEN, "screen.html", htmlENwithCss, "text/html");
      await writeFile(sdirEN, "vikta-task.css", viktaCss, "text/css");
      await writeFile(
        sdirEN,
        "screen.js",
        "// Screen-specific JS\n",
        "text/javascript",
      );
    }
  }

  const defTxtEN = await translateText(rteToPlain(defHtmlFR) || "");
  const csvEN = buildJiraCsv({
    projectKey,
    summary: taskNameEN || "Task",
    description: `Task definition:\n${defTxtEN}\n\n(See workspace files for screens and elements.)`,
  });
  await writeFile(enDir, "issue.csv", "\ufeff" + csvEN, "text/csv");

  toast(`Workspace FR + EN exporté.`);
}
async function writeFile(dirHandle, filename, content, mime) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([content], { type: mime || "text/plain" }));
  await writable.close();
}

/* ---------- UI glue ---------- */
document.getElementById("addScreenHeader").addEventListener("click", addScreen);
document.getElementById("saveAsTask").addEventListener("click", saveAsTask);
document
  .getElementById("pickDefaultDir")
  .addEventListener("click", pickDefaultDir);
document.getElementById("openTask").addEventListener("click", openTask);
document
  .getElementById("exportWorkspace")
  .addEventListener("click", exportWorkspace);
document.getElementById("aiSettings").addEventListener("click", openAiSettings);
document
  .getElementById("closeModal")
  .addEventListener("click", () => $("#modal").classList.remove("open"));
document.getElementById("saveAiCfg").addEventListener("click", saveAiSettings);
document
  .getElementById("clearAiCfg")
  .addEventListener("click", clearAiSettings);
document.querySelectorAll('input[name="aimode"]').forEach((r) => {
  r.addEventListener("change", (e) => {
    const v = e.target.value;
    $("#proxyFields").style.display = v === "proxy" ? "" : "none";
    $("#directFields").style.display = v === "direct" ? "" : "none";
  });
});

/* Gate interactions */
document.getElementById("gatePick").addEventListener("click", pickDefaultDir);
document.getElementById("gateSkip").addEventListener("click", () => {
  $("#workspaceGate").style.display = "none";
  validateTaskName(false);
});

/* ---------- Toast ---------- */
function toast(msg) {
  const t = document.createElement("div");
  Object.assign(t.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    padding: "10px 14px",
    borderRadius: "12px",
    background: "linear-gradient(180deg,#3fa0ff,#298df5)",
    color: "#fff",
    border: "1px solid rgba(0,0,0,.25)",
    boxShadow: "0 10px 30px rgba(0,0,0,.3)",
    zIndex: 9999,
  });
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

/* Init: demander dossier + hydrater écrans existants */
window.addEventListener("DOMContentLoaded", async () => {
  $("#workspaceGate").style.display = "flex";
  validateTaskName(false);
  hydrateAllScreens();

  // Tenter de restaurer le dossier précédent via IndexedDB
  const saved = await _loadDirHandle();
  if (saved) {
    const btn = document.createElement("button");
    btn.className = "btn brand";
    btn.textContent = `Rouvrir "${saved.name}"`;
    btn.addEventListener("click", async () => {
      try {
        const perm = await saved.requestPermission({ mode: "readwrite" });
        if (perm === "granted") {
          defaultDirHandle = saved;
          $("#workspaceGate").style.display = "none";
          toast(`Dossier "${saved.name}" restauré.`);
          validateTaskName(false);
        }
      } catch(e) { console.error(e); }
    });
    document.querySelector(".gate-actions").prepend(btn);
  }
});
async function _translateText(cfg, text) {
  if (!text || !text.trim()) return text;
  const mode = cfg.mode || "direct";
  if (mode === "proxy") {
    const res = await fetch(cfg.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "chat",
        prompt: "Translate the following French text to English. Return ONLY the translated text, no explanations:\n\n" + text
      })
    });
    if (!res.ok) throw new Error("Proxy " + res.status);
    const data = await res.json();
    return data.text || text;
  } else {
    const key = cfg.openaiKey;
    if (!key) return text;
    const base = (cfg.apiBase || "https://api.openai.com").replace(/\/$/, "");
    const model = cfg.openaiModel || "gpt-4o-mini";
    const res = await fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model, temperature: 0.0,
        messages: [
          { role: "system", content: "You are a French-to-English translator. Translate only. No explanations." },
          { role: "user", content: text }
        ]
      })
    });
    if (!res.ok) throw new Error("OpenAI " + res.status);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || text;
  }
}

async function _translateHtml(cfg, html) {
  if (!html || !html.trim()) return html;
  const isFullDoc = /<html[\s>]/i.test(html);
  const mode = cfg.mode || "direct";
  if (mode === "proxy") {
    const res = await fetch(cfg.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "translate", prompt: html })
    });
    if (!res.ok) {
      let details = "";
      try { const d = await res.json(); details = d.details || d.error || ""; } catch(e) {}
      throw new Error("Proxy " + res.status + (details ? " — " + details : ""));
    }
    const data = await res.json();
    let result = stripCodeFence(data.html || "") || html;
    if (!isFullDoc && /<html[\s>]/i.test(result)) {
      const m = result.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (m) result = m[1].trim();
    }
    return result || html;
  } else {
    const key = cfg.openaiKey;
    if (!key) return html;
    const base = (cfg.apiBase || "https://api.openai.com").replace(/\/$/, "");
    const model = cfg.openaiModel || "gpt-4o-mini";
    const res = await fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model, temperature: 0.0,
        messages: [
          { role: "system", content: "You are a French-to-English translator. Translate all visible French text in the HTML to English. Preserve ALL HTML structure, CSS classes, IDs, and JavaScript exactly. Return ONLY the translated HTML." },
          { role: "user", content: html }
        ]
      })
    });
    if (!res.ok) throw new Error("OpenAI " + res.status);
    const data = await res.json();
    let result = stripCodeFence(data.choices?.[0]?.message?.content?.trim() || "") || html;
    if (!isFullDoc && /<html[\s>]/i.test(result)) {
      const m = result.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (m) result = m[1].trim();
    }
    return result || html;
  }
}

async function exportMockupAutonome() {
  if (!validateTaskName(true)) {
    $("#taskName").focus();
    return;
  }

  const taskName = ($("#taskName").value || "maquette").trim();
  const fileName = slug(taskName) + "-mockup.html";

  // 1. Dossier de travail + ouverture du flux d'écriture MAINTENANT
  //    (createWritable requiert un user gesture actif — avant les await longs)
  if (!defaultDirHandle) {
    await pickDefaultDir();
    if (!defaultDirHandle) return;
  }

  let writableStream;
  try {
    const fileHandle = await defaultDirHandle.getFileHandle(fileName, { create: true });
    writableStream = await fileHandle.createWritable();
  } catch (e) {
    alert("Impossible d'ouvrir le fichier pour écriture : " + (e?.message || e));
    return;
  }

  let css = "";
  try {
    const cssHandle = await defaultDirHandle.getFileHandle("vikta-task.css");
    const cssFile = await cssHandle.getFile();
    css = await cssFile.text();
  } catch (e) {
    await writableStream.abort().catch(() => {});
    alert("Impossible de trouver vikta-task.css dans le dossier de travail.");
    return;
  }
  if (!css.trim()) {
    await writableStream.abort().catch(() => {});
    alert("vikta-task.css est vide.");
    return;
  }

  // 2. Récupérer définition
  const definitionHtml = document.querySelector("#definition")?.innerHTML || "";

  // 3. Préparer les données de chaque écran (FR)
  //    On injecte le CSS inline pour que l'iframe srcdoc soit autonome
  const screens = Array.from(document.querySelectorAll("#screens .screen"));

  // CSS sera injecté côté client (une seule copie dans le mockup), pas dans les données JSON
  const screensData = screens.map((sc, idx) => {
    const title = sc.querySelector(".screen-title")?.value || `Écran ${idx + 1}`;
    const html = sc.querySelector(".html-source")?.value || "";
    const explication = sc.querySelector(".explication .rte")?.innerHTML || "";
    return { title, html, explication };
  });

  // 4. Traduction optionnelle FR → EN
  let titleEn = taskName;
  let definitionHtmlEn = definitionHtml;
  let screensDataEn = screensData.map(s => ({ title: s.title, html: s.html, explication: s.explication }));
  let hasEn = false;

  if (canTranslate()) {
    toast("Traduction EN en cours\u2026");
    try {
      const cfg = getAiCfg();
      const N = screensData.length;
      const results = await Promise.all([
        _translateText(cfg, taskName),
        _translateHtml(cfg, definitionHtml),
        ...screensData.map(sc => _translateText(cfg, sc.title)),
        ...screensData.map(sc => _translateHtml(cfg, sc.explication)),
        ...screensData.map(sc => _translateHtml(cfg, sc.html)),
      ]);

      titleEn          = results[0] || taskName;
      definitionHtmlEn = results[1] || definitionHtml;
      const titleScEn  = results.slice(2,         2 + N);
      const expEn      = results.slice(2 + N,     2 + 2 * N);
      const htmlEn     = results.slice(2 + 2 * N, 2 + 3 * N);

      screensDataEn = screensData.map((sc, i) => ({
        title:       titleScEn[i] || sc.title,
        explication: expEn[i]     || sc.explication,
        html:        htmlEn[i]    || sc.html,
      }));
      hasEn = true;
    } catch (e) {
      console.warn("Traduction échouée, export FR uniquement.", e);
      hasEn = false;
    }
  }

  // 5. Sérialiser — échapper </ pour éviter que le parser HTML
  //    ne ferme prématurément le <script> sur un </script> dans les données
  const escJ = (obj) => JSON.stringify(obj).replace(/<\//g, "<\\/");
  const escS = (s)   => JSON.stringify(s || "").replace(/<\//g, "<\\/");

  const screensDataJson   = escJ(screensData);
  const screensDataEnJson = escJ(screensDataEn);

  // 6. HTML final : iframes srcdoc isolées + même protocole po:navigate/po:activate
  //    que le prototype + toggle FR/EN si traduction disponible
  const langToggleHtml = hasEn
    ? `<div class="lang-toggle">
    <button id="btnLangFr" class="lang-btn active" onclick="setLang('fr')">FR</button>
    <span class="lang-sep">|</span>
    <button id="btnLangEn" class="lang-btn" onclick="setLang('en')">EN</button>
  </div>`
    : "";

  const finalHtml = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${taskName}</title>
<style>
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f4f6fa; }
.mock-shell { max-width: 1200px; margin: 0 auto; padding: 16px; }
details.mock-definition { background: #fff; border: 1px solid #dde3ee; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 0.95rem; }
details.mock-definition summary { cursor: pointer; font-weight: 600; }
.mock-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.mock-nav button { padding: 6px 18px; border-radius: 6px; border: 1px solid #b0bcd4; background: #fff; cursor: pointer; font-size: 0.95rem; }
.mock-nav button:hover:not(:disabled) { background: #e8edf8; }
.mock-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
.screen-indicator { font-size: 0.9rem; color: #555; }
.mock-screen-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 8px; color: #1a2a4a; }
details.mock-explication { background: #f0f4ff; border-left: 4px solid #6a8fd8; border-radius: 0 6px 6px 0; padding: 12px 16px; margin-bottom: 12px; font-size: 0.9rem; }
details.mock-explication summary { cursor: pointer; font-weight: 600; color: #3a5a9a; margin-bottom: 0; }
details.mock-explication[hidden] { display: none; }
iframe.screen-frame { width: 100%; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; display: none; min-height: 500px; }
iframe.screen-frame.active { display: block; }
.lang-toggle { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.lang-btn { padding: 4px 12px; border-radius: 4px; border: 1px solid #b0bcd4; background: #fff; cursor: pointer; font-size: 0.85rem; font-weight: 500; }
.lang-btn.active { background: #2a4a8a; color: #fff; border-color: #2a4a8a; }
.lang-sep { color: #aaa; font-size: 0.85rem; }
</style>
</head>
<body>
<div class="mock-shell">
  <h1 id="mock-title" style="margin:0 0 12px;font-size:1.4rem;">${taskName}</h1>
  <details class="mock-definition">
    <summary id="mock-definition-summary">D\u00e9finition de la t\u00e2che</summary>
    <div id="mock-definition-content" style="margin-top:8px;">${definitionHtml}</div>
  </details>
  <div class="mock-nav">
    <button id="btnPrev" onclick="navigate(-1)">\u25c4\u00a0Pr\u00e9c\u00e9dent</button>
    <span class="screen-indicator" id="screenIndicator"></span>
    <button id="btnNext" onclick="navigate(+1)">Suivant\u00a0\u25ba</button>
    ${langToggleHtml}
  </div>
  <div id="mock-screen-title" class="mock-screen-title"></div>
  <details id="mock-explication" class="mock-explication">
    <summary id="mock-explication-summary">Zone explicative</summary>
    <div id="mock-explication-content" style="margin-top:8px;"></div>
  </details>
  <div id="screens-container"></div>
</div>
<script>
var titleFr = ${escS(taskName)};
var titleEn = ${escS(titleEn)};
var definitionFr = ${escS(definitionHtml)};
var definitionEn = ${escS(definitionHtmlEn)};
var screensData   = ${screensDataJson};
var screensDataEn = ${screensDataEnJson};
var CSS_CONTENT   = ${escS(css)};
var hasEn = ${hasEn};
var currentLang = 'fr';
var currentIndex = 0;
var framesFr = [];
var framesEn = [];
var container      = document.getElementById('screens-container');
var titleEl        = document.getElementById('mock-screen-title');
var mockTitle      = document.getElementById('mock-title');
var mockDefContent = document.getElementById('mock-definition-content');
var mockDefSummary = document.getElementById('mock-definition-summary');
var expEl          = document.getElementById('mock-explication');
var expSummary     = document.getElementById('mock-explication-summary');
var expContent     = document.getElementById('mock-explication-content');
var indicator      = document.getElementById('screenIndicator');

function makeFrame(html) {
  var iframe = document.createElement('iframe');
  iframe.className = 'screen-frame';
  iframe.scrolling = 'no';
  container.appendChild(iframe);
  var styleTag = '<style>' + CSS_CONTENT + '</style>';
  var srcdoc = html.indexOf('vikta-task.css') !== -1
    ? html.replace(/<link[^>]+vikta-task[^>]*>/i, styleTag)
    : html.indexOf('</head>') !== -1
      ? html.replace('</head>', styleTag + '</head>')
      : html;
  iframe.srcdoc = srcdoc;
  iframe.addEventListener('load', function() {
    try {
      var h = iframe.contentDocument.body.scrollHeight;
      iframe.style.height = Math.max(500, h + 32) + 'px';
    } catch(e) {}
  });
  return iframe;
}

screensData.forEach(function(sc, i) {
  framesFr.push(makeFrame(sc.html));
  if (hasEn) framesEn.push(makeFrame(screensDataEn[i].html));
});

function currentFrames() { return (currentLang === 'en' && hasEn) ? framesEn : framesFr; }
function currentData()   { return (currentLang === 'en' && hasEn) ? screensDataEn : screensData; }

function showScreen(i) {
  if (i < 0 || i >= framesFr.length) return;
  var allFrames = hasEn ? framesFr.concat(framesEn) : framesFr;
  allFrames.forEach(function(f) { f.classList.remove('active'); });
  var frames = currentFrames();
  frames[i].classList.add('active');
  currentIndex = i;
  var data = currentData()[i];
  var prefix = (currentLang === 'en' && hasEn) ? 'Screen' : '\u00c9cran';
  titleEl.textContent = prefix + ' ' + (i + 1) + ' \u2014 ' + data.title;
  var expHtml = data.explication || '';
  expContent.innerHTML = expHtml;
  expEl.hidden = !expHtml.trim();
  expSummary.textContent = (currentLang === 'en' && hasEn) ? 'Explanation' : 'Zone explicative';
  indicator.textContent = (i + 1) + ' / ' + framesFr.length;
  document.getElementById('btnPrev').disabled = (i === 0);
  document.getElementById('btnNext').disabled = (i === framesFr.length - 1);
  if (frames[i].contentWindow) {
    frames[i].contentWindow.postMessage({ type: 'po:activate', index: i + 1 }, '*');
  }
  // Re-mesurer la hauteur : l'iframe était hidden au chargement, layout non calculé
  setTimeout(function() {
    try {
      var h = frames[i].contentDocument.body.scrollHeight;
      if (h > 0) frames[i].style.height = (h + 32) + 'px';
    } catch(e) {}
  }, 300);
}

function setLang(lang) {
  if (!hasEn && lang === 'en') return;
  currentLang = lang;
  var btnFr = document.getElementById('btnLangFr');
  var btnEn = document.getElementById('btnLangEn');
  if (btnFr) btnFr.classList.toggle('active', lang === 'fr');
  if (btnEn) btnEn.classList.toggle('active', lang === 'en');
  mockTitle.textContent = (lang === 'en') ? titleEn : titleFr;
  mockDefContent.innerHTML = (lang === 'en') ? definitionEn : definitionFr;
  mockDefSummary.textContent = (lang === 'en') ? 'Task definition' : 'D\u00e9finition de la t\u00e2che';
  showScreen(currentIndex);
}

function navigate(delta) { showScreen(currentIndex + delta); }

window.addEventListener('message', function(e) {
  var fi = framesFr.findIndex(function(f) { return f.contentWindow === e.source; });
  if (fi === -1 && hasEn) fi = framesEn.findIndex(function(f) { return f.contentWindow === e.source; });
  if (fi === -1) return;
  var data = e.data || {};
  if (data.type !== 'po:navigate') return;
  if (data.action === 'next')      showScreen(fi + 1);
  else if (data.action === 'prev') showScreen(fi - 1);
  else if (data.action === 'goto' && isFinite(data.index)) showScreen(data.index - 1);
});

showScreen(0);
</script>
</body>
</html>`;

  // 7. Enregistrer via le flux ouvert au début (avant les await longs)
  try {
    await writableStream.write(new Blob([finalHtml], { type: "text/html;charset=utf-8" }));
    await writableStream.close();
  } catch (e) {
    console.error("Erreur save mockup:", e);
    await writableStream.abort().catch(() => {});
    alert("Impossible d'enregistrer la maquette dans le dossier de travail.\n" + (e?.message || String(e)));
    return;
  }

  toast(hasEn ? "Maquette bilingue export\u00e9e." : "Maquette autonome export\u00e9e.");
}

document
  .getElementById("exportMockup")
  .addEventListener("click", exportMockupAutonome);
