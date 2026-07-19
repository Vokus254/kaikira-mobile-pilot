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
const readRootTestFile = name => fs.readFileSync(path.join(root,"Testdateien",name), "utf8");
const readArrayBuffer = name => {
  const override = name.startsWith("02_") ? process.env.KAIKIRA_STRUCTURE_XLSX : process.env.KAIKIRA_MAPPING_XLSX;
  const buffer = fs.readFileSync(override || path.join(testDir,name));
  return buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
};

assert.equal(context.window.projectData.trialBalance.rows.length, 0, "empty state must contain no trial-balance rows");
assert.equal(context.window.projectData.balanceSheet, null, "empty state must not synthesize a balance sheet");
assert.equal(context.window.projectData.incomeStatement, null, "empty state must not synthesize an income statement");
assert.equal(context.normalizeAccountIdentifier("0100"),"100","leading zeroes must not split the same numeric account");
assert.equal(context.normalizeAccountIdentifier(100),"100");
assert.equal(context.normalizeAccountIdentifier("AB-0100"),"AB-0100","alphanumeric account identifiers must remain intact");
const migratedAccounts=context.migrateProjectData({trialBalance:{rows:[{account:"100"}]},mapping:{rows:[{account:"0100"}]}});
assert.equal(migratedAccounts.mapping.rows[0].account,migratedAccounts.trialBalance.rows[0].account,"stored imports must be repaired on reload");

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

const flexibleInputTag = html.match(/<input id="flexibleFileInput"[^>]*>/)?.[0] || "";
assert.match(flexibleInputTag,/accept="[^"]*\.csv[^"]*\.xlsx[^"]*"/);
assert.match(flexibleInputTag,/\bmultiple\b/,"flexible import must allow multiple files");
assert.match(html,/Bei Excel-Dateien wird jedes Tabellenblatt einzeln angezeigt/);
assert.match(html,/Demo-Parameter passend zu importierten Testzahlen befüllen/);

const importWorkspaceElement = { innerHTML:"" };
const importErrorsElement = { innerHTML:"" };
const originalGetElementById = context.document.getElementById;
context.document.getElementById = id => id === "importWorkspace" ? importWorkspaceElement : id === "importWorkspaceErrors" ? importErrorsElement : null;
context.window.importWorkspace = {items:[],nextId:1,errors:[]};
context.resetProjectData();
const workbookTables = await context.xlsxArrayBufferToTables(readArrayBuffer("03_KAIKIRA_Mapping_SuSa_zu_HGB.xlsx"));
assert.deepEqual(Array.from(workbookTables,table=>table.name),["Mapping","Kontrollen"],"all Excel worksheets must be available");
await context.addImportFiles([{name:"03_KAIKIRA_Mapping_SuSa_zu_HGB.xlsx",arrayBuffer:async()=>readArrayBuffer("03_KAIKIRA_Mapping_SuSa_zu_HGB.xlsx")}]);
assert.equal(context.window.importWorkspace.items.find(item=>item.target==="mapping").state,"WAITING","mapping must wait until its dependencies have been imported");
await context.addImportFiles([{name:"02_KAIKIRA_HGB_Berichtsstruktur_Bilanz_GuV.xlsx",arrayBuffer:async()=>readArrayBuffer("02_KAIKIRA_HGB_Berichtsstruktur_Bilanz_GuV.xlsx")}]);
await context.addImportFiles([{name:"01_KAIKIRA_Test_SuSa_Industrie_AG_2026.csv",text:async()=>readRootTestFile("01_KAIKIRA_Test_SuSa_Industrie_AG_2026.csv")}]);
assert.equal(context.window.importWorkspace.items.length,4,"one CSV table and three Excel worksheets must be staged");
assert.equal(context.window.importWorkspace.items.find(item=>item.fileName.startsWith("01_")).target,"trialBalance");
assert.equal(context.window.importWorkspace.items.find(item=>item.fileName.startsWith("02_")).target,"reportStructure");
assert.equal(context.window.importWorkspace.items.find(item=>item.sheetName==="Mapping").target,"mapping");
assert.match(importWorkspaceElement.innerHTML,/Inhalt ansehen/);
assert.match(importWorkspaceElement.innerHTML,/Spalten zuordnen/);
assert.match(importWorkspaceElement.innerHTML,/Spaltennamen stehen in/);
for (const target of ["trialBalance","reportStructure","mapping"]) {
  const item=context.window.importWorkspace.items.find(entry=>entry.target===target);
  assert.equal(item.state,"IMPORTED",`recognized ${target} table should import automatically: ${item.message}`);
}
assert.equal(context.window.projectData.mapping.validation.status,"VALID",context.window.projectData.mapping.validation.errors.join("\n"));
assert.equal(context.window.projectData.balanceSheet.sumAktivaCurrent,160_000_000,"automatic import must populate the balance sheet");
assert.equal(context.window.projectData.incomeStatement.jahresueberschussCurrent,9_000_000,"automatic import must populate P&L");
assert.ok(Object.values(context.window.projectData.mirrors).flatMap(mirror=>mirror.rows).length>0,"automatic import must populate mapped mirror rows");
assert.equal(context.window.projectData.masterData.companyName,"Industrie AG");
assert.equal(context.window.projectData.masterData.financialYear,2026);
for (const key of ["revenue_change_reason","result_development_reason","management_assessment","opportunities","risks","forecast"]) {
  assert.equal(context.window.projectData.parameters[key].sourceDetail,"DEMO_TESTDATEN",`${key} should be generated for the recognized demo dataset`);
  assert.match(context.window.projectData.parameters[key].value,/Demoannahme/);
  assert.equal(context.window.projectData.parameters[key].open,false);
}

const titledLayout=context.detectImportLayout({rows:[["SuSa Export 2026"],["Konto","Bezeichnung","Saldo BJ","Saldo VJ"],["1000","Bank","100","90"]],headerRow:0});
assert.deepEqual({...titledLayout},{target:"trialBalance",headerRow:1,required:3},"header rows below spreadsheet titles must be detected");

const manualItem={id:99,fileName:"freie-spalten.csv",sheetName:"Tabelle 1",rows:[["Kto","Text","Ist","Vorjahr"],["1000","Bank","100","90"]],target:"",mapping:{},state:"READY",message:"",expanded:false};
context.window.importWorkspace.items.push(manualItem);
context.setImportTarget(99,"trialBalance");
context.setImportColumn(99,"konto","0");
context.setImportColumn(99,"bezeichnung","1");
context.setImportColumn(99,"saldobj","2");
context.setImportColumn(99,"saldovj","3");
context.importMappedTable(99);
assert.equal(manualItem.state,"IMPORTED");
assert.deepEqual({...context.window.projectData.trialBalance.rows[0]},{account:"1000",name:"Bank",balanceCurrent:100,balancePrior:90});
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
assert.ok(context.window.projectData.mapping.validation.errors.some(error => error.includes("Konto 100") && error.includes("unbekannter 7L-Zielschlüssel")));

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
