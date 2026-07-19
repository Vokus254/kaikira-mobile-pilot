import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, match => match.slice(1))), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);

const storage = new Map();
const context = {
  console,
  Date,
  Intl,
  URL,
  URLSearchParams,
  ArrayBuffer,
  Blob,
  DataView,
  DecompressionStream,
  Response,
  TextDecoder,
  Uint8Array,
  encodeURIComponent,
  decodeURIComponent,
  fetch:async () => { throw new Error("Network access is disabled in tests"); },
  setInterval:() => 0,
  clearInterval:() => {},
  setTimeout,
  clearTimeout,
  document:{
    hidden:false,
    getElementById:() => null,
    querySelectorAll:() => [],
  },
  localStorage:{
    getItem:key => storage.get(key) ?? null,
    setItem:(key,value) => storage.set(key,String(value)),
    removeItem:key => storage.delete(key),
  },
};
context.window = context;
context.window.addEventListener = () => {};
vm.createContext(context);
new vm.Script(scripts[0], { filename:"index.html#main" }).runInContext(context);

const testDir = path.join(root, "Testdateien", "Test 2");
const read = name => fs.readFileSync(path.join(testDir,name), "utf8");
const readArrayBuffer = name => {
  const override = name.startsWith("02_") ? process.env.KAIKIRA_STRUCTURE_XLSX : process.env.KAIKIRA_MAPPING_XLSX;
  const buffer = fs.readFileSync(override || path.join(testDir,name));
  return buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
};

assert.equal(context.window.projectData.trialBalance.rows.length, 0, "empty state must contain no trial-balance rows");
assert.equal(context.window.projectData.balanceSheet, null, "empty state must not synthesize a balance sheet");
assert.equal(context.window.projectData.incomeStatement, null, "empty state must not synthesize an income statement");

assert.equal(context.importTrialBalance(read("01_KAIKIRA_Test_SuSa_Industrie_AG_2026.csv"), "susa.csv"), 86);
assert.equal(context.window.projectData.balanceSheet, null, "financial release stays blocked before structure and mapping");
assert.equal(context.importReportStructure(read("02_KAIKIRA_HGB_Berichtsstruktur_Bilanz_GuV.csv"), "structure.csv"), 72);
assert.equal(new Set(context.window.projectData.reportStructure.rows.map(row => row.target7)).size, 72);
assert.ok(context.window.projectData.reportStructure.rows.every(row => [1,2,3,4,5,6,7].every(level => Object.hasOwn(row.levels, `ausweis${level}`))));

assert.equal(context.importConfirmedMapping(read("03_KAIKIRA_Mapping_SuSa_zu_HGB.csv"), "mapping.csv"), 86);
const pd = context.window.projectData;
assert.equal(pd.mapping.validation.status, "VALID", pd.mapping.validation.errors.join("\n"));
assert.deepEqual({
  trialBalance:pd.mapping.validation.counts.trialBalance,
  mapping:pd.mapping.validation.counts.mapping,
  confirmed:pd.mapping.validation.counts.confirmed,
  targets:pd.mapping.validation.counts.targets,
}, {trialBalance:86,mapping:86,confirmed:86,targets:72});

assert.equal(pd.balanceSheet.sumAktivaCurrent, 160_000_000);
assert.equal(pd.balanceSheet.sumPassivaCurrent, 160_000_000);
assert.equal(pd.balanceSheet.sumAktivaPrior, 142_000_000);
assert.equal(pd.balanceSheet.sumPassivaPrior, 142_000_000);
assert.equal(pd.incomeStatement.jahresueberschussCurrent, 9_000_000);
assert.equal(pd.incomeStatement.jahresueberschussPrior, 7_000_000);

const reportingSusaNetIncome = pd.mapping.rows.find(row => row.account === "2040");
assert.equal(reportingSusaNetIncome.statement, "BS");
assert.equal(pd.mapping.rows.filter(row => row.account === "2040").length, 1);
assert.equal(pd.balanceSheet.passiva.EK.current, 56_000_000, "account 2040 is included once in equity without adding P&L net income again");

const importedMirrorRows = Object.values(pd.mirrors).flatMap(mirror => mirror.rows.filter(row => row.source === "MAPPING"));
assert.ok(importedMirrorRows.length > 0, "mirror mappings must be created");
assert.ok(importedMirrorRows.every(row => row.movementsComplete === false && row.missingMovements.length), "movement data must stay open");

for (const key of ["balance_sheet_total","revenue_current_prior","net_income_current_prior","fixed_assets_total","inventories_total","receivables_total","liquid_funds_total","equity_total","provisions_total","liabilities_total"]) {
  assert.equal(pd.parameters[key].source, "CALCULATED", `${key} should be calculated`);
  assert.equal(pd.parameters[key].open, false, `${key} should be resolved`);
}
for (const key of ["revenue_change_reason","result_development_reason","management_assessment","opportunities","risks","forecast"]) {
  assert.equal(pd.parameters[key].open, true, `${key} must remain open`);
}
assert.equal(pd.parameters.fixed_assets_development.open, true, "asset movements cannot be derived from closing balances");

context.resetProjectData();
const mappingXlsx = await context.xlsxArrayBufferToDelimited(readArrayBuffer("03_KAIKIRA_Mapping_SuSa_zu_HGB.xlsx"));
const structureXlsx = await context.xlsxArrayBufferToDelimited(readArrayBuffer("02_KAIKIRA_HGB_Berichtsstruktur_Bilanz_GuV.xlsx"));
assert.equal(context.importTrialBalance(mappingXlsx, "susa.xlsx"), 86, "SuSa must support XLSX input");
assert.equal(context.importReportStructure(structureXlsx, "structure.xlsx"), 72, "report structure must support XLSX input");
assert.equal(context.importConfirmedMapping(mappingXlsx, "mapping.xlsx"), 86, "mapping must support XLSX input");
assert.equal(context.window.projectData.mapping.validation.status, "VALID", context.window.projectData.mapping.validation.errors.join("\n"));
assert.equal(context.window.projectData.balanceSheet.sumAktivaCurrent, 160_000_000);
assert.equal(context.window.projectData.incomeStatement.jahresueberschussCurrent, 9_000_000);

for (const inputId of ["susaFileInput","structureFileInput","mappingFileInput"]) {
  const inputTag = html.match(new RegExp(`<input id="${inputId}"[^>]*>`))?.[0] || "";
  assert.match(inputTag, /accept="[^"]*\.csv[^"]*\.xlsx[^"]*"/, `${inputId} must accept CSV and XLSX`);
}

const uploadStatus = { innerHTML:"" };
const uploadInput = {
  dataset:{}, disabled:false, value:"selected", files:[],
  addEventListener:(type,listener) => { if(type === "change") uploadInput.onChange = listener; },
};
const originalGetElementById = context.document.getElementById;
context.document.getElementById = id => id === "testUploadInput" ? uploadInput : id === "testUploadStatus" ? uploadStatus : null;
context.bindSpreadsheetImport("testUploadInput",() => { throw new Error("Fehlende SuSa-Spalten: konto"); },"testUploadStatus");
uploadInput.files = [{ name:"ungueltige-susa.csv", text:async()=>"falsche;spalten" }];
await uploadInput.onChange({ target:uploadInput });
assert.match(uploadStatus.innerHTML,/Import nicht möglich/);
assert.match(uploadStatus.innerHTML,/Fehlende SuSa-Spalten: konto/);
assert.equal(uploadInput.disabled,false,"file input must be enabled after an import error");
assert.equal(uploadInput.value,"","the same invalid file must be selectable again");

const successStatus = { innerHTML:"" };
const successInput = {
  dataset:{}, disabled:false, value:"selected", files:[],
  addEventListener:(type,listener) => { if(type === "change") successInput.onChange = listener; },
};
context.document.getElementById = id => id === "susaFileInput" ? successInput : id === "susaUploadStatus" ? successStatus : null;
context.resetProjectData();
context.bindSpreadsheetImport("susaFileInput",context.importTrialBalance,"susaUploadStatus");
successInput.files = [{ name:"neue-susa.csv", text:async()=>read("01_KAIKIRA_Test_SuSa_Industrie_AG_2026.csv") }];
await successInput.onChange({ target:successInput });
assert.match(successStatus.innerHTML,/neue-susa\.csv/);
assert.match(successStatus.innerHTML,/VALID/);
assert.equal(successInput.value,"","the same file must be selectable again");
assert.equal(successInput.disabled,false,"file input must be enabled after a successful import");
context.document.getElementById = originalGetElementById;

const targetSections = ["report-review","notes-provisions","mgmt-business","mgmt-performance","mgmt-risks","bs-provisions","provision-account"];
for (const id of targetSections) {
  const section = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?<\\/section>`))?.[0] || "";
  assert.ok(section, `section ${id} must exist`);
  assert.doesNotMatch(section, /8\.450\.000|1\.820\.000|42,6 Mio|185\.000|1\.635\.000|1\.240\.000|39,8 Mio/);
}

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const hashLinks = [...new Set([...html.matchAll(/href="#([^"]*)"/g)].map(match => match[1]).filter(Boolean))];
assert.deepEqual(hashLinks.filter(target => !htmlIds.has(target)), [], "all internal navigation links need a live target");

assert.doesNotMatch(html, /<iframe\b|srcdoc\s*=|new\s+Blob\s*\(|base64,/i);

context.resetProjectData();
context.importTrialBalance(read("01_KAIKIRA_Test_SuSa_Industrie_AG_2026.csv"), "susa.csv");
context.importReportStructure(read("02_KAIKIRA_HGB_Berichtsstruktur_Bilanz_GuV.csv"), "structure.csv");
const invalidMapping = read("03_KAIKIRA_Mapping_SuSa_zu_HGB.csv").replace(
  "HGB.AV_IMMATERIELL.I_IMMATERIELLE_VERMOGENSGEGENSTANDE_1_ENTGELTLICH_ERWORBENE_RECHTE_UND_WERTE",
  "HGB.UNBEKANNTES_ZIEL",
);
context.importConfirmedMapping(invalidMapping, "invalid-mapping.csv");
assert.equal(context.window.projectData.mapping.validation.status, "BLOCKED");
assert.equal(context.window.projectData.balanceSheet, null, "invalid mapping must block financial statement release");
assert.ok(context.window.projectData.mapping.validation.errors.some(error => error.includes("Konto 0100") && error.includes("unbekannter 7L-Zielschlüssel")));

console.log(JSON.stringify({
  accounts:pd.trialBalance.rows.length,
  targets:pd.mapping.validation.counts.targets,
  mapped:pd.mapping.validation.counts.mapping,
  balanceSheetCurrent:[pd.balanceSheet.sumAktivaCurrent,pd.balanceSheet.sumPassivaCurrent],
  balanceSheetPrior:[pd.balanceSheet.sumAktivaPrior,pd.balanceSheet.sumPassivaPrior],
  netIncome:[pd.incomeStatement.jahresueberschussCurrent,pd.incomeStatement.jahresueberschussPrior],
  mirrorRows:importedMirrorRows.length,
  status:"PASS",
}, null, 2));
