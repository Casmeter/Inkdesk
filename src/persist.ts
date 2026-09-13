declare global {
  interface Window {
    inkdesk?: {
      readData: (file: string) => Promise<string | null>;
      writeData: (file: string, content: string) => Promise<void>;
      dataDir: () => Promise<string>;
      openDataDir: () => Promise<void>;
      togglePet?: () => Promise<"docked" | "undocked">;
      bongo?: (side?: "left" | "right") => void;
      sendLampState?: (state: { mood: string; shine: number }) => void;
      onBongo?: (cb: (side?: "left" | "right") => void) => void;
      onLampState?: (cb: (state: { mood: string; shine: number }) => void) => void;
      onPetMode?: (cb: (mode: "docked" | "undocked") => void) => void;
      petDragStart?: (screenX: number, screenY: number) => void;
      petDragMove?: (screenX: number, screenY: number) => void;
      petDragEnd?: () => void;
      setPetIgnoreMouse?: (ignore: boolean) => void;
    };
  }
}

export {};

const LS: Record<string, string> = {
  "project.json": "inkdesk-v1",
  "lamp.json": "inkdesk-lamp-v1",
  "台词.txt": "inkdesk-lines-v1",
  "cards.json": "inkdesk-cards-v1",
};

export async function readStore(
  file: "project.json" | "lamp.json" | "台词.txt" | "cards.json",
): Promise<string | null> {
  const lsKey = LS[file];
  if (window.inkdesk) {
    const fromFile = await window.inkdesk.readData(file);
    if (fromFile != null && fromFile !== "") return fromFile;
    const fromLs = localStorage.getItem(lsKey);
    if (fromLs) {
      await window.inkdesk.writeData(file, fromLs);
      return fromLs;
    }
    return null;
  }
  return localStorage.getItem(lsKey);
}

export async function writeStore(file: "project.json" | "lamp.json" | "cards.json", content: string) {
  if (window.inkdesk) {
    await window.inkdesk.writeData(file, content);
    return;
  }
  localStorage.setItem(LS[file], content);
}
