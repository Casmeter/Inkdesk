import { Decoration, MatchDecorator, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { Project } from "./store";

function namesMatch(fileName: string, want: string) {
  const a = fileName.replace(/\.(dialogue|txt|md)$/i, "").toLowerCase();
  const b = want.replace(/\.(dialogue|txt|md)$/i, "").toLowerCase();
  return a === b || fileName.toLowerCase() === want.toLowerCase();
}

export function findTitlePos(text: string, name: string): number | null {
  const want = name.trim();
  let offset = 0;
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*~\s+([^#\n]+)/);
    if (m && m[1].trim() === want) return offset + line.search(/~/);
    offset += line.length + 1;
  }
  return null;
}

export function resolveJump(
  project: Project,
  currentText: string,
  currentId: string | null,
  target: string,
): { id: string; pos: number } | null {
  if (/^END!?$/i.test(target)) return null;
  const slash = target.indexOf("/");
  const filePart = slash >= 0 ? target.slice(0, slash) : null;
  const title = slash >= 0 ? target.slice(slash + 1) : target;

  if (!filePart) {
    const here = findTitlePos(currentText, title);
    if (here != null && currentId) return { id: currentId, pos: here };
    for (const node of project.nodes) {
      if (node.kind !== "file") continue;
      const pos = findTitlePos(node.content, title);
      if (pos != null) return { id: node.id, pos };
    }
    return null;
  }

  const file = project.nodes.find((n) => n.kind === "file" && namesMatch(n.name, filePart));
  if (!file) return null;
  const pos = findTitlePos(file.content, title);
  if (pos == null) return null;
  return { id: file.id, pos };
}

export function dialogueJumps(host: {
  enabled: () => boolean;
  project: () => Project;
  currentId: () => string | null;
  open: (id: string, pos: number) => void;
  toast: (msg: string) => void;
}): Extension {
  const matcher = new MatchDecorator({
    regexp: /(=><?)\s*([^\s#]+)/g,
    decoration: (match) => {
      const target = match[2];
      if (/^END!?$/i.test(target)) {
        return Decoration.mark({ class: "cm-jump-end" });
      }
      return Decoration.mark({
        class: "cm-jump-link",
        attributes: {
          "data-jump": target,
          title: `转到 ~ ${target}`,
        },
      });
    },
  });

  return ViewPlugin.fromClass(
    class {
      decorations;
      constructor(view: Parameters<typeof matcher.createDeco>[0]) {
        this.decorations = host.enabled() ? matcher.createDeco(view) : Decoration.none;
      }
      update(u: ViewUpdate) {
        if (!host.enabled()) {
          this.decorations = Decoration.none;
          return;
        }
        this.decorations = matcher.updateDeco(u, this.decorations);
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        click(event, view) {
          if (!host.enabled()) return false;
          const el = (event.target as HTMLElement | null)?.closest?.(".cm-jump-link") as HTMLElement | null;
          if (!el) return false;
          if (view.state.selection.main.from !== view.state.selection.main.to) return false;
          const target = el.getAttribute("data-jump");
          if (!target) return false;
          const hit = resolveJump(host.project(), view.state.doc.toString(), host.currentId(), target);
          if (!hit) {
            host.toast(`找不到 ${target}`);
            return true;
          }
          event.preventDefault();
          host.open(hit.id, hit.pos);
          return true;
        },
      },
    },
  );
}
