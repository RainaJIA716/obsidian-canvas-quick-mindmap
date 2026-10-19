import { App, ItemView, KeymapEventHandler, Notice, SettingDefinitionItem, Platform, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, getLanguage, normalizePath, setIcon, setTooltip } from "obsidian";
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// ---------- Canvas internals (not part of the public API; shapes observed in Obsidian 1.14) ----------

interface BBox { minX: number; minY: number; maxX: number; maxY: number }

interface CanvasNode {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	isEditing: boolean;
	canvas: Canvas;
	nodeEl: HTMLElement;
	file?: TFile;
	text?: string;
	child?: { editor?: { cm?: EditorView }; editMode?: { focus(): void } };
	setText?(text: string): void;
	subpath?: string;
	setFile?(file: TFile, subpath: string, force: boolean): void;
	unloadChild?(): void;
	getData(): { type: string; text?: string; file?: string; label?: string; url?: string };
	moveAndResize(rect: { x: number; y: number; width: number; height: number }): void;
	attach(): void;
	render(): void;
	startEditing(): void;
	blur(): void;
	getBBox(): BBox;
}

interface CanvasEdge {
	from: { node: CanvasNode; side: string };
	to: { node: CanvasNode; side: string };
	getData(): { id: string; fromSide?: string; toSide?: string };
}

interface CanvasMenu {
	canvas: Canvas;
	menuEl: HTMLElement;
	render: (this: CanvasMenu, ...args: unknown[]) => unknown;
}

interface Canvas {
	nodes: Map<string, CanvasNode>;
	selection: Set<CanvasNode>;
	readonly: boolean;
	isDragging: boolean;
	wrapperEl: HTMLElement;
	canvasEl: HTMLElement;
	menu: CanvasMenu;
	config: { defaultTextNodeDimensions: { width: number; height: number } };
	getEdgesForNode(node: CanvasNode): CanvasEdge[];
	getIntersectingNodes(bbox: BBox): CanvasNode[];
	createTextNode(opts: {
		pos: { x: number; y: number };
		size: { width: number; height: number };
		text: string;
		focus: boolean;
		save: boolean;
	}): CanvasNode;
	importData(data: { nodes: unknown[]; edges: unknown[] }): void;
	selectOnly(node: CanvasNode): void;
	requestSave(): void;
	markDirty(node: CanvasNode): void;
	requestFrame(): void;
	panIntoView(bbox: BBox): void;
	panTo(x: number, y: number): void;
	zoomToBbox(bbox: BBox): void;
	zoom: number;
	zoomBreakpoint: number;
}

interface CanvasView extends ItemView {
	canvas: Canvas;
	file: TFile | null;
}

// ---------- Settings & strings ----------

interface Settings {
	autoLayout: boolean;
	enterInEdit: boolean;
	hGap: number;
	vGap: number;
	renamePasted: boolean;
	autoSize: boolean;
	maxWidth: number;
}

const DEFAULT_SETTINGS: Settings = {
	autoLayout: true,
	enterInEdit: true,
	hGap: 160,
	vGap: 20,
	renamePasted: true,
	autoSize: true,
	maxWidth: 320,
};

const STRINGS = {
	en: {
		addChild: "Add child node",
		addSibling: "Add sibling node",
		relayout: "Tidy mind map layout",
		tidyTip: "Tidy mind map",
		search: "Search canvas",
		searchTip: "Search canvas",
		searchPlaceholder: "Search this canvas…",
		searchPrev: "Previous",
		searchNext: "Next",
		searchClose: "Close search",
		searchNone: "No results",
		childTip: "Add child",
		siblingTip: "Add sibling",
		autoLayout: "Auto layout",
		autoLayoutDesc: "After adding a node, rearrange the whole branch tree so nodes never overlap. Turn off to keep your manual positions; new nodes are then placed in the nearest free spot.",
		enterInEdit: "Enter adds a child while typing",
		enterInEditDesc: "While editing a node, Enter adds a child and Shift+Enter inserts a line break (Tab adds a sibling). Turn off to keep Enter as a line break. Always off on mobile.",
		hGap: "Horizontal gap",
		hGapDesc: "Distance between a node and its children, in pixels. Below 160, Obsidian's curved edges start to loop back and cross each other.",
		vGap: "Vertical gap",
		vGapDesc: "Distance between sibling branches, in pixels.",
		renamePasted: "Rename attachments pasted into a canvas",
		renamePastedDesc: "Images and other files pasted or dropped into a canvas are renamed after the canvas (\"My map.png\", \"My map-1.png\"…), like Paste Image Rename does in notes. Only files the canvas actually uses are touched.",
		renamed: "Renamed to",
		renameFailed: "Could not rename",
		autoSize: "Fit nodes to their text",
		autoSizeDesc: "Mind map nodes (text nodes with an edge) grow and shrink with their text while you type, and when you add nodes or tidy. Nodes with images, code blocks, tables or headings keep their size.",
		maxWidth: "Maximum node width",
		maxWidthDesc: "Longer text wraps onto more lines instead of widening the node.",
		copyTip: "Copy image",
		copied: "Image copied",
		copyFailed: "Could not copy the image",
	},
	zh: {
		addChild: "添加子节点",
		addSibling: "添加同级节点",
		relayout: "整理导图布局",
		tidyTip: "整理导图",
		search: "搜索画布",
		searchTip: "搜索画布",
		searchPlaceholder: "搜索这个画布…",
		searchPrev: "上一个",
		searchNext: "下一个",
		searchClose: "关闭搜索",
		searchNone: "无结果",
		childTip: "添加子节点",
		siblingTip: "添加同级节点",
		autoLayout: "自动排版",
		autoLayoutDesc: "添加节点后，把整棵树重新排一遍，节点不会重叠。关掉则保留你手动摆的位置，新节点放在最近的空位。",
		enterInEdit: "输入时 Enter 新建子节点",
		enterInEditDesc: "编辑节点时，Enter 新建子节点，Shift+Enter 换行（Tab 新建同级节点）。关掉则 Enter 照常换行。手机上始终关闭。",
		hGap: "水平间距",
		hGapDesc: "节点和子节点之间的距离（像素）。小于 160 时，Obsidian 的弯曲连线会往回绕，看起来互相交叉。",
		vGap: "垂直间距",
		vGapDesc: "同级分支之间的距离（像素）。",
		renamePasted: "按画布名重命名粘贴的附件",
		renamePastedDesc: "粘贴或拖进画布的图片等附件，按画布名重命名（「导图.png」「导图-1.png」…），和笔记里 Paste Image Rename 的效果一样。只处理画布里真的用到的文件。",
		renamed: "已重命名为",
		renameFailed: "重命名失败",
		autoSize: "节点大小跟随文字",
		autoSizeDesc: "导图里的节点（有连线的文本节点）在输入、添加节点和整理时自动调整宽高以适应文字。含图片、代码块、表格、标题的节点不动。",
		maxWidth: "节点最大宽度",
		maxWidthDesc: "文字再长就换行，节点变高而不是继续变宽。",
		copyTip: "复制图片",
		copied: "已复制图片",
		copyFailed: "复制图片失败",
	},
};

type Strings = typeof STRINGS.en;

function t(): Strings {
	return getLanguage().startsWith("zh") ? STRINGS.zh : STRINGS.en;
}

type Action = "child" | "sibling";

function randomId(): string {
	let s = "";
	for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
	return s;
}

function isGroup(node: CanvasNode): boolean {
	return node.getData().type === "group";
}

function bboxOf(n: { x: number; y: number; width: number; height: number }): BBox {
	return { minX: n.x, minY: n.y, maxX: n.x + n.width, maxY: n.y + n.height };
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);

/**
 * Text as it reads on screen, for measuring. Null when the node holds something that renders much
 * bigger or differently than its characters (embeds, code, tables, headings, maths).
 */
function plainText(md: string): string | null {
	if (/!\[|```|~~~|\$\$|^\s*\||^\s*#{1,6}\s/m.test(md)) return null;
	return md
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, (_m, target: string) => target.split("#")[0].split("/").pop() ?? target)
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^(\s*)[-*+] \[[ xX]\] /gm, "$1☐ ")
		.replace(/^(\s*)[-*+] /gm, "$1• ")
		.replace(/^\s*> ?/gm, "")
		.replace(/(\*\*|__|~~|==|`)/g, "")
		.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1$2")
		.replace(/\n+$/, "");
}

// ---------- Link text helpers ----------

/** Names appear raw in wikilinks and URL-encoded in Markdown links. */
function nameForms(oldName: string, newName: string): [string, string][] {
	const forms: [string, string][] = [[oldName, newName]];
	if (encodeURI(oldName) !== oldName) forms.push([encodeURI(oldName), encodeURI(newName)]);
	return forms;
}

function mentions(text: string, name: string): boolean {
	return nameForms(name, name).some(([from]) => text.includes(from));
}

function replacements(text: string, oldName: string, newName: string): { from: number; to: number; insert: string }[] {
	const out: { from: number; to: number; insert: string }[] = [];
	for (const [from, to] of nameForms(oldName, newName)) {
		for (let i = text.indexOf(from); i >= 0; i = text.indexOf(from, i + from.length)) {
			out.push({ from: i, to: i + from.length, insert: to });
		}
	}
	return out.sort((a, b) => a.from - b.from);
}

function applyReplacements(text: string, changes: { from: number; to: number; insert: string }[]): string {
	let result = "";
	let pos = 0;
	for (const c of changes) {
		result += text.slice(pos, c.from) + c.insert;
		pos = c.to;
	}
	return result + text.slice(pos);
}

// ---------- Geometry helpers ----------

/** File nodes (images, notes) show their file name above the box. */
function labelSpace(n: CanvasNode): number {
	return n.file ? 30 : 0;
}

function unionBox(nodes: CanvasNode[]): BBox {
	return {
		minX: Math.min(...nodes.map((n) => n.x)),
		minY: Math.min(...nodes.map((n) => n.y - labelSpace(n))),
		maxX: Math.max(...nodes.map((n) => n.x + n.width)),
		maxY: Math.max(...nodes.map((n) => n.y + n.height)),
	};
}

function overlaps(a: BBox, b: BBox, margin: number): boolean {
	return a.minX < b.maxX + margin && b.minX < a.maxX + margin && a.minY < b.maxY + margin && b.minY < a.maxY + margin;
}

function moveBy(n: CanvasNode, dx: number, dy: number) {
	n.moveAndResize({ x: n.x + dx, y: n.y + dy, width: n.width, height: n.height });
}

// ---------- Tree helpers ----------

function parentOf(node: CanvasNode): CanvasNode | null {
	const edge = node.canvas.getEdgesForNode(node).find((e) => e.to.node === node && e.from.node !== node && !isGroup(e.from.node));
	return edge ? edge.from.node : null;
}

function outgoing(node: CanvasNode): CanvasNode[] {
	const out: CanvasNode[] = [];
	for (const e of node.canvas.getEdgesForNode(node)) {
		const target = e.to.node;
		if (e.from.node === node && target !== node && !isGroup(target) && !out.includes(target)) out.push(target);
	}
	return out;
}

function rootOf(node: CanvasNode): CanvasNode {
	const seen = new Set<CanvasNode>([node]);
	let cur = node;
	for (;;) {
		const p = parentOf(cur);
		if (!p || seen.has(p)) return cur;
		seen.add(p);
		cur = p;
	}
}

/** Children of every node in the tree under `root`, each node claimed once (breadth first), ordered top to bottom. */
function buildTree(root: CanvasNode): Map<CanvasNode, CanvasNode[]> {
	const tree = new Map<CanvasNode, CanvasNode[]>();
	const claimed = new Set<CanvasNode>([root]);
	const queue = [root];
	while (queue.length) {
		const n = queue.shift() as CanvasNode;
		const kids = outgoing(n).filter((c) => !claimed.has(c));
		kids.sort((a, b) => a.y - b.y || a.x - b.x);
		kids.forEach((c) => claimed.add(c));
		tree.set(n, kids);
		queue.push(...kids);
	}
	return tree;
}

function subtreeBottom(node: CanvasNode, tree: Map<CanvasNode, CanvasNode[]>): number {
	let bottom = node.y + node.height;
	for (const c of tree.get(node) ?? []) bottom = Math.max(bottom, subtreeBottom(c, tree));
	return bottom;
}

// ---------- Plugin ----------

export default class CanvasQuickMindmap extends Plugin {
	settings: Settings = { ...DEFAULT_SETTINGS };
	private restoreMenu: (() => void) | null = null;

	async onload() {
		await this.loadSettings();
		const s = t();

		this.addCommand({ id: "add-child", name: s.addChild, icon: "arrow-right-from-line", checkCallback: (checking) => this.commandFor("child", checking) });
		this.addCommand({ id: "add-sibling", name: s.addSibling, icon: "arrow-down-from-line", checkCallback: (checking) => this.commandFor("sibling", checking) });
		this.addCommand({
			id: "search-canvas",
			name: s.search,
			icon: "search",
			checkCallback: (checking) => {
				const view = this.activeCanvasView();
				if (!view) return false;
				if (!checking) this.openSearch(view);
				return true;
			},
		});
		this.addCommand({
			id: "tidy-layout",
			name: s.relayout,
			icon: "list-tree",
			checkCallback: (checking) => {
				const canvas = this.activeCanvas();
				if (!canvas) return false;
				if (!checking) this.tidy(canvas);
				return true;
			},
		});

		// Typing inside a node: the editor lives in an iframe, so its keys never reach window listeners.
		this.registerEditorExtension([
			Prec.highest(EditorView.domEventHandlers({ keydown: (evt, view) => this.onEditorKeydown(evt, view) })),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) this.onEditorChanged(update.view);
			}),
		]);

		// A node selected but not being edited.
		this.registerDomEvent(window, "keydown", (evt) => this.onWindowKeydown(evt), { capture: true });
		this.registerEvent(
			this.app.workspace.on("window-open", (_w, win) => {
				this.registerDomEvent(win, "keydown", (evt) => this.onWindowKeydown(evt), { capture: true });
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.patchMenuFromOpenCanvas();
			this.addTidyButtons();
			// Registered after load: the vault fires "create" for every existing file while it starts up.
			this.registerEvent(this.app.vault.on("create", (file) => this.onFileCreated(file)));
		});
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.patchMenuFromOpenCanvas();
				this.addTidyButtons();
			}),
		);
		this.register(() => activeDocument.querySelectorAll(".cqm-tidy").forEach((el) => el.remove()));

		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {
		this.restoreMenu?.();
		for (const [view, handler] of this.findKeys) view.scope?.unregister(handler);
		for (const search of this.searches.values()) search.close(false);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<Settings> | null);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ---------- Entry points ----------

	private activeCanvasView(): CanvasView | null {
		const view = this.app.workspace.getActiveViewOfType(ItemView);
		return view && view.getViewType() === "canvas" && (view as CanvasView).canvas ? (view as CanvasView) : null;
	}

	private activeCanvas(): Canvas | null {
		const view = this.app.workspace.getActiveViewOfType(ItemView);
		if (!view || view.getViewType() !== "canvas") return null;
		return (view as CanvasView).canvas ?? null;
	}

	private singleSelected(canvas: Canvas): CanvasNode | null {
		if (canvas.readonly || canvas.selection.size !== 1) return null;
		const [node] = canvas.selection;
		if (!node || !("getData" in node) || isGroup(node)) return null; // edges can be selected too
		return node;
	}

	private commandFor(action: Action, checking: boolean): boolean {
		const canvas = this.activeCanvas();
		const node = canvas && this.singleSelected(canvas);
		if (!node) return false;
		if (!checking) this.add(node, action);
		return true;
	}

	private onWindowKeydown(evt: KeyboardEvent) {
		if (evt.defaultPrevented || evt.isComposing || evt.key === "Process") return;
		if (isFindKey(evt)) {
			const view = this.activeCanvasView();
			if (!view) return;
			evt.preventDefault();
			evt.stopPropagation();
			this.openSearch(view);
			return;
		}
		if (evt.ctrlKey || evt.metaKey || evt.altKey || evt.shiftKey) return;
		// Tab adds a child; Enter opens the selected node for editing (siblings: Enter while typing, or the + below).
		const action: Action | "edit" | null = evt.key === "Tab" ? "child" : evt.key === "Enter" ? "edit" : null;
		if (!action) return;

		const canvas = this.activeCanvas();
		if (!canvas) return;
		const target = evt.target as HTMLElement | null;
		const doc = canvas.wrapperEl.ownerDocument;
		const onCanvas = !target || target === doc.body || canvas.wrapperEl.contains(target);
		if (!onCanvas || target?.closest("input, textarea, [contenteditable='true']")) return;
		if (doc.querySelector(".modal-container, .suggestion-container, .menu")) return;

		const node = this.singleSelected(canvas);
		if (!node || node.isEditing) return;
		evt.preventDefault();
		evt.stopPropagation();
		if (action === "edit") this.edit(node);
		else this.add(node, action);
	}

	/**
	 * Start editing a node with the cursor at the end of its text. The canvas only focuses an editor
	 * once it is on screen, so bring the node into view first, then wait for the editor to take focus.
	 */
	private edit(node: CanvasNode) {
		node.canvas.panIntoView(node.getBBox());
		window.setTimeout(() => {
			node.startEditing();
			const deadline = Date.now() + 1000;
			const settle = () => {
				const cm = node.child?.editor?.cm;
				if (cm?.hasFocus) {
					cm.dispatch({ selection: { anchor: cm.state.doc.length } });
					return;
				}
				if (!node.isEditing || Date.now() >= deadline) return;
				node.child?.editMode?.focus();
				window.setTimeout(settle, 50);
			};
			window.setTimeout(settle, 50);
		}, 0);
	}

	private onEditorKeydown(evt: KeyboardEvent, view: EditorView): boolean {
		if (evt.isComposing || evt.key === "Process" || view.composing) return false;
		if (isFindKey(evt)) {
			const node = this.nodeForEditor(view);
			const canvasView = node && this.app.workspace.getLeavesOfType("canvas").map((l) => l.view as CanvasView).find((v) => v.canvas === node.canvas);
			if (!node || !canvasView) return false;
			evt.preventDefault();
			node.blur();
			this.openSearch(canvasView);
			return true;
		}
		if (evt.ctrlKey || evt.metaKey || evt.altKey || evt.shiftKey) return false;
		let action: Action | null = null;
		// While typing: Enter goes one level deeper, Tab adds the next node on the same level.
		if (evt.key === "Tab") action = "sibling";
		else if (evt.key === "Enter" && this.settings.enterInEdit && !Platform.isMobile) action = "child";
		if (!action) return false;

		const node = this.nodeForEditor(view);
		if (!node || node.canvas.readonly) return false;
		// Let an open autocomplete (links, tags…) take the key.
		if (activeDocument.querySelector(".suggestion-container") || view.dom.ownerDocument.querySelector(".suggestion-container")) return false;

		evt.preventDefault();
		this.add(node, action);
		return true;
	}

	private nodeForEditor(view: EditorView): CanvasNode | null {
		for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
			const canvas = (leaf.view as CanvasView).canvas;
			if (!canvas) continue;
			for (const node of canvas.nodes.values()) {
				if (node.isEditing && node.child?.editor?.cm === view) return node;
			}
		}
		return null;
	}

	// ---------- Fitting nodes to their text ----------

	private fitTimers = new Map<CanvasNode, number>();

	/** Typing in a mind map node: resize it (debounced) and, with auto layout, re-flow its tree. */
	private onEditorChanged(view: EditorView) {
		if (!this.settings.autoSize) return;
		const node = this.nodeForEditor(view);
		if (!node || node.canvas.readonly || !node.canvas.getEdgesForNode(node).length) return;
		window.clearTimeout(this.fitTimers.get(node));
		this.fitTimers.set(
			node,
			window.setTimeout(() => {
				this.fitTimers.delete(node);
				if (!this.fit(node, view.state.doc.toString())) return;
				const parent = parentOf(node);
				if (this.settings.autoLayout && (parent || outgoing(node).length)) this.layout(rootOf(node));
				node.canvas.requestSave();
			}, 120),
		);
	}

	/** Resize a plain-text node to its text. Returns true if its size changed. */
	fit(node: CanvasNode, text = node.text): boolean {
		if (typeof text !== "string" || node.getData().type !== "text") return false;
		const size = this.measure(node.canvas, text);
		if (!size || (Math.abs(size.width - node.width) < 1 && Math.abs(size.height - node.height) < 1)) return false;
		// Keep the vertical centre, so edges and siblings move as little as possible.
		const y = node.y + (node.height - size.height) / 2;
		node.moveAndResize({ x: node.x, y, width: size.width, height: size.height });
		return true;
	}

	/**
	 * Size of a text node showing `text`, measured with a hidden copy of the node's own DOM inside the
	 * canvas so the theme's fonts and paddings apply. Null for text this can't measure faithfully.
	 */
	measure(canvas: Canvas, text: string): { width: number; height: number } | null {
		const plain = plainText(text);
		if (plain === null) return null;
		const host = canvas.canvasEl.createDiv({ cls: "canvas-node cqm-measure" });
		try {
			const container = host.createDiv({ cls: "canvas-node-container" });
			const preview = container
				.createDiv({ cls: "canvas-node-content markdown-embed" })
				.createDiv({ cls: "markdown-embed-content" })
				.createDiv({ cls: "markdown-preview-view markdown-rendered" });
			const p = preview.createDiv({ cls: "markdown-preview-sizer markdown-preview-section" }).createEl("p", { text: plain || " " });

			const cs = getComputedStyle(preview);
			const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
			const border = container.offsetWidth - container.clientWidth || 2;
			const padY = 32; // a one-line node is the native 60px tall

			p.addClass("cqm-measure-natural");
			const natural = p.offsetWidth + 2; // a little slack so the line never wraps from rounding
			const contentWidth = Math.min(natural, Math.max(40, this.settings.maxWidth - padX - border));
			p.removeClass("cqm-measure-natural");
			p.addClass("cqm-measure-wrap");
			p.setCssStyles({ width: `${contentWidth}px` });
			const height = p.offsetHeight;

			return {
				// An empty node stays wide enough to read as a box to type into.
				width: Math.max(plain ? 80 : 120, Math.ceil(contentWidth + padX + border)),
				height: Math.max(60, Math.ceil(height + padY)),
			};
		} finally {
			host.remove();
		}
	}

	// ---------- Adding nodes ----------

	add(from: CanvasNode, action: Action) {
		const canvas = from.canvas;
		const parent = action === "child" ? from : parentOf(from);
		if (from.isEditing) from.blur();
		if (this.settings.autoSize) this.fit(from);

		const size = (this.settings.autoSize && this.measure(canvas, "")) || { ...canvas.config.defaultTextNodeDimensions };
		const node = canvas.createTextNode({ pos: { x: from.x, y: from.y + from.height + this.settings.vGap }, size, text: "", focus: false, save: false });

		if (parent) {
			canvas.importData({
				nodes: [],
				edges: [{ id: randomId(), fromNode: parent.id, fromSide: "right", toNode: node.id, toSide: "left" }],
			});
		}

		if (parent && this.settings.autoLayout) {
			this.layout(rootOf(parent), { node, after: action === "sibling" ? from : null });
		} else {
			this.placeFreely(node, from, action);
		}

		canvas.requestSave();
		// Focus after the current key event has finished, or the old editor keeps it.
		window.setTimeout(() => {
			// Same steps as the native createTextNode({ focus: true }): the editor only exists once rendered.
			node.attach();
			node.render();
			canvas.selectOnly(node);
			node.startEditing();
			canvas.panIntoView(node.getBBox());
		}, 0);
	}

	/** Without auto layout: put the node next to its relatives, then step down past anything in the way. */
	private placeFreely(node: CanvasNode, from: CanvasNode, action: Action) {
		const { hGap, vGap } = this.settings;
		let x: number;
		let y: number;
		if (action === "child") {
			const tree = buildTree(from);
			const siblings = (tree.get(from) ?? []).filter((c) => c !== node);
			x = from.x + from.width + hGap;
			if (siblings.length) {
				const last = siblings[siblings.length - 1];
				y = subtreeBottom(last, tree) + vGap;
			} else {
				y = from.y + (from.height - node.height) / 2;
			}
		} else {
			const tree = buildTree(from);
			x = from.x;
			y = subtreeBottom(from, tree) + vGap;
		}
		for (let i = 0; i < 200; i++) {
			const box = bboxOf({ x, y, width: node.width, height: node.height });
			const hits = node.canvas.getIntersectingNodes(box).filter((n) => n !== node && !isGroup(n));
			if (!hits.length) break;
			y = Math.max(...hits.map((n) => n.y + n.height)) + vGap;
		}
		node.moveAndResize({ x, y, width: node.width, height: node.height });
	}

	/** Classic right-hand tree: children stacked in a column, centred on their parent. The root stays where it is. */
	layout(root: CanvasNode, insert?: { node: CanvasNode; after: CanvasNode | null }) {
		const { hGap, vGap } = this.settings;
		const tree = buildTree(root);

		if (insert) {
			for (const kids of tree.values()) {
				const i = kids.indexOf(insert.node);
				if (i < 0) continue;
				kids.splice(i, 1);
				const at = insert.after ? kids.indexOf(insert.after) : -1;
				if (at >= 0) kids.splice(at + 1, 0, insert.node);
				else kids.push(insert.node);
			}
		}

		const heights = new Map<CanvasNode, number>();
		const heightOf = (n: CanvasNode): number => {
			const kids = tree.get(n) ?? [];
			let total = 0;
			kids.forEach((c, i) => (total += heightOf(c) + (i ? vGap : 0)));
			const h = Math.max(labelSpace(n) + n.height, total);
			heights.set(n, h);
			return h;
		};
		heightOf(root);

		const place = (n: CanvasNode, x: number, top: number) => {
			const h = heights.get(n) as number;
			const y = top + (h - labelSpace(n) - n.height) / 2 + labelSpace(n);
			if (Math.abs(n.x - x) > 0.5 || Math.abs(n.y - y) > 0.5) n.moveAndResize({ x, y, width: n.width, height: n.height });
			const kids = tree.get(n) ?? [];
			let total = 0;
			kids.forEach((c, i) => (total += (heights.get(c) as number) + (i ? vGap : 0)));
			let cursor = top + (h - total) / 2;
			const cx = x + n.width + hGap;
			for (const c of kids) {
				place(c, cx, cursor);
				cursor += (heights.get(c) as number) + vGap;
			}
		};
		place(root, root.x, root.y - labelSpace(root) - ((heights.get(root) as number) - labelSpace(root) - root.height) / 2);
	}

	/**
	 * Tidy the whole canvas: every tree is laid out again with its edges running right → left,
	 * trees are pushed apart so they don't overlap, and loose nodes sitting on top of a tree are moved below it.
	 */
	tidy(canvas: Canvas) {
		const { vGap } = this.settings;
		const gap = vGap * 3;
		const roots = [...canvas.nodes.values()].filter((n) => !isGroup(n) && !parentOf(n) && outgoing(n).length);
		roots.sort((a, b) => a.y - b.y || a.x - b.x);

		const trees: CanvasNode[][] = [];
		for (const root of roots) {
			const tree = buildTree(root);
			this.straightenEdges(canvas, tree);
			if (this.settings.autoSize) for (const n of tree.keys()) this.fit(n);
			this.layout(root);
			trees.push([...tree.keys()]);
		}

		// Trees, top to bottom: push each one down until it clears the ones already placed.
		const placed: BBox[] = [];
		for (const members of trees) {
			let box = unionBox(members);
			for (;;) {
				const hit = placed.find((p) => overlaps(p, box, gap));
				if (!hit) break;
				const dy = hit.maxY + gap - box.minY;
				members.forEach((n) => moveBy(n, 0, dy));
				box = unionBox(members);
			}
			placed.push(box);
		}

		// Loose nodes (no edges at all) that ended up under a tree go below everything.
		const inTree = new Set(trees.flat());
		let bottom = placed.length ? Math.max(...placed.map((b) => b.maxY)) : 0;
		for (const n of canvas.nodes.values()) {
			if (inTree.has(n) || isGroup(n) || canvas.getEdgesForNode(n).length) continue;
			const box = bboxOf(n);
			if (!placed.some((p) => overlaps(p, box, 0))) continue;
			const left = Math.min(...placed.filter((p) => overlaps(p, box, 0)).map((p) => p.minX));
			n.moveAndResize({ x: left, y: bottom + gap, width: n.width, height: n.height });
			bottom = n.y + n.height;
		}
		canvas.requestSave();
	}

	/** Parent → child edges leave from the parent's right side and enter the child's left side. */
	private straightenEdges(canvas: Canvas, tree: Map<CanvasNode, CanvasNode[]>) {
		const changed: unknown[] = [];
		for (const [parent, kids] of tree) {
			for (const e of canvas.getEdgesForNode(parent)) {
				if (e.from.node !== parent || !kids.includes(e.to.node)) continue;
				if (e.from.side === "right" && e.to.side === "left") continue;
				changed.push({ ...e.getData(), fromSide: "right", toSide: "left" });
			}
		}
		if (changed.length) canvas.importData({ nodes: [], edges: changed });
	}

	// ---------- Tidy button in the canvas controls (right-hand toolbar) ----------

	private findKeys = new Map<CanvasView, KeymapEventHandler>();

	private addTidyButtons() {
		for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
			const view = leaf.view as CanvasView;
			// Mod+F belongs to "Search current file", whose hotkey fires before any plugin listener.
			// The canvas view's own scope is consulted first, so claim the key there.
			if (view.scope && !this.findKeys.has(view)) {
				this.findKeys.set(
					view,
					view.scope.register(["Mod"], "f", () => {
						this.openSearch(view);
						return false;
					}),
				);
			}
			const controls = view.containerEl.querySelector(".canvas-controls");
			if (!view.canvas || !controls || controls.querySelector(".cqm-tidy")) continue;
			const group = createDiv({ cls: "canvas-control-group mod-raised cqm-tidy" });
			const searchItem = group.createDiv({ cls: "canvas-control-item" });
			setIcon(searchItem, "search");
			setTooltip(searchItem, `${t().searchTip} (${Platform.isMacOS ? "⌘" : "Ctrl+"}F)`, { placement: "left" });
			searchItem.addEventListener("click", () => this.openSearch(view));
			const item = group.createDiv({ cls: "canvas-control-item" });
			setIcon(item, "list-tree");
			setTooltip(item, t().tidyTip, { placement: "left" });
			item.addEventListener("click", () => this.tidy(view.canvas));
			// After the zoom group, before undo / redo.
			const anchor = controls.children[2] ?? null;
			controls.insertBefore(group, anchor);
		}
	}

	// ---------- Search ----------

	searches = new Map<CanvasView, CanvasSearch>();

	openSearch(view: CanvasView) {
		let search = this.searches.get(view);
		if (!search) {
			search = new CanvasSearch(this.app, view, () => this.searches.delete(view));
			this.searches.set(view, search);
		}
		search.open();
	}

	// ---------- Renaming attachments pasted into a canvas ----------
	// Paste Image Rename only looks at Markdown views, so in a canvas it gives up ("No active file found").

	private onFileCreated(file: TAbstractFile) {
		if (!this.settings.renamePasted || !(file instanceof TFile)) return;
		if (file.extension === "md" || file.extension === "canvas") return;
		if (Date.now() - file.stat.ctime > 1000) return;
		const view = this.app.workspace.getActiveViewOfType(ItemView);
		if (!view || view.getViewType() !== "canvas") return;
		const { canvas, file: canvasFile } = view as CanvasView;
		if (!canvas || !canvasFile) return;
		void this.renameIfUsedBy(file, canvas, canvasFile);
	}

	private async renameIfUsedBy(file: TFile, canvas: Canvas, canvasFile: TFile) {
		const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
		const originalPath = file.path;
		const oldName = file.name;
		const usedByCanvas = () =>
			[...canvas.nodes.values()].some((n) => n.file === file || (typeof n.text === "string" && mentions(n.text, oldName)));

		// Only touch files this canvas adopts within a few seconds; anything else (sync, other plugins) is left alone.
		let deadline = Date.now() + 5000;
		while (!usedByCanvas()) {
			if (Date.now() >= deadline) return;
			await sleep(100);
		}
		if (file.path !== originalPath || this.app.vault.getAbstractFileByPath(originalPath) !== file) return; // someone else moved it

		const target = this.uniquePath(file, canvasFile.basename);
		const s = t();
		try {
			await this.app.fileManager.renameFile(file, target);
		} catch (e) {
			console.error("[canvas-quick-mindmap]", e);
			new Notice(`${s.renameFailed}: ${file.name}`);
			return;
		}
		deadline = Date.now() + 5000;
		while (this.app.vault.getAbstractFileByPath(target) !== file) {
			if (Date.now() >= deadline) {
				new Notice(`${s.renameFailed}: ${file.name}`);
				return;
			}
			await sleep(25);
		}
		// File nodes hold the TFile, so their saved path is already right, but their label and image
		// still show the old name: the node only reloads when handed a different file. Force it.
		// Links inside text nodes are not updated by Obsidian at all, so rewrite them here —
		// through the editor if the node is open.
		for (const n of canvas.nodes.values()) {
			if (n.file === file) {
				n.setFile?.(file, n.subpath ?? "", true);
				n.unloadChild?.();
				canvas.markDirty(n);
				continue;
			}
			if (typeof n.text !== "string" || !mentions(n.text, oldName)) continue;
			const cm = n.isEditing ? n.child?.editor?.cm : undefined;
			if (cm) {
				const doc = cm.state.doc.toString();
				const changes = replacements(doc, oldName, file.name);
				if (changes.length) cm.dispatch({ changes });
			} else if (n.setText) {
				n.setText(applyReplacements(n.text, replacements(n.text, oldName, file.name)));
			}
		}
		canvas.requestFrame();
		canvas.requestSave();
		new Notice(`${s.renamed} ${file.name}`);
	}

	/**
	 * "<stem>.ext", then "<stem>-1.ext"… — a name no other file in the vault has, so a short link to it is never
	 * ambiguous. Asked of Obsidian's own link resolution (which finds a file by name anywhere), not by listing files.
	 */
	private uniquePath(file: TFile, stem: string): string {
		const folder = file.parent && !file.parent.isRoot() ? file.parent.path + "/" : "";
		for (let i = 0; ; i++) {
			const name = `${stem}${i ? `-${i}` : ""}.${file.extension}`;
			const path = normalizePath(folder + name);
			const sameName = this.app.metadataCache.getFirstLinkpathDest(name, "");
			if ((!sameName || sameName === file) && !this.app.vault.getAbstractFileByPath(path)) return path;
		}
	}

	// ---------- Copying an image node (desktop only) ----------

	/**
	 * Puts the image on the clipboard as PNG — the one image type the clipboard API takes — so a paste
	 * anywhere gets the full-size picture. PNGs go as they are; other formats are decoded and re-encoded.
	 */
	private async copyImage(file: TFile) {
		const s = t();
		try {
			const png = await this.toPng(file);
			await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
			new Notice(s.copied);
		} catch (e) {
			console.error("[canvas-quick-mindmap] copy failed", e);
			new Notice(s.copyFailed);
		}
	}

	/** Decoded from the file's bytes, not the <img> on the page: that one taints a canvas and refuses to export. */
	private async toPng(file: TFile): Promise<Blob> {
		const ext = file.extension.toLowerCase();
		const bytes = await this.app.vault.readBinary(file);
		if (ext === "png") return new Blob([bytes], { type: "image/png" });
		const type = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
		let source: ImageBitmap | HTMLImageElement;
		if (type === "image/svg+xml") {
			// createImageBitmap cannot decode SVG; an <img> from a blob URL can.
			const url = URL.createObjectURL(new Blob([bytes], { type }));
			const img = new Image();
			img.src = url;
			await img.decode().finally(() => URL.revokeObjectURL(url));
			source = img;
		} else {
			source = await createImageBitmap(new Blob([bytes], { type }));
		}
		const el = createEl("canvas");
		el.width = source.width;
		el.height = source.height;
		el.getContext("2d")?.drawImage(source, 0, 0);
		if (source instanceof ImageBitmap) source.close();
		const blob = await new Promise<Blob | null>((resolve) => el.toBlob(resolve, "image/png"));
		if (!blob) throw new Error("could not encode PNG");
		return blob;
	}

	// ---------- Buttons on the selected node ----------

	private patchMenuFromOpenCanvas() {
		if (this.restoreMenu) return;
		for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
			const canvas = (leaf.view as CanvasView).canvas;
			if (canvas?.menu) {
				this.patchMenu(canvas.menu);
				return;
			}
		}
	}

	private patchMenu(menu: CanvasMenu) {
		const proto = Object.getPrototypeOf(menu) as CanvasMenu;
		const original = proto.render;
		const decorate = (m: CanvasMenu) => this.decorateMenu(m);
		const patched = function (this: CanvasMenu, ...args: unknown[]): unknown {
			const result: unknown = original.call(this, ...args);
			try {
				decorate(this);
			} catch (e) {
				console.error("[canvas-quick-mindmap]", e);
			}
			return result;
		};
		proto.render = patched;
		this.restoreMenu = () => {
			if (proto.render === patched) proto.render = original;
			for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
				(leaf.view as CanvasView).canvas?.wrapperEl.querySelectorAll(".cqm-node-button").forEach((el) => el.remove());
			}
		};
		menu.render(true);
	}

	/** Runs whenever the canvas redraws its selection menu, i.e. whenever the selection changes. */
	private decorateMenu(menu: CanvasMenu) {
		const canvas = menu.canvas;
		const node = canvas.isDragging ? null : this.singleSelected(canvas);
		canvas.wrapperEl.querySelectorAll(".cqm-node-button").forEach((el) => {
			if (!node || el.parentElement !== node.nodeEl) el.remove();
		});
		if (!node || node.nodeEl.querySelector(".cqm-node-button")) return;
		const s = t();
		const make = (cls: string, icon: string, tip: string, placement: "right" | "bottom" | "top", run: () => void) => {
			const btn = node.nodeEl.createDiv({ cls: `cqm-node-button ${cls}`, attr: { role: "button" } });
			setIcon(btn, icon);
			setTooltip(btn, tip, { placement });
			// Keep the canvas from treating these as a drag, a selection change or a double-click on the node.
			for (const type of ["pointerdown", "mousedown", "dblclick"]) btn.addEventListener(type, (evt) => evt.stopPropagation());
			btn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				run();
			});
		};
		make("cqm-add cqm-add-child", "plus", s.childTip, "right", () => this.add(node, "child"));
		make("cqm-add cqm-add-sibling", "plus", s.siblingTip, "bottom", () => this.add(node, "sibling"));
		const file = node.file;
		if (file && IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) {
			make("cqm-copy", "copy", s.copyTip, "top", () => void this.copyImage(file));
		}
	}
}

function isFindKey(evt: KeyboardEvent): boolean {
	const mod = Platform.isMacOS ? evt.metaKey && !evt.ctrlKey : evt.ctrlKey && !evt.metaKey;
	return mod && !evt.shiftKey && !evt.altKey && evt.key.toLowerCase() === "f";
}

/**
 * Find bar for one canvas view, built from Obsidian's own find-bar classes so it looks native.
 * Matching nodes are highlighted, the rest dimmed; Enter / Shift+Enter walk through them.
 */
class CanvasSearch {
	private containerEl: HTMLElement | null = null;
	private inputEl: HTMLInputElement | null = null;
	private countEl: HTMLElement | null = null;
	private hits: CanvasNode[] = [];
	private index = -1;
	private noteText = new Map<string, string>();
	private timer = 0;

	constructor(private app: App, private view: CanvasView, private onClosed: () => void) {}

	private get canvas(): Canvas {
		return this.view.canvas;
	}

	open() {
		if (!this.containerEl) this.build();
		void this.loadNotes();
		this.inputEl?.focus();
		this.inputEl?.select();
		if (this.inputEl?.value) this.run();
	}

	private build() {
		const s = t();
		const container = (this.containerEl = this.view.contentEl.createDiv({ cls: "document-search-container cqm-search", prepend: true }));
		const bar = container.createDiv({ cls: "document-search" });
		const inputWrap = bar.createDiv({ cls: "search-input-container document-search-input" });
		const input = (this.inputEl = inputWrap.createEl("input", { type: "text", placeholder: s.searchPlaceholder }));
		this.countEl = inputWrap.createDiv({ cls: "document-search-count" });
		const buttons = bar.createDiv({ cls: "document-search-buttons" });
		const button = (icon: string, tip: string, run: () => void, cls = "clickable-icon document-search-button") => {
			const el = buttons.createEl("button", { cls });
			setIcon(el, icon);
			setTooltip(el, tip, { placement: "top" });
			el.addEventListener("mousedown", (evt) => evt.preventDefault()); // keep focus in the input
			el.addEventListener("click", (evt) => {
				evt.preventDefault();
				run();
			});
		};
		button("arrow-up", `${s.searchPrev} (Shift+Enter)`, () => this.step(-1));
		button("arrow-down", `${s.searchNext} (Enter)`, () => this.step(1));
		button("x", `${s.searchClose} (Esc)`, () => this.close(true), "clickable-icon document-search-close-button");

		input.addEventListener("input", () => {
			window.clearTimeout(this.timer);
			this.timer = window.setTimeout(() => this.run(), 120);
		});
		input.addEventListener("keydown", (evt) => {
			if (evt.isComposing || evt.key === "Process") return; // an input method is still choosing characters
			if (evt.key === "Enter") {
				evt.preventDefault();
				evt.stopPropagation();
				if (this.hits.length && this.index < 0) this.run(); // typed and hit Enter before the debounce
				this.step(evt.shiftKey ? -1 : 1);
			} else if (evt.key === "Escape") {
				evt.preventDefault();
				evt.stopPropagation();
				this.close(true);
			}
		});
	}

	/** Contents of Markdown notes shown in file nodes, so their text is searchable too. */
	private async loadNotes() {
		const files = new Set<TFile>();
		for (const n of this.canvas.nodes.values()) if (n.file && n.file.extension === "md") files.add(n.file);
		await Promise.all(
			[...files].map(async (f) => {
				try {
					this.noteText.set(f.path, await this.app.vault.cachedRead(f));
				} catch {
					/* unreadable: search its name only */
				}
			}),
		);
		if (this.inputEl?.value) this.run(false);
	}

	private textOf(n: CanvasNode): string {
		const d = n.getData();
		const parts = [d.text, d.label, d.url];
		if (n.file) parts.push(n.file.basename, this.noteText.get(n.file.path));
		else if (d.file) parts.push(d.file);
		return parts.filter((p): p is string => typeof p === "string").join("\n").toLowerCase();
	}

	private run(jump = true) {
		const query = (this.inputEl?.value ?? "").trim().toLowerCase();
		this.clearMarks();
		this.hits = [];
		this.index = -1;
		if (!query) {
			this.setCount("");
			return;
		}
		const words = query.split(/\s+/);
		this.hits = [...this.canvas.nodes.values()]
			.filter((n) => {
				const text = this.textOf(n);
				return words.every((w) => text.includes(w));
			})
			.sort((a, b) => a.y - b.y || a.x - b.x);
		this.canvas.wrapperEl.addClass("cqm-searching");
		this.hits.forEach((n) => n.nodeEl.addClass("cqm-search-hit"));
		if (!this.hits.length) {
			this.setCount(t().searchNone);
			return;
		}
		if (jump) this.step(1);
		else this.setCount(`0 / ${this.hits.length}`);
	}

	private step(delta: number) {
		if (!this.hits.length) return;
		this.hits[this.index]?.nodeEl.removeClass("cqm-search-current");
		this.index = (this.index + delta + this.hits.length) % this.hits.length;
		const node = this.hits[this.index];
		node.nodeEl.addClass("cqm-search-current");
		this.setCount(`${this.index + 1} / ${this.hits.length}`);
		this.reveal(node);
	}

	/** Centre the node; zoom in first if the canvas is too far out to read it. */
	private reveal(node: CanvasNode) {
		const c = this.canvas;
		const box = node.getBBox();
		if (c.zoom < c.zoomBreakpoint + 0.5) {
			const pad = 300;
			c.zoomToBbox({ minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad });
		} else {
			c.panTo((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
		}
	}

	private setCount(text: string) {
		this.countEl?.setText(text);
	}

	private clearMarks() {
		this.canvas.wrapperEl.removeClass("cqm-searching");
		this.canvas.wrapperEl.querySelectorAll(".cqm-search-hit, .cqm-search-current").forEach((el) => el.removeClass("cqm-search-hit", "cqm-search-current"));
	}

	/** `keepCurrent`: leave the result you were on selected, so Enter edits it straight away. */
	close(keepCurrent: boolean) {
		window.clearTimeout(this.timer);
		const current = this.hits[this.index];
		this.clearMarks();
		this.containerEl?.remove();
		this.containerEl = this.inputEl = this.countEl = null;
		this.onClosed();
		if (keepCurrent && current && this.canvas.nodes.has(current.id)) {
			this.canvas.selectOnly(current);
			this.canvas.wrapperEl.focus();
		}
	}
}

type ToggleKey = "autoLayout" | "enterInEdit" | "autoSize" | "renamePasted";
type SliderKey = "hGap" | "vGap" | "maxWidth";
type SettingSpec =
	| { kind: "toggle"; key: ToggleKey; name: string; desc: string }
	| { kind: "slider"; key: SliderKey; name: string; desc: string; min: number; max: number; step: number };

function settingSpecs(): SettingSpec[] {
	const s = t();
	return [
		{ kind: "toggle", key: "autoLayout", name: s.autoLayout, desc: s.autoLayoutDesc },
		{ kind: "toggle", key: "enterInEdit", name: s.enterInEdit, desc: s.enterInEditDesc },
		{ kind: "slider", key: "hGap", name: s.hGap, desc: s.hGapDesc, min: 80, max: 400, step: 10 },
		{ kind: "slider", key: "vGap", name: s.vGap, desc: s.vGapDesc, min: 0, max: 200, step: 10 },
		{ kind: "toggle", key: "autoSize", name: s.autoSize, desc: s.autoSizeDesc },
		{ kind: "slider", key: "maxWidth", name: s.maxWidth, desc: s.maxWidthDesc, min: 160, max: 800, step: 20 },
		{ kind: "toggle", key: "renamePasted", name: s.renamePasted, desc: s.renamePastedDesc },
	];
}

class SettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CanvasQuickMindmap) {
		super(app, plugin);
	}

	/** 1.13+: declarative settings, searchable from the settings window. Values go through plugin.settings. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return settingSpecs().map((spec) =>
			spec.kind === "toggle"
				? { name: spec.name, desc: spec.desc, control: { type: "toggle", key: spec.key, defaultValue: DEFAULT_SETTINGS[spec.key] } }
				: {
						name: spec.name,
						desc: spec.desc,
						control: { type: "slider", key: spec.key, min: spec.min, max: spec.max, step: spec.step, defaultValue: DEFAULT_SETTINGS[spec.key] },
					},
		);
	}

	/** Before 1.13 (minAppVersion is 1.8.7). */
	display() {
		const { containerEl } = this;
		containerEl.empty();
		for (const spec of settingSpecs()) {
			const row = new Setting(containerEl).setName(spec.name).setDesc(spec.desc);
			if (spec.kind === "toggle") {
				const key = spec.key;
				row.addToggle((tg) =>
					tg.setValue(this.plugin.settings[key]).onChange(async (v) => {
						this.plugin.settings[key] = v;
						await this.plugin.saveSettings();
					}),
				);
			} else {
				const key = spec.key;
				row.addSlider((sl) =>
					sl
						.setLimits(spec.min, spec.max, spec.step)
						.setValue(this.plugin.settings[key])
						.onChange(async (v) => {
							this.plugin.settings[key] = v;
							await this.plugin.saveSettings();
						}),
				);
			}
		}
	}
}
