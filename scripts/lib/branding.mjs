import {join} from 'node:path';
import {ROOT} from './util.mjs';
export const LOGO_PATH=join(ROOT,'assets/brand/mobile-pet-works-logo.png');
// Preserve the supplied logo's colors and aspect ratio; the light badge gives contrast.
export async function logoLayer(sharp,{left,top,size=90}) {
 const inset=Math.round(size*0.14),inner=size-2*inset;
 const logo=await sharp(LOGO_PATH).resize(inner,inner,{fit:'contain',background:'#ffffff00'}).png().toBuffer();
 const badge=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size*0.2)}" fill="#FFFFFF"/></svg>`);
 const input=await sharp(badge).composite([{input:logo,left:inset,top:inset}]).png().toBuffer();
 return {input,left,top};
}
export async function brandedPhoto(sharp,input) {
 // A dedicated footer preserves the whole photo rather than covering a pet's face.
 const photo=await sharp(input).resize(1080,972,{fit:'contain',background:'#fff8eb'}).extend({bottom:108,background:'#172E4D'}).png().toBuffer();
 const badge=await logoLayer(sharp,{left:40,top:984,size:84});
 const label=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><text x="152" y="1024" font-family="Quicksand" font-size="29" font-weight="700" fill="#FFFFFF">Mobile Pet Works</text><text x="152" y="1060" font-family="Quicksand" font-size="25" fill="#FFFFFF">mobilepetworks.com</text></svg>');
 return sharp(photo).composite([badge,{input:label,left:0,top:0}]);
}
