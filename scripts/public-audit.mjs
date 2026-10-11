// Examine Git's proposed public files; report paths only, never matching credentials.
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const issues=[];
const forbidden=/(^|\/)(?:node_modules|runtime|runs|\.data|\.local|\.git)(\/|$)|(^|\/)\.env$/;
const patterns=[/sk-[a-zA-Z0-9]{24,}/,/tvly-[a-zA-Z0-9_-]{20,}/,/fc-[a-zA-Z0-9]{24,}/,/github_pat_[a-zA-Z0-9_]{20,}/,/gh[pousr]_[a-zA-Z0-9]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/[EC]:[\\/]codex-workspace/i,/C:[\\/]Users[\\/]HP/i];
for(const file of files){
 if(forbidden.test(file))issues.push({file,reason:'private/generated path'});
 const bytes=readFileSync(file);if(bytes.includes(0))continue;
 const text=bytes.toString('utf8');if(patterns.some(p=>p.test(text)))issues.push({file,reason:'credential or author-local path pattern'});
 if(file.endsWith('.md'))for(const m of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)){
  const link=m[1];if(/^(?:https?:|mailto:|#)/.test(link)||link.includes('{{'))continue;
  const target=decodeURIComponent(link.split('#')[0]);if(target&&!existsSync(path.resolve(path.dirname(file),target)))issues.push({file,reason:'missing relative link: '+target});
 }
}
console.log(JSON.stringify({files:files.length,issues},null,2));if(issues.length)process.exitCode=1;
