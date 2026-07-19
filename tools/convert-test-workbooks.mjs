import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [structurePath, mappingPath, outputDir] = process.argv.slice(2);
if (!structurePath || !mappingPath || !outputDir) {
  throw new Error("Usage: node convert-test-workbooks.mjs <structure.xlsx> <mapping.xlsx> <output-dir>");
}

await fs.mkdir(outputDir, { recursive: true });

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function convert(sourcePath, outputName, previewPrefix) {
  const input = await FileBlob.load(sourcePath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const summary = await workbook.inspect({
    kind: "workbook,sheet,table",
    maxChars: 6000,
    tableMaxRows: 8,
    tableMaxCols: 16,
    tableMaxCellChars: 120,
  });
  console.log(`INSPECT ${path.basename(sourcePath)}\n${summary.ndjson}`);

  const sheets = workbook.worksheets.items;
  if (!sheets.length) throw new Error(`${sourcePath} contains no worksheet`);
  for (let index = 0; index < sheets.length; index += 1) {
    const sheet = sheets[index];
    const preview = await workbook.render({
      sheetName: sheet.name,
      autoCrop: "all",
      scale: 1,
      format: "png",
    });
    await fs.writeFile(
      path.join(outputDir, `${previewPrefix}-${index + 1}.png`),
      new Uint8Array(await preview.arrayBuffer()),
    );
  }

  const used = sheets[0].getUsedRange(true);
  const values = used ? used.values : [];
  const csv = values.map(row => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
  await fs.writeFile(path.join(outputDir, outputName), `\uFEFF${csv}`, "utf8");
  console.log(`EXPORTED ${outputName}: ${Math.max(values.length - 1, 0)} data rows, ${values[0]?.length || 0} columns`);
}

await convert(
  structurePath,
  "02_KAIKIRA_HGB_Berichtsstruktur_Bilanz_GuV.csv",
  "preview-structure",
);
await convert(
  mappingPath,
  "03_KAIKIRA_Mapping_SuSa_zu_HGB.csv",
  "preview-mapping",
);
