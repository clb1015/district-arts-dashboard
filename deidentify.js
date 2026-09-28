import {parseCSV} from './core.mjs';
import {generateKey,createKeyPackage,readKeyPackage,recommendedDropColumns,deidentifyRows,validateDeidentifiedRows,toCSV} from './deidentify.mjs';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat().format(n||0);
const st={key:null,rows:[],headers:[],file:null,sheets:[],output:[],downloadUrl:null,keyUrl:null};

function setStatus(id,msg,type='info'){const el=$(id);el.textContent=msg;el.className='status '+type;}
function revoke(){if(st.downloadUrl){URL.revokeObjectURL(st.downloadUrl);st.downloadUrl=null;}}

async function readSource(file){
  const bytes=await file.arrayBuffer(),name=file.name.toLowerCase();
  let rows=[],sheets=[];
  if(name.endsWith('.csv')||name.endsWith('.tsv')){
    let text=new TextDecoder().decode(bytes);
    if(name.endsWith('.tsv')) text=text.split('\n').map(line=>line.split('\t').map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
    rows=parseCSV(text);sheets=[file.name];
  }else if(name.endsWith('.xlsx')){
    if(!window.XLSX) throw new Error('XLSX parser did not load. Refresh the page or export CSV.');
    const wb=XLSX.read(bytes,{type:'array',raw:false});sheets=wb.SheetNames;
    for(const sheetName of wb.SheetNames){
      const data=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:'',raw:false});
      data.forEach((r,i)=>rows.push({...r,__sheet_name:sheetName,__row_number:i+2}));
    }
  }else throw new Error('Use CSV, TSV, or XLSX.');
  if(!rows.length) throw new Error('No data rows were found.');
  return {rows,sheets};
}

function headers(rows){const set=new Set();rows.slice(0,500).forEach(r=>Object.keys(r).filter(k=>!k.startsWith('__')).forEach(k=>set.add(k)));return [...set];}

function renderConfig(){
  $('idColumn').innerHTML=st.headers.map(h=>'<option value="'+esc(h)+'">'+esc(h)+'</option>').join('');
  const likely=st.headers.find(h=>/student.*(id|number|num)|^(id|student)$/i.test(h))||st.headers[0];
  $('idColumn').value=likely;
  const recommended=new Set(recommendedDropColumns(st.headers));
  $('columnReview').innerHTML=st.headers.map(h=>'<label class="column-choice"><input class="drop-col" type="checkbox" value="'+esc(h)+'" '+(recommended.has(h)?'checked':'')+'> <span>'+esc(h)+'</span> '+(recommended.has(h)?'<strong>recommended remove</strong>':'')+'</label>').join('');
  document.querySelectorAll('.drop-col').forEach(cb=>{if(cb.value===$('idColumn').value){cb.checked=false;cb.disabled=true;}});
  $('idColumn').onchange=()=>document.querySelectorAll('.drop-col').forEach(cb=>{cb.disabled=cb.value===$('idColumn').value;if(cb.disabled)cb.checked=false;});
  $('configCard').hidden=false;
}

$('generateKey').onclick=async()=>{
  const key=await generateKey(),pkg=await createKeyPackage(key);
  st.key=await readKeyPackage(pkg);
  if(st.keyUrl)URL.revokeObjectURL(st.keyUrl);
  st.keyUrl=URL.createObjectURL(new Blob([pkg],{type:'application/json'}));
  const a=$('keyDownload');a.href=st.keyUrl;a.download='SDOC_Arts_Deidentification_Key_'+st.key.keyId+'.json';a.hidden=false;
  setStatus('keyStatus','Key '+st.key.keyId+' generated. Download the key file now and store it in district-approved protected storage before processing real data.','warning');
};

$('keyFile').onchange=async()=>{
  try{
    const file=$('keyFile').files[0];if(!file)return;
    st.key=await readKeyPackage(await file.text());
    setStatus('keyStatus','Key '+st.key.keyId+' loaded. This key will reproduce the same anonymous student IDs across school years.','success');
  }catch(e){st.key=null;setStatus('keyStatus',e.message||String(e),'error');}
};

$('sourceFile').onchange=async()=>{
  try{
    if(!st.key) throw new Error('Load or generate the de-identification key first.');
    const file=$('sourceFile').files[0];if(!file)return;
    const read=await readSource(file);
    st.file=file;st.rows=read.rows;st.sheets=read.sheets;st.headers=headers(st.rows);
    setStatus('fileStatus','Loaded '+fmt(st.rows.length)+' rows from '+fmt(st.sheets.length)+' worksheet/file source'+(st.sheets.length===1?'':'s')+'. Raw values remain only in this browser session.','success');
    renderConfig();
  }catch(e){setStatus('fileStatus',e.message||String(e),'error');$('sourceFile').value='';}
};

$('processBtn').onclick=async()=>{
  try{
    if(!st.key) throw new Error('No de-identification key is loaded.');
    if(!$('reviewConfirm').checked) throw new Error('Confirm that you reviewed the direct-identifier columns before export.');
    const idColumn=$('idColumn').value;
    const drops=[...document.querySelectorAll('.drop-col:checked')].map(x=>x.value);
    const missingId=st.rows.filter(r=>String(r[idColumn]??'').trim()==='').length;
    if(missingId) throw new Error(missingId+' rows have a blank Student ID. Resolve those rows in the source file before de-identification.');
    st.output=await deidentifyRows(st.rows,{idColumn,keyBase64:st.key.keyBase64,dropColumns:drops,namespace:st.key.namespace});
    const validation=validateDeidentifiedRows(st.output);
    if(validation.invalid) throw new Error('Anonymous identifier validation failed.');
    revoke();
    const csv=toCSV(st.output);
    st.downloadUrl=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const a=$('csvDownload');a.href=st.downloadUrl;a.download=st.file.name.replace(/\.(xlsx|csv|tsv)$/i,'')+'_DEIDENTIFIED.csv';a.hidden=false;
    $('resultMetrics').innerHTML=[
      ['Source rows',validation.rows],
      ['Anonymous IDs',validation.ids],
      ['Unique students',validation.unique],
      ['Columns removed',drops.length+1]
    ].map(x=>'<div class="metric"><span>'+esc(x[0])+'</span><strong>'+fmt(x[1])+'</strong></div>').join('');
    setStatus('resultStatus','De-identification complete using key '+st.key.keyId+'. No raw Student ID values are included in the exported CSV.','success');
    $('resultCard').hidden=false;
  }catch(e){$('resultCard').hidden=false;setStatus('resultStatus',e.message||String(e),'error');}
};