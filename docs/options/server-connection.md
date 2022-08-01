---
title: Remote Server Connection
parent: Configuration Options
has_children: false
nav_order: 30
---

## {{page.title}}

The MDI Desktop App makes it easy to to connect
to a remote HPC server, like UM Great Lakes. Simply 
provide a valid user login and server address.

### Username **

Provide the name of a user that has SSH access to the
computer specified by Server Domain.
You must possess all credentials required to log into
the server as this user.

### Server Domain **

Provide the complete domain name (but nothing else)
for the remote computer that will serve this installation of the MDI.

**Examples**
- greatlakes.arc-ts.umich.edu
- my-mdi.io

### Identify Key File (advanced)

If supported by your server, you may provide
the complete local path to a secure SSH key file, which
will allow you to log into the server without having
to type a password.

Please consult your server administrator for how to set up an SSH key.

SSH keys are not supported by UM Great Lakes.
