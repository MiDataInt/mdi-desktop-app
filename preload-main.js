/* -----------------------------------------------------------
preload-main.js has limited access to Node in support of renderer.js as a conduit to main.js
----------------------------------------------------------- */
const { contextBridge, ipcRenderer } = require('electron');
const net = require('net');
let mdiPort = 0; // used as both proxy and shiny ports depending on mode

/* -----------------------------------------------------------
use contextBridge for inter-process communication (IPC)
creates a controlled API for renderer.js to talk to main.js as mdi.method()
----------------------------------------------------------- */
contextBridge.exposeInMainWorld('mdi', {

  // debug auto-update
  autoUpdateStatus: (message) => ipcRenderer.on('autoUpdateStatus', message),

  // dynamically set the app window title
  setTitle: (mode, connection) => ipcRenderer.send('setTitle', mode, connection),

  // enable error and message dialogs via Electron dialog:showMessageBoxSync and electron-prompt
  showMessageBoxSync: (options) => ipcRenderer.send('showMessageBoxSync', options),
  confirmTerminal: (result) => ipcRenderer.on('confirmTerminal', result),
  confirmInstall: (result) => ipcRenderer.on('confirmInstall', result),
  confirmDelete: (result) => ipcRenderer.on('confirmDelete', result),
  showPrompt: (options) => ipcRenderer.send("showPrompt", options),
  configurationName: (result) => ipcRenderer.on('configurationName', result),

  // support dynamic resizing
  ptyResize: (size) => ipcRenderer.send('ptyResize', size),
  resizePanelWidths: (viewportHeight, viewportWidth, serverPanelWidth) => {
    ipcRenderer.send('resizePanelWidths', viewportHeight, viewportWidth, serverPanelWidth);
  },

  // enable local file system search for an identity file, MDI folder, etc.
  getLocalFile: (options) => ipcRenderer.invoke('getLocalFile', options),
  
  // data flow between the back-end node-pty pseudo-terminal and the front-end xterm terminal window
  // using IPC obviates the need for setting nodeIntegration:true
  xtermToPty: (data) => ipcRenderer.send('xtermToPty', data),
  ptyToXterm: (data) => ipcRenderer.on('ptyToXterm', data),

  // establish/terminate an ssh connection to the remote server on user request
  // these actions are only used in remote, not local, server modes
  sshConnect: (config) => {
    getRandomFreeLocalPort().then((port) => {
      mdiPort = port;
      const sshCommand = assembleSshCommand(config, true);
      ipcRenderer.send('sshConnect', sshCommand);      
    })
  },
  sshDisconnect: () => ipcRenderer.send('sshDisconnect'),

  // install and run the MDI frameworks on the remote server
  // these actions are always required to launch the mdi-apps-framework
  installServer: (config) => {
    const mdi = assembleMdiCommand(config, 'install');
    ipcRenderer.send('installServer', mdi);
  },
  startServer: (config) => {
    const mdi = assembleMdiCommand(config, 'run');
    ipcRenderer.send('startServer', mdi, mdiPort);
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

  // load content into the content BrowserView, contents BrowserView tab controls
  showFrameworkContents: (url, proxyRules) => ipcRenderer.send('showFrameworkContents', url, proxyRules),
  clearFrameworkContents: () => ipcRenderer.send('clearFrameworkContents'),
  refreshContents: () => ipcRenderer.send('refreshContents'),
  contentsBack: (listening) => ipcRenderer.send('contentsBack', listening),
  launchExternalTab: (listening) => ipcRenderer.send('launchExternalTab', listening),
  addTab: (viewportHeight, viewportWidth) => ipcRenderer.send('addTab', viewportHeight, viewportWidth),
  selectTab: (tabIndex) => ipcRenderer.send('selectTab', tabIndex),
  closeTab: (tabIndex) => ipcRenderer.send('closeTab', tabIndex),
  showDocumentation: (url) => ipcRenderer.on('showDocumentation', url), // in response to mdi-apps-framework
  showExternalLink: (tabName, tabIndex, addTab) => ipcRenderer.on('showExternalLink', tabName, tabIndex, addTab) // in response to external a links in content views
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
          // server mode = local port forwarding
          // 127.0.0.1(localhost) here is the destination as interpreted by the server, i.e., is the server
          ["-L", [mdiPort, "127.0.0.1", mdiPort].join(":")] : 
          // node mode = dynamic port forwarding (cluster forwards to node)
          // 127.0.0.1(localhost) here is the user's local computer
          ["-D", ["127.0.0.1", mdiPort].join(":")] 
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
  opt.install = (!opt.advanced.quickStart).toString().toUpperCase();
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
      "if [ ! -e mdi ]; then ./install.sh 1; fi",
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
      // the call to the remote target script
      "bash", 
      opt.remoteTarget,
      // arguments required by the target script
      mdiPort, // R Shiny port, used in local port forward and R process on login node
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
      // the call to the remote target script
      "bash", 
      opt.remoteTarget,
      // arguments required by the target script
      mdiPort, // proxy port, used in dynamic port forward, for reporting only 
      opt.rLoadCommand,
      mdiPort, // R Shiny port, used by R server in worker node process
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

/* -----------------------------------------------------------
return a promise that resolves to a single, random, free local port 
  this port may or may not be free on the server (but probably is)
  very rarely, this can result in a local race condition
----------------------------------------------------------- */
const checkCandidatePort = (port) => new Promise((resolve, reject) => { 
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(port, () => server.close(() => resolve(port)));
})
const getRandomFreeLocalPort = () => new Promise((resolve, reject) => { 
  const minPort = 1024; 
  const maxPort = 65535;
  const port = Math.floor(Math.random() * (maxPort - minPort) ) + minPort;    
  return checkCandidatePort(port)
    .then(resolve)
    .catch(() => { // step forward from a random starting port until a free port is found
      getRandomFreeLocalPort().then(resolve);
    })
})
