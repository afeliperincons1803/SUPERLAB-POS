import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = process.argv[2];
const outputDir = process.argv[3];
await fs.mkdir(outputDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheets = await workbook.inspect({
  kind: "workbook,sheet,table,drawing",
  maxChars: 12000,
  tableMaxRows: 30,
  tableMaxCols: 12,
  tableMaxCellChars: 150,
});
await fs.writeFile(path.join(outputDir, "inspect.ndjson"), sheets.ndjson, "utf8");
const sheetInfo = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
await fs.writeFile(path.join(outputDir, "sheets.ndjson"), sheetInfo.ndjson, "utf8");

const names = [];
for (const line of sheetInfo.ndjson.split(/\r?\n/)) {
  if (!line.trim()) continue;
  try {
    const record = JSON.parse(line);
    const name = record.name || record.sheetName;
    if (name && !names.includes(name)) names.push(name);
  } catch {}
}
if (!names.length) {
  for (let index = 0; index < 20; index++) {
    try {
      const sheet = workbook.worksheets.getItemAt(index);
      if (sheet?.name) names.push(sheet.name);
    } catch {
      break;
    }
  }
}
for (let index = 0; index < names.length; index++) {
  const preview = await workbook.render({ sheetName: names[index], autoCrop: "all", scale: 1.3, format: "png" });
  await fs.writeFile(path.join(outputDir, `sheet-${index + 1}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({ names, outputDir }));
