/* -----------------------------------------------------------
renderer.js has no access to Node or local system except through preload.js contextBridge
----------------------------------------------------------- */

/* -----------------------------------------------------------
initialize the xterm terminal window and associated events and data flow
----------------------------------------------------------- */
const terminalDiv = document.getElementById("terminal");
const xtermCols = 80; // fixed
let xtermRows = 24;   // dynamically resized
const xtermCharWidth = 560 / 80; // determined empirically, could measure?
const xtermCharHeight = 280 / 20;
const xterm = new Terminal({
    cols: xtermCols,
    rows: xtermRows,
    fontFamily: "monospace",
    fontSize: 12,
    cursorStyle: "bar",
    cursorBlink: true,
    cursorWidth: 2
});
xterm.open(terminalDiv);
xterm.onResize((size) => mdi.xtermResize(size));
xterm.onData((data) => mdi.xtermToPty(data));
mdi.ptyToXterm((event, data) => { xterm.write(data) });

/* -----------------------------------------------------------
activate dynamic element resizing
----------------------------------------------------------- */
const serverConfigPanel = document.getElementById("server-config");
const viewerPanel = document.getElementById("viewer-panel"); // on top of serverPanel, contains toggleButton and frameworkPanel
const toggleButton = document.getElementById('server-panel-toggle');
const frameworkPanel = document.getElementById('framework-panel');
const toggleButtonWidth = 20; // as set in launcher.css
const serverPanelPadding = 15;
const serverPanelWidth = Math.floor((xtermCols + 6) * xtermCharWidth); // determined emprically
const serverPanelPaddedWidth = serverPanelWidth + 2 * serverPanelPadding;
let serverPanelWorkingWidth = serverPanelPaddedWidth;
const resizePanelWidths = function(){ // control the horizontal display, for hiding serverPanel under frameworkPanel 
    viewerPanel.style.marginLeft = serverPanelWorkingWidth + "px";
    frameworkPanel.style.width = (window.innerWidth - serverPanelWorkingWidth - toggleButtonWidth) + "px";
}
const resizePanelHeights = function(){ // control xterm terminal height based on viewport and options displays
    const xtermHeight = window.innerHeight - serverConfigPanel.clientHeight - 2 * serverPanelPadding;
    const xtermRows = Math.max(1, Math.floor(xtermHeight / xtermCharHeight));
    xterm.resize(xtermCols, xtermRows);    
}
const resizePanels = function(){
    resizePanelWidths();
    resizePanelHeights();
}
resizePanels();
window.addEventListener('resize', (event) => resizePanels());

/* -----------------------------------------------------------
activate the button to toggle server-panel visibility, with a bit of animation
----------------------------------------------------------- */
const toggleServerPanel = function(){
    let id = null;
    let target = null;
    const collapsing = serverPanelWorkingWidth > 0;
    clearInterval(id);
    if(collapsing){
        target = 0;
        inc = -1;
    } else {
        target = serverPanelPaddedWidth;
        inc = 1;
    }
    const animate = function() {
        if (serverPanelWorkingWidth == target) {
            clearInterval(id);
            toggleButton.innerHTML = collapsing ? "&gt;" : "&lt;";
        } else {
            serverPanelWorkingWidth += inc * serverPanelPaddedWidth / 75; // animation speed set here
            serverPanelWorkingWidth = Math.min(Math.max(serverPanelWorkingWidth, 0), serverPanelPaddedWidth);
            resizePanelWidths();
        }
    }    
    id = setInterval(animate, 0);
}
toggleButton.addEventListener('click', function(event) {
    toggleServerPanel();
});

/* -----------------------------------------------------------
activate the MDI apps server action buttons
----------------------------------------------------------- */
const sshConnectButton    = document.getElementById('ssh-connect');
const sshDisconnectButton = document.getElementById('ssh-disconnect');
const installServerButton = document.getElementById('install-server');
const startServerButton   = document.getElementById('start-server');
const stopServerButton    = document.getElementById('stop-server');
const spawnTerminalButton = document.getElementById('spawn-terminal');
const buttonsHr = document.getElementById('buttons-hr');
let serverState = {
    connected: false, // whether an ssh connection has been established
    listening: false, // whether the mdi-apps-framework is running
    nButtons: 0
};
const setButtonVisibility = function(button, isVisible){
    button.style.display = isVisible ? "inline-block" : "none";
    if(isVisible) serverState.nButtons++;
}
const setButtonsVisibility = function(){
    const config = presets[presetSelect.value];
    const isLocal = config.mode == "Local";
    const isConnected = isLocal || serverState.connected;
    const sshIsReady = checkActionReadiness("ssh", true).success;
    const installIsReady = checkActionReadiness("mdi", "install").success;
    const runIsReady = checkActionReadiness("ssh", "run").success;
    const terminalIsReady = checkActionReadiness("ssh", false).success;
    serverState.nButtons = 0;
    setButtonVisibility(sshConnectButton,    !isLocal && sshIsReady && !serverState.connected);
    setButtonVisibility(sshDisconnectButton, !isLocal && sshIsReady &&  serverState.connected);
    setButtonVisibility(installServerButton, isConnected && installIsReady && !serverState.listening);
    setButtonVisibility(startServerButton,   isConnected && runIsReady && !serverState.listening);
    setButtonVisibility(stopServerButton,    isConnected && serverState.listening);
    setButtonVisibility(spawnTerminalButton, terminalIsReady);
    buttonsHr.style.display = serverState.nButtons > 0 ? "block" : "none";
    resizePanelHeights();
}
const sshRequiredOptions = function(config, createTunnel){
    const isLocal = config.mode === "Local";
    const isNode = config.mode === "Node";
    return {
        regular:{
            user: !isLocal,
            serverDomain: !isLocal,
            shinyPort: createTunnel && !isNode
        },
        advanced:{        
            proxyPort: createTunnel && isNode
        }
    }    
};
const mdiRequiredOptions = function(config, action){
    const isInstall = action === "install";    
    const isLocal = config.mode === "Local";
    const isNode  = config.mode === "Node";
    const isNodeRun = !isInstall && isNode
    return {
        regular: {
            serverDomain: !isInstall && !isLocal,
            clusterAccount: isNodeRun,
            jobTimeMinutes: isNodeRun,
            mdiDirectoryRemote: !isLocal,
            mdiDirectoryLocal: isLocal,
            shinyPort: true 
        },
        advanced: {                 
            proxyPort: isNodeRun,
            cpusPerTask: isNodeRun,
            memPerCpu: isNodeRun
        }
    }   
}
checkActionReadiness = function(commandType, extra){
    const config = presets[presetSelect.value];
    const requiredOptions = commandType == "ssh" ? sshRequiredOptions(config, extra) : mdiRequiredOptions(config, extra);
    for(optionType of ["regular", "advanced"]){
        for(option of Object.keys(requiredOptions[optionType])){
            if(!requiredOptions[optionType][option]) continue;
            if(!config.options[optionType][option]) return {success: false, option: option};
        }
    }
    return {success: true, config: config};
}
const getConfig = function(commandType, extra){
    const check = checkActionReadiness(commandType, extra);
    if(check.success) return check.config;
    mdi.showMessageBoxSync({
        message: "Option '" + check.option + "' is required for " + commandType + " actions.",
        type: "warning",
        title: "Missing option value"
    });
};
sshConnectButton.addEventListener('click', function(event) {
    const config = getConfig('ssh', true);
    if(!config) return;
    mdi.sshConnect(config);
    xterm.focus();
});
sshDisconnectButton.addEventListener('click', function(event) {
    const config = getConfig('ssh', false);
    if(!config) return;
    mdi.sshDisconnect(config);
    xterm.focus();
});
installServerButton.addEventListener('click', function(event) {
    const config = getConfig('mdi', 'install');
    if(!config) return;
    mdi.installServer(config);
    xterm.focus();
});
startServerButton.addEventListener('click', function(event) {
    const config = getConfig('mdi', 'run');
    if(!config) return;
    mdi.startServer(config);
});
stopServerButton.addEventListener('click', function(event) {
    const config = getConfig('mdi', 'run');
    if(!config) return;
    mdi.stopServer(config);
    xterm.focus();
});
spawnTerminalButton.addEventListener('click', function(event) {
    const config = getConfig('ssh', false);
    if(!config) return;
    mdi.spawnTerminal(config);
});

/* -----------------------------------------------------------
activate dynamic server configuration inputs (initialized in upside-down fashion)
----------------------------------------------------------- */

// use IPC to access the local file system
const fileOptionInputs = document.getElementsByClassName('fileOptionInput');
for (const fileOptionInput of fileOptionInputs) {
    const elements = fileOptionInput.children;
    elements[1].addEventListener('click', async () => {
        const filePath = await mdi.getLocalFile(elements[1].dataset.type);
        if(filePath) elements[0].value = filePath;
        elements[0].dispatchEvent(new Event('change', {bubbles: true}));
    });
}

// act on option value changes
// edits are always accumulated in the "Working" configuration
const optionForms   = document.getElementsByClassName('optionsForm');
const configOptions = document.getElementsByClassName('config-option');
const commitWorkingChanges = function(){
    localStorage.setItem(presetsKey, JSON.stringify(presets));
    presetSelect.value = "working";
    setButtonsVisibility();    
}
const handleInputChange = function(form, input){
    const type = form.dataset.type; 
    const option = input.name;
    const value = input.type === "checkbox" ? input.checked : input.value.trim();
    if(presets.working.options       === undefined) presets.working.options       = structuredClone(nullPreset.options);
    if(presets.working.options[type] === undefined) presets.working.options[type] = structuredClone(nullPreset.options[type]);
    presets.working.options[type][option] = value;
    commitWorkingChanges();
}
for (const optionForm of optionForms){ // listen to the form to catch input change events by propagation
    optionForm.addEventListener('change', function(event){
        handleInputChange(this, event.target);
    });
}

// control the available options based on server mode
const setServerMode = function(mode, isInit){
    mdi.setTitle(mode)
    for (const configOption of configOptions) {
        configOption.style.display = configOption.classList.contains(mode) ? "block" : "none";
    }
    for (const modeRadio of modeRadios) {
        modeRadio.checked = modeRadio.value === mode;
    }
    resizePanelHeights();
    presets.working.mode = mode;
    isInit ? setButtonsVisibility() : commitWorkingChanges();
}

// control available options based on show/hide advanced link
const toggleAdvanced  = document.getElementById('toggleAdvanced');
const advancedOptions = document.getElementById('advancedOptions');
let advancedAreVisible = false;
toggleAdvanced.addEventListener('click', function(){
    advancedAreVisible = !advancedAreVisible;
    advancedOptions.style.display = advancedAreVisible ? "block" : "none";
});

// server mode, i.e., where the mdi-apps-framework will run
const modeRadios = document.serverMode.mode;
for (const modeRadio of modeRadios) {
    modeRadio.addEventListener('change', function(){
        setServerMode(this.value);
    });
}

// save/load user-defined configurations, i.e., Presets, from localStorage
const presetSelect = document.getElementById('preset');
const presetsKey = "mdi-launcher-presets";
const nullPreset = {
    mode: "Remote",
    options: {
        regular:{
            user: "",
            serverDomain: "greatlakes.arc-ts.umich.edu",
            clusterAccount: "",
            jobTimeMinutes: 120,
            mdiDirectoryRemote: "~/mdi",
            mdiDirectoryLocal: "~/mdi",
            rLoadCommand: "",
            rDirectory: "",
            shinyPort: 3838,
            developer: false   
        },
        advanced:{
            identityFile: "",            
            dataDirectoryRemote: "",
            dataDirectoryLocal: "",
            hostDirectoryRemote: "",
            hostDirectoryLocal: "",
            proxyPort: 1080,
            cpusPerTask: 2,
            memPerCpu: "4g"
        }
    }
};
let presets = localStorage.getItem(presetsKey);
////////////////
if(!presets || true) { //////////////
    presets = {
        defaults:   structuredClone(nullPreset),
        mostRecent: structuredClone(nullPreset),
        working:    structuredClone(nullPreset)
    };
    localStorage.setItem(presetsKey, JSON.stringify(presets));
} else {
    presets = JSON.parse(presets);
}
const changeToPreset = function(presetName, isInit){
    let preset = presets[presetName];
    if(!preset) preset = structuredClone(nullPreset);
    setServerMode(preset.mode, isInit);
};
presetSelect.addEventListener('change', function(){ 
    changeToPreset(this.value);
});

// on page load, show the last state of the launcher, whether saved as a named preset or not
changeToPreset("mostRecent", true);

/* -----------------------------------------------------------
respond to data stream watches and other pty state events
----------------------------------------------------------- */
const iframe = document.getElementById("embedded-apps-framework");
mdi.connectedState((event, data) => { 
    serverState.connected = data.connected;
    setButtonsVisibility();
});
mdi.listeningState((event, match, data) => { 
    serverState.listening = data.listening;
    setButtonsVisibility();
    if(serverState.listening){
        iframe.src = match.match(/http:\/\/.+:\d+/);
        iframe.style.display = "block";
        if(serverPanelWorkingWidth > 0 && !data.developer) toggleServerPanel(); // by default, hide the server panel unless developing
    } else {
        iframe.src = "";
        iframe.style.display = "none";
        if(serverPanelWorkingWidth == 0) toggleServerPanel();
    }
});

// TODO: save and delete configs from buttons; and save Most Recent when connected (or listening?)
//       disable certain inputs when connected or listening
//       node mode, hopefully can set Chromium proxy
//       need better says to refresh the framework page (add a link to the electron header?)
//       copy paste from terminal
//       publish and distribute
//       documentation
