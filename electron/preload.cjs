const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("inkdesk", {
  readData: (file) => ipcRenderer.invoke("read-data", file),
  writeData: (file, content) => ipcRenderer.invoke("write-data", file, content),
  dataDir: () => ipcRenderer.invoke("data-dir"),
  openDataDir: () => ipcRenderer.invoke("open-data-dir"),
  togglePet: () => ipcRenderer.invoke("toggle-pet"),
  bongo: (side) => ipcRenderer.send("bongo", side),
  sendLampState: (state) => ipcRenderer.send("lamp-state", state),
  onBongo: (cb) => {
    ipcRenderer.on("bongo", (_e, side) => cb(side));
  },
  onLampState: (cb) => {
    ipcRenderer.on("lamp-state", (_e, state) => cb(state));
  },
  onPetMode: (cb) => {
    ipcRenderer.on("pet-mode", (_e, mode) => cb(mode));
  },
  petDragStart: (screenX, screenY) => ipcRenderer.send("pet-drag-start", screenX, screenY),
  petDragMove: (screenX, screenY) => ipcRenderer.send("pet-drag-move", screenX, screenY),
  petDragEnd: () => ipcRenderer.send("pet-drag-end"),
  setPetIgnoreMouse: (ignore) => ipcRenderer.send("pet-ignore-mouse", ignore),
});
