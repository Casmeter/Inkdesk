const { app, BrowserWindow, Menu, shell, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");

app.setName("inkdesk");
app.setAppUserModelId("local.inkdesk.app");
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
      ],
    },
  ]),
);

const ALLOWED = new Set(["project.json", "lamp.json", "project.json.bak", "说明.txt", "台词.txt", "cards.json"]);

function resolveDataDir() {
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath("exe")), "data");
  }
  return path.join(__dirname, "..", "data");
}

let dataDir = "";
let mainWin = null;
let petWin = null;
let lastPetPos = null;
let petDrag = null;

function ensureDataDir() {
  dataDir = resolveDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const note = path.join(dataDir, "说明.txt");
  if (!fs.existsSync(note)) {
    fs.writeFileSync(
      note,
      "inkdesk 把文稿存在这个文件夹。\n\nproject.json 是你的剧本。\n灯芯进度在 lamp.json。\n台词.txt 是灯芯说的话，可直接改。\n备份时请拷贝整个 data 文件夹。\n",
      "utf8",
    );
  }
  const lines = path.join(dataDir, "台词.txt");
  if (!fs.existsSync(lines)) {
    const bundled = path.join(__dirname, "台词.default.txt");
    if (fs.existsSync(bundled)) fs.copyFileSync(bundled, lines);
  }
}

function safePath(name) {
  const base = path.basename(String(name || ""));
  if (!ALLOWED.has(base)) throw new Error("不允许的文件");
  return path.join(dataDir, base);
}

ipcMain.handle("data-dir", () => dataDir);
ipcMain.handle("open-data-dir", () => shell.openPath(dataDir));
ipcMain.handle("read-data", (_e, name) => {
  const file = safePath(name);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
});
ipcMain.handle("write-data", (_e, name, content) => {
  const file = safePath(name);
  if (name === "project.json" && fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(dataDir, "project.json.bak"));
  }
  fs.writeFileSync(file, String(content ?? ""), "utf8");
});

function setPetMode(mode) {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send("pet-mode", mode);
  }
}

function rememberPetPos() {
  if (!petWin || petWin.isDestroyed()) return;
  const [x, y] = petWin.getPosition();
  lastPetPos = { x, y };
}

function clampPetPos(x, y, w, h) {
  const keep = 56;
  const nearest = screen.getDisplayNearestPoint({
    x: Math.round(x + w / 2),
    y: Math.round(y + h / 2),
  });
  const b = nearest.bounds;
  return {
    x: Math.round(Math.min(Math.max(x, b.x - w + keep), b.x + b.width - keep)),
    y: Math.round(Math.min(Math.max(y, b.y - h + keep), b.y + b.height - keep)),
  };
}

function petFromEvent(e) {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win.isDestroyed() || win !== petWin) return null;
  return win;
}

function dockPet() {
  if (!petWin || petWin.isDestroyed()) return false;
  rememberPetPos();
  const win = petWin;
  petWin = null;
  petDrag = null;
  win.close();
  setPetMode("docked");
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  }
  return true;
}

function createPet() {
  if (petWin && !petWin.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  const width = 108;
  const height = 128;
  const fallback = {
    x: workArea.x + workArea.width - 128,
    y: workArea.y + workArea.height - 148,
  };
  const start = clampPetPos(
    lastPetPos?.x ?? fallback.x,
    lastPetPos?.y ?? fallback.y,
    width,
    height,
  );
  petWin = new BrowserWindow({
    width,
    height,
    x: start.x,
    y: start.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    movable: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  petWin.setAlwaysOnTop(true, "screen-saver");
  petWin.setIgnoreMouseEvents(true, { forward: true });
  let lastNativeDock = 0;
  const dockFromNative = () => {
    const now = Date.now();
    if (now - lastNativeDock < 400) return;
    lastNativeDock = now;
    setImmediate(() => dockPet());
  };
  try {
    petWin.hookWindowMessage(0x00a3, dockFromNative);
    petWin.hookWindowMessage(0x0203, dockFromNative);
  } catch {}
  petWin.once("ready-to-show", () => petWin.show());
  petWin.loadFile(path.join(__dirname, "..", "dist", "pet.html"));
  petWin.on("closed", () => {
    petWin = null;
    setPetMode("docked");
  });
}

ipcMain.handle("toggle-pet", () => {
  if (dockPet()) return "docked";
  createPet();
  setPetMode("undocked");
  return "undocked";
});

ipcMain.on("pet-drag-start", (e, screenX, screenY) => {
  const win = petFromEvent(e);
  if (!win) return;
  win.setIgnoreMouseEvents(false);
  const [x, y] = win.getPosition();
  petDrag = { dx: Number(screenX) - x, dy: Number(screenY) - y };
});

ipcMain.on("pet-drag-move", (e, screenX, screenY) => {
  const win = petFromEvent(e);
  if (!win || !petDrag) return;
  const [w, h] = win.getSize();
  const next = clampPetPos(Number(screenX) - petDrag.dx, Number(screenY) - petDrag.dy, w, h);
  win.setPosition(next.x, next.y);
});

ipcMain.on("pet-drag-end", () => {
  petDrag = null;
});

ipcMain.on("pet-ignore-mouse", (e, ignore) => {
  const win = petFromEvent(e);
  if (!win) return;
  if (petDrag || !ignore) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.on("bongo", (_e, side) => {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send("bongo", side);
});
ipcMain.on("lamp-state", (_e, state) => {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send("lamp-state", state);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWin) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  });
}

function resolveAppIcon() {
  const packed = path.join(__dirname, "icon.ico");
  if (fs.existsSync(packed)) return packed;
  const dev = path.join(__dirname, "..", "build", "icon.ico");
  if (fs.existsSync(dev)) return dev;
  return undefined;
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "inkdesk",
    icon: resolveAppIcon(),
    backgroundColor: "#070b14",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWin.once("ready-to-show", () => mainWin.show());
  mainWin.webContents.on("context-menu", () => {
    Menu.buildFromTemplate([
      { role: "cut", label: "剪切" },
      { role: "copy", label: "复制" },
      { role: "paste", label: "粘贴" },
      { type: "separator" },
      { role: "selectAll", label: "全选" },
    ]).popup({ window: mainWin });
  });
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWin.on("closed", () => {
    mainWin = null;
    if (petWin && !petWin.isDestroyed()) petWin.close();
  });

  const html = path.join(__dirname, "..", "dist", "index.html");
  mainWin.loadFile(html);
}

app.whenReady().then(() => {
  ensureDataDir();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
