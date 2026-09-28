import {parseCourseReferenceCSV} from './core.mjs';
import {listImports,listPathways,getCertification,saveCertification} from './storage.mjs';
import {buildGoldenSummary,certificationRecord} from './golden.mjs';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat().format(n||0);
const pct=n=>(Number(n||0)*100).toFixed(1)+'%';

const state={imports:[],reference:new Map(),pathways:new Map(),summary:null};

function metric(label,value){return '<div class="metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';}

async function load(){
  const [referenceText,imports,pathways,synthetic,golden]=await Promise.all([
    fetch('./data/florida-arts-courses.csv').then(r=>r.text()),
    listImports(),
    listPathways(),
    getCertification('synthetic-acceptance'),
    getCertification('golden')
  ]);
  state.reference=parseCourseReferenceCSV(referenceText);
  state.imports=imports.filter(i=>i.status==='active');
  state.pathways=new Map(pathways.map(p=>[p.code,p]));
  $('importSelect').innerHTML=state.imports.length
    ? state.imports.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.id)+' · '+esc(i.filename)+'</option>').join('')
    : '<option value="">No active imports</option>';
  $('importSelect').onchange=render;
  if(golden){
    $('recordStatus').textContent='Production Golden Import certified '+new Date(golden.certifiedAt).toLocaleString()+' from '+golden.importId+'.';
    $('recordStatus').className='status success';
  } else if(synthetic){
    $('recordStatus').textContent='Synthetic acceptance passed '+new Date(synthetic.certifiedAt).toLocaleString()+' from '+synthetic.importId+'. Production Golden Import is still pending a de-identified district export.';
    $('recordStatus').className='status success';
  }
  render();
}

function selectedImport(){
  const id=$('importSelect').value;
  return state.imports.find(i=>i.id===id)||state.imports[0]||null;
}

function render(){
  const imp=selectedImport();
  if(!imp){
    $('statusPill').textContent='No active import';
    $('candidateStatus').textContent='Import and approve a dataset before certification.';
    $('certifyBtn').disabled=true;$('exportBtn').disabled=true;
    return;
  }
  const s=buildGoldenSummary(imp,state.reference,state.pathways); state.summary=s;
  $('statusPill').textContent=s.kind==='synthetic'?'Synthetic benchmark':s.kind==='deidentified'?'De-identified district candidate':'Certification blocked';
  $('candidateStatus').innerHTML='<strong>'+esc(s.importId)+'</strong> · '+esc(s.filename)+' · '+(s.kind==='synthetic'?'Synthetic acceptance candidate':s.kind==='deidentified'?'Production Golden Import candidate':'Unapproved identifier pattern');

  $('importMetrics').innerHTML=[
    ['Source rows',fmt(s.sourceRows)],
    ['Active enrollment records',fmt(s.activeEnrollmentRecords)],
    ['Unique students',fmt(s.uniqueStudents)],
    ['Duplicate records prevented',fmt(s.duplicateRecordsPrevented)],
    ['Held records',fmt(s.heldRecords)],
    ['Excluded records',fmt(s.excludedRecords)]
  ].map(x=>metric(x[0],x[1])).join('');

  $('referenceMetrics').innerHTML=[
    ['FLDOE course match',pct(s.fldoeCoverage)],
    ['Pathway classification',pct(s.pathwayCoverage)],
    ['Unknown course codes',fmt(s.unknownCourseCodes.length)],
    ['Courses needing review',fmt(s.coursesNeedingReview.length)]
  ].map(x=>metric(x[0],x[1])).join('');
  $('reviewDetail').innerHTML='<strong>Unknown course codes:</strong> '+(s.unknownCourseCodes.map(esc).join(', ')||'None')+
    '<br><strong>Courses needing review:</strong> '+(s.coursesNeedingReview.map(esc).join(', ')||'None');

  $('compositionMetrics').innerHTML=[
    ['Fall enrollments',fmt(s.terms.Fall)],
    ['Spring enrollments',fmt(s.terms.Spring)],
    ['Yearlong enrollments',fmt(s.terms.Yearlong)],
    ['Schools',fmt(s.schools)],
    ['Grades',fmt(s.grades.length)],
    ['Arts disciplines',fmt(s.disciplines.length)]
  ].map(x=>metric(x[0],x[1])).join('');
  $('compositionDetail').innerHTML='<strong>Grades:</strong> '+(s.grades.map(esc).join(', ')||'Not supplied')+
    '<br><strong>Disciplines represented:</strong> '+(s.disciplines.map(esc).join(', ')||'Awaiting classification');

  if(s.ready){
    const isSynthetic=s.kind==='synthetic';
    const label=isSynthetic?'Record synthetic acceptance':'Certify as Golden Import';
    $('gate').innerHTML='<div class="successbox"><strong>Certification gates pass.</strong> '+(isSynthetic?'This validates the importer and pathway workflow. It does not replace the future de-identified district Golden Import.':'This de-identified district import is eligible to become the production Golden Import.')+'</div>';
    $('certifyBtn').textContent=label;$('certifyBtn').disabled=false;$('exportBtn').disabled=false;
  }else{
    $('gate').innerHTML='<div class="warningbox"><strong>Certification blocked.</strong><ul>'+s.blockers.map(b=>'<li>'+esc(b)+'</li>').join('')+'</ul></div>';
    $('certifyBtn').textContent='Certification blocked';$('certifyBtn').disabled=true;$('exportBtn').disabled=false;
  }
}

$('certifyBtn').onclick=async()=>{
  const imp=selectedImport(),s=state.summary;if(!imp||!s)return;
  const type=s.kind==='synthetic'?'synthetic':'golden';
  const record=certificationRecord(s,type);
  record.fingerprint=imp.fingerprint||null;
  await saveCertification(record);
  $('recordStatus').textContent=(type==='synthetic'?'Synthetic acceptance passed':'Golden Import certified')+' '+new Date(record.certifiedAt).toLocaleString()+' from '+record.importId+'.';
  $('recordStatus').className='status success';
};

$('exportBtn').onclick=()=>{
  if(!state.summary)return;
  const imp=selectedImport(),payload={
    generatedAt:new Date().toISOString(),
    candidateType:state.summary.kind,
    importId:state.summary.importId,
    filename:state.summary.filename,
    sourceFingerprint:imp?.fingerprint||null,
    status:state.summary.ready?'Certification gates pass':'Blocked',
    blockers:state.summary.blockers,
    summary:state.summary
  };
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=(state.summary.kind==='synthetic'?'synthetic-acceptance':'golden-import-summary')+'-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

await load();