// load dependencies
const { contextBridge, ipcRenderer } = require('electron')

// parse the server mode options into the proper SSH command
const assembleSshArgs = (action, mode, options) => {
  return ["-T", "wilsonte@greatlakes.arc-ts.umich.edu"];
}

// use contextBridge for inter-process communication (IPC) since contextIsolation === true
contextBridge.exposeInMainWorld('mdi', {

  // dynamically set the app window title
  setTitle: (mode) => ipcRenderer.send('setTitle', mode),

  // install the MDI frameworks on the remote server
  installServer: (mode, options) => {
    let sshArgs = assembleSshArgs('install', mode, options)
    ipcRenderer.send('installServer', sshArgs)
  },

  // launch the MDI apps framework on the remote server
  startServer: (mode, options) => {
    let sshArgs = assembleSshArgs('run', mode, options)
    ipcRenderer.send('startServer', sshArgs)
  },

  launchFramework: (shinyPort) => {
    // TODO: handle window switch to loadURL("http://127.0.0.1:shinyPort")
    // or, just do this in main window using iframe?
  },  

  // data flow between node-pty pseudo-terminal and xterm terminal window
  // NB: using IPC obviates the need for setting nodeIntegration: true
  xtermToPty: (data) => {
    ipcRenderer.send('xtermToPty', data)
  },
  ptyToXterm: (data) => {
    ipcRenderer.on('ptyToXterm', data)
  }
})
