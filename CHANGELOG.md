# Changelog

## 0.1.1

Addresses the automated community review of 0.1.0. No change in what the plugin does.

- **No longer lists every file in the vault.** Renaming a pasted image needs a name no other file has. 0.1.0 checked that by listing all vault files; 0.1.1 asks Obsidian's link resolution whether the name is taken, which gives the same guarantee. The review's "Vault Enumeration" note goes away.
- Removed a redundant type assertion flagged by the review's lint.

## 0.1.0

First release: Enter / Tab to add child and sibling nodes while typing, Enter to edit a selected node, + buttons on the selected node, automatic layout, Tidy button, nodes that fit their text, canvas search (Cmd/Ctrl+F), copy image nodes, rename images pasted into a canvas.
