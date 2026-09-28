import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proposeMappings,mappingFromSuggestions,normalizeTerm,normalizeCourseCode,analyzeImport,certificationGate,matchCourseReference
} from '../core.mjs';

const rows = [
  {'Student Number':'SYN-0001','Campus':'Harmony Middle School','Academic Year':'2026-27','Semester Name':'Semester 1','Course Num':'1302000','Class Name':'M/J Band 1','Instructor':'Teacher A','Grade Level':'6','Sec Num':'001','Local Extra':'source-A',__row_number:2},
  {'Student Number':'SYN-0001','Campus':'Harmony Middle School','Academic Year':'2026-27','Semester Name':'Semester 2','Course Num':'1302000','Class Name':'M/J Band 1','Instructor':'Teacher A','Grade Level':'6','Sec Num':'001','Local Extra':'source-A',__row_number:3},
  {'Student Number':'SYN-0002','Campus':'Harmony Middle School','Academic Year':'2026-27','Semester Name':'S1','Course Num':'1302000','Class Name':'M/J Band 1','Instructor':'Teacher A','Grade Level':'6','Sec Num':'001','Local Extra':'source-A',__row_number:4},
  {'Student Number':'SYN-0002','Campus':'Harmony Middle School','Academic Year':'2026-27','Semester Name':'S1','Course Num':'1302000','Class Name':'M/J Band 1','Instructor':'Teacher A','Grade Level':'6','Sec Num':'002','Local Extra':'source-A',__row_number:5},
  {'Student Number':'SYN-0003','Campus':'Harmony Middle School','Academic Year':'2026-27','Semester Name':'Fall','Course Num':'1302010','Class Name':'M/J Band 2','Instructor':'Teacher A','Grade Level':'7','Sec Num':'','Local Extra':'source-A',__row_number:6},
  {'Student Number':'SYN-0004','Campus':'St. Cloud High School','Academic Year':'2026-27','Semester Name':'Annual','Course Num':'0400310','Class Name':'Theatre 1','Instructor':'Teacher B','Grade Level':'9','Sec Num':'101','Local Extra':'source-B',__row_number:7},
  {'Student Number':'SYN-0005','Campus':'St. Cloud High School','Academic Year':'2026-27','Semester Name':'Full Year','Course Num':'0400410','Class Name':'Technical Theatre: Design & Production 1','Instructor':'Teacher C','Grade Level':'10','Sec Num':'201','Local Extra':'source-B',__row_number:8},
  {'Student Number':'SYN-0006','Campus':'St. Cloud High School','Academic Year':'2026-27','Semester Name':'Sem 2','Course Num':'0400310','Class Name':'Theatre 1','Instructor':'Teacher B','Grade Level':'9','Sec Num':'102','Local Extra':'source-B',__row_number:9},
  {'Student Number':'SYN-0007','Campus':'Tohopekaliga High School','Academic Year':'2026-27','Semester Name':'T2','Course Num':'1302300','Class Name':'Band 1','Instructor':'Teacher D','Grade Level':'9','Sec Num':'301','Local Extra':'source-C',__row_number:10},
  {'Student Number':'SYN-0008','Campus':'Tohopekaliga High School','Academic Year':'2026-27','Semester Name':'Spring','Course Num':'9999999','Class Name':'Local Music Lab','Instructor':'Teacher D','Grade Level':'10','Sec Num':'302','Local Extra':'source-C',__row_number:11},
  {'Student Number':'SYN-0009','Campus':'Tohopekaliga High School','Academic Year':'2026-27','Semester Name':'Spring','Course Num':'1302300','Class Name':'Band 1','Instructor':'Teacher D','Grade Level':'9','Sec Num':'303','Local Extra':'source-C',__row_number:12},
  {'Student Number':'SYN-0010','Campus':'Tohopekaliga High School','Academic Year':'2026-27','Semester Name':'Spring','Course Num':'1302300','Class Name':'Band 1','Instructor':'Teacher D','Grade Level':'9','Sec Num':'304','Local Extra':'source-C',__row_number:13},
];
rows.push({...rows[0],__row_number:14});
const headers=Object.keys(rows[0]).filter(k=>!k.startsWith('__'));
const ref = new Map([
  ['1302000',{code:'1302000',abbreviatedTitle:'M/J BAND 1',title:'M/J Band 1',discipline:'Music Education',gradeBand:'Grades 6-8'}],
  ['1302010',{code:'1302010',abbreviatedTitle:'M/J BAND 2',title:'M/J Band 2',discipline:'Music Education',gradeBand:'Grades 6-8'}],
  ['1302300',{code:'1302300',abbreviatedTitle:'BAND 1',title:'Band 1',discipline:'Music Education',gradeBand:'Grades 9-12'}],
  ['0400310',{code:'0400310',abbreviatedTitle:'THEATRE 1',title:'Theatre 1',discipline:'Drama / Theatre Arts',gradeBand:'Grades 9-12'}],
  ['0400410',{code:'0400410',abbreviatedTitle:'TECH THEATRE 1',title:'Technical Theatre: Design & Production 1',discipline:'Drama / Theatre Arts',gradeBand:'Grades 9-12'}],
]);

test('mapping finds all nine canonical fields',()=>{
  const s=proposeMappings(headers,rows);
  const m=mappingFromSuggestions(s);
  assert.equal(m.student_id,'Student Number');
  assert.equal(m.school,'Campus');
  assert.equal(m.school_year,'Academic Year');
  assert.equal(m.term,'Semester Name');
  assert.equal(m.course_code,'Course Num');
  assert.equal(m.course_title,'Class Name');
  assert.equal(m.teacher,'Instructor');
  assert.equal(m.grade,'Grade Level');
  assert.equal(m.section,'Sec Num');
});

test('term normalization handles expected variants and holds T2',()=>{
  assert.equal(normalizeTerm('Semester 1').normalized,'Fall');
  assert.equal(normalizeTerm('S1').normalized,'Fall');
  assert.equal(normalizeTerm('Sem 2').normalized,'Spring');
  assert.equal(normalizeTerm('Annual').normalized,'Yearlong');
  assert.equal(normalizeTerm('Full Year').normalized,'Yearlong');
  assert.equal(normalizeTerm('T2').status,'review');
});

test('course codes preserve or restore leading zero from official reference',()=>{
  assert.equal(normalizeCourseCode('0400310',[...ref.keys()]).normalized,'0400310');
  assert.equal(normalizeCourseCode('400310',[...ref.keys()]).normalized,'0400310');
});

test('first-pass synthetic import auto-excludes rows outside the Florida arts reference',()=>{
  const mapping=mappingFromSuggestions(proposeMappings(headers,rows));
  const a=analyzeImport(rows,mapping,ref);
  assert.equal(a.counts.sourceRows,13);
  assert.equal(a.counts.exactDuplicates,1);
  assert.equal(a.counts.held,1);
  assert.equal(a.counts.excluded,1);
  assert.equal(a.counts.autoReferenceExcluded,1);
  assert.equal(a.counts.accepted,10);
  assert.equal(a.uniqueStudents,8);
  assert.equal(a.issues.filter(i=>i.type==='Unknown Term').length,1);
  assert.equal(a.issues.filter(i=>i.type==='Questionable Course Code').length,0);
  assert.equal(a.rows.find(r=>r.mapped.student_id==='SYN-0008').disposition,'excluded');
  assert.equal(a.rows.find(r=>r.mapped.student_id==='SYN-0008').exclusionReason,'No code or title match in Florida arts reference');
  assert.equal(a.rows.filter(r=>r.mapped.student_id==='SYN-0002' && r.disposition==='accepted').length,2);
  assert.equal(a.rows.find(r=>r.mapped.student_id==='SYN-0003').disposition,'accepted');
  assert.equal(a.reconciles,true);
  assert.equal(certificationGate(a).ready,false);
});

test('resolved synthetic import becomes import-ready with non-reference courses excluded',()=>{
  const mapping=mappingFromSuggestions(proposeMappings(headers,rows));
  const resolutions={terms:{T2:'Spring'},courses:{},duplicates:{}};
  const a=analyzeImport(rows,mapping,ref,resolutions);
  assert.equal(a.counts.sourceRows,13);
  assert.equal(a.counts.exactDuplicates,1);
  assert.equal(a.counts.held,0);
  assert.equal(a.counts.excluded,1);
  assert.equal(a.counts.autoReferenceExcluded,1);
  assert.equal(a.counts.accepted,11);
  assert.equal(a.uniqueStudents,9);
  assert.equal(a.rows.filter(r=>r.mapped.student_id==='SYN-0002' && r.disposition==='accepted').length,2);
  assert.equal(a.rows.find(r=>r.mapped.student_id==='SYN-0003').disposition,'accepted');
  assert.equal(a.reconciles,true);
  assert.equal(certificationGate(a).ready,true);
});


test('non-pseudonymous student keys are held and block import readiness',()=>{
  const bad=[{...rows[0],'Student Number':'123456',__row_number:2}];
  const mapping=mappingFromSuggestions(proposeMappings(headers,bad));
  const a=analyzeImport(bad,mapping,ref);
  assert.equal(a.counts.held,1);
  assert.equal(a.issues.filter(i=>i.type==='Student Key Review').length,1);
  assert.equal(certificationGate(a).ready,false);
});

test('exact normalized course title keeps a row even when the source code does not match',()=>{
  const one=[{...rows[5],'Course Num':'LOCAL-THEATRE','Class Name':'Theatre 1',__row_number:2}];
  const mapping=mappingFromSuggestions(proposeMappings(headers,one));
  const a=analyzeImport(one,mapping,ref);
  assert.equal(a.counts.accepted,1);
  assert.equal(a.counts.excluded,0);
  assert.equal(a.rows[0].mapped.course_match_type,'title-exact');
  assert.equal(a.rows[0].mapped.reference_code,'0400310');
  assert.equal(a.fldoeCoverage,1);
});

test('a row matching neither Florida code nor title is automatically excluded rather than held',()=>{
  const one=[{...rows[9],'Course Num':'9999999','Class Name':'Algebra 1',__row_number:2}];
  const mapping=mappingFromSuggestions(proposeMappings(headers,one));
  const a=analyzeImport(one,mapping,ref);
  assert.equal(a.counts.accepted,0);
  assert.equal(a.counts.held,0);
  assert.equal(a.counts.excluded,1);
  assert.equal(a.counts.autoReferenceExcluded,1);
  assert.equal(a.rows[0].exclusionReason,'No code or title match in Florida arts reference');
});

test('administrative waivers stay in source audit but out of enrollment and coverage',()=>{
  const waiverCodes=['1500440','1500441','1500442','1500445'];
  const waiverRows=waiverCodes.map((code,i)=>({...rows[0],'Student Number':`SYN-W${i+1}`,'Course Num':code,'Class Name':'Administrative waiver',__row_number:i+2}));
  const source=[...waiverRows,{...waiverRows[0],__row_number:6},{...rows[0],__row_number:7}];
  const reference=new Map([...ref,...waiverCodes.map(code=>[code,{code,title:'Administrative waiver'}])]);
  const mapping=mappingFromSuggestions(proposeMappings(headers,source));
  const a=analyzeImport(source,mapping,reference);
  assert.deepEqual([a.counts.sourceRows,a.counts.accepted,a.counts.excluded,a.counts.exactDuplicates,a.uniqueStudents],[6,1,4,1,1]);
  assert.equal(a.fldoeCoverage,1);
  assert.equal(a.reconciles,true);
  assert.equal(certificationGate(a).ready,true);
  assert.deepEqual(a.rows.filter(r=>r.disposition==='excluded').map(r=>r.mapped.course_code),waiverCodes);
  assert.equal(a.rows[4].disposition,'duplicate');
  assert.equal(a.issues.filter(i=>i.type==='Administrative Waiver Excluded').length,4);
  assert.equal(a.rows[0].raw['Course Num'],'1500440');
  assert.equal(a.rows[0].exclusionReason,'Administrative waiver');
});
