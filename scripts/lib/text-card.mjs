import {join,dirname} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {ROOT} from './util.mjs';
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const clean=s=>String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}️‍]/gu,'').trim();
// Each format has a different composition; every text block is measured before export.
export async function renderTextCard({sharp,cfg,bodyText,postFormat,supportLines,outPath}) {
 const layers=[];let shapes='';
 const ink='#172E4D',blue='#0146A3',gold='#FFD25A',cream='#FFF8EB',coral='#D54B5D';
 const rect=(x,y,w,h,color,r=0)=>{shapes+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${color}"/>`;};
 async function text(s,x,y,w,h,size,color,align='left') {
  for(let fontSize=size;fontSize>=20;fontSize-=2){
   const {data,info}=await sharp({text:{text:`<span foreground="${color}">${xml(clean(s))}</span>`,font:`Quicksand Bold ${fontSize}`,fontfile:join(ROOT,'assets/fonts/Quicksand.ttf'),width:w,align,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
   if(info.height<=h&&info.width<=w){layers.push({input:data,left:x,top:y});return;}
  }
  throw new Error('Text does not fit the selected graphic; shorten it before approval.');
 }
 const lines=supportLines || [];
 if(lines.length!==3) throw new Error('Text card requires three supporting lines.');
 let field=cream,fg=ink;
 if(postFormat==='question'){
  field=ink;fg=cream;rect(830,50,180,130,gold,55);
  await text('?',885,62,70,105,96,ink);
  await text('YOUR TAKE?',72,90,700,60,27,gold);
  await text(bodyText,72,215,900,370,88,cream);
  for(let i=0;i<3;i++){rect(72,625+i*105,936,88,i===0?blue:'#263E62',24);await text(lines[i],100,641+i*105,875,65,30,cream);}
 } else if(postFormat==='checklist'){
  field=cream;rect(0,0,1080,125,blue);
  await text('THE LITTLE THINGS',72,43,936,65,30,cream);
  await text(bodyText,72,185,936,220,72,ink);
  for(let i=0;i<3;i++){rect(72,445+i*160,76,76,gold,38);await text(String(i+1),94,460+i*160,45,50,40,ink);await text(lines[i],185,444+i*160,815,130,40,ink);}
 } else if(postFormat==='two_sides'){
  field=cream;await text('TWO WAYS TO SEE IT',72,70,936,60,27,blue);
  await text(bodyText,72,165,936,220,74,ink);
  rect(60,430,465,340,coral,30);rect(555,430,465,340,blue,30);
  await text('A',90,455,100,60,38,cream);await text('B',585,455,100,60,38,cream);
  await text(lines[0],90,540,400,200,44,cream);await text(lines[1],585,540,400,200,44,cream);
  await text(lines[2],72,825,936,115,38,ink);
 } else if(postFormat==='mini_story'){
  field='#F4E7D1';rect(70,65,940,870,'#FFFFFF',16);rect(70,65,17,870,gold);
  await text('A MOMENT TO PICTURE',130,118,810,55,27,blue);
  await text(bodyText,130,220,810,255,72,ink);
  for(let i=0;i<3;i++)await text(lines[i],130,520+i*125,810,105,38,ink);
 } else if(postFormat==='punchline'){
  field=gold;await text('DOG PEOPLE GET IT.',72,80,936,60,28,ink);
  await text(bodyText,72,205,936,370,100,ink);
  rect(72,615,936,8,ink);
  for(let i=0;i<3;i++)await text(lines[i],72,665+i*95,936,75,36,ink);
 } else throw new Error('Unknown text-card format.');
 rect(0,965,1080,115,postFormat==='question'?blue:ink);
 await text(cfg.business.name,72,982,936,40,27,cream);
 await text(`${cfg.business.website}  |  ${cfg.business.phone}`,72,1028,936,34,22,cream);
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="${field}"/>${shapes}</svg>`);
 const buffer=await sharp(svg).composite(layers).jpeg({quality:93}).toBuffer();
 await mkdir(dirname(outPath),{recursive:true});await writeFile(outPath,buffer);return outPath;
}
