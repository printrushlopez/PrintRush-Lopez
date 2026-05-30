const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getEnv:    () => ipcRenderer.invoke('get-env'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  onBluetoothFileReceived: (callback) => ipcRenderer.on('bluetooth-file-received', (_event, fileInfo) => callback(fileInfo)),
  printFile:   (urlOrPath) => ipcRenderer.invoke('print-file', urlOrPath),
  saveConfig:  (config)    => ipcRenderer.invoke('save-config', config)
});
