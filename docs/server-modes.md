---
title: "Server Modes"
has_children: false
nav_order: 20
---

{% include entity-box-style.html %}

## {{page.title}}

The MDI apps server can be launched on different computers
depending on your needs. In all cases, you access the data
analysis apps via a web browser embedded in the launcher app.

### Local Computer Mode 

**Local Computer** mode uses R to install the web server
on your desktop or laptop, so that the web browser and web
server both run on the same local computer.

<div class="entityBox outerBox">
    <p class='entityBoxLabel'>Local Desktop or Laptop Computer</p>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Web Browser</p>
        <p>user interface</p>
    </div>
    <div class="diagramArrow">&harr;</div>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Web Server</p>
        <p>performs computations</p>
    </div>
</div>

Local mode is responsive and secure, but you must manually transfer 
processed data files to your computer, or a provider needs to share
such files with you, e.g., via email.

### Remote Server Mode 

A **Remote Server** runs on a 
remote computer on its login host, either a high performance computing (HPC) resource
or a server dedicated to running the MDI. 
The local computer connects to the server via a secure SSH
tunnel.

<div class="entityBox outerBox">
    <p class='entityBoxLabel'>Remote Server Configuration</p>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Desktop or Laptop</p>
        <div class="entityBox inlineBox">
            <p class='entityBoxLabel'>Web Browser</p>
        </div>
    </div>
    <div class="inlineBox" style="text-align: center;">
        <div class="diagramArrow">&harr;</div>
        <div>SSH</div>
    </div>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Remote Server</p>
        <div class="entityBox inlineBox">
            <p class='entityBoxLabel'>Web Server</p>
            <p>runs on login node</p>
        </div>
    </div>
</div>

In Remote Server mode, you can use the Pipeline Runner to
execute Stage 1 pipelines and then analyze their output using Stage 2 apps on the same server. It is best for users with an HPC solution accessible by SSH, where the slightly more complex
installation is a good trade-off for the added capabilities afforded by running the MDI remotely.

### Cluster Node Mode 

**Cluster Node** mode is similar to Remote Server except that now
the web server runs on a worker node that is part of a remote server cluster using Slurm as its job scheduler. The server login node proxies web requests from the local computer to the cluster node, again using SSH.

<div class="entityBox outerBox">
    <p class='entityBoxLabel'>Remote Node Configuration</p>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Desktop or Laptop</p>
        <div class="entityBox inlineBox">
            <p class='entityBoxLabel'>Web Browser</p>
        </div>
    </div>
    <div class="inlineBox" style="text-align: center;">
        <div class="diagramArrow">&harr;</div>
        <div>SSH</div>
    </div>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Server Login Node</p>
        <div class="entityBox inlineBox">
            <p class='entityBoxLabel'>SSH proxy</p>
            <p>launch node job via Slurm</p>            
            <p>proxy to node via OpenSSH</p>
        </div>
    </div>
    <div class="inlineBox" style="text-align: center;">
        <div class="diagramArrow">&harr;</div>
        <div>SSH</div>
    </div>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Cluster Node</p>
        <div class="entityBox inlineBox">
            <p class='entityBoxLabel'>Web Server</p>
            <p>performs computations</p>
        </div>
    </div>
</div>

Cluster Node mode is best for users wishing to exploit the advantages of a remote
server whose configuration allows for computational processes to run on a dedicated node 
accessed via an authorized user account, e.g., the University of Michigan Great Lakes 
server cluster.
