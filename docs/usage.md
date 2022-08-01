---
title: Usage
has_children: false
nav_order: 40
---

## {{ page.title }}

A logical series of actions is required to get the
MDI installed and running on the intended computer.

### Connect to a server (remote, node modes)

If you will run the MDI web server remotely, e.g.,
to take advantage of an HPC resource, your first
step is to click the **Connect** button, which 
executes an appropriate SSH command in the black
terminal window.  Log in as dictated by your server.

This step is not needed and not available in local mode.

As needed, you can type shell commands in the terminal window,
or click **Terminal** to open a separate shell in a new window.

### (Re)Install the MDI

Once you are connected, two new buttons will appear.
The first time you are working on a new target computer 
you must click **(Re)Install** to install the needed MDI repositories
and packages.

Usually, you can skip re-installation in future visits to the app.
However, if/when you want to update to a new version of R, you must
click (Re)Install again. You might also sometimes want to
force a hard update of all code.

The MDI requires many resources to run, so installation 
will take many minutes, especially on a Linux server where code
needs to be compiled. It will go much faster the second time. 

Watch the installation progress in the black terminal window - 
you will be ready to proceed when you see a command prompt
awaiting input.

### Start and use the server

Once the MDI is installed, simply click **Start** to launch the 
MDI Apps Framework, which will load into a web browser on the right
side of the app.

Notice the **tall vertical >/< button** in the middle or to the
left of the screen. This button toggles the visibility of the server
configuration and terminal panels during MDI use. The server is always
there and reporting its log stream, even when you hide it!

The desktop interface is a minimal web browser. You will
start with one Docs and one Apps tab. If desired, you can open 
additional Apps tabs running from the same server. Documentation links
in the framework and apps will load into the Docs tab.

Continue to use the MDI interface and data analysis apps. Please see
the documentation of the 
[MDI apps framework](/mdi-apps-framework)
for information on how to proceed once the interface is running.

### Stop the server and disconnect

When you are done working, click the tall vertical >/< button
to expose the server controls and click **Stop** to end your 
server session. In remote modes, click **Disconnect**
to end your SSH session. You must disconnect before re-connecting
to a different server.

You can also just use the normal window controls to close the desktop app,
with using the Stop and Disconnect buttons.
Any servers and jobs running on remote computers will terminate
once the SSH connection is dropped. 
