const assert=require('node:assert/strict');
const source=require('fs').readFileSync('app/pos/page.jsx','utf8');
const code=source.slice(source.indexOf('function wrapLabelCanvasText('),source.indexOf('function createNiimbotCupLabelCanvas('));
const {wrap,draw}=new Function('normalizeLabelLine',code+'; return {wrap:wrapLabelCanvasText,draw:drawCupLabelDetails}')(v=>String(v||'').trim());
for(const [width,itemSize,detailSize,bottom] of [[543,42,26,400],[400,32,20,278]]){
 const calls=[];const ctx={font:'',measureText(text){return{width:text.length*Number(this.font.match(/(\d+)px/)[1])*.65}},fillText(text,x,y){calls.push({text,x,y,size:Number(this.font.match(/(\d+)px/)[1])})}};
 const name='Strawberry Vanilla Frappe';const details=['Regular','50% sugar, extra Black Pearl and Cheesecake','Note: Less ice, separate packing please'];
 draw(ctx,{itemName:name,detailLines:details,x:0,y:100,width,bottom,itemSize,detailSize,fontFamily:'Arial'});
 assert.equal(calls.map(c=>c.text).join(' '),[name,...details].join(' '));
 assert(calls.every(c=>c.y+c.size<=bottom));
 assert(calls.filter(c=>c.text==='Regular').every(c=>c.size<calls[0].size));
 for(const c of calls){ctx.font=c.size+'px Arial';assert(ctx.measureText(c.text).width<=width)}
 ctx.font='10px Arial';assert.deepEqual(wrap(ctx,'Cocoa Cheesecake Milk Tea',130),['Cocoa Cheesecake','Milk Tea']);
}
console.log('PASS: whole words, every option retained, smaller option font, width and footer bounds for both printers.');
