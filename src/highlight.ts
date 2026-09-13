import { StreamLanguage } from "@codemirror/language";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** 浅色稿纸上的墨水色，仍按 Godot / Dialogue Manager 分工 */
export const C = {
  text: "#24352c",
  comment: "#6d7d72",
  keyword: "#b4234a",
  control: "#9a2e6a",
  string: "#7a5b10",
  func: "#1d5fa8",
  number: "#1a7a5c",
  jump: "#b45a12",
  cue: "#1a7a5c",
  character: "#1a4f8a",
  symbol: "#4a5a78",
  member: "#2a5080",
  tag: "#8a5a18",
  error: "#b4234a",
};

const KEYWORDS = new Set([
  "if",
  "elif",
  "else",
  "while",
  "match",
  "when",
  "for",
  "func",
  "return",
  "var",
  "const",
  "class",
  "class_name",
  "extends",
  "signal",
  "await",
  "pass",
  "break",
  "continue",
  "and",
  "or",
  "not",
  "in",
  "is",
  "as",
  "true",
  "false",
  "null",
  "self",
  "super",
  "static",
  "void",
  "enum",
  "preload",
  "assert",
]);

const LINE_KEYWORDS = new Set([
  "if",
  "elif",
  "else",
  "while",
  "match",
  "when",
  "do",
  "set",
  "using",
  "import",
  "as",
]);

export type Seg = { text: string; color: string };

interface LineState {
  kind: string;
  named: boolean;
}

function eatIdent(stream: { match(r: RegExp): unknown }) {
  const hit = stream.match(/^[A-Za-z_\u00A0-\uFFFF][\w\u00A0-\uFFFF]*/);
  if (!hit) return null;
  return Array.isArray(hit) ? String(hit[0]) : "";
}

export const dialogueLanguage = StreamLanguage.define<LineState>({
  name: "dialogue",
  tokenTable: {
    goto: t.labelName,
    character: t.character,
    function: t.function(t.variableName),
  },
  startState: () => ({ kind: "", named: false }),
  token(stream, state) {
    if (stream.sol()) {
      state.kind = "";
      state.named = false;
      if (stream.match(/^[ \t]+/)) return null;
    }

    if (!state.kind) {
      if (stream.match(/^##?.*$/)) return "comment";
      if (stream.match(/^~/)) {
        state.kind = "cue";
        return "heading";
      }
      if (stream.match(/^=><|^=>/)) {
        state.kind = "goto";
        return "goto";
      }
      if (stream.match(/^%\d*/)) {
        state.kind = "random";
        return "number";
      }
      if (stream.match(/^- /)) {
        state.kind = "choice";
        return "heading";
      }
      if (stream.match(/^\| /)) {
        state.kind = "dialogue";
        return "keyword";
      }
      if (stream.match(/^(do!|do|set|\$>>|\$>)\b/)) {
        state.kind = "mut";
        return "keyword";
      }
      if (stream.match(/^(if|elif|else if|else|while|match|when|using|import)\b/)) {
        state.kind = "cond";
        return "keyword";
      }
      const char = stream.match(/^[^:#\n\\]+?:/);
      if (char) {
        state.kind = "dialogue";
        state.named = true;
        return "character";
      }
      state.kind = "dialogue";
    }

    if (state.kind === "cue") {
      stream.skipToEnd();
      return "heading";
    }

    if (stream.match(/^#.*$/)) return "comment";
    if (stream.match(/=>| =>< /) || stream.match(/^=><|^=>/)) {
      state.kind = "goto";
      return "goto";
    }
    if (stream.match(/^END!|^END\b/)) return "goto";
    if (stream.match(/^"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/)) return "string";
    if (stream.match(/^\{\{/)) return "atom";
    if (stream.match(/^\}\}/)) return "atom";
    if (stream.match(/^\[[^\]]*\]/)) return "tagName";
    if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^[A-Za-z_\u00A0-\uFFFF][\w\u00A0-\uFFFF]*(?=\s*\()/)) return "function";
    const ident = eatIdent(stream);
    if (ident !== null) {
      const word = ident;
      if (KEYWORDS.has(word) || LINE_KEYWORDS.has(word)) return "keyword";
      if (state.kind === "goto") return "goto";
      return "variableName";
    }
    if (stream.match(/^[()[\]{}.,:]=?|^[=!<>]=?|^[-+*/%]/)) return "operator";
    stream.next();
    return null;
  },
});

export const engineHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.comment, color: C.comment, fontStyle: "italic" },
    { tag: t.heading, color: C.cue, fontWeight: "bold" },
    { tag: t.keyword, color: C.keyword },
    { tag: t.string, color: C.string },
    { tag: t.content, color: C.text },
    { tag: t.character, color: C.character, fontWeight: "bold" },
    { tag: t.number, color: C.number },
    { tag: t.function(t.variableName), color: C.func },
    { tag: t.variableName, color: C.member },
    { tag: t.operator, color: C.symbol },
    { tag: t.atom, color: C.symbol },
    { tag: t.tagName, color: C.tag },
    { tag: t.labelName, color: C.jump },
    { tag: t.heading1, color: C.cue, fontWeight: "bold" },
    { tag: t.heading2, color: C.jump, fontWeight: "bold" },
    { tag: t.strong, color: C.text, fontWeight: "bold" },
    { tag: t.emphasis, color: C.text, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through", color: C.comment },
    { tag: t.processingInstruction, color: C.comment },
    { tag: t.meta, color: C.comment },
    { tag: t.quote, color: C.tag },
    { tag: t.list, color: C.cue },
  ]),
);

/** 给长图用：按行切成带色片段 */
export function tokenizeLine(line: string): Seg[] {
  const segs: Seg[] = [];
  let i = 0;
  const push = (end: number, color: string) => {
    if (end <= i) return;
    segs.push({ text: line.slice(i, end), color });
    i = end;
  };

  const ws = line.match(/^[ \t]*/)?.[0].length ?? 0;
  push(ws, C.text);

  const rest = () => line.slice(i);
  const matchHere = (re: RegExp) => {
    const m = rest().match(re);
    return m && m.index === 0 ? m[0] : null;
  };

  if (matchHere(/^#/)) {
    push(line.length, C.comment);
    return segs;
  }
  if (matchHere(/^~/)) {
    push(i + 1, C.cue);
    push(line.length, C.cue);
    return segs;
  }

  const goto = matchHere(/^=><|^=>/);
  if (goto) {
    push(i + goto.length, C.jump);
  }

  const rand = matchHere(/^%\d*/);
  if (rand) push(i + rand.length, C.number);

  const choice = matchHere(/^- /);
  if (choice) push(i + choice.length, C.cue);

  const pipe = matchHere(/^\| /);
  if (pipe) push(i + pipe.length, C.keyword);

  const mut = matchHere(/^(do!|do|set|\$>>|\$>)\b/);
  if (mut) push(i + mut.length, C.keyword);

  const cond = matchHere(/^(if|elif|else if|else|while|match|when|using|import)\b/);
  if (cond) push(i + cond.length, C.control);

  const speaker = matchHere(/^[^:#\n\\]+?:/);
  if (speaker && !mut && !cond && !goto) push(i + speaker.length, C.character);

  while (i < line.length) {
    const r = rest();
    const g = r.match(/^=><|^=>|=>/);
    if (g && (g.index === 0 || g[0] === "=>" || g[0] === "=><")) {
      const at = r.indexOf(g[0]);
      if (at > 0) {
        colorDialogueChunk(line, i, i + at, segs);
        i += at;
      }
      push(i + g[0].length, C.jump);
      continue;
    }
    const endWord = r.match(/^\s*END!|\s*END\b/);
    if (endWord && line.slice(0, i).includes("=>")) {
      const m = endWord[0];
      push(i + m.length, C.jump);
      continue;
    }
    const str = matchHere(/^"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/);
    if (str) {
      push(i + str.length, C.string);
      continue;
    }
    const interp = matchHere(/^\{\{|\}\}/);
    if (interp) {
      push(i + interp.length, C.symbol);
      continue;
    }
    const tag = matchHere(/^\[[^\]]*\]/);
    if (tag) {
      push(i + tag.length, C.tag);
      continue;
    }
    const num = matchHere(/^\d+(?:\.\d+)?/);
    if (num) {
      push(i + num.length, C.number);
      continue;
    }
    const fn = matchHere(/^[A-Za-z_\u00A0-\uFFFF][\w\u00A0-\uFFFF]*(?=\s*\()/);
    if (fn) {
      push(i + fn.length, C.func);
      continue;
    }
    const ident = matchHere(/^[A-Za-z_\u00A0-\uFFFF][\w\u00A0-\uFFFF]*/);
    if (ident) {
      const color =
        KEYWORDS.has(ident) || LINE_KEYWORDS.has(ident)
          ? C.keyword
          : line.slice(0, i).includes("=>")
            ? C.jump
            : C.member;
      push(i + ident.length, color);
      continue;
    }
    const op = matchHere(/^[()[\]{}.,:]|^[=!<>]=?|^[-+*/%]/);
    if (op) {
      push(i + op.length, C.symbol);
      continue;
    }
    push(i + 1, C.text);
  }
  return segs.length ? mergeSegs(segs) : [{ text: line, color: C.text }];
}

function colorDialogueChunk(line: string, from: number, to: number, segs: Seg[]) {
  let i = from;
  const chunk = line.slice(from, to);
  const tagRe = /\{\{|\}\}|\[[^\]]*\]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = tagRe.exec(chunk))) {
    if (m.index > last) segs.push({ text: chunk.slice(last, m.index), color: C.text });
    const color = m[0].startsWith("[") ? C.tag : m[0].startsWith("{{") || m[0] === "}}" ? C.symbol : C.string;
    segs.push({ text: m[0], color });
    last = m.index + m[0].length;
  }
  if (last < chunk.length) segs.push({ text: chunk.slice(last), color: C.text });
  i = to;
  void i;
}

function mergeSegs(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.color === s.color) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}
