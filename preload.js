// load dependencies
const { contextBridge, ipcRenderer } = require('electron');

// parse the server mode options into the proper SSH and MDI commands
const assembleSshCommand = (mode, options, tunnel) => {
  return ["-T", "wilsonte@greatlakes.arc-ts.umich.edu"];
}
const assembleMdiCommand = (action, mode, options) => {
  return ["-T", "wilsonte@greatlakes.arc-ts.umich.edu"];
}

// use contextBridge for inter-process communication (IPC) since contextIsolation:true
contextBridge.exposeInMainWorld('mdi', {

  // dynamically set the app window title
  setTitle: (mode) => ipcRenderer.send('setTitle', mode),

  // support dynamic terminal resizing
  xtermResize: (size) => ipcRenderer.send('xtermResize', size),

  // enable local file system search for an identity file
  getLocalFile: (type) => ipcRenderer.invoke('getLocalFile', type),
  
  // data flow between the back-end node-pty pseudo-terminal and the front-end xterm terminal window
  // using IPC obviates the need for setting nodeIntegration:true
  xtermToPty: (data) => ipcRenderer.send('xtermToPty', data),
  ptyToXterm: (data) => ipcRenderer.on('ptyToXterm', data),

  // establish/terminate an ssh connection to the remote server on user request
  sshConnect: (mode, options) => {
    let sshCommand = assembleSshCommand(mode, options, true);
    ipcRenderer.send('sshConnect', sshCommand);
  },
  sshDisconnect: (mode) => {
    ipcRenderer.send('sshDisconnect', mode);
  },

  // install the MDI frameworks on the remote server
  installServer: (mode, options) => {
    let mdiCommand = assembleMdiCommand('install', mode, options);
    ipcRenderer.send('installServer', mdiCommand);
  },
  runServer: (mode, options) => {
    let mdiCommand = assembleMdiCommand('run', mode, options);
    ipcRenderer.send('runServer', mdiCommand);
  },

  // launch a host terminal external to the electron app with an interactive ssh session 
  spawnTerminal: (mode, options) => {
    let sshCommand = assembleSshCommand(mode, options, false);
    ipcRenderer.send('spawnTerminal', data)
  },
  // launchFramework: (shinyPort) => {
  //   // TODO: handle window switch to loadURL("http://127.0.0.1:shinyPort")
  //   // or, just do this in main window using iframe?
  // },  
});
