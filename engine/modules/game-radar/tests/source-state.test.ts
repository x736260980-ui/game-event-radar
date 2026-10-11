import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readSourceState,saveSourceState} from '../source-state.ts';
test('successful source fingerprints persist; blocked reads do not erase them',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'radar-sources-'));
 try{assert.deepEqual(readSourceState(root),{});saveSourceState(root,[{url:'https://example.com',fingerprint:'same'}]);saveSourceState(root,[{url:'https://example.com'}]);assert.deepEqual(readSourceState(root),{'https://example.com':'same'});}finally{rmSync(root,{recursive:true,force:true});}
});
