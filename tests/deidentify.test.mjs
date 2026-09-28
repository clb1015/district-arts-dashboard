import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {
  anonymizeIdentifier,deidentifyRows,validateDeidentifiedRows,
  createKeyPackage,readKeyPackage,recommendedDropColumns,toCSV
} from '../deidentify.mjs';

globalThis.crypto ??= webcrypto;
globalThis.btoa ??= s=>Buffer.from(s,'binary').toString('base64');
globalThis.atob ??= s=>Buffer.from(s,'base64').toString('binary');

const key=Buffer.alloc(32,7).toString('base64');

test('same Student ID produces the same stable ANON token',async()=>{
  const a=await anonymizeIdentifier('123456',key);
  const b=await anonymizeIdentifier('123456',key);
  const c=await anonymizeIdentifier('654321',key);
  assert.match(a,/^ANON-[A-F0-9]{24}$/);
  assert.equal(a,b);
  assert.notEqual(a,c);
});

test('de-identification removes source ID and selected direct identifiers',async()=>{
  const rows=[
    {'Student Number':'123456','Student Name':'Jane Doe','Campus':'School A','Course Num':'1302300','Teacher Name':'Teacher A'},
    {'Student Number':'654321','Student Name':'John Doe','Campus':'School B','Course Num':'1302310','Teacher Name':'Teacher B'}
  ];
  const out=await deidentifyRows(rows,{idColumn:'Student Number',keyBase64:key,dropColumns:['Student Name']});
  assert.equal(out.length,2);
  assert.equal('Student Number' in out[0],false);
  assert.equal('Student Name' in out[0],false);
  assert.equal(out[0]['Teacher Name'],'Teacher A');
  assert.match(out[0]['Anonymous Student ID'],/^ANON-/);
  assert.equal(JSON.stringify(out).includes('123456'),false);
  assert.equal(JSON.stringify(out).includes('Jane Doe'),false);
});

test('recommended removal flags student identifiers without flagging teacher names',()=>{
  const headers=['Student Number','Student Name','First Name','Teacher Name','Campus','DOB','Parent Email'];
  const drops=recommendedDropColumns(headers);
  assert.equal(drops.includes('Student Name'),true);
  assert.equal(drops.includes('First Name'),true);
  assert.equal(drops.includes('DOB'),true);
  assert.equal(drops.includes('Parent Email'),true);
  assert.equal(drops.includes('Teacher Name'),false);
});

test('key package round-trips and preserves namespace',async()=>{
  const pkg=await createKeyPackage(key,'SDOC-ARTS-V1');
  const restored=await readKeyPackage(pkg);
  assert.equal(restored.keyBase64,key);
  assert.equal(restored.namespace,'SDOC-ARTS-V1');
  assert.match(restored.keyId,/^[A-F0-9]{12}$/);
});

test('de-identified validation and CSV export contain only ANON identifiers',async()=>{
  const rows=[
    {'Student Number':'123456','Campus':'A'},
    {'Student Number':'123456','Campus':'A'},
    {'Student Number':'654321','Campus':'B'}
  ];
  const out=await deidentifyRows(rows,{idColumn:'Student Number',keyBase64:key});
  const v=validateDeidentifiedRows(out);
  assert.deepEqual(v,{rows:3,ids:3,invalid:0,unique:2});
  const csv=toCSV(out);
  assert.match(csv,/Anonymous Student ID/);
  assert.equal(csv.includes('123456'),false);
  assert.equal(csv.includes('654321'),false);
});
