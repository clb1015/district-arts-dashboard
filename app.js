import {
  CANONICAL_FIELDS,FIELD_LABELS,REQUIRED_FIELDS,proposeMappings,
  parseCSV,parseCourseReferenceCSV,analyzeImport,certificationGate,maskStudentKey
} from './core.mjs';
import {listImports,saveImport,withdrawImport,activeRecords,restoreImports} from './storage.mjs';
import {createBackup,readBackup} from './backup.mjs';

const state={file:null,fileBytes:null,rows:[],headers:[],suggestions:[],reference:new Map(),resolutions:{terms:{},courses:{},duplicates:{}},analysis:null,fingerprint:'',sheetNames:[]};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat().format(n||0);
let sourceUrls=[];
let backupUrl=null;

async function sha256(bytes){
  const h=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function status(msg,type='info'){$('status').textContent=msg;$('status').className=`status ${type}`;}
function show(id,on=true){$(id).hidden=!on;}

async function loadReference(){
  try{
    const text=await (await fetch('./data/florida-arts-courses.csv')).text();
    state.reference=parseCourseReferenceCSV(text);
    $('refStatus').textContent=`${fmt(state.reference.size)} FLDOE arts course codes loaded`;
  }catch(e){
    $('refStatus').textContent='FLDOE reference failed to load. Course-code review will be incomplete.';
  }
}

async function readFile(file){
  const bytes=await file.arrayBuffer();
  state.fileBytes=bytes;
  state.fingerprint=await sha256(bytes);
  const name=file.name.toLowerCase();
  let rows=[]; let sheetNames=[];
  if(name.endsWith('.csv') || name.endsWith('.tsv')){
    let text=new TextDecoder().decode(bytes);
    if(name.endsWith('.tsv')) text=text.split('\n').map(line=>line.split('\t').map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    rows=parseCSV(text); sheetNames=[file.name];
  } else if(name.endsWith('.xlsx')){
    if(!window.XLSX) throw new Error('XLSX parser did not load. Try CSV or refresh the page.');
    const wb=XLSX.read(bytes,{type:'array',raw:false});
    sheetNames=wb.SheetNames;
    for(const sheetName of wb.SheetNames){
      const sheet=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:'',raw:false});
      sheet.forEach((r,i)=>rows.push({...r,__sheet_name:sheetName,__row_number:i+2}));
    }
  } else throw new Error('Use CSV, TSV, or XLSX.');
  return {rows,sheetNames};
}

function buildHeaders(rows){
  const set=new Set();
  rows.slice(0,500).forEach(r=>Object.keys(r).filter(k=>!k.startsWith('__')).forEach(k=>set.add(k)));
  return [...set];
}

function renderMapping(){
  const body=$('mappingBody'); body.innerHTML='';
  for(const s of state.suggestions){
    const options=['<option value="">Unmapped</option>',...CANONICAL_FIELDS.map(f=>`<option value="${f}" ${s.field===f?'selected':''}>${esc(FIELD_LABELS[f])}${REQUIRED_FIELDS.includes(f)?' *':''}</option>`)].join('');
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><strong>${esc(s.source)}</strong></td><td><select class="map-select" data-source="${esc(s.source)}">${options}</select></td><td><span class="confidence ${s.confidence.toLowerCase()}">${s.confidence}</span></td><td>${s.samples.map(esc).join('<br>')||'<span class="muted">No sample</span>'}</td>`;
    body.appendChild(tr);
  }
  $('mappingNote').textContent='Required: Student ID, School, School Year, Term, Course Code, Course Title. Teacher, Grade, and Section are optional.';
  show('mappingCard');
}

function currentMapping(){
  const mapping={}; const collisions=[];
  document.querySelectorAll('.map-select').forEach(sel=>{
    if(!sel.value) return;
    if(mapping[sel.value]) collisions.push(sel.value);
    mapping[sel.value]=sel.dataset.source;
  });
  return {mapping,collisions};
}

function unmappedColumns(){
  const mapped=new Set(Object.values(currentMapping().mapping));
  return state.headers.filter(h=>!mapped.has(h));
}

function renderValidation(a){
  const metrics=[
    ['Source rows',a.counts.sourceRows],['Eligible now',a.counts.accepted],['Held for review',a.counts.held],['Excluded',a.counts.excluded],['Exact duplicates',a.counts.exactDuplicates],
    ['Unique eligible students',a.uniqueStudents],['Schools',a.schools.length],['School years',a.years.length],['Course codes',a.codes.length]
  ];
  $('metrics').innerHTML=metrics.map(([k,v])=>`<div class="metric"><span>${esc(k)}</span><strong>${fmt(v)}</strong></div>`).join('');
  const pct=(a.fldoeCoverage*100).toFixed(1);
  $('quality').innerHTML=`<div><strong>FLDOE course-match coverage:</strong> ${pct}%</div><div><strong>Reconciliation:</strong> ${a.reconciles?'Balanced':'NOT BALANCED'}</div><div><strong>Detected terms:</strong> ${Object.entries(a.terms).map(([k,v])=>`${esc(k)} ${fmt(v)}`).join(' · ')||'None'}</div><div><strong>Unmapped source columns:</strong> ${unmappedColumns().map(esc).join(', ')||'None'}</div>`;
  const groups={};
  a.issues.forEach(i=>(groups[i.type]??=[]).push(i));
  $('issues').innerHTML=Object.keys(groups).length
    ? Object.entries(groups).map(([type,items])=>`<div class="issue"><strong>${esc(type)} (${items.length})</strong><div>${items.slice(0,8).map(i=>`Row ${i.sourceRow}: ${esc(i.detail)}${i.courseCode?` · ${esc(i.courseCode)}`:''}`).join('<br>')}${items.length>8?'<br>…':''}</div></div>`).join('')
    : '<div class="successbox">No unresolved validation issues.</div>';
  renderResolvers(a);
  const gate=certificationGate(a);
  $('gate').innerHTML=gate.ready
    ? '<div class="successbox"><strong>Import-ready.</strong> Validation and reconciliation gates pass.</div>'
    : `<div class="warningbox"><strong>Not ready to import.</strong><ul>${gate.blockers.map(b=>`<li>${esc(b)}</li>`).join('')}</ul></div>`;
  $('commitBtn').disabled=!gate.ready;
  show('validationCard'); show('resolveCard'); show('commitCard');
}

function renderResolvers(a){
  const unknownTerms=[...new Set(a.issues.filter(i=>i.type==='Unknown Term').map(i=>i.detail))];
  const unknownCodes=[...new Set(a.issues.filter(i=>i.type==='Questionable Course Code').map(i=>i.courseCode||i.detail))];
  const dupRows=a.rows.filter(r=>r.issues.some(i=>i.type==='Possible Duplicate') && !r.duplicateResolved);
  const parts=[];
  if(unknownTerms.length){
    parts.push(`<h3>Unknown terms</h3>${unknownTerms.map(t=>`<div class="resolver"><span><strong>${esc(t)}</strong></span><select class="term-resolution" data-term="${esc(t)}"><option value="">Choose…</option>${['Fall','Spring','Yearlong','Summer','Other'].map(v=>`<option ${state.resolutions.terms[t]===v?'selected':''}>${v}</option>`).join('')}</select></div>`).join('')}`);
  }
  if(unknownCodes.length){
    parts.push(`<h3>Unknown course codes</h3>${unknownCodes.map(code=>{const r=state.resolutions.courses[code]||{};return `<div class="resolver wide"><span><strong>${esc(code)}</strong></span><select class="course-action" data-code="${esc(code)}"><option value="">Choose…</option><option value="local" ${r.action==='local'?'selected':''}>Identify as local course</option><option value="exclude" ${r.action==='exclude'?'selected':''}>Exclude from arts analytics</option><option value="hold" ${r.action==='hold'?'selected':''}>Hold for review</option><option value="map" ${r.action==='map'?'selected':''}>Map to FLDOE code</option></select><input class="course-target" data-code="${esc(code)}" placeholder="FLDOE code if mapping" value="${esc(r.target||'')}"></div>`}).join('')}`);
  }
  if(dupRows.length){
    parts.push(`<h3>Possible duplicates</h3>${dupRows.map(r=>`<div class="resolver wide"><span>Row ${r.sourceRow} · ${esc(maskStudentKey(r.mapped.student_id))} · ${esc(r.mapped.course_code)}</span><select class="dup-action" data-row="${r.sourceRow}"><option value="">Choose…</option><option value="keep">Keep as legitimate enrollment</option><option value="exclude">Exclude row</option><option value="hold">Hold for review</option></select></div>`).join('')}`);
  }
  $('resolvers').innerHTML=parts.join('')||'<div class="successbox">Nothing requires manual resolution.</div>';
  document.querySelectorAll('.term-resolution').forEach(el=>el.onchange=()=>{
    if(el.value)state.resolutions.terms[el.dataset.term]=el.value;else delete state.resolutions.terms[el.dataset.term];
    runAnalysis();
  });
  document.querySelectorAll('.course-action').forEach(el=>el.onchange=()=>{
    const code=el.dataset.code;
    state.resolutions.courses[code]={action:el.value,target:document.querySelector(`.course-target[data-code="${CSS.escape(code)}"]`)?.value||''};
    runAnalysis();
  });
  document.querySelectorAll('.course-target').forEach(el=>el.onchange=()=>{
    const code=el.dataset.code;
    const action=document.querySelector(`.course-action[data-code="${CSS.escape(code)}"]`)?.value||'map';
    state.resolutions.courses[code]={action,target:el.value};
    runAnalysis();
  });
  document.querySelectorAll('.dup-action').forEach(el=>el.onchange=()=>{
    if(el.value)state.resolutions.duplicates[el.dataset.row]=el.value;else delete state.resolutions.duplicates[el.dataset.row];
    runAnalysis();
  });
}

async function runAnalysis(){
  const {mapping,collisions}=currentMapping();
  if(collisions.length){status(`A canonical field is mapped more than once: ${collisions.map(f=>FIELD_LABELS[f]).join(', ')}`,'error');return;}
  const existing=await activeRecords();
  state.analysis=analyzeImport(state.rows,mapping,state.reference,state.resolutions,existing);
  renderValidation(state.analysis);
}

async function handleFile(){
  const file=$('file').files[0]; if(!file)return;
  status('Reading file locally…');
  try{
    const history=await listImports();
    const read=await readFile(file);
    state.file=file; state.rows=read.rows; state.sheetNames=read.sheetNames; state.headers=buildHeaders(read.rows);
    const prior=history.find(i=>i.fingerprint===state.fingerprint && i.status==='active');
    if(prior) status(`This exact file was already imported as ${prior.id}. It will not be imported again unless that import is withdrawn.`,'warning');
    else status(`Found ${fmt(state.rows.length)} source rows in ${read.sheetNames.length} worksheet/file source${read.sheetNames.length===1?'':'s'}.`,'success');
    state.suggestions=proposeMappings(state.headers,state.rows);
    state.resolutions={terms:{},courses:{},duplicates:{}};
    renderMapping();
    show('validationCard',false);show('resolveCard',false);show('commitCard',false);
  }catch(e){status(e.message||String(e),'error');}
}

async function commitImport(){
  if(!state.analysis) return;
  const gate=certificationGate(state.analysis);
  if(!gate.ready){status('Import blocked until validation issues are resolved.','error');return;}
  const history=await listImports();
  if(history.some(i=>i.fingerprint===state.fingerprint && i.status==='active')){
    status('This exact file is already active. Duplicate import prevented.','error');return;
  }
  const mapping=currentMapping().mapping;
  const accepted=state.analysis.rows.filter(r=>r.disposition==='accepted').map(r=>({identity:r.identity,mapped:r.mapped,sourceRow:r.sourceRow}));
  const record={
    id:`IMP-${String(Date.now()).slice(-8)}`,
    filename:state.file.name,
    fingerprint:state.fingerprint,
    createdAt:new Date().toISOString(),
    status:'active',
    sourceRows:state.analysis.counts.sourceRows,
    acceptedRows:accepted.length,
    heldRows:state.analysis.rows.filter(r=>r.disposition==='held').length,
    excludedRows:state.analysis.rows.filter(r=>r.disposition==='excluded').length,
    exactDuplicates:state.analysis.counts.exactDuplicates,
    mapping,
    resolutions:state.resolutions,
    years:state.analysis.years,
    terms:state.analysis.terms,
    fldoeCoverage:state.analysis.fldoeCoverage,
    rawRows:state.rows,
    sourceFile:new Blob([state.fileBytes],{type:state.file.type||'application/octet-stream'}),
    acceptedRecords:accepted,
    audit:{rawPreserved:true,reconciles:state.analysis.reconciles,unmappedColumns:unmappedColumns(),sheetNames:state.sheetNames,exclusions:state.analysis.rows.filter(r=>r.disposition==='excluded').map(r=>({sourceRow:r.sourceRow,courseCode:r.mapped.course_code,reason:r.exclusionReason||'Manual exclusion'}))}
  };
  await saveImport(record);
  status(`${record.id} imported: ${fmt(accepted.length)} active enrollment records from ${fmt(record.sourceRows)} source rows.`,'success');
  await renderHistory();
}

async function renderHistory(){
  if(backupUrl){URL.revokeObjectURL(backupUrl);backupUrl=null;$('backupLink').hidden=true;}
  const imports=await listImports();
  sourceUrls.forEach(url=>URL.revokeObjectURL(url));
  sourceUrls=imports.map(i=>i.sourceFile ? URL.createObjectURL(i.sourceFile) : null);
  $('historyBody').innerHTML=imports.length
    ? imports.map((i,n)=>`<tr><td><strong>${esc(i.id)}</strong><br><span class="muted">${new Date(i.createdAt).toLocaleString()}</span></td><td>${esc(i.filename)}</td><td>${fmt(i.sourceRows)}</td><td>${fmt(i.acceptedRows)}</td><td>${esc(i.status)}</td><td>${(i.fldoeCoverage*100).toFixed(1)}%</td><td>${sourceUrls[n]?`<a class="source-link" href="${esc(sourceUrls[n])}" download="${esc(i.filename)}">Download source</a>`:'Raw rows saved'} ${i.status==='active'?`<button class="secondary withdraw" data-id="${esc(i.id)}">Withdraw</button>`:''}</td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">No imports yet.</td></tr>';
  document.querySelectorAll('.withdraw').forEach(btn=>btn.onclick=async()=>{
    if(confirm(`Withdraw ${btn.dataset.id}? This removes its contribution from active records but preserves audit history.`)){
      await withdrawImport(btn.dataset.id); await renderHistory();
      status(`${btn.dataset.id} withdrawn. Active records were recalculated from remaining imports.`,'success');
    }
  });
}

$('backupBtn').addEventListener('click',async()=>{
  const label=$('backupStatus');
  try{
    const imports=await listImports();
    if(!imports.length) throw new Error('No import history exists to back up.');
    const missingSources=imports.filter(i=>!i.sourceFile).length;
    if(backupUrl) URL.revokeObjectURL(backupUrl);
    backupUrl=URL.createObjectURL(new Blob([await createBackup(imports)],{type:'application/json'}));
    const link=$('backupLink');
    link.href=backupUrl;
    link.download=`sdoc-arts-audit-${new Date().toISOString().slice(0,10)}.json`;
    link.hidden=false;
    label.textContent=`Backup ready: ${fmt(imports.length)} imports. ${missingSources?`${fmt(missingSources)} older import${missingSources===1?' has':'s have'} raw rows but no original source bytes; keep those original files separately. `:''}Click Download backup and save it in district-approved protected storage.`;
    label.className=`status ${missingSources?'warning':'success'}`;
  }catch(e){label.textContent=e.message;label.className='status error';}
});

$('restoreBtn').addEventListener('click',async()=>{
  const label=$('backupStatus');
  try{
    const file=$('restoreFile').files[0];
    if(!file) throw new Error('Choose a backup JSON file first.');
    if((await listImports()).length) throw new Error('Restore requires an empty import history. Use a fresh browser profile.');
    const records=await readBackup(await file.text());
    if(!records.length) throw new Error('Backup contains no imports.');
    const missingSources=records.filter(r=>!r.sourceFile).length;
    await restoreImports(records);
    await renderHistory();
    label.textContent=`Restored ${fmt(records.length)} imports and audit history. ${missingSources?`${fmt(missingSources)} older import${missingSources===1?' has':'s have'} raw rows but no original source bytes; keep those original files separately.`:'Original source files were restored.'}`;
    label.className=`status ${missingSources?'warning':'success'}`;
  }catch(e){label.textContent=e.message||String(e);label.className='status error';}
});

$('file').addEventListener('change',handleFile);
$('validateBtn').addEventListener('click',runAnalysis);
$('commitBtn').addEventListener('click',commitImport);
$('resetBtn').addEventListener('click',()=>location.reload());

await loadReference();
await renderHistory();
