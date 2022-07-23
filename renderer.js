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
xterm.onResize((size) => window.mdi.xtermResize(size));
xterm.onData((data) => window.mdi.xtermToPty(data));
window.mdi.ptyToXterm((event, data) => { xterm.write(data) });

/* -----------------------------------------------------------
activate dynamic element resizing
----------------------------------------------------------- */
const serverConfigPanel = document.getElementById("server-config");
const viewerPanel = document.getElementById("viewer-panel"); // on top of serverPanel, contains toggleButton and frameworkPanel
const toggleButton = document.getElementById('server-panel-toggle');
const frameworkPanel = document.getElementById('framework-panel');
const toggleButtonWidth = 20;
const serverPanelPadding = 15;
const serverPanelWidth = Math.floor((xtermCols + 6) * xtermCharWidth);
const serverPanelPaddedWidth = serverPanelWidth + 2 * serverPanelPadding;
let serverPanelWorkingWidth = serverPanelPaddedWidth;
const resizePanelWidths = function(){
    viewerPanel.style.marginLeft = serverPanelWorkingWidth + "px";
    frameworkPanel.style.width = (window.innerWidth - serverPanelWorkingWidth - toggleButtonWidth) + "px";
}
const resizePanelHeights = function(){
    let xtermHeight = window.innerHeight - serverConfigPanel.clientHeight - 2 * serverPanelPadding;
    let xtermRows = Math.max(1, Math.floor(xtermHeight / xtermCharHeight));
    xterm.resize(xtermCols, xtermRows);    
}
const resizePanels = function(){
    resizePanelWidths();
    resizePanelHeights();
}
resizePanels();
window.addEventListener('resize', (event) => resizePanels());

/* -----------------------------------------------------------
activate the button to toggle server-panel visibility
----------------------------------------------------------- */
toggleButton.addEventListener('click', function(event) {
    let id = null;
    let target = null;
    let collapsing = serverPanelWorkingWidth > 0;
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
});

/* -----------------------------------------------------------
activate dynamic server configuration inputs (initialized in upside-down fashion)
----------------------------------------------------------- */

// use IPC to access the local file system
const fileOptionInputs = document.getElementsByClassName('fileOptionInput');
for (const fileOptionInput of fileOptionInputs) {
    const nodes = fileOptionInput.childNodes;
    nodes[3].addEventListener('click', async () => {
        const filePath = await window.mdi.getLocalFile(nodes[3].dataset.type);
        if(filePath) nodes[1].value = filePath;
    });
}

// control available options based on server mode
const optionForms = document.getElementsByClassName('optionsForm');
const configOptions = document.getElementsByClassName('config-option');
const handleInputChange = function(form, input){
    let type = form.dataset.type;
    let option = input.name;
    let value = input.type === "checkbox" ? input.checked : input.value;
    if(presets.working.options       === undefined) presets.working.options      = structuredClone(nullPreset.options);
    if(presets.working.options[type] === undefined) presets.working.options.type = structuredClone(nullPreset.options[type]);
    presets.working.options[type][option] = value;
    localStorage.setItem(presetsKey, JSON.stringify(presets));
    presetSelect.value = "working";
}
for (const optionForm of optionForms){
    optionForm.addEventListener('change', (event) => handleInputChange(this, event.target));
}
const setServerMode = function(mode){
    window.mdi.setTitle(mode)
    for (const configOption of configOptions) {
        configOption.style.display = configOption.classList.contains(mode) ? "block" : "none";
    }
    for (const modeRadio of modeRadios) {
        modeRadio.checked = modeRadio.value === mode
    }
    resizePanelHeights();
    presets.working.mode = mode;
    localStorage.setItem(presetsKey, JSON.stringify(presets));
}

// control available options based on show/hide advanced link
const toggleAdvanced = document.getElementById('toggleAdvanced');
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
        setServerMode(this.value)
    });
}
const getServerMode = function(){
    for (const modeRadio of modeRadios) {
        if(modeRadio.checked) return modeRadio.value
    }
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
const changeToPreset = function(presetName){
    let preset = presets[presetName];
    if(!preset) preset = structuredClone(nullPreset);
    setServerMode(preset.mode);
};
presetSelect.addEventListener('change', function(){ 
    changeToPreset(this.value)
});

// on page load, show the last state of the launcher, whether saved as a named preset or not
changeToPreset("mostRecent");

/* -----------------------------------------------------------
activate the MDI apps server action buttons
----------------------------------------------------------- */
const sshConnectButton    = document.getElementById('ssh-connect');
const sshDisconnectButton = document.getElementById('ssh-disconnect');
const installServerButton = document.getElementById('install-server');
const runServerButton     = document.getElementById('run-server');
const spawnTerminalButton = document.getElementById('spawn-terminal');
sshConnectButton.addEventListener('click', function(event) {
    window.mdi.sshConnect(mode, options);
    xterm.focus();
});
sshDisconnectButton.addEventListener('click', function(event) {
    window.mdi.sshDisconnect(mode);
    xterm.focus();
});
installServerButton.addEventListener('click', function(event) {
    window.mdi.installServer(mode, options);
    xterm.focus();
});
runServerButton.addEventListener('click', function(event) {
    window.mdi.runServer(mode, options);
});
spawnTerminalButton.addEventListener('click', function(event) {
    window.mdi.spawnTerminal(mode, options);
});
