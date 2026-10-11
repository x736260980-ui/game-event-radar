import sharp from "sharp";
import {readFile,writeFile} from "node:fs/promises";
const root=new URL('../site/brand/',import.meta.url);const svg=await readFile(new URL('logo.svg',root));
for(const [name,size] of [['icon.png',512],['icon-192.png',192],['apple-touch-icon.png',180]] as const)await sharp(svg).resize(size,size).png().toFile(new URL(name,root).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const png=await sharp(svg).resize(32,32).png().toBuffer();const h=Buffer.alloc(22);h.writeUInt16LE(1,2);h.writeUInt16LE(1,4);h[6]=32;h[7]=32;h.writeUInt16LE(1,10);h.writeUInt16LE(32,12);h.writeUInt32LE(png.length,14);h.writeUInt32LE(22,18);await writeFile(new URL('favicon.ico',root),Buffer.concat([h,png]));
