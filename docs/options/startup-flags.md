---
title: Startup Flags
parent: Configuration Options
has_children: false
nav_order: 50
---

## {{page.title}}

The following yes/no options determine how your MDI server will start.

### Developer Mode

If checked, the MDI web server will launch
in `Developer Mode`, which provides access to powerful
code development tools within the web interface. 
End users should leave this option unchecked.

### Quick Start

The default behavior of `mdi::run()` is to check all
MDI repositories for updates prior to 
launching the server. This is recommended so that your
codebase will always be up to date.

If you would like to manage the installation yourself, you 
can get the MDI web page up and running a few seconds
faster if you check the `Quick Start` option. 
