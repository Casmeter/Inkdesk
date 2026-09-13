export type DayPoint = { day: string; chars: number };

export function drawStatsChart(canvas: HTMLCanvasElement, series: DayPoint[]) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 720;
  const cssH = canvas.clientHeight || 360;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 52, r: 18, t: 28, b: 42 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;
  const max = Math.max(1, ...series.map((p) => p.chars));
  const barW = Math.max(6, (w / series.length) * 0.55);

  ctx.fillStyle = "#0c1422";
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.strokeStyle = "#24344c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + h);
  ctx.lineTo(pad.l + w, pad.t + h);
  ctx.stroke();

  ctx.fillStyle = "#8b8478";
  ctx.font = "12px InkKai, serif";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = Math.round((max * (ticks - i)) / ticks);
    const y = pad.t + (h * i) / ticks;
    ctx.fillText(String(v), 10, y + 4);
    ctx.strokeStyle = "#1a2740";
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
  }

  series.forEach((p, i) => {
    const x = pad.l + ((i + 0.5) * w) / series.length;
    const bh = (p.chars / max) * h;
    ctx.fillStyle = p.chars ? "#2d6a4f" : "#182338";
    ctx.fillRect(x - barW / 2, pad.t + h - bh, barW, bh);
  });

  ctx.beginPath();
  series.forEach((p, i) => {
    const x = pad.l + ((i + 0.5) * w) / series.length;
    const y = pad.t + h - (p.chars / max) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#c4a574";
  ctx.lineWidth = 2;
  ctx.stroke();

  series.forEach((p, i) => {
    const x = pad.l + ((i + 0.5) * w) / series.length;
    const y = pad.t + h - (p.chars / max) * h;
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    const showLabel = i === 0 || i === series.length - 1 || i % 2 === 0;
    if (showLabel) {
      ctx.fillStyle = "#8b8478";
      ctx.font = "11px InkKai, serif";
      ctx.textAlign = "center";
      ctx.fillText(p.day.slice(5).replace("-", "/"), x, pad.t + h + 18);
    }
    if (p.chars && (i === series.length - 1 || p.chars === max)) {
      ctx.fillStyle = "#d8d2c4";
      ctx.font = "11px InkKai, serif";
      ctx.textAlign = "center";
      ctx.fillText(String(p.chars), x, y - 10);
    }
  });
  ctx.textAlign = "left";
}
