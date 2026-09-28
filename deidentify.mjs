const enc=new TextEncoder();

export function normalizeIdentifier(value){
  return String(value??'').trim();
}

export async function generateKey(){
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes);
}

export function bytesToBase64(bytes){
  let s=''; for(const b of bytes)s+=String.fromCharCode(b); return btoa(s);
}
export function base64ToBytes(value){
  const bin=atob(String(value||'')); return Uint8Array.from(bin,c=>c.charCodeAt(0));
}

export async function importHmacKey(base64){
  const bytes=base64ToBytes(base64);
  if(bytes.length!==32) throw new Error('De-identification key must contain 32 bytes.');
  return crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
}

export async function anonymizeIdentifier(value,keyBase64,namespace='SDOC-ARTS-V1'){
  const id=normalizeIdentifier(value);
  if(!id) return '';
  const key=await importHmacKey(keyBase64);
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(namespace+'|'+id)));
  const token=[...sig.slice(0,12)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  return 'ANON-'+token;
}

export function recommendedDropColumns(headers){
  const patterns=[
    /(^|\b)(student|legal|preferred|first|last|middle|full)\s*name(\b|$)/i,
    /student.*email|email.*student|(^|\b)e-?mail(\b|$)/i,
    /student.*address|home.*address|mailing.*address/i,
    /student.*phone|home.*phone|mobile.*phone|cell.*phone/i,
    /(^|\b)dob(\b|$)|date.*birth|birth.*date/i,
    /guardian/i,/parent/i,/ssn/i,/social security/i
  ];
  return headers.filter(h=>patterns.some(p=>p.test(String(h))));
}

export async function deidentifyRows(rows,{idColumn,keyBase64,dropColumns=[],namespace='SDOC-ARTS-V1'}){
  if(!idColumn) throw new Error('Choose the source Student ID column.');
  if(!keyBase64) throw new Error('Load or generate a de-identification key.');
  const drops=new Set(dropColumns);
  const output=[];
  for(const row of rows){
    const next={};
    for(const [k,v] of Object.entries(row)){
      if(k.startsWith('__')||drops.has(k)||k===idColumn) continue;
      next[k]=v;
    }
    next['Anonymous Student ID']=await anonymizeIdentifier(row[idColumn],keyBase64,namespace);
    output.push(next);
  }
  return output;
}

export function validateDeidentifiedRows(rows){
  const ids=rows.map(r=>String(r['Anonymous Student ID']??'').trim()).filter(Boolean);
  const invalid=ids.filter(id=>!/^ANON-[A-F0-9]{24}$/.test(id));
  return {rows:rows.length,ids:ids.length,invalid:invalid.length,unique:new Set(ids).size};
}

export function toCSV(rows){
  if(!rows.length) return '';
  const headers=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return [headers.map(q).join(','),...rows.map(r=>headers.map(h=>q(r[h])).join(','))].join('\r\n');
}


export async function keyId(keyBase64){
  const bytes=base64ToBytes(keyBase64);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...digest.slice(0,6)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}

export async function createKeyPackage(keyBase64,namespace='SDOC-ARTS-V1'){
  await importHmacKey(keyBase64);
  return JSON.stringify({
    format:'sdoc-arts-deidentification-key',
    version:1,
    namespace,
    keyId:await keyId(keyBase64),
    createdAt:new Date().toISOString(),
    key:keyBase64
  },null,2);
}

export async function readKeyPackage(text){
  let data;
  try{ data=JSON.parse(text); }catch{ throw new Error('This is not a valid SDOC Arts de-identification key file.'); }
  if(data?.format!=='sdoc-arts-deidentification-key' || data?.version!==1 || typeof data?.key!=='string'){
    throw new Error('Unsupported de-identification key format.');
  }
  await importHmacKey(data.key);
  const actual=await keyId(data.key);
  if(data.keyId && data.keyId!==actual) throw new Error('De-identification key integrity check failed.');
  return {keyBase64:data.key,namespace:data.namespace||'SDOC-ARTS-V1',keyId:actual,createdAt:data.createdAt||null};
}
