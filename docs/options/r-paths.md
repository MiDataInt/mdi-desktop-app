---
title: R Paths
parent: Configuration Options
has_children: false
nav_order: 20
---

## {{page.title}}

The MDI requires that R be installed and available to run
on the computer that acts as the web server. In addition
to telling the desktop how to access R, the following options
let you create different MDI installations based on potentially
multiple versions of R on the same computer.

If these options are left blank, 'Rscript' or 'Rscript.exe' 
must already be available via the `PATH` environment variable,
however, it is recommended to explicitly set the R path.

### Rscript Path (local mode)

If provided, `Rscript Path` must be a full path to a valid
'Rscript' or 'Rscript.exe' executable file.

**Examples**

- **Windows**: C:\Program Files\R\R-4.1.0\bin\Rscript.exe
- **Mac or Linux**: /path/to/R-4.1.0/bin/Rscript

### R Load Command (remote, node modes)

If provided, `R Load Command` will be called on a remote
server prior to attempting to launch the MDI. 
R Load Command must make 'Rscript' available 
via the system <code>PATH</code> environment variable.

**Examples**

- module load R/4.1.0 (e.g., on Great Lakes)
- export PATH=/path/to/R-4.1.0:$PATH
