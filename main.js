/* -----------------------------------------------------------
Overall Electron app logic:
  main.js -  launches app and handles interactions with user OS via ipcMain and dialog
  preload.js - handles events raised by renderer.js, preprocesses them, and sends to ipcMain
  renderer.js - runs the restricted client-side web page in the BrowserWindow Chromium process
This recommended use of inter-process communication (IPC) isolates any third party
web content from node.js and other potential security exosures by maintaining
contextIsolation:true, sandbox:true, and nodeIntegration:false in the client browser.
----------------------------------------------------------- */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const pty = require('node-pty');
const { spawn } = require('child_process');
app.commandLine.appendSwitch('ignore-gpu-blacklist');

/* -----------------------------------------------------------
Electron app windows and flow control, see:
  https://www.electronjs.org/docs/latest/tutorial/quick-start
  https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata
----------------------------------------------------------- */
let mainWindow = null;
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

/* -----------------------------------------------------------
launch the Electron app in the main renderer, i.e., BrowserWindow
----------------------------------------------------------- */
const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // security settings (defaults repeated here for clarity)
      sandbox: true,
      contextIsolation: true
    },
    autoHideMenuBar: true // we don't need a top menu (File, Edit, etc.)
  });

  // set the app title bar based on server mode
  ipcMain.on('setTitle', (event, mode, connection) => {
    const connectedTo = connection ? (" - " + connection.server) : ""; 
    BrowserWindow.fromWebContents(event.sender).setTitle("MDI " + mode + connectedTo);
  });

  // load the app page that allows users to configure and launch their server
  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools(); // <<< for developers >>>

  // asynchronously activate the MDI server connections
  setTimeout(activateAppSshTerminal, 100);
  setTimeout(activateServerTerminal, 200);
};

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
enable system error and message dialogs via Electron dialog API
----------------------------------------------------------- */
ipcMain.on('showMessageBoxSync', (event, options) => {
  dialog.showMessageBoxSync(BrowserWindow.fromWebContents(event.sender), options);
});

/* -----------------------------------------------------------
activate the in-app node-pty pseudo-terminal that runs the mdi-remote server
----------------------------------------------------------- */
const isWindows = process.platform.toLowerCase().startsWith("win");
const shellCommand = isWindows ? 'powershell.exe' : 'bash';
let watch = {
  buffer: "",
  for: "",
  event: null,
  data: undefined
};
const activateAppSshTerminal = function(){

  // open a pseudo-terminal to the local computer's command shell
  // this terminal will receive appropriate subsequent connect/install/run commands
  const ptyProcess = pty.spawn(shellCommand, [], {
    name: 'mdi-remote-terminal',
    cols: 80,
    rows: 24,
    cwd: app.getPath('home'),
    env: process.env
  });

  // support dynamic terminal resizing
  ipcMain.on('xtermResize', (event, size) => ptyProcess.resize(size.cols, size.rows));

  // establish data flow between the back-end node-pty pseudo-terminal and the front-end xterm terminal window
  ipcMain.on('xtermToPty',  (event, data) => ptyProcess.write(data));
  ptyProcess.onData(data => {
    if(watch.for) { // monitor the stream for signals of interest
      watch.buffer += data;
      const match = watch.buffer.match(watch.for);
      if(match){
        mainWindow.webContents.send(watch.event, match[0], watch.data);        
        watch = {
          buffer: "",
          for: "",
          event: null,
          data: undefined
        };
      }
    }
    mainWindow.webContents.send('ptyToXterm', data);
  });

  // establish/terminate an ssh connection to the remote server on user request
  // these actions are only used in remote, not local, server modes
  ipcMain.on('sshConnect', (event, sshCommand) => {
    ptyProcess.write(sshCommand.join(" ") + "\r");
    mainWindow.webContents.send("connectedState", {connected: true}); // TODO: smarter way to know whether connection was successful?
  });
  ipcMain.on('sshDisconnect', (event, mode) => {
    ptyProcess.write("\r" + "exit" + "\r");
    mainWindow.webContents.send("connectedState", {connected: false});
  });

  // install and run MDI commands on the local or remote server on user request
  // these actions are always required to launch the mdi-apps-framework
  ipcMain.on('installServer', (event, mdi) => {
    if(mdi.mode == "Local"){ // parse local install here due to OS dependency
      const rScript = getRScript(mdi);
      const commands = [
        [
          rScript, "-e", // make sure remotes is installed
          "\"if(require('remotes', character.only = TRUE) == FALSE) install.packages('remotes', repos = 'https://cloud.r-project.org', Ncpus = 4)\""
        ].join(" "),
        [
          rScript, "-e", // make sure mdi-manager is installed
          "\"remotes::install_github('MiDataInt/mdi-manager')\""
        ].join(" "),
        [
          rScript, "-e", // install the mdi
          ["\"mdi::install('", mdi.opt.mdiDir, "', hostDir = '", mdi.opt.hostDir, "')\""].join("")
        ].join(" ")
      ];
      ptyProcess.write(commands.join("\r") + "\r");
    } else {
      ptyProcess.write(mdi.commands.join("; ") + "\r");
    }
  });  
  ipcMain.on('startServer', (event, mdi) => {
    watch = {
      buffer: "",
      for: /\nListening on http:\/\/.+:\d+/,
      event: "listeningState",
      data: {
        listening: true,
        developer: mdi.opt.regular.developer
      }
    };
    if(mdi.mode == "Local"){ // parse local install here due to OS dependency
      const rScript = getRScript(mdi);
      const command = [
        rScript, "-e",
        [
          "\"mdi::run('", mdi.opt.mdiDir, 
          "', hostDir = '", mdi.opt.hostDir, 
          "', dataDir = '", mdi.opt.dataDir, 
          "', port = ", mdi.opt.regular.shinyPort, 
          ", debug = ", mdi.opt.developer,
          ", developer = ", mdi.opt.developer, 
          ", browser = ", "FALSE", // if TRUE, an external Chrome window is spawned
          ")\"" // install = TRUE
        ].join("")
      ];
      ptyProcess.write(command.join(" ") + "\r");
    } else {
      ptyProcess.write(mdi.command.join(" ") + "\r");
    }
  });  
  ipcMain.on('stopServer', (event, mode) => {
    ptyProcess.write('\x03'); // SIGNIT, Ctrl-C, ^C, ASCII 3
    mainWindow.webContents.send("listeningState", null, {listening: false});
  });  
}
const getRScript = function(mdi){ // for local MDI calls
  const delimiter = isWindows ? '\\' : '/';
  let rScript = mdi.opt.regular.rDirectory ? (mdi.opt.regular.rDirectory + delimiter + "Rscript") : "Rscript";
  if(isWindows) rScript = rScript.replace(/ /g, "' '"); // deal with spaces in names
  return rScript;
}

/* -----------------------------------------------------------
launch a host terminal external to the electron app with an interactive [ssh] session 
to give users an additional way to explore a server machine while the MDI is running
----------------------------------------------------------- */
const activateServerTerminal = function(){
  ipcMain.on('spawnTerminal', (event, sshCommand) => {
    if(isWindows){ // 'start' required to create a stable external window
      if(!sshCommand) sshCommand = shellCommand; // Local mode
      spawn(shellCommand, ["/c", "start"].concat(sshCommand));
    } else {
      // TODO: handle linux/Mac does this work?
      // or maybe spawn(shellCommand, ["open", "ssh"].concat(sshArgs));
      spawn('ssh', sshCommand);
    }
  })  
}
