const modeInputs = document.serverMode.mode;
const modeForms = document.getElementsByClassName('modeOptions');

let mode = null;
let setServerMode = function(mode){
    window.mdi.setTitle(mode)
    window.mdi.log("HIT " + mode)
    window.mdi.log(mode.toLowerCase() + "Options")
    for (var i = 0; i < modeForms.length; i++) {
        modeForms[i].style.display = 'none';
    }
    document.getElementById(mode.toLowerCase() + "Options").style.display = 'block';
}
setServerMode("Remote")


for (var i = 0; i < modeInputs.length; i++) {
    modeInputs[i].addEventListener('change', function() {
        setServerMode(this.value)
    });
}


// const setButton = document.getElementById('btn')
// const titleInput = document.getElementById('title')
// setButton.addEventListener('click', () => {
//     const title = titleInput.value
//     window.electronAPI.setTitle(title)
// });

// const sshButton = document.getElementById('ssh')
// const password = document.getElementById('password')
// const nClicksP = document.getElementById('nClicks')
// let nClicks = 0;
// sshButton.addEventListener('click', () => {
//     console.log("sshButton click")
//     nClicks += 1;
//     nClicksP.innerText = nClicks
//     window.ssh.tunnel(password.value)
// });

// const sshData = document.getElementById('ssh-data')
// window.electronAPI.sshData((_event, value) => {
//     sshData.innerText = sshData.innerText + value
// })

