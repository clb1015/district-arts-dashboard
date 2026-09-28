const DB_NAME='sdoc-arts-importer';
const DB_VERSION=1;
const IMPORTS='imports';

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(IMPORTS)) db.createObjectStore(IMPORTS,{keyPath:'id'});
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
