// load dependencies
const { contextBridge, ipcRenderer } = require('electron')

// parse the server mode options into the proper SSH command
const assembleSshCommand = (action, mode, options) => {
  return ["-T", "wilsonte@greatlakes.arc-ts.umich.edu"];
}

// use contextBridge for inter-process communication (IPC) since contextIsolation === true
contextBridge.exposeInMainWorld('mdi', {
  setTitle: (mode) => ipcRenderer.send('set-title', mode),
  installServer: (mode, options) => {
    let sshCommand = assembleSshCommand('install', mode, options)
    ipcRenderer.send('server-action', sshCommand)
  },
  startServer: (mode, options) => {
    let sshCommand = assembleSshCommand('run', mode, options)
    ipcRenderer.send('server-action', sshCommand)
  },
  launchFramework: (shinyPort) => {
    // TODO: handle window switch to loadURL("http://127.0.0.1:shinyPort")
    // or, just do this in main window using iframe?
  }
})
