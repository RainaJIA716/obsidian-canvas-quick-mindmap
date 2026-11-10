# Changelog

## Unreleased

- **Auto-size never splits a word.** A node is at least as wide as its longest word ("Macro" no longer shows as "Mac / ro"), growing past the max width if a single word needs it. Text is now measured beside a paragraph of a real node on screen, so custom themes and fonts no longer make nodes a few pixels too narrow.
- **Nodes are no longer shrunk while the canvas is hidden.** Measuring text in a hidden canvas (background tab, switching workspaces or desktops) read every width as 0, so fitted nodes collapsed to 80x60. Measuring now waits until the canvas is visible.
- **Renaming a pasted attachment only rewrites whole links.** Renaming `1.png` no longer touches `image-1.png` in text nodes.
- Cmd+F opens canvas search on iPad / iPhone with a hardware keyboard (it expected Ctrl+F there).
- Typing in ordinary notes no longer scans canvas nodes when no canvas is open.
- Disabling the plugin removes its toolbar buttons from popout windows too.
- Closed canvases are no longer kept in memory by the find key and search bar.

## 0.1.1

Addresses the automated community review of 0.1.0. No change in what the plugin does.

- **No longer lists every file in the vault.** Renaming a pasted image needs a name no other file has. 0.1.0 checked that by listing all vault files; 0.1.1 asks Obsidian's link resolution whether the name is taken, which gives the same guarantee. The review's "Vault Enumeration" note goes away.
- Removed a redundant type assertion flagged by the review's lint.

## 0.1.0

First release: Enter / Tab to add child and sibling nodes while typing, Enter to edit a selected node, + buttons on the selected node, automatic layout, Tidy button, nodes that fit their text, canvas search (Cmd/Ctrl+F), copy image nodes, rename images pasted into a canvas.
