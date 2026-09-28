import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createBackup,readBackup} from '../backup.mjs';

globalThis.crypto ??= webcrypto;

test('audit backup round-trips a source file, withdrawn status, raw rows, and resolutions',async()=>{
  const bytes=new TextEncoder().encode('Student Number,Course Num\nSYN-0001,1302300\n');
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  const record={id:'IMP-12345678',filename:'synthetic.csv',fingerprint:hash,createdAt:'2026-09-28T15:00:00Z',status:'withdrawn',sourceRows:1,acceptedRows:1,
    rawRows:[{'Student Number':'SYN-0001','Course Num':'1302300','Local Extra':'preserved'}],
    acceptedRecords:[{identity:'SYN-0001|2026-2027|Fall|School|1302300|001',mapped:{student_id:'SYN-0001'}}],
    mapping:{student_id:'Student Number'},resolutions:{terms:{T2:'Spring'},courses:{},duplicates:{}},audit:{rawPreserved:true},
    sourceFile:new Blob([bytes],{type:'text/csv'})};
  const restored=await readBackup(await createBackup([record]));
  assert.equal(restored.length,1);
  assert.equal(restored[0].status,'withdrawn');
  assert.equal(restored[0].rawRows[0]['Local Extra'],'preserved');
  assert.equal(restored[0].resolutions.terms.T2,'Spring');
  assert.deepEqual(new Uint8Array(await restored[0].sourceFile.arrayBuffer()),bytes);
  const legacy=await readBackup(await createBackup([{...record,id:'IMP-87654321',sourceFile:null}]));
  assert.equal(legacy[0].sourceFile,null);
  assert.equal(legacy[0].rawRows[0]['Local Extra'],'preserved');

  const tampered=JSON.parse(await createBackup([record]));
  tampered.records[0].source.base64=Buffer.from('altered').toString('base64');
  await assert.rejects(readBackup(JSON.stringify(tampered)),/checksum/);
});
