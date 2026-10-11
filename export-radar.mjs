import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const id=process.argv[2];if(!id||!/^[-\w]{1,100}$/.test(id))throw Error('需要有效批次 ID');
const response=await fetch(`http://127.0.0.1:${process.env.RADAR_PORT??8788}/api/site/radar/batches/${id}/export`,{signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error(`网页导出失败：HTTP ${response.status}`);
const data=await response.json();if(data.run?.id!==id||!Array.isArray(data.events))throw Error('无效导出响应');
const dir=new URL(`./exports/${id}/`,import.meta.url);await mkdir(dir,{recursive:true});const file=new URL(`game-radar-${id}.json`,dir);
await writeFile(file,JSON.stringify(data,null,2)+'\n','utf8');console.log('本地展示记录：'+fileURLToPath(file));
