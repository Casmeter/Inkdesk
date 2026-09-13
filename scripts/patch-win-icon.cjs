const fs = require("fs");
const path = require("path");
const resedit = require("resedit");

const exePath = process.argv[2];
const iconPath = process.argv[3];
if (!exePath || !iconPath) {
  console.error("usage: node patch-win-icon.cjs <exe> <ico>");
  process.exit(1);
}

const buffer = fs.readFileSync(exePath);
const executable = resedit.NtExecutable.from(buffer);
const res = resedit.NtExecutableResource.from(executable);
const viList = resedit.Resource.VersionInfo.fromEntries(res.entries);
const vi = viList.length > 0 ? viList[0] : resedit.Resource.VersionInfo.createEmpty();
const languages = vi.getAllLanguagesForStringValues();
const lang = languages.length > 0 ? languages[0] : { lang: 0x0409, codepage: 1200 };
const groups = resedit.Resource.IconGroupEntry.fromEntries(res.entries);
const iconId = groups.length > 0 ? groups[0].id : 1;
const iconFile = resedit.Data.IconFile.from(fs.readFileSync(iconPath));
resedit.Resource.IconGroupEntry.replaceIconsForResource(
  res.entries,
  iconId,
  lang.lang,
  iconFile.icons.map((icon) => icon.data),
);
res.outputResource(executable);
fs.writeFileSync(exePath, Buffer.from(executable.generate()));
console.log(`PATCHED ${path.resolve(exePath)} id=${iconId} lang=${lang.lang}`);
