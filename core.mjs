export const REQUIRED_FIELDS = ['student_id','school','school_year','term','course_code','course_title'];
export const OPTIONAL_FIELDS = ['teacher','grade','section'];
export const CANONICAL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
export const ADMINISTRATIVE_WAIVER_CODES = new Set(['1500440','1500441','1500442','1500445']);

export const FIELD_LABELS = {
  student_id:'Student ID', school:'School', school_year:'School Year', term:'Term',
  course_code:'Course Code', course_title:'Course Title', teacher:'Teacher', grade:'Grade', section:'Section'
};

export const ALIASES = {
  student_id:['student id','anonymous student id','anon student id','student number','student num','student no','student identifier','studentid','studentnumber'],
  school:['school','campus','school name','campus name','location','site'],
  school_year:['school year','academic year','year','academic year name','schoolyear','academicyear'],
  term:['term','semester','semester name','session','course term','academic term','marking period','semester code','term code','s1/s2'],
  course_code:['course code','course num','course number','course no','course id','coursenum','coursecode'],
  course_title:['course title','course name','class name','class title','course description','coursename','classtitle'],
  teacher:['teacher','teacher name','instructor','instructor name','faculty','staff'],
  grade:['grade','grade level','student grade','gradelevel'],
  section:['section','section id','section number','sec','sec num','section #','class section','course section','period section','class id']
};

export function clean(value){ return String(value ?? '').trim(); }
export function headerKey(value){ return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
export function compactKey(value){ return headerKey(value).replace(/\s+/g,''); }

function scoreHeader(header, aliases){
  const h = headerKey(header); const hc = compactKey(header);
  let best = 0;
  for (const alias of aliases){
    const a = headerKey(alias); const ac = compactKey(alias);
    if (h === a || hc === ac) best = Math.max(best, 1);
    else if (h.includes(a) || a.includes(h)) best = Math.max(best, .82);
    else {
      const ht = new Set(h.split(' ')); const at = a.split(' ');
      const overlap = at.filter(t=>ht.has(t)).length / Math.max(at.length,1);
      if (overlap >= .66) best = Math.max(best, .68);
    }
  }
  return best;
}

export function proposeMappings(headers, sampleRows=[]){
  const used = new Set();
  const suggestions = headers.map(header => {
    let bestField = ''; let bestScore = 0;
    for (const field of CANONICAL_FIELDS){
      if (used.has(field)) continue;
      const score = scoreHeader(header, ALIASES[field]);
      if (score > bestScore){ bestScore = score; bestField = field; }
    }
    if (bestScore >= .82 && bestField) used.add(bestField);
    const confidence = bestScore >= .82 ? 'High' : bestScore >= .65 ? 'Medium' : 'Low';
    const mappedField = bestScore >= .65 ? bestField : '';
    return {
      source: header,
      field: mappedField,
      confidence,
      score: bestScore,
      samples: sampleRows.slice(0,3).map(r=>clean(r[header])).filter(Boolean)
    };
  });
  return suggestions;
}

export function mappingFromSuggestions(suggestions){
  const map = {};
  for (const s of suggestions){ if (s.field) map[s.field] = s.source; }
  return map;
}

export function missingRequiredMappings(mapping){
  return REQUIRED_FIELDS.filter(f => !mapping?.[f]);
}

export function normalizeSchoolYear(value){
  const v = clean(value);
  let m = v.match(/^(\d{4})\s*[-–/]\s*(\d{2}|\d{4})$/);
  if (!m) return v;
  const start = Number(m[1]);
  let end = Number(m[2]);
  if (m[2].length === 2) end = Math.floor(start/100)*100 + end;
  return `${start}-${end}`;
}

export function normalizeTerm(value){
  const raw = clean(value); const v = raw.toLowerCase().replace(/[._-]/g,' ').replace(/\s+/g,' ').trim();
  if (!v) return {raw, normalized:null, status:'missing'};
  const fall = ['fall','semester 1','sem 1','s1','first semester','1st semester','semester one'];
  const spring = ['spring','semester 2','sem 2','s2','second semester','2nd semester','semester two'];
  const yearlong = ['yearlong','year long','full year','annual','full-year','full academic year'];
  const summer = ['summer','summer term','summer session'];
  if (fall.includes(v)) return {raw, normalized:'Fall', status:'recognized'};
  if (spring.includes(v)) return {raw, normalized:'Spring', status:'recognized'};
  if (yearlong.includes(v)) return {raw, normalized:'Yearlong', status:'recognized'};
  if (summer.includes(v)) return {raw, normalized:'Summer', status:'recognized'};
  return {raw, normalized:null, status:'review'};
}

export function normalizeCourseCode(value, referenceCodes=[]){
  let raw = clean(value).replace(/\.0+$/,'');
  let compact = raw.replace(/[^0-9A-Za-z]/g,'');
  if (!compact) return {raw, normalized:'', matchType:'none'};
  const refs = new Set(referenceCodes.map(clean));
  if (refs.has(compact)) return {raw, normalized:compact, matchType:'exact'};
  if (/^\d+$/.test(compact)){
    const noLeading = String(Number(compact));
    const candidates = [compact, noLeading, noLeading.padStart(7,'0')];
    for (const c of candidates){ if (refs.has(c)) return {raw, normalized:c, matchType:c===compact?'exact':'normalized'}; }
  }
  return {raw, normalized:compact, matchType:'unmatched'};
}

export function normalizeCourseTitle(value){
  return clean(value)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

export function referenceCandidatesForGrade(courseReference, grade){
  const raw=clean(grade).toUpperCase();
  const numeric=Number(raw.replace(/^0+/,''));
  let bands;
  if(raw==='K' || raw==='KG' || raw==='KINDERGARTEN' || (Number.isFinite(numeric) && numeric>=0 && numeric<=5)){
    bands=['Pre-K to 5'];
  }else if(Number.isFinite(numeric) && numeric>=6 && numeric<=8){
    bands=['Grades 6-8'];
  }else if(Number.isFinite(numeric) && numeric>=9 && numeric<=12){
    bands=['Grades 9-12'];
  }else{
    // Missing/unknown grade defaults to the two secondary reference files requested for this workflow.
    bands=['Grades 6-8','Grades 9-12'];
  }
  return [...courseReference.values()].filter(r=>!r.gradeBand || bands.includes(r.gradeBand));
}

export function matchCourseReference(courseCode, courseTitle, grade, courseReference){
  const candidates=referenceCandidatesForGrade(courseReference,grade);
  const byCode=new Map(candidates.map(r=>[r.code,r]));
  const codeInfo=normalizeCourseCode(courseCode,[...byCode.keys()]);
  if(['exact','normalized'].includes(codeInfo.matchType)){
    const reference=byCode.get(codeInfo.normalized)||null;
    return {matchType:codeInfo.matchType,codeInfo,reference,referenceCode:reference?.code||'',titleMatches:[]};
  }

  const titleKey=normalizeCourseTitle(courseTitle);
  if(titleKey){
    const titleMatches=candidates.filter(r=>{
      const full=normalizeCourseTitle(r.title);
      const abbr=normalizeCourseTitle(r.abbreviatedTitle);
      return titleKey===full || titleKey===abbr;
    });
    if(titleMatches.length){
      const reference=titleMatches[0];
      return {
        matchType:titleMatches.length===1?'title-exact':'title-exact-ambiguous',
        codeInfo,
        reference,
        referenceCode:titleMatches.length===1?reference.code:'',
        titleMatches
      };
    }
  }
  return {matchType:'unmatched',codeInfo,reference:null,referenceCode:'',titleMatches:[]};
}

export function normalizeSection(value){
  const raw = clean(value);
  return {raw, normalized: raw.replace(/\.0+$/,'')};
}

export function parseCSV(text){
  const rows=[]; let row=[]; let value=''; let quoted=false;
  const pushValue=()=>{ row.push(value); value=''; };
  const pushRow=()=>{ if(row.some(v=>String(v).trim()!=='')) rows.push(row); row=[]; };
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"' && text[i+1]==='"'){ value+='"'; i++; }
      else if(c==='"') quoted=false;
      else value+=c;
    } else if(c==='"') quoted=true;
    else if(c===',') pushValue();
    else if(c==='\n'){ pushValue(); pushRow(); }
    else if(c==='\r'){} else value+=c;
  }
  if(value.length || row.length){ pushValue(); pushRow(); }
  if(!rows.length) return [];
  const headers=rows[0].map(clean);
  return rows.slice(1).map((vals,idx)=>{
    const obj={__row_number:idx+2}; headers.forEach((h,i)=>obj[h]=vals[i]??''); return obj;
  });
}

export function parseCourseReferenceCSV(text){
  const rows=parseCSV(text); const map=new Map();
  for(const r of rows){
    const code=clean(r['Course Code']); if(!code) continue;
    map.set(code, {
      code,
      discipline:clean(r['Discipline Category']),
      abbreviatedTitle:clean(r['Abbreviated Title']),
      title:clean(r['Full Course Title']),
      gradeBand:clean(r['Source Document']),
      length:clean(r['Course Length']),
      notes:clean(r['Notes & Flags'])
    });
  }
  return map;
}

export function stableObjectString(obj){
  return JSON.stringify(Object.keys(obj).filter(k=>!k.startsWith('__')).sort().map(k=>[k, clean(obj[k])]));
}

export function analyzeImport(rawRows, mapping, courseReference=new Map(), resolutions={terms:{},courses:{},duplicates:{}}, existingRecords=[]){
  const missingMappings=missingRequiredMappings(mapping);
  const rows=[]; const exactSeen=new Map(); const identitySeen=new Map();
  const counts={sourceRows:rawRows.length,accepted:0,held:0,excluded:0,autoReferenceExcluded:0,exactDuplicates:0,possibleDuplicates:0,existing:0,newRecords:0,conflicts:0};
  const issues=[];

  for(const raw of rawRows){
    const mapped={};
    for(const field of CANONICAL_FIELDS){ mapped[field]=mapping?.[field] ? clean(raw[mapping[field]]) : ''; }
    mapped.school_year=normalizeSchoolYear(mapped.school_year);
    const termInfo=normalizeTerm(mapped.term);
    const termResolution=resolutions?.terms?.[termInfo.raw];
    mapped.raw_term=termInfo.raw;
    mapped.term=termInfo.normalized || termResolution || '';
    const sectionInfo=normalizeSection(mapped.section);
    mapped.raw_section=sectionInfo.raw; mapped.section=sectionInfo.normalized;
    const referenceMatch=matchCourseReference(mapped.course_code,mapped.course_title,mapped.grade,courseReference);
    const codeInfo=referenceMatch.codeInfo;
    mapped.raw_course_code=codeInfo.raw;
    mapped.course_code=codeInfo.normalized;
    mapped.course_match_type=referenceMatch.matchType;
    mapped.reference_code=referenceMatch.referenceCode;
    mapped.reference_title=referenceMatch.reference?.title||'';
    mapped.reference_discipline=referenceMatch.reference?.discipline||'';
    mapped.reference_grade_band=referenceMatch.reference?.gradeBand||'';

    const missingValues=REQUIRED_FIELDS.filter(f=>!clean(mapped[f]));
    const rowIssues=[];
    if(missingMappings.length) rowIssues.push({type:'Mapping Needs Confirmation',detail:missingMappings.join(', ')});
    if(missingValues.length) rowIssues.push({type:'Missing Required Value',detail:missingValues.join(', ')});
    if(mapped.student_id && !/^(SYN|ANON)-/i.test(mapped.student_id)) rowIssues.push({type:'Student Key Review',detail:'Student key is not SYN-/ANON- prefixed.'});
    if(termInfo.status==='review' && !termResolution) rowIssues.push({type:'Unknown Term',detail:termInfo.raw});

    const isAdministrativeWaiver=ADMINISTRATIVE_WAIVER_CODES.has(mapped.course_code);
    const isReferenceExcluded=referenceMatch.matchType==='unmatched' && !isAdministrativeWaiver;

    const exactSig=stableObjectString(raw);
    const exactFirst=exactSeen.get(exactSig);
    if(exactFirst){ counts.exactDuplicates++; rowIssues.push({type:'Exact Duplicate',detail:`Matches source row ${exactFirst}`}); }
    else exactSeen.set(exactSig, raw.__row_number);
    if(isAdministrativeWaiver && !exactFirst) rowIssues.push({type:'Administrative Waiver Excluded',detail:`${mapped.course_code} is a non-instructional waiver; retained in source audit only.`});

    const identityBase=[mapped.student_id,mapped.school_year,mapped.term,mapped.school,mapped.course_code].join('|');
    const identity=mapped.section ? `${identityBase}|${mapped.section}` : identityBase;
    if(!exactFirst){
      if(!mapped.section && identitySeen.has(identityBase)){
        counts.possibleDuplicates++; rowIssues.push({type:'Possible Duplicate',detail:`Same student/year/term/school/course without Section; first seen row ${identitySeen.get(identityBase)}`});
      } else if(!mapped.section) identitySeen.set(identityBase, raw.__row_number);
    }

    const existing=existingRecords.some(r=>r.identity===identity);
    if(existing) counts.existing++;

    const hasPossibleDuplicate=rowIssues.some(i=>i.type==='Possible Duplicate');
    const duplicateResolution=resolutions?.duplicates?.[raw.__row_number] || null;
    let disposition='accepted';
    if(missingMappings.length || missingValues.length || (termInfo.status==='review' && !termResolution) || rowIssues.some(i=>i.type==='Student Key Review')) disposition='held';
    if(hasPossibleDuplicate && !duplicateResolution) disposition='held';
    if(hasPossibleDuplicate && duplicateResolution==='exclude') disposition='excluded';
    if(hasPossibleDuplicate && duplicateResolution==='hold') disposition='held';
    if(disposition==='accepted' && isReferenceExcluded) disposition='excluded';
    if(isAdministrativeWaiver) disposition='excluded';
    if(exactFirst) disposition='duplicate';

    if(disposition==='accepted') {counts.accepted++; if(!existing) counts.newRecords++;}
    else if(disposition==='held') counts.held++;
    else if(disposition==='excluded') {counts.excluded++; if(isReferenceExcluded && !isAdministrativeWaiver) counts.autoReferenceExcluded++;}

    const exclusionReason=isAdministrativeWaiver && disposition==='excluded'?'Administrative waiver':(isReferenceExcluded && disposition==='excluded'?'No code or title match in Florida arts reference':null);
    const record={sourceRow:raw.__row_number,raw,mapped,identity,issues:rowIssues,disposition,exclusionReason,duplicateResolved:!hasPossibleDuplicate || duplicateResolution==='keep' || duplicateResolution==='exclude',reference:referenceMatch.reference};
    rowIssues.forEach(issue=>issues.push({...issue,sourceRow:raw.__row_number,studentKey:maskStudentKey(mapped.student_id),courseCode:mapped.raw_course_code}));
    rows.push(record);
  }

  const uniqueStudents=new Set(rows.filter(r=>r.disposition==='accepted').map(r=>r.mapped.student_id)).size;
  const terms={}; const schools=new Set(), years=new Set(), codes=new Set(), titles=new Set(), teachers=new Set(), sections=new Set();
  for(const r of rows){
    const m=r.mapped; if(m.school)schools.add(m.school); if(m.school_year)years.add(m.school_year); if(m.course_code)codes.add(m.course_code); if(m.course_title)titles.add(m.course_title); if(m.teacher)teachers.add(m.teacher); if(m.section)sections.add(m.section); if(m.term)terms[m.term]=(terms[m.term]||0)+1;
  }
  const matchedRows=rows.filter(r=>r.disposition!=='duplicate' && r.disposition!=='excluded' && ['exact','normalized','title-exact','title-exact-ambiguous'].includes(r.mapped.course_match_type)).length;
  const referenceEligible=rows.filter(r=>r.disposition!=='duplicate' && r.disposition!=='excluded').length;
  const fldoeCoverage=referenceEligible ? matchedRows/referenceEligible : 0;
  const reconciliationTotal=counts.accepted+counts.held+counts.excluded+counts.exactDuplicates;
  return {rows,issues,counts,missingMappings,uniqueStudents,schools:[...schools],years:[...years],terms,codes:[...codes],titles:[...titles],teachers:[...teachers],sections:[...sections],fldoeCoverage,reconciles:reconciliationTotal===counts.sourceRows};
}

export function maskStudentKey(value){
  const v=clean(value); if(!v) return '';
  if(v.length<=4) return '••••';
  return `${v.slice(0,4)}•••${v.slice(-2)}`;
}

export function certificationGate(analysis){
  const blockers=[];
  if(analysis.missingMappings.length) blockers.push('Required field mapping is incomplete.');
  if(!analysis.reconciles) blockers.push('Import reconciliation does not balance.');
  if(analysis.issues.some(i=>i.type==='Unknown Term')) blockers.push('Unknown term values remain unresolved.');
  if(analysis.issues.some(i=>i.type==='Student Key Review')) blockers.push('Student keys must use approved pseudonymous identifiers before import.');
  if(analysis.rows.some(r=>r.issues.some(i=>i.type==='Possible Duplicate') && !r.duplicateResolved)) blockers.push('Possible duplicates remain unresolved.');
  if(analysis.counts.accepted===0) blockers.push('No enrollment records are eligible for import.');
  return {ready:blockers.length===0,blockers};
}
