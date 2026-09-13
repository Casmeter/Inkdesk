export type NodeKind = "file" | "folder";

export type DocNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  name: string;
  content: string;
  updatedAt: number;
};

export type Settings = {
  markdown: boolean;
  fontSize: number;
  align: "left" | "center" | "right";
  linesPerImage: number;
  seedDialogue: boolean;
};

export const DIALOGUE_SEED = "~ start\n\n";

function defaultSettings(): Settings {
  return {
    markdown: false,
    fontSize: 18,
    align: "left",
    linesPerImage: 24,
    seedDialogue: true,
  };
}

export type Project = {
  name: string;
  nodes: DocNode[];
  activeId: string | null;
  settings: Settings;
  carets?: Record<string, { cursor: number; scroll: number }>;
};

import { readStore, writeStore } from "./persist";

const STARTER = `~ start
# Tab 缩进会原样保留。写完直接复制，粘贴进 Godot Dialogue Manager。

角色: 先写这一行就好。
角色: 语法会像编辑器一样变色——标题、跳转、条件、说话人。

if some_flag
	角色: 只有条件成立时才会说到这里。
	do unlock_door()
	set some_flag = true

- 继续
	=> next
- 先到这里
	=> END

~ next
角色: （深吸一口气。）
=> END
`;

function uid() {
  return crypto.randomUUID();
}

export function defaultProject(): Project {
  const folder: DocNode = {
    id: uid(),
    parentId: null,
    kind: "folder",
    name: "第一幕",
    content: "",
    updatedAt: Date.now(),
  };
  const file: DocNode = {
    id: uid(),
    parentId: folder.id,
    kind: "file",
    name: "开始.dialogue",
    content: STARTER,
    updatedAt: Date.now(),
  };
  return {
    name: "我的剧本",
    nodes: [folder, file],
    activeId: file.id,
    settings: defaultSettings(),
  };
}

export async function loadProject(): Promise<Project> {
  const raw = await readStore("project.json");
  if (!raw) {
    const fresh = defaultProject();
    await writeStore("project.json", JSON.stringify(fresh));
    return fresh;
  }
  try {
    const data = JSON.parse(raw) as Project;
    if (!Array.isArray(data.nodes)) throw new Error("no nodes");
    if (!data.settings) data.settings = defaultSettings();
    if (data.settings.seedDialogue === undefined) data.settings.seedDialogue = true;
    if (!data.carets) data.carets = {};
    return data;
  } catch {
    const bak = window.inkdesk ? await window.inkdesk.readData("project.json.bak") : null;
    if (bak) {
      try {
        const data = JSON.parse(bak) as Project;
        if (Array.isArray(data.nodes)) return data;
      } catch {
        /* keep going */
      }
    }
    throw new Error("稿件文件损坏，未覆盖原文件");
  }
}

export function saveProject(project: Project) {
  const raw = JSON.stringify(project);
  void writeStore("project.json", raw);
}

export function childrenOf(project: Project, parentId: string | null) {
  return project.nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, "zh");
    });
}

export function getNode(project: Project, id: string | null) {
  return project.nodes.find((n) => n.id === id) ?? null;
}

export function addNode(project: Project, kind: NodeKind, parentId: string | null): DocNode {
  const node: DocNode = {
    id: uid(),
    parentId,
    kind,
    name: kind === "folder" ? "新文件夹" : project.settings.seedDialogue !== false ? "未命名.dialogue" : "未命名",
    content: kind === "file" ? (project.settings.seedDialogue !== false ? DIALOGUE_SEED : "") : "",
    updatedAt: Date.now(),
  };
  project.nodes.push(node);
  if (kind === "file") project.activeId = node.id;
  saveProject(project);
  return node;
}

export function removeNode(project: Project, id: string) {
  const drop = new Set<string>();
  const walk = (target: string) => {
    drop.add(target);
    for (const n of project.nodes) if (n.parentId === target) walk(n.id);
  };
  walk(id);
  project.nodes = project.nodes.filter((n) => !drop.has(n.id));
  if (project.carets) {
    for (const gone of drop) delete project.carets[gone];
  }
  if (project.activeId && drop.has(project.activeId)) {
    const first = project.nodes.find((n) => n.kind === "file");
    project.activeId = first?.id ?? null;
  }
  saveProject(project);
}

export function countChars(text: string) {
  return [...text.replace(/\s/g, "")].length;
}
