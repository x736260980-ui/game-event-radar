import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
export function readSourceState(root:string):Record<string,string>{
  const file=path.join(root,'.fixed-source-state.json');
  if(!existsSync(file))return {};
  const value=JSON.parse(readFileSync(file,'utf8'));
  return Object.fromEntries(Object.entries(value).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
}
export function saveSourceState(root:string,checks:Array<{url:string;fingerprint?:string}>){
  const values={...readSourceState(root),...Object.fromEntries(checks.filter(c=>c.fingerprint).map(c=>[c.url,c.fingerprint!]))};
  const file=path.join(root,'.fixed-source-state.json'),temp=file+'.'+process.pid+'.tmp';
  writeFileSync(temp,JSON.stringify(values,null,2)+'\n','utf8');renameSync(temp,file);
}
