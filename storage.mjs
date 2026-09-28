const DB_NAME='sdoc-arts-importer';
const DB_VERSION=2;
const IMPORTS='imports';
const PATHWAYS='pathways';

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(IMPORTS)) db.createObjectStore(IMPORTS,{keyPath:'id'});
      if(!db.objectStoreNames.contains(PATHWAYS)) db.createObjectStore(PATHWAYS,{keyPath:'code'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

function reqPromise(req){ return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);}); }

export async function listImports(){
  const db=await openDb(); const tx=db.transaction(IMPORTS,'readonly');
  const all=await reqPromise(tx.objectStore(IMPORTS).getAll()); db.close();
  return all.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function saveImport(record){
  const db=await openDb(); const tx=db.transaction(IMPORTS,'readwrite');
  await reqPromise(tx.objectStore(IMPORTS).put(record)); db.close(); return record;
}

export async function withdrawImport(id){
  const imports=await listImports(); const target=imports.find(i=>i.id===id);
  if(!target) return false;
  target.status='withdrawn'; target.withdrawnAt=new Date().toISOString();
  await saveImport(target); return true;
}

export async function activeRecords(){
  const imports=(await listImports()).filter(i=>i.status==='active');
  const byIdentity=new Map();
  for(const imp of [...imports].reverse()){
    for(const r of imp.acceptedRecords||[]){ if(!byIdentity.has(r.identity)) byIdentity.set(r.identity,r); }
  }
  return [...byIdentity.values()];
}

export async function clearAll(){
  const db=await openDb(); const tx=db.transaction(IMPORTS,'readwrite');
  await reqPromise(tx.objectStore(IMPORTS).clear()); db.close();
}

export async function restoreImports(records){
  if((await listImports()).length) throw new Error('Restore requires an empty import history.');
  const db=await openDb();
  try{
    const tx=db.transaction(IMPORTS,'readwrite');
    const store=tx.objectStore(IMPORTS);
    const complete=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Restore failed.'));});
    records.forEach(record=>store.add(record));
    await complete;
  }finally{ db.close(); }
}


export async function listPathways(){
  const db=await openDb(); const tx=db.transaction(PATHWAYS,'readonly');
  const all=await reqPromise(tx.objectStore(PATHWAYS).getAll()); db.close();
  return all.sort((a,b)=>String(a.code).localeCompare(String(b.code)));
}

export async function savePathway(record){
  if(!record?.code) throw new Error('Pathway classification requires a Course Code.');
  const db=await openDb(); const tx=db.transaction(PATHWAYS,'readwrite');
  await reqPromise(tx.objectStore(PATHWAYS).put(record)); db.close(); return record;
}

export async function savePathways(records){
  const db=await openDb();
  try{
    const tx=db.transaction(PATHWAYS,'readwrite');
    const store=tx.objectStore(PATHWAYS);
    const complete=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Pathway save failed.'));});
    records.forEach(record=>{ if(record?.code) store.put(record); });
    await complete;
  }finally{ db.close(); }
}

export async function restorePathways(records){
  if(!Array.isArray(records) || !records.length) return;
  const db=await openDb();
  try{
    const tx=db.transaction(PATHWAYS,'readwrite');
    const store=tx.objectStore(PATHWAYS);
    const complete=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Pathway restore failed.'));});
    records.forEach(record=>{ if(record?.code) store.put(record); });
    await complete;
  }finally{ db.close(); }
}
