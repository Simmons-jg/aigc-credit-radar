const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aigcCreditRadarStorage", {
  getItem(key) {
    return ipcRenderer.sendSync("aigc-credit-radar:storage-get", key);
  },
  setItem(key, value) {
    ipcRenderer.sendSync("aigc-credit-radar:storage-set", key, value);
  },
});
