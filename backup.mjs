export const BACKUP_FORMAT='sdoc-arts-import-backup';
export const BACKUP_VERSION=2;

async function checksum(bytes){
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function encode(bytes){
  let result='';
  const block=3*16384;
  for(let i=0;i<bytes.length;i+=block){
    result+=btoa(String.fromCharCode(...bytes.subarray(i,i+block)));
  }
  return result;
}

function decode(value){
  if(typeof value!=='string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid source-file encoding in backup.');
  const binary=atob(value);
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}

export async function createBackup(imports,pathways=[]){
  const records=[];
  for(const record of imports){
    const {sourceFile,...metadata}=record;
    let source=null;
    if(sourceFile){
      const bytes=new Uint8Array(await sourceFile.arrayBuffer());
      source={type:sourceFile.type||'application/octet-stream',base64:encode(bytes),sha256:await checksum(bytes)};
    }
    records.push({...metadata,source});
  }
  return JSON.stringify({format:BACKUP_FORMAT,version:BACKUP_VERSION,createdAt:new Date().toISOString(),records,pathways});
}

export async function readBackup(text){
  let data;
  try{ data=JSON.parse(text); }catch{ throw new Error('This is not a valid JSON backup.'); }
  if(data?.format!==BACKUP_FORMAT || ![1,2].includes(data?.version) || !Array.isArray(data.records)) throw new Error('Unsupported SDOC Arts backup format.');
  const ids=new Set(),records=[];
  for(const entry of data.records){
    if(!entry || typeof entry!=='object' || typeof entry.id!=='string' || !/^IMP-[0-9]+$/.test(entry.id) || ids.has(entry.id) ||
       !['active','withdrawn'].includes(entry.status) || typeof entry.fingerprint!=='string' || !Array.isArray(entry.rawRows) ||
       !Array.isArray(entry.acceptedRecords) || !entry.audit || typeof entry.filename!=='string' || typeof entry.createdAt!=='string'){
      throw new Error('Backup contains an invalid or repeated import record.');
    }
    ids.add(entry.id);
    if(entry.acceptedRecords.some(r=>!r?.mapped?.student_id || !/^(SYN|ANON)-/i.test(r.mapped.student_id))) throw new Error('Backup contains an unapproved student key.');
    const {source,...metadata}=entry;
    let sourceFile=null;
    if(source!==null){
      if(!source || typeof source.sha256!=='string' || typeof source.type!=='string') throw new Error('Backup source-file metadata is incomplete.');
      const bytes=decode(source.base64);
      if(await checksum(bytes)!==source.sha256 || (entry.fingerprint && await checksum(bytes)!==entry.fingerprint)) throw new Error('Backup source-file checksum does not match.');
      sourceFile=new Blob([bytes],{type:source.type});
    }
    records.push({...metadata,sourceFile});
  }
  const pathways=data.version>=2 ? data.pathways : [];
  if(!Array.isArray(pathways)) throw new Error('Backup pathway dictionary is invalid.');
  for(const p of pathways){
    if(!p || typeof p!=='object' || typeof p.code!=='string' || !p.code.trim()) throw new Error('Backup contains an invalid pathway classification.');
  }
  return {records,pathways};
}
