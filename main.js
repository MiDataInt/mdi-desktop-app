/* -----------------------------------------------------------
load dependencies
----------------------------------------------------------- */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const pty = require('node-pty');
const { spawn } = require('child_process');
app.commandLine.appendSwitch('ignore-gpu-blacklist');

/* -----------------------------------------------------------
enable local file system search for an identity file, R executable, MDI directory, etc.
----------------------------------------------------------- */
async function getLocalFile(event, type) {
  const { canceled, filePaths } = await dialog.showOpenDialog({properties: [
    type === "file" ? "openFile" : "openDirectory",
    "showHiddenFiles"
  ]});
  if (canceled) return;
  return filePaths[0];
};
ipcMain.handle('getLocalFile', getLocalFile);

/* -----------------------------------------------------------
enable error and message dialogs
----------------------------------------------------------- */
ipcMain.on('showMessageBoxSync', (event, options) => {
  dialog.showMessageBoxSync(BrowserWindow.fromWebContents(event.sender), options);
});

/* -----------------------------------------------------------
activate the in-app node-pty pseudo-terminal that runs the mdi-remote server
----------------------------------------------------------- */
const isWindows = process.platform.toLowerCase().startsWith("win");
const shellCommand = isWindows ? 'powershell.exe' : 'bash';
const activateAppSshTerminal = function(){

  // open pseudo-terminal to the local computer's command shell (no ssh yet)
  const ptyProcess = pty.spawn(shellCommand, [], {
    name: 'mdi-remote-terminal',
    cols: 80,
    rows: 24,
    cwd: app.getPath('home'),
    env: process.env
  });

  // support dynamic terminal resizing
  ipcMain.on('xtermResize', (event, size) => ptyProcess.resize(size.cols, size.rows));

  // data flow between the back-end node-pty pseudo-terminal and the front-end xterm terminal window
  ipcMain.on('xtermToPty',  (event, data) => ptyProcess.write(data));
  ptyProcess.onData(data => {
    // TODO: monitor data for the URL of the server to launch in the iframe, etc.
    mainWindow.webContents.send('ptyToXterm', data);
  });

  // establish/terminate an ssh connection to the remote server on user request
  ipcMain.on('sshConnect', (event, sshCommand) => {
    ptyProcess.write(sshCommand.join(" ") + "\r");
  });
  ipcMain.on('sshDisconnect', (event) => {
    ptyProcess.write("exit" + "\r");
  });

  // run MDI commands on the local or remote server on user request
  ipcMain.on('installServer', (event, mdiCommand) => {
    ptyProcess.write(mdiCommand.join(" ") + "\r");
  });  
  ipcMain.on('runServer', (event, mdiCommand) => {
    console.log(mdiCommand.join(" ") + "\r");
    // TODO: activate URL watcher to load web page
  });  
}

/* -----------------------------------------------------------
launch a host terminal external to the electron app with an interactive ssh session 
----------------------------------------------------------- */
const activateHostSshTerminal = function(){
  ipcMain.on('spawnTerminal', (event, sshCommand) => {
    if(isWindows){ // 'start' required to create a stable external window
      spawn(shellCommand, ["/c", "start"].concat(sshCommand));
    } else {
      // TODO: handle linux/Mac does this work?
      // or maybe spawn(shellCommand, ["open", "ssh"].concat(sshArgs));
      spawn('ssh', sshCommand);
    }
  })  
}

/* -----------------------------------------------------------
launch the Electron app in the main renderer, i.e., BrowserWindow
----------------------------------------------------------- */
let mainWindow = null;
const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // security settings (defaults repeated here for clarity)
      sandbox: true,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  // set the app title bar based on server mode
  ipcMain.on('setTitle', (event, mode) => {
    BrowserWindow.fromWebContents(event.sender).setTitle("MDI " + mode);
  });

  // load the app page that allows users to configure and launch their server
  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools(); // <<< for developers >>>

  // activate the MDI server connections
  setTimeout(activateAppSshTerminal, 50);
  setTimeout(activateHostSshTerminal, 100);
};

/* -----------------------------------------------------------
Electron app windows and flow control, see:
  https://www.electronjs.org/docs/latest/tutorial/quick-start
  https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata
----------------------------------------------------------- */
if (app.requestSingleInstanceLock({})) { // allow at most a single instance of the app
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if (mainWindow) { // focus an existing window
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => { // create a non-existent window
    createMainWindow();
    app.on('activate', () => { // for Mac
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
  app.on('window-all-closed', () => { // all except Mac
    if (process.platform !== 'darwin') app.quit();
  });
} else {
  app.quit();
}
