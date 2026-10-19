# Canvas Quick Mindmap — community listing

Paste these into community.obsidian.md. Search (in the app and on the website)
only looks at the **name + short description**, so the short description is
written for search; About is written to convince.

## Short description (≤200, 189 chars)

Keyboard mind mapping and brainstorming on Canvas: Enter/Tab add child and sibling nodes, auto layout tree, tidy edges, nodes resize to fit text, search/find, copy and rename pasted images.

Why this wording (checked against the 2026-10 registry with `search_rank.py`,
app-search rules: every word must appear as a substring, results sorted by
downloads, this plugin counted at 0 downloads):

- Reachable by 29 of 32 test queries; 19 of them have fewer than 5 matching
  plugins, so a new plugin can still be in the top 5 — e.g. "canvas keyboard",
  "canvas auto layout", "canvas tidy", "canvas search", "canvas find",
  "canvas auto resize", "canvas copy image", "canvas rename image",
  "canvas brainstorm", "mind map search".
- The first version (the manifest's original text) was reachable by 10 / top 5
  for 6.
- "xmind" and "canvas outline" are not covered: the plugin doesn't do those.

## About (≤1000, plain text)

The backend field is plain text: Markdown list markers and emphasis are not
rendered, so this is written as short paragraphs. Paste everything between the
lines.

---

Canvas is a great place to think, but building a mind map in it is slow: create a card, drag it into place, drag an edge, resize, repeat. Canvas Quick Mindmap turns that into typing.

While editing a node, Enter adds a child to the right and Tab adds a sibling below. Each new node is connected, placed in a tidy tree and opened for typing. On a selected node, Enter edits it. Round + buttons next to the selected node do the same with a tap, on phones too.

Nodes grow and shrink with their text. The Tidy button in the canvas toolbar re-lays out every tree, straightens the edges and pulls overlapping trees apart; one undo restores everything.

Cmd/Ctrl+F searches the canvas: card text, group labels, links, file names and embedded notes.

Image nodes get a copy button, and images pasted into a canvas are renamed after it, with links updated.

It is still a plain .canvas file. English and Chinese interface.

---

## Categories (≤3, first is primary)

1. Canvas — if offered; otherwise Editing
2. Interface
3. Images

## Screenshots

Desktop (1200×800): `desktop-1200x800.png` (rendered from `../hero.svg`).

No phone screenshot yet: the + buttons and the toolbar work on mobile, but the
main value is keyboard-driven.

## GitHub

- Description: same as the short description.
- Topics: obsidian-plugin, obsidian, canvas, mindmap, mind-map, brainstorming
