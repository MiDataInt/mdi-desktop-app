const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mdi', {
  setTitle: (mode) => ipcRenderer.send('set-title', mode),
  startServer: (password) => ipcRenderer.send('start-server', password),
  log: (message) => ipcRenderer.send('show-log', message)
})
