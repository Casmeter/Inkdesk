import { C, tokenizeLine } from "./highlight";

export async function exportLongImages(opts: {
  text: string;
  title: string;
  linesPerImage: number;
  fontSize: number;
  align: CanvasTextAlign;
  syntax: boolean;
}) {
  const { text, title, linesPerImage, fontSize, align, syntax } = opts;
  await document.fonts.load(`500 ${fontSize}px "InkKai"`);
  await document.fonts.ready;

  const all = text.replace(/\r\n/g, "\n").split("\n");
  const per = Math.max(1, Math.floor(linesPerImage));
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += per) chunks.push(all.slice(i, i + per));
  if (!chunks.length) chunks.push([""]);

  const lineHeight = Math.round(fontSize * 1.85);
  const padX = 72;
  const padTop = 88;
  const padBot = 64;

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("无法创建画布");
  measure.font = `500 ${fontSize}px "InkKai"`;

  let maxW = 640;
  for (const line of all) {
    maxW = Math.max(maxW, measure.measureText(line.replace(/\t/g, "    ")).width);
  }
  const width = Math.min(1200, Math.max(720, Math.ceil(maxW + padX * 2)));

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "");
  let index = 0;
  for (const chunk of chunks) {
    const height = padTop + padBot + chunk.length * lineHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.scale(2, 2);
    ctx.fillStyle = "#c7edcc";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#163a6d";
    ctx.fillRect(0, 0, 6, height);

    ctx.font = `500 13px "InkKai"`;
    ctx.fillStyle = "#3d6b4f";
    ctx.textAlign = "left";
    ctx.fillText(title, padX, 42);
    ctx.fillText(`${index + 1} / ${chunks.length}`, width - padX - 48, 42);

    ctx.font = `500 ${fontSize}px "InkKai"`;
    ctx.textBaseline = "top";
    chunk.forEach((raw, row) => {
      const line = raw.replace(/\t/g, "    ");
      const y = padTop + row * lineHeight;
      if (!syntax) {
        ctx.fillStyle = C.text;
        ctx.textAlign = align;
        const x = align === "center" ? width / 2 : align === "right" ? width - padX : padX;
        ctx.fillText(line, x, y);
        return;
      }
      let x = padX;
      if (align === "center" || align === "right") {
        const total = tokenizeLine(raw).reduce((w, s) => w + ctx.measureText(s.text.replace(/\t/g, "    ")).width, 0);
        x = align === "center" ? (width - total) / 2 : width - padX - total;
      }
      ctx.textAlign = "left";
      for (const seg of tokenizeLine(raw)) {
        const piece = seg.text.replace(/\t/g, "    ");
        ctx.fillStyle = seg.color;
        ctx.fillText(piece, x, y);
        x += ctx.measureText(piece).width;
      }
    });

    await downloadCanvas(canvas, `${safe(title)}-${stamp}-${index + 1}.png`);
    index += 1;
  }
}

function safe(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_") || "稿";
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  return new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      resolve();
    }, "image/png");
  });
}
