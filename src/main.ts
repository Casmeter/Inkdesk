import "./styles.css";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import {
  addNode,
  childrenOf,
  countChars,
  getNode,
  loadProject,
  removeNode,
  saveProject,
  type Project,
} from "./store";
import { dialogueLanguage, engineHighlight } from "./highlight";
import { dialogueJumps } from "./jumps";
import {
  addCard,
  formatCardTime,
  getCards,
  loadCards,
  moveCard,
  removeCard,
  setPinned,
  updateCard,
  type NoteCard,
} from "./cards";
import { exportLongImages } from "./export-image";
import { createLamp } from "./companion";
import { drawStatsChart } from "./stats";

const langConf = new Compartment();
const lookConf = new Compartment();
const jumpConf = new Compartment();

let project!: Project;
let view: EditorView | null = null;
let editingId: string | null = null;
let saveTimer = 0;
let renaming: string | null = null;
let renameTimer = 0;
let canWrite = true;
let lamp!: Awaited<ReturnType<typeof createLamp>>;
let statsTimer = 0;
type AppView = "files" | "stats" | "cards";
let appView: AppView = "files";
let restoringCaret = false;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

function toast(text: string) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 1800);
}

function jumpExt() {
  return project.settings.markdown
    ? []
    : dialogueJumps({
        enabled: () => !project.settings.markdown,
        project: () => project,
        currentId: () => project.activeId,
        open: openAt,
        toast,
      });
}

function openAt(id: string, pos: number) {
  persistDoc();
  if (project.activeId !== id) {
    project.activeId = id;
    saveProject(project);
    renderTree();
    mountEditor({ restore: false });
  }
  restoringCaret = false;
  requestAnimationFrame(() => {
    if (!view) return;
    const safe = Math.max(0, Math.min(pos, view.state.doc.length));
    view.dispatch({
      selection: { anchor: safe },
      effects: EditorView.scrollIntoView(safe, { y: "center" }),
    });
    view.focus();
  });
}

function lookTheme() {
  const { fontSize, align } = project.settings;
  return EditorView.theme({
    ".cm-content": { fontSize: `${fontSize}px` },
    ".cm-line": { textAlign: align },
    ".cm-selectionBackground": { backgroundColor: "#163a6d7a" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
      backgroundColor: "#163a6d7a",
    },
  });
}

function langExt() {
  return project.settings.markdown ? markdown() : dialogueLanguage;
}

function currentFile() {
  return getNode(project, project.activeId);
}

function persistDoc() {
  if (!canWrite) return;
  stashCaret();
  const file = getNode(project, editingId);
  if (!file || file.kind !== "file" || !view) return;
  file.content = view.state.doc.toString();
  file.updatedAt = Date.now();
  saveProject(project);
  $("#saveState").textContent = "已存到软件目录 /data";
}

function stashCaret() {
  if (restoringCaret || !view || !editingId) return;
  if (!project.carets) project.carets = {};
  project.carets[editingId] = {
    cursor: view.state.selection.main.head,
    scroll: view.scrollDOM.scrollTop,
  };
}

function restoreCaret() {
  if (!view || !editingId) return;
  const saved = project.carets?.[editingId];
  if (!saved) return;
  const cursor = Math.max(0, Math.min(saved.cursor ?? 0, view.state.doc.length));
  const scroll = saved.scroll ?? 0;
  restoringCaret = true;
  view.dispatch({ selection: { anchor: cursor } });
  const apply = () => {
    if (!view) return;
    view.scrollDOM.scrollTop = scroll;
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(() => {
      apply();
      restoringCaret = false;
    });
  });
}

function scheduleSave() {
  $("#saveState").textContent = "正在写下…";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persistDoc, 360);
}

function updateCounts() {
  const text = view?.state.doc.toString() ?? "";
  $("#charCount").textContent = String(countChars(text));
  $("#lineCount").textContent = String(text ? text.split("\n").length : 0);
  $("#empty").style.display = text.trim() ? "none" : "grid";
}

function refreshMarkdownUi() {
  const on = project.settings.markdown;
  $("#mdToggle").classList.toggle("on", on);
  document.querySelectorAll<HTMLButtonElement>("[data-md]").forEach((btn) => {
    btn.disabled = !on;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-align]").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.align === project.settings.align);
  });
  $("#sizeLabel").textContent = String(project.settings.fontSize);
}

function mountEditor(opts?: { restore?: boolean }) {
  const file = currentFile();
  const parent = $("#stage");
  if (view) {
    persistDoc();
    view.destroy();
    view = null;
  }
  if (!file || file.kind !== "file") {
    updateCounts();
    return;
  }
  editingId = file.id;
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc: file.content,
      extensions: [
        basicSetup,
        indentUnit.of("\t"),
        EditorState.tabSize.of(4),
        keymap.of([indentWithTab]),
        engineHighlight,
        drawSelection(),
        langConf.of(langExt()),
        lookConf.of(lookTheme()),
        jumpConf.of(jumpExt()),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
        }),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          keydown(event) {
            lamp.noteKey(event);
            return false;
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            scheduleSave();
            updateCounts();
            let added = 0;
            u.changes.iterChanges((_a, _b, _c, _d, inserted) => {
              added += countChars(inserted.toString());
            });
            lamp.noteWriting(added);
          }
          if (u.selectionSet) stashCaret();
        }),
      ],
    }),
  });
  refreshMarkdownUi();
  updateCounts();
  $("#saveState").textContent = canWrite ? "已存到软件目录 /data" : "读取失败，未写入";
  view.focus();
  if (opts?.restore !== false) restoreCaret();
  view.scrollDOM.addEventListener("scroll", stashCaret, { passive: true });
}

function renderTree() {
  const root = $("#tree");
  root.replaceChildren();

  const walk = (parentId: string | null, depth: number) => {
    for (const node of childrenOf(project, parentId)) {
      const row = document.createElement("div");
      row.className = "tree-item" + (node.id === project.activeId ? " active" : "");
      row.dataset.id = node.id;
      row.style.paddingLeft = `${8 + depth * 16}px`;
      row.title = "点选后按 F2 改名";

      const ico = document.createElement("span");
      ico.className = "ico";
      ico.innerHTML =
        node.kind === "folder"
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h6l2 2h10v10H3z"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 4h7l5 5v11H7z"/><path d="M14 4v5h5"/></svg>`;

      const label = document.createElement("span");
      label.className = "grow";
      label.textContent = node.name;

      const ops = document.createElement("span");
      ops.className = "ops";
      const ren = document.createElement("button");
      ren.className = "ren";
      ren.type = "button";
      ren.title = "改名";
      ren.textContent = "改";
      const del = document.createElement("button");
      del.className = "del";
      del.type = "button";
      del.title = "删除";
      del.textContent = "×";
      ops.append(ren, del);

      ren.addEventListener("click", (e) => {
        e.stopPropagation();
        startRename(row, node.id);
      });
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`删除「${node.name}」？`)) return;
        persistDoc();
        removeNode(project, node.id);
        renderTree();
        mountEditor();
      });

      row.append(ico, label, ops);
      row.addEventListener("click", (e) => {
        if (renaming) return;
        const onName = (e.target as HTMLElement).closest(".grow");
        if (project.activeId === node.id && onName) {
          window.clearTimeout(renameTimer);
          renameTimer = window.setTimeout(() => startRename(row, node.id), 380);
          return;
        }
        selectNode(node);
      });
      row.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.clearTimeout(renameTimer);
        startRename(row, node.id);
      });
      root.append(row);
      if (node.kind === "folder") walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
}

function selectNode(node: ReturnType<typeof getNode>) {
  if (!node) return;
  persistDoc();
  const prev = project.activeId;
  project.activeId = node.id;
  saveProject(project);
  document.querySelectorAll<HTMLElement>(".tree-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === node.id);
  });
  if (node.kind === "file" && prev !== node.id) mountEditor();
}

function rowById(id: string) {
  return document.querySelector<HTMLElement>(`.tree-item[data-id="${id}"]`);
}

function startRename(row: HTMLElement, id: string) {
  const node = getNode(project, id);
  if (!node) return;
  if (renaming === id && row.querySelector("input")) return;
  if (renaming && renaming !== id) renderTree();
  const fresh = rowById(id) ?? row;
  const grow = fresh.querySelector(".grow");
  if (!grow) return;
  renaming = id;
  const input = document.createElement("input");
  input.value = node.name;
  input.spellcheck = false;
  grow.replaceWith(input);
  input.focus();
  input.select();
  let finished = false;
  const done = (commit: boolean) => {
    if (finished) return;
    finished = true;
    if (commit) {
      const next = input.value.trim();
      if (next) node.name = next;
      node.updatedAt = Date.now();
      saveProject(project);
    }
    renaming = null;
    renderTree();
  };
  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("dblclick", (e) => e.stopPropagation());
  input.addEventListener("blur", () => done(true));
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") {
      ev.preventDefault();
      input.blur();
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      done(false);
    }
  });
}

function parentForNew() {
  const cur = currentFile();
  if (!cur) return null;
  return cur.kind === "folder" ? cur.id : cur.parentId;
}

function wrapSel(before: string, after = before) {
  if (!view || !project.settings.markdown) return;
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to);
  view.dispatch(view.state.replaceSelection(`${before}${text}${after}`));
  view.focus();
}

function prefixLines(prefix: string) {
  if (!view || !project.settings.markdown) return;
  const sel = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(sel.from);
  const toLine = view.state.doc.lineAt(sel.to);
  const changes = [];
  for (let n = fromLine.number; n <= toLine.number; n++) {
    const line = view.state.doc.line(n);
    const stripped = line.text.replace(/^#{1,6}\s+|^>\s+|^[-*]\s+|^\d+\.\s+/, "");
    changes.push({
      from: line.from,
      to: line.to,
      insert: prefix === "" ? stripped : prefix + stripped,
    });
  }
  view.dispatch({ changes });
  view.focus();
}

function applyLang() {
  if (!view) return;
  view.dispatch({
    effects: [langConf.reconfigure(langExt()), jumpConf.reconfigure(jumpExt())],
  });
}

function applyLook() {
  if (!view) return;
  view.dispatch({ effects: lookConf.reconfigure(lookTheme()) });
  refreshMarkdownUi();
  saveProject(project);
}

function setRailActive(act: string) {
  document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.act === act);
  });
}

function paintStats() {
  const canvas = document.querySelector("#statsChart") as HTMLCanvasElement | null;
  if (!canvas || !lamp.series) return;
  const series = lamp.series(21);
  drawStatsChart(canvas, series);
  const today = series[series.length - 1]?.chars ?? 0;
  const total = series.reduce((n, p) => n + p.chars, 0);
  const peak = series.reduce((n, p) => Math.max(n, p.chars), 0);
  $("#statsToday").textContent = String(today);
  $("#statsRange").textContent = String(total);
  $("#statsAvg").textContent = String(Math.round(total / series.length));
  $("#statsPeak").textContent = String(peak);
}

const PIN_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.2V8.6"/><path d="M5 2.8h6l-.7 4.2c-1.6 1.1-4 1.1-5.6 0L5 2.8z"/><path d="M4.8 2.8h6.4"/></svg>';

function pinDefaultPos() {
  const n = getCards().filter((c) => c.pinned).length;
  return {
    x: Math.max(16, window.innerWidth - 292),
    y: 72 + n * 36,
  };
}

function togglePin(id: string) {
  const card = getCards().find((c) => c.id === id);
  if (!card) return;
  if (card.pinned) setPinned(id, false);
  else setPinned(id, true, card.x != null && card.y != null ? { x: card.x, y: card.y } : pinDefaultPos());
  paintCards();
  paintPins();
}

function bindCardDrag(slip: HTMLElement, id: string) {
  const handle = slip.querySelector(".card-meta") as HTMLElement | null;
  if (!handle) return;
  handle.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = slip.offsetLeft;
    const origY = slip.offsetTop;
    slip.classList.add("dragging");
    const onMove = (ev: MouseEvent) => {
      const maxX = window.innerWidth - slip.offsetWidth - 8;
      const maxY = window.innerHeight - 40;
      const x = Math.max(8, Math.min(maxX, origX + ev.clientX - startX));
      const y = Math.max(8, Math.min(maxY, origY + ev.clientY - startY));
      slip.style.left = `${x}px`;
      slip.style.top = `${y}px`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      slip.classList.remove("dragging");
      moveCard(id, parseFloat(slip.style.left), parseFloat(slip.style.top));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function cardButtons(card: NoteCard) {
  const wrap = document.createElement("span");
  wrap.className = "card-actions";
  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = "card-pin" + (card.pinned ? " on" : "");
  pin.title = card.pinned ? "收回盒子" : "钉在稿纸上";
  pin.innerHTML = PIN_SVG;
  pin.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePin(card.id);
  });
  const del = document.createElement("button");
  del.type = "button";
  del.className = "card-del";
  del.title = "丢掉";
  del.textContent = "×";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    removeCard(card.id);
    paintCards();
    paintPins();
  });
  wrap.append(pin, del);
  return wrap;
}

function paintCards() {
  const stack = $("#cardStack");
  const list = getCards();
  stack.replaceChildren();
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "cards-empty";
    empty.textContent = "盒是空的。先丢一张进去。";
    stack.append(empty);
    return;
  }
  for (const card of list) {
    const slip = document.createElement("article");
    slip.className = "card-slip" + (card.pinned ? " in-box-pinned" : "");
    const meta = document.createElement("div");
    meta.className = "card-meta";
    const time = document.createElement("span");
    time.textContent = card.pinned ? "钉在稿纸上" : formatCardTime(card.at);
    meta.append(time, cardButtons(card));
    if (card.pinned) {
      const preview = document.createElement("p");
      preview.className = "card-preview";
      preview.textContent = card.text;
      slip.append(meta, preview);
    } else {
      const area = document.createElement("textarea");
      area.value = card.text;
      area.rows = Math.min(8, Math.max(2, card.text.split("\n").length));
      area.addEventListener("input", () => {
        updateCard(card.id, area.value);
        area.rows = Math.min(8, Math.max(2, area.value.split("\n").length));
      });
      slip.append(meta, area);
    }
    stack.append(slip);
  }
}

function paintPins() {
  const board = $("#pinBoard");
  board.replaceChildren();
  for (const card of getCards().filter((c) => c.pinned)) {
    const slip = document.createElement("article");
    slip.className = "card-slip floating";
    slip.style.left = `${card.x ?? pinDefaultPos().x}px`;
    slip.style.top = `${card.y ?? pinDefaultPos().y}px`;
    const meta = document.createElement("div");
    meta.className = "card-meta";
    const time = document.createElement("span");
    time.textContent = "拖这里挪位置";
    meta.append(time, cardButtons(card));
    const area = document.createElement("textarea");
    area.value = card.text;
    area.rows = Math.min(10, Math.max(3, card.text.split("\n").length));
    area.addEventListener("input", () => {
      updateCard(card.id, area.value);
      area.rows = Math.min(10, Math.max(3, area.value.split("\n").length));
    });
    slip.append(meta, area);
    bindCardDrag(slip, card.id);
    board.append(slip);
  }
}

function setView(name: AppView) {
  appView = name;
  document.body.classList.remove("typewriter");
  document.body.classList.toggle("view-stats", name === "stats");
  document.body.classList.toggle("view-cards", name === "cards");
  setRailActive(name === "files" ? "files" : name);
  window.clearInterval(statsTimer);
  if (name === "stats") {
    paintStats();
    statsTimer = window.setInterval(paintStats, 2000);
    requestAnimationFrame(paintStats);
  } else if (name === "cards") {
    paintCards();
    $("#cardDraft").focus();
  } else {
    view?.focus();
  }
}

function setTypewriter(on: boolean) {
  if (on) {
    appView = "files";
    document.body.classList.remove("view-stats", "view-cards");
    window.clearInterval(statsTimer);
  }
  document.body.classList.toggle("typewriter", on);
  if (on) setRailActive("typewriter");
  else if (appView === "stats") setRailActive("stats");
  else if (appView === "cards") setRailActive("cards");
  else setRailActive("files");
  view?.focus();
  if (on && view) {
    requestAnimationFrame(() => {
      if (!view) return;
      view.requestMeasure();
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }),
      });
    });
  }
}

function bind() {
  const nameInput = $<HTMLInputElement>("#projectName");
  nameInput.value = project.name;
  nameInput.addEventListener("input", () => {
    project.name = nameInput.value || "我的剧本";
    saveProject(project);
  });

  $("#newFile").addEventListener("click", () => {
    persistDoc();
    const node = addNode(project, "file", parentForNew());
    renderTree();
    mountEditor();
    const row = rowById(node.id);
    if (row) startRename(row, node.id);
  });
  const seedBox = $<HTMLInputElement>("#seedDialogue");
  const fileMenu = $("#newFileMenu");
  const filePop = $("#newFilePop");
  seedBox.checked = project.settings.seedDialogue !== false;
  const closeFilePop = () => {
    filePop.hidden = true;
    fileMenu.setAttribute("aria-expanded", "false");
    fileMenu.classList.remove("open");
  };
  fileMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = filePop.hidden;
    filePop.hidden = !open;
    fileMenu.setAttribute("aria-expanded", String(open));
    fileMenu.classList.toggle("open", open);
  });
  filePop.addEventListener("click", (e) => e.stopPropagation());
  seedBox.addEventListener("change", () => {
    project.settings.seedDialogue = seedBox.checked;
    saveProject(project);
  });
  document.addEventListener("click", closeFilePop);
  const draft = $<HTMLTextAreaElement>("#cardDraft");
  draft.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (!addCard(draft.value)) return;
    draft.value = "";
    paintCards();
  });
  $("#newFolder").addEventListener("click", () => {
    persistDoc();
    const node = addNode(project, "folder", parentForNew());
    renderTree();
    const row = rowById(node.id);
    if (row) startRename(row, node.id);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "files") setView("files");
      if (act === "stats") setView(appView === "stats" ? "files" : "stats");
      if (act === "cards") setView(appView === "cards" ? "files" : "cards");
      if (act === "typewriter") setTypewriter(!document.body.classList.contains("typewriter"));
      if (act === "export") {
        $<HTMLInputElement>("#linesPer").value = String(project.settings.linesPerImage);
        $("#exportModal").classList.add("show");
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "F2") {
      if (renaming) return;
      e.preventDefault();
      if (!project.activeId) return;
      const row = rowById(project.activeId);
      if (row) startRename(row, project.activeId);
      return;
    }
    if (e.key === "Escape" && document.body.classList.contains("typewriter")) setTypewriter(false);
    else if (e.key === "Escape" && (appView === "stats" || appView === "cards")) setView("files");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      persistDoc();
      toast("已保存");
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b" && project.settings.markdown) {
      e.preventDefault();
      wrapSel("**");
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i" && project.settings.markdown) {
      e.preventDefault();
      wrapSel("*");
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-md]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.md;
      if (k === "bold") wrapSel("**");
      if (k === "italic") wrapSel("*");
      if (k === "strike") wrapSel("~~");
      if (k === "p") prefixLines("");
      if (k === "h1") prefixLines("# ");
      if (k === "h2") prefixLines("## ");
      if (k === "quote") prefixLines("> ");
      if (k === "ul") prefixLines("- ");
      if (k === "ol") prefixLines("1. ");
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-align]").forEach((btn) => {
    btn.addEventListener("click", () => {
      project.settings.align = btn.dataset.align as Project["settings"]["align"];
      applyLook();
    });
  });

  $("#sizeDown").addEventListener("click", () => {
    project.settings.fontSize = Math.max(14, project.settings.fontSize - 1);
    applyLook();
  });
  $("#sizeUp").addEventListener("click", () => {
    project.settings.fontSize = Math.min(36, project.settings.fontSize + 1);
    applyLook();
  });

  $("#mdToggle").addEventListener("click", () => {
    project.settings.markdown = !project.settings.markdown;
    saveProject(project);
    applyLang();
    refreshMarkdownUi();
  });

  $("#openData")?.addEventListener("click", () => {
    void window.inkdesk?.openDataDir();
  });

  $("#copyAll").addEventListener("click", async () => {
    persistDoc();
    const file = getNode(project, editingId);
    const text = file?.kind === "file" ? file.content : view?.state.doc.toString() ?? "";
    await navigator.clipboard.writeText(text);
    toast("已复制，缩进原样保留");
  });

  $("#exportCancel").addEventListener("click", () => $("#exportModal").classList.remove("show"));
  $("#exportModal").addEventListener("click", (e) => {
    if (e.target === $("#exportModal")) $("#exportModal").classList.remove("show");
  });
  $("#exportGo").addEventListener("click", async () => {
    persistDoc();
    const file = currentFile();
    if (!file || file.kind !== "file") return;
    project.settings.linesPerImage = Math.max(4, Number($<HTMLInputElement>("#linesPer").value) || 24);
    saveProject(project);
    $("#exportModal").classList.remove("show");
    toast("正在绘稿…");
    try {
      await exportLongImages({
        text: file.content,
        title: `${project.name} · ${file.name}`,
        linesPerImage: project.settings.linesPerImage,
        fontSize: Math.max(18, project.settings.fontSize),
        align: project.settings.align,
        syntax: !project.settings.markdown,
      });
      toast("长图已保存到下载");
    } catch (err) {
      console.error(err);
      toast("导出失败");
    }
  });
}

boot();

async function boot() {
  try {
    project = await loadProject();
  } catch (err) {
    canWrite = false;
    project = {
      name: "读取失败",
      nodes: [],
      activeId: null,
      settings: {
        markdown: false,
        fontSize: 18,
        align: "left",
        linesPerImage: 24,
        seedDialogue: true,
      },
    };
    toast(err instanceof Error ? err.message : "稿件读取失败，原文件未改动");
  }
  lamp = await createLamp();
  await loadCards();
  bind();
  renderTree();
  mountEditor();
  refreshMarkdownUi();
  paintPins();
  window.addEventListener("resize", () => {
    if (appView === "stats") paintStats();
  });
  if (window.inkdesk) {
    const openBtn = document.querySelector("#openData") as HTMLButtonElement | null;
    if (openBtn) openBtn.hidden = false;
    if (canWrite) $("#saveState").textContent = "已存到软件目录 /data";
  }
}
