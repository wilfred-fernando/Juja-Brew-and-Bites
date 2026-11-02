import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { getCupLabelSize, resizeLabelCanvas, printerMediaKey } from '../lib/printerLabelSize.mjs';

assert.equal(getCupLabelSize().key,'50x40');
assert.equal(getCupLabelSize().w_px,591);
assert.equal(getCupLabelSize().h_px,472);
assert.equal(getCupLabelSize({},'ct221b').key,'53x40');
assert.equal(getCupLabelSize({},'ct221b').w_px,424);
assert.equal(getCupLabelSize({label_size:'53x40'}).key,'50x40');
assert.equal(getCupLabelSize({label_size:'invalid'},'ct221b').key,'53x40');
assert.equal(printerMediaKey({device_id:'device-A'}),printerMediaKey({ble_device_id:'device-A',id:'new-db-id'}));
assert.equal(printerMediaKey({name:'Printer A'}),printerMediaKey({ble_device_name:'Printer A',id:'new-db-id'}));
const draws=[];
globalThis.document={createElement:()=>({style:{},getContext:()=>({fillRect(){},drawImage(...args){draws.push(args);}})})};
const base={width:424,height:320};
assert.equal(resizeLabelCanvas(base,getCupLabelSize({},'ct221b')),base,'Default output stays identical');
const resized=resizeLabelCanvas(base,getCupLabelSize({label_size:'50x30'},'ct221b'));
assert.equal(resized.width,400);assert.equal(resized.height,240);
const [,x,y,width,height]=draws.at(-1);
assert(x>=0 && y>=0 && x+width<=400 && y+height<=240,'All content fits without clipping');
const page=fs.readFileSync('app/pos/page.jsx','utf8');
const start=page.indexOf('function buildCt221bCupLabelBytes('),end=page.indexOf('\nasync function printCt221bCupLabel(',start);
const build=vm.runInNewContext(`(${page.slice(start,end).trim()})`,{
  TextEncoder,Uint8Array,getCupLabelSize,resizeLabelCanvas,
  createCt221bCupLabelCanvas:()=>base,
  niimbotCanvasToPacked:canvas=>({buf:new Uint8Array(Math.ceil(canvas.width/8)*canvas.height),stride:Math.ceil(canvas.width/8),height:canvas.height}),
});
for(const [key,stride,height] of [['53x40',53,320],['50x40',50,320],['50x30',50,240],['40x30',40,240]]){
  const bytes=build('Test label',{label_size:key});
  const text=new TextDecoder().decode(bytes);
  assert(text.includes(`SIZE ${key.split('x')[0]} mm,${key.split('x')[1]} mm`));
  assert(text.includes(`BITMAP 0,0,${stride},${height},0,`));
  assert(text.endsWith('PRINT 1,1\r\n'));
}
const browserStart=page.indexOf('async function printNiimbotCupLabel(');
const browserEnd=page.indexOf('// ================= PRINT ROUTER',browserStart);
let job;
const browserPrint=vm.runInNewContext(`(${page.slice(browserStart,browserEnd).trim()})`,{
  isNativeBluetoothApp:()=>false,
  getNiimbotDriver:async()=>({printImage:async(url,options)=>{job=options;}}),
  renderNiimbotCupLabelImage:()=> 'test-image',
  withRememberedNiimbotDevice:async(cfg,callback)=>callback(),
  getCupLabelSize,NIIMBOT_B1_PRO_MODEL:{},
});
await browserPrint('Test',{label_size:'40x30'});
assert.equal(job.size.w_px,472);assert.equal(job.size.h_px,354);
const require=createRequire(import.meta.url);
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const jsx=fs.readFileSync('components/pos/PrinterSetupCard.jsx','utf8');
const code=require('next/dist/compiled/babel/core').transformSync(jsx,{filename:'PrinterSetupCard.jsx',presets:['next/babel'],babelrc:false,configFile:false}).code;
const moduleObject={exports:{}};
vm.runInNewContext(code,{module:moduleObject,exports:moduleObject.exports,require:name=>{
  if(name==='@/lib/printerLabelSize.mjs') return require('../lib/printerLabelSize.mjs');
  if(name.startsWith('@babel/runtime/')) return require(`next/dist/compiled/${name}`);
  return require(name);
}});
const form={model:'Clabel CT221B label printer',name:'CT221B-7500',enabled:true,device_id:'test-device',label_size:'53x40',service_uuid:'service',characteristic_uuid:'characteristic'};
const card=renderToStaticMarkup(React.createElement(moduleObject.exports.default,{role:'cup_label',label:'Cup Labels',form}));
assert.match(card,/<option value="53x40" selected="">53 × 40 mm<\/option>/);
assert.match(card,/>Choose printer<\/button>/);
assert.match(card,/>Test print<\/button>/);
assert.match(card,/<details[^>]*>/);
assert.doesNotMatch(card,/<details[^>]*\sopen/);
const niimbotCard=renderToStaticMarkup(React.createElement(moduleObject.exports.default,{role:'cup_label',label:'Cup Labels',form:{...form,model:'Niimbot B1 Pro label printer',label_size:'50x40'}}));
assert.doesNotMatch(niimbotCard,/<option value="53x40"/);
console.log('PASS: legacy defaults, model-safe presets, device persistence keys, no-clipping resize, actual TSPL size/bitmap commands');
