/* -----------------------------------------------------------
preload.js has limited access to Node in support of renderer.js as a conduit to main.js
----------------------------------------------------------- */
const { contextBridge, ipcRenderer } = require('electron');

/* -----------------------------------------------------------
use contextBridge for inter-process communication (IPC)
essentially, create a controlled API for renderer.js to talk to main.js as mdi.method()
----------------------------------------------------------- */
contextBridge.exposeInMainWorld('mdi', {

  // dynamically set the app window title
  setTitle: (mode, connection) => ipcRenderer.send('setTitle', mode, connection),

  // enable error and message dialogs via Electron dialog:showMessageBoxSync and electron-prompt
  showMessageBoxSync: (options) => ipcRenderer.send('showMessageBoxSync', options),
  confirmDelete: (result) => ipcRenderer.on('confirmDelete', result),
  showPrompt: (options) => ipcRenderer.send("showPrompt", options),
  configurationName: (result) => ipcRenderer.on('configurationName', result),

  // support dynamic resizing
  xtermResize: (size) => ipcRenderer.send('xtermResize', size),
  resizePanelWidths: (viewPortWidth, serverPanelWidth) => {
    ipcRenderer.send('resizePanelWidths', viewPortWidth, serverPanelWidth);
  },

  // enable local file system search for an identity file, MDI folder, etc.
  getLocalFile: (type) => ipcRenderer.invoke('getLocalFile', type),
  
  // data flow between the back-end node-pty pseudo-terminal and the front-end xterm terminal window
  // using IPC obviates the need for setting nodeIntegration:true
  xtermToPty: (data) => ipcRenderer.send('xtermToPty', data),
  ptyToXterm: (data) => ipcRenderer.on('ptyToXterm', data),

  // establish/terminate an ssh connection to the remote server on user request
  // these actions are only used in remote, not local, server modes
  sshConnect: (config) => {
    const sshCommand = assembleSshCommand(config, true);
    ipcRenderer.send('sshConnect', sshCommand);
  },
  sshDisconnect: (config) => {
    ipcRenderer.send('sshDisconnect', config.mode);
  },

  // install and run the MDI frameworks on the remote server
  // these actions are always required to launch the mdi-apps-framework
  installServer: (config) => {
    const install = assembleMdiCommand(config, 'install');
    ipcRenderer.send('installServer', install);
  },
  startServer: (config) => {
    const mdiCommand = assembleMdiCommand(config, 'run');
    ipcRenderer.send('startServer', mdiCommand);
  },
  stopServer: (config) => {
    ipcRenderer.send('stopServer', config.mode);
  },

  // launch a host terminal external to the electron app with an interactive ssh session 
  spawnTerminal: (config) => {
    const sshCommand = config.mode == "Local" ? "" : assembleSshCommand(config, false);
    ipcRenderer.send('spawnTerminal', sshCommand)
  },

  // respond to data stream watches and other pty state events
  connectedState: (data) => ipcRenderer.on('connectedState', data),
  listeningState: (match, data) => ipcRenderer.on('listeningState', match, data),

  // load content into the content BrowserView
  showContent: (url, proxyRules) => ipcRenderer.send('showContent', url, proxyRules)
});

/* -----------------------------------------------------------
parse the server config options into proper SSH commands
----------------------------------------------------------- */
const assembleSshCommand = (config, createTunnel) => {
  const opt = structuredClone(config.options);
  return ["ssh", "-t"].
    concat( // optional ssh key file for remote servers that support them (_not_ UM Great Lakes)
      opt.advanced.identityFile ? 
      ["-i", opt.advanced.identityFile] : 
      []
    ).
    concat(
      createTunnel ? ( // for in-app MDI server connection, create a port tunnel
        config.mode === "Remote" ? 
        ["-L", [opt.regular.shinyPort, "127.0.0.1", opt.regular.shinyPort].join(":")] : 
        ["-D", opt.advanced.proxyPort]
      ) :
      [] // extra connection windows are just simple interactive terminals
    ).
    concat([opt.regular.user + "@" + opt.regular.serverDomain]); // all connections are user-specific over SSH
}

/* -----------------------------------------------------------
parse the server config options into proper MDI commands
R function signatures are found here:
  https://midataint.github.io/mdi-manager/docs/actions/00_index.html
----------------------------------------------------------- */
const assembleMdiCommand = (config, action) => {
  const opt = structuredClone(config.options);
  opt.isLocal = config.mode === "Local";
  opt.isNode  = config.mode === "Node";
  return action === "install" ? (
    opt.isLocal ? assembleMdiLocal(opt) : assembleRemoteInstall(opt)
  ) : (
    opt.isLocal ? assembleMdiLocal(opt) : (opt.isNode ? assembleNodeRun(opt) : assembleRemoteRun(opt))
  );
}

/* -----------------------------------------------------------
MDI commands in local mode - executed on the host machine
----------------------------------------------------------- */
const assembleMdiLocal = function(opt){
  opt.mdiDir = opt.regular.mdiDirectoryLocal.replace(/\\/g, '/');
  opt.hostDir = opt.advanced.hostDirectoryLocal.replace(/\\/g, '/') || "NULL";
  opt.dataDir = opt.advanced.dataDirectoryLocal.replace(/\\/g, '/') || "NULL";
  opt.developer = opt.regular.developer.toString().toUpperCase();
  return {
    mode: "Local",
    opt: opt   
  };
}

/* -----------------------------------------------------------
MDI commands in remote modes - executed on the server machine via SSH
argument signatures for run scripts are found here:
  https://github.com/MiDataInt/mdi-manager/blob/main/inst/remote/mdi-remote-server.sh
  https://github.com/MiDataInt/mdi-manager/blob/main/inst/remote/mdi-remote-node.sh
----------------------------------------------------------- */
const assembleRemoteInstall = function(opt){ // does _not_ depend on remote mode, i.e., remote vs. node
  opt = parseRemoteInstallOptions(opt);      // MDI server installation runs on the login host, not a node
  return {
    mode: "Remote",
    opt: opt,
    commands: [
      opt.rLoadCommand,
      "export SUPPRESS_MDI_BASHRC=TRUE",
      ["if [ ! -d", opt.mdiDir, "]; then mkdir -p", opt.mdiDir, "; fi"].join(" "),
      "cd " + opt.mdiDir,
      "if [ ! -e install.sh ]; then git clone https://github.com/MiDataInt/mdi.git .; fi",
      "if [ ! -e mdi ]; then ./install.sh; fi", // TODO: add "1" to force install?
      "./mdi install --install-packages --n-cpu 4 " + opt.forksFlag
    ]    
  };
}
const parseRemoteInstallOptions = function(opt){ // convert user inputs into values suitable for passing to mdi::install
  opt.mdiDir = opt.regular.mdiDirectoryRemote;
  opt.forksFlag = opt.regular.developer ? "--forks" : "";
  opt.rLoadCommand = opt.regular.rLoadCommand ? opt.regular.rLoadCommand : "echo";
  return opt;
}
const assembleRemoteRun = function(opt){ // run command when server mode == remote
  opt = parseRemoteRunOptions(opt);
  return {
    mode: "Remote",
    opt: opt,
    command: [
      "bash", // the call to the remote target script
      opt.remoteTarget,
      //-------------------------
      opt.regular.shinyPort, // the arguments required by the target script
      opt.mdiDir,
      opt.dataDirectory,
      opt.hostDirectory,
      opt.developer,
      opt.rLoadCommand,
      opt.regular.serverDomain
    ]
  };
}
const assembleNodeRun = function(opt){ // run command when server mode == node
  opt = parseRemoteRunOptions(opt);
  return {
    mode: "Node",
    opt: opt,
    command: [
      "bash", // the call to the remote target script
      opt.remoteTarget,
      //-------------------------
      opt.advanced.proxyPort, // the arguments required by the target script
      opt.rLoadCommand,
      opt.regular.shinyPort,
      opt.mdiDir,
      opt.dataDirectory,
      opt.hostDirectory,
      opt.developer,
      opt.regular.clusterAccount,
      opt.regular.jobTimeMinutes,
      opt.advanced.cpusPerTask,
      opt.advanced.memPerCpu,
      opt.regular.serverDomain
    ]
  };
}
const parseRemoteRunOptions = function(opt){ // convert user inputs into values suitable for passing to scripts
  opt.mdiDir = opt.regular.mdiDirectoryRemote;
  opt.remoteTarget = opt.mdiDir + "/remote/" + (opt.isNode ? "mdi-remote-node" : "mdi-remote-server") + ".sh";
  opt.dataDirectory = opt.advanced.dataDirectoryRemote || "NULL";
  opt.hostDirectory = opt.advanced.hostDirectoryRemote || "NULL";
  opt.developer = opt.regular.developer.toString().toUpperCase();
  opt.rLoadCommand = opt.regular.rLoadCommand ? opt.regular.rLoadCommand.replace(/ /g, "~~") : "echo";
  return opt;
}
