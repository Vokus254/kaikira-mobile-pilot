import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,match=>match.slice(1))),"..");
const source=execFileSync("git",["show","829fa28:index39.html"],{cwd:root,encoding:"utf8",maxBuffer:4*1024*1024});
const style=source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if(!style)throw new Error("index39 style block not found");

function page(id){
  const start=source.indexOf(`<section class="page${id==='page1'?' active':''}" id="${id}">`);
  if(start<0)throw new Error(`${id} not found`);
  const next=source.indexOf('<section class="page"',start+1);
  const mainEnd=source.indexOf('</main>',start+1);
  return source.slice(start,next>=0&&next<mainEnd?next:mainEnd);
}

const labels={
  page1:'Mustertext HGB',page2:'Platzhalter HGB',page3:'Mustertext IFRS',page4:'Platzhalter IFRS',
  page5:'Anlagenspiegel',page6:'Rückstellungsspiegel',page7:'Bilanz HGB',page8:'GuV HGB',
  page9:'Kapitalflussrechnung',page10:'Eigenkapitalveränderung',page11:'SuSa',page12:'Konten-Mapping'
};
const ids=Object.keys(labels);
const tabs=ids.map(id=>`<button class="tab${id==='page1'?' active':''}" data-page="${id}">${labels[id]}</button>`).join('');
const pages=ids.map(page).join('\n');
const fragment=`<!-- Generated from the binding reference index39.html at commit 829fa28. -->\n<style>\n${style}\n:host{display:block;background:#eef1f5;color:#1f2937;min-height:100%;font-family:Arial,sans-serif}.factory-close{position:sticky;top:0;z-index:20;width:100%;padding:12px 16px;background:#111827;color:#fff;border:0;text-align:left;font-weight:700}.page{display:none}.page.active{display:block}\n</style>\n<button class="factory-close" type="button">← Zur KAI/KIRA-App</button><div class="header"><div class="tabs">${tabs}</div></div><main>${pages}</main>`;
const outDir=path.join(root,"reporting");
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,"index39-template.html"),fragment,"utf8");
console.log(JSON.stringify({source:"829fa28:index39.html",pages:ids.length,inputs:(fragment.match(/<input\b/g)||[]).length,bytes:Buffer.byteLength(fragment)}));
