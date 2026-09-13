import { readStore, writeStore } from "./persist";

export type NoteCard = {
  id: string;
  text: string;
  at: number;
  pinned?: boolean;
  x?: number;
  y?: number;
};

let cards: NoteCard[] = [];
let saveTimer = 0;

export function getCards() {
  return cards;
}

export async function loadCards() {
  try {
    const raw = await readStore("cards.json");
    if (!raw) {
      cards = [];
      return;
    }
    const data = JSON.parse(raw) as { cards?: NoteCard[] } | NoteCard[];
    const list = Array.isArray(data) ? data : (data.cards ?? []);
    cards = list.filter((c) => c && typeof c.text === "string" && typeof c.id === "string");
  } catch {
    cards = [];
  }
}

function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void writeStore("cards.json", JSON.stringify({ cards }));
  }, 280);
}

export function addCard(text: string) {
  const body = text.replace(/\s+$/, "").replace(/^\s+/, "");
  if (!body) return null;
  const card: NoteCard = {
    id: crypto.randomUUID(),
    text: body,
    at: Date.now(),
  };
  cards.unshift(card);
  persist();
  return card;
}

export function updateCard(id: string, text: string) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  card.text = text;
  card.at = Date.now();
  persist();
}

export function removeCard(id: string) {
  cards = cards.filter((c) => c.id !== id);
  persist();
}

export function setPinned(id: string, pinned: boolean, pos?: { x: number; y: number }) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  card.pinned = pinned;
  if (pos) {
    card.x = pos.x;
    card.y = pos.y;
  }
  persist();
}

export function moveCard(id: string, x: number, y: number) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  card.x = x;
  card.y = y;
  persist();
}

export function formatCardTime(at: number) {
  const d = new Date(at);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (d.toDateString() === now.toDateString()) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
