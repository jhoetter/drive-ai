# Slash command catalog (UI and agent)

These are the product-level commands from the drive-ai prompt. The web UI can surface them in comment/composer fields; the agent uses the same names via MCP/CLI where implemented.

| Command        | Purpose                          | Status |
|----------------|----------------------------------|--------|
| `/upload`      | Open upload flow for current folder | Planned (wire to file input) |
| `/new doc`     | Create Office doc via host       | Requires hofOS `openOfficeEditor` |
| `/new sheet`   | Create spreadsheet via host      | Same |
| `/new slides`  | Create presentation via host     | Same |
| `/share`       | Open share dialog                | Planned |
| `/move`        | Move selected items              | Planned |
| `/summarize`   | Summarize selection              | Agent/LLM |
| `/find`        | Focus search                     | Can map to search route |
| `/attach`      | Attach to workflow               | Cross-product |
| `/request access` | Create access request         | API: `access-request:create` |

Server commands (command bus) implemented in [packages/server/src/services/command-dispatch.ts](../packages/server/src/services/command-dispatch.ts) include: `folder:create`, `file:trash`, `file:restore`, `permission:grant`, `permission:create-link`, `access-request:create`, `access-request:approve`, `comment:create`, `file:set-label`.
