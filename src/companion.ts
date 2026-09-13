import { readStore, writeStore } from "./persist";
import type { DayPoint } from "./stats";

const IDLE_MS = 70_000;
const DROP_EVERY = 80;
const HISTORY_DAYS = 120;
const MOD_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock", "Fn"]);
const LEFT_LETTERS = new Set("qwertasdfgzxcvb".split(""));

function pawSideFromEvent(e: KeyboardEvent): "left" | "right" {
  const code = e.code || "";
  if (code.startsWith("Key")) {
    return LEFT_LETTERS.has(code.slice(3).toLowerCase()) ? "left" : "right";
  }
  if (code.startsWith("Digit")) {
    const n = code.slice(5);
    return "12345".includes(n) ? "left" : "right";
  }
  if (
    code === "Tab" ||
    code === "CapsLock" ||
    code === "ShiftLeft" ||
    code === "ControlLeft" ||
    code === "AltLeft" ||
    code === "MetaLeft" ||
    code === "Backquote" ||
    code === "Escape" ||
    code === "ArrowLeft" ||
    code === "ArrowUp"
  ) {
    return "left";
  }
  return "right";
}

export type Lamp = {
  day: string;
  todayChars: number;
  todayMs: number;
  totalChars: number;
  lastWriteDay: string;
  streak: number;
  history: Record<string, number>;
};

type Mood = "idle" | "write" | "nap" | "cheer";
type LineBank = Record<Mood, string[]>;

const FALLBACK: LineBank = {
  idle: ["坐下来也算。", "灯还亮着。", "先写一行就好。", "我在这儿。"],
  write: ["……", "在写。", "嗯。"],
  nap: ["我眯一会儿。", "灯还亮着。"],
  cheer: ["今天又亮了一点。", "记下了。", "好。"],
};

const SECTION: Record<string, Mood> = {
  idle: "idle",
  write: "write",
  nap: "nap",
  cheer: "cheer",
  闲着: "idle",
  在写: "write",
  打盹: "nap",
  高兴: "cheer",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayStr(d);
}

function pruneHistory(history: Record<string, number>) {
  const keys = Object.keys(history).sort();
  while (keys.length > HISTORY_DAYS) {
    const gone = keys.shift();
    if (gone) delete history[gone];
  }
  return history;
}

function stampHistory(lamp: Lamp) {
  const history = { ...(lamp.history ?? {}) };
  if (lamp.day) history[lamp.day] = lamp.todayChars;
  lamp.history = pruneHistory(history);
}

function parseLines(raw: string): LineBank {
  const out: LineBank = { idle: [], write: [], nap: [], cheer: [] };
  let cur: Mood | null = null;
  for (const line of raw.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) continue;
    const m = t.match(/^\[(.+)\]$/);
    if (m) {
      cur = SECTION[m[1].trim()] ?? null;
      continue;
    }
    if (cur) out[cur].push(t);
  }
  for (const key of Object.keys(FALLBACK) as Mood[]) {
    if (!out[key].length) out[key] = FALLBACK[key];
  }
  return out;
}

function emptyLamp(): Lamp {
  return {
    day: todayStr(),
    todayChars: 0,
    todayMs: 0,
    totalChars: 0,
    lastWriteDay: "",
    streak: 0,
    history: {},
  };
}

function rollDay(lamp: Lamp): Lamp {
  const today = todayStr();
  if (lamp.day === today) return lamp;
  stampHistory(lamp);
  const keep =
    lamp.lastWriteDay === today || lamp.lastWriteDay === yesterdayStr() ? lamp.streak : 0;
  return { ...lamp, day: today, todayChars: 0, todayMs: 0, streak: keep };
}

async function loadLamp(): Promise<Lamp> {
  try {
    const raw = await readStore("lamp.json");
    if (!raw) return emptyLamp();
    const data = JSON.parse(raw) as Lamp;
    data.history = data.history ?? {};
    if (data.day) {
      data.history[data.day] = Math.max(data.history[data.day] ?? 0, data.todayChars ?? 0);
    }
    return rollDay(data);
  } catch {
    return emptyLamp();
  }
}

function saveLamp(lamp: Lamp) {
  stampHistory(lamp);
  void writeStore("lamp.json", JSON.stringify(lamp));
}

export function formatClock(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export async function createLamp() {
  let lamp = await loadLamp();
  let lines = FALLBACK;
  let mood: Mood = "idle";
  let lastInput = 0;
  let sessionMs = 0;
  let bubbleAt = 0;
  let cheerUntil = 0;
  let pawSide = 0;
  let pawTimer = 0;
  let lastBongo = 0;
  let clickTimer = 0;

  const pet = document.querySelector("#pet") as HTMLElement;
  const bubble = document.querySelector("#petBubble") as HTMLElement;
  const todayEl = document.querySelector("#todayChars") as HTMLElement;
  const todayBar = document.querySelector("#todayCharsBar") as HTMLElement | null;
  const sessionEl = document.querySelector("#sessionClock") as HTMLElement;
  const dropEl = document.querySelector("#drops") as HTMLElement;
  const streakEl = document.querySelector("#streak") as HTMLElement;
  const typeClock = document.querySelector("#typeClock") as HTMLElement | null;

  function drops() {
    return Math.floor(lamp.totalChars / DROP_EVERY);
  }

  function shine() {
    const t = Math.min(1, Math.log2(drops() + 1) / 10);
    return mood === "nap" ? t * 0.22 : t;
  }

  function series(days = 21): DayPoint[] {
    const hist = { ...(lamp.history ?? {}) };
    hist[todayStr()] = lamp.todayChars;
    const out: DayPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = todayStr(d);
      out.push({ day: key, chars: hist[key] ?? 0 });
    }
    return out;
  }

  function syncPetWindow() {
    window.inkdesk?.sendLampState?.({ mood, shine: shine() });
  }

  function tapPaws(hit?: "left" | "right") {
    if (!pet) return;
    const side = hit ?? (pawSide ? "left" : "right");
    pawSide = side === "left" ? 1 : 0;
    pet.classList.remove("hit-left", "hit-right");
    pet.classList.add(side === "left" ? "hit-left" : "hit-right");
    window.clearTimeout(pawTimer);
    pawTimer = window.setTimeout(() => {
      pet.classList.remove("hit-left", "hit-right");
    }, 140);
    const now = Date.now();
    if (now - lastBongo > 50) {
      lastBongo = now;
      window.inkdesk?.bongo?.(side);
    }
  }

  function noteKey(e: KeyboardEvent) {
    if (MOD_KEYS.has(e.key)) return;
    lastInput = Date.now();
    tapPaws(pawSideFromEvent(e));
    if (Date.now() > cheerUntil) setMood("write");
  }

  async function refreshLines() {
    const raw = await readStore("台词.txt");
    if (raw) lines = parseLines(raw);
  }

  async function say(kind: Mood, force = false) {
    const now = Date.now();
    if (!force && now - bubbleAt < 4000 && kind !== "cheer") return;
    bubbleAt = now;
    await refreshLines();
    const pool = lines[kind];
    bubble.textContent = pool[Math.floor(Math.random() * pool.length)];
  }

  function paint() {
    todayEl.textContent = String(lamp.todayChars);
    if (todayBar) todayBar.textContent = String(lamp.todayChars);
    sessionEl.textContent = formatClock(sessionMs);
    dropEl.textContent = String(drops());
    streakEl.textContent = String(lamp.streak);
    if (typeClock) typeClock.textContent = formatClock(sessionMs || lamp.todayMs);
    pet.dataset.mood = mood;
    pet.style.setProperty("--shine", shine().toFixed(3));
    syncPetWindow();
  }

  function setMood(next: Mood) {
    if (next === mood && next !== "cheer") return;
    mood = next;
    pet.dataset.mood = mood;
    void say(next, next === "cheer");
    paint();
  }

  function noteWriting(added: number) {
    if (added <= 0) return;
    const prevDrops = drops();
    const today = todayStr();
    lamp = rollDay(lamp);
    if (lamp.lastWriteDay !== today) {
      lamp.streak = lamp.lastWriteDay === yesterdayStr() ? lamp.streak + 1 : 1;
      lamp.lastWriteDay = today;
    }
    lamp.todayChars += added;
    lamp.totalChars += added;
    lastInput = Date.now();
    saveLamp(lamp);
    if (drops() > prevDrops) {
      cheerUntil = Date.now() + 2400;
      setMood("cheer");
    } else {
      setMood("write");
    }
    paint();
  }

  const api = { noteWriting, noteKey, tapPaws, series, lamp: () => lamp };

  if (!pet || !bubble || !todayEl || !sessionEl || !dropEl || !streakEl) {
    return { ...api, noteWriting() {}, noteKey() {} };
  }

  pet.addEventListener("click", () => {
    window.clearTimeout(clickTimer);
    clickTimer = window.setTimeout(() => {
      if (mood === "nap") setMood("idle");
      else void say(mood, true);
    }, 280);
  });

  pet.addEventListener("dblclick", (e) => {
    e.preventDefault();
    window.clearTimeout(clickTimer);
    if (window.inkdesk?.togglePet) void window.inkdesk.togglePet();
    else bubble.textContent = "桌面版才能放到桌面上。";
  });

  window.inkdesk?.onPetMode?.((mode) => {
    document.body.classList.toggle("pet-away", mode === "undocked");
  });

  window.setInterval(() => {
    const now = Date.now();
    lamp = rollDay(lamp);
    if (lastInput && now - lastInput < IDLE_MS) {
      sessionMs += 1000;
      lamp.todayMs += 1000;
      if (now % 10_000 < 1200) saveLamp(lamp);
      if (now > cheerUntil && mood !== "write") setMood("write");
    } else if (lastInput && now - lastInput >= IDLE_MS) {
      if (now > cheerUntil) setMood("nap");
    }
    paint();
  }, 1000);

  await refreshLines();
  saveLamp(lamp);
  void say("idle", true);
  paint();
  return api;
}
