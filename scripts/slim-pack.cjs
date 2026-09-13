const fs = require("fs");
const path = require("path");

const KEEP_LOCALES = new Set(["en-US.pak", "zh-CN.pak"]);
const DROP = [
  "LICENSES.chromium.html",
  "dxcompiler.dll",
  "dxil.dll",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
];

exports.default = async function slimPack(context) {
  const out = context.appOutDir;
  const loc = path.join(out, "locales");
  if (fs.existsSync(loc)) {
    for (const name of fs.readdirSync(loc)) {
      if (!KEEP_LOCALES.has(name)) fs.unlinkSync(path.join(loc, name));
    }
  }
  for (const name of DROP) {
    const p = path.join(out, name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
};
