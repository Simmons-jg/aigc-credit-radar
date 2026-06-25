const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aigcCreditRadarStorage", {
  getItem(key) {
    return ipcRenderer.sendSync("aigc-credit-radar:storage-get", key);
  },
  setItem(key, value) {
    ipcRenderer.sendSync("aigc-credit-radar:storage-set", key, value);
  },
});

contextBridge.exposeInMainWorld("aigcCreditRadarDesktop", {
  showNotification(payload) {
    ipcRenderer.send("aigc-credit-radar:show-notification", payload);
  },
  showMainWindow() {
    ipcRenderer.send("aigc-credit-radar:show-main-window");
  },
  toggleMiniWindow() {
    ipcRenderer.send("aigc-credit-radar:toggle-mini-window");
  },
});
