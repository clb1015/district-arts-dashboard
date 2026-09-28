import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldenSummary,certificationRecord,datasetKind} from '../golden.mjs';

const refs=new Map([
  ['1302300',{code:'1302300',discipline:'Music Education',title:'Band 1',gradeBand:'Grades 6-12'}],
  ['1302310',{code:'1302310',discipline:'Music Education',title:'Band 2',gradeBand:'Grades 6-12'}],
  ['0400310',{code:'0400310',discipline:'Drama / Theatre Arts',title:'Theatre 1',gradeBand:'Grades 9-12'}],
  ['0400410',{code:'0400410',discipline:'Drama / Theatre Arts',title:'Technical Theatre: Design & Production 1',gradeBand:'Grades 9-12'}]
]);
const mapping={student_id:'Student Number',school:'Campus',school_year:'Academic Year',term:'Semester Name',course_code:'Course Num',course_title:'Class Name',teacher:'Instructor',grade:'Grade Level',section:'Sec Num'};

function rec(student_id,school,term,course_code,course_title,grade,match='exact'){
  return {identity:[student_id,'2026-2027',term,school,course_code].join('|'),mapped:{student_id,school,school_year:'2026-2027',term,course_code,course_title,grade,course_match_type:match}};
}
const records=[
  rec('SYN-0001','Harmony Middle School','Fall','1302300','Band 1','6'),
  rec('SYN-0001','Harmony Middle School','Spring','1302300','Band 1','6'),
  rec('SYN-0002','Harmony Middle School','Fall','1302300','Band 1','6'),
  rec('SYN-0002','Harmony Middle School','Fall','1302300','Band 1','6'),
  rec('SYN-0003','Harmony Middle School','Fall','1302310','Band 2','7'),
  rec('SYN-0004','St. Cloud High School','Yearlong','0400310','Theatre 1','9'),
  rec('SYN-0005','St. Cloud High School','Yearlong','0400410','Technical Theatre: Design & Production 1','10'),
  rec('SYN-0006','St. Cloud High School','Spring','0400310','Theatre 1','9'),
  rec('SYN-0007','Tohopekaliga High School','Spring','1302300','Band 1','9'),
  rec('SYN-0008','Tohopekaliga High School','Spring','9999999','Local Music Lab','10','local'),
  rec('SYN-0009','Tohopekaliga High School','Spring','1302300','Band 1','9'),
  rec('SYN-0010','Tohopekaliga High School','Spring','1302300','Band 1','9')
];
const pathways=new Map([
  ['1302300',{code:'1302300',include:'Yes',discipline:'Music',subdiscipline:'Band',pathway:'Band',courseLevel:'Beginning',status:'Administrator Confirmed'}],
  ['1302310',{code:'1302310',include:'Yes',discipline:'Music',subdiscipline:'Band',pathway:'Band',courseLevel:'Intermediate',status:'Administrator Confirmed'}],
  ['0400310',{code:'0400310',include:'Yes',discipline:'Theatre',subdiscipline:'Theatre / Drama',pathway:'Theatre',courseLevel:'Beginning',status:'Administrator Confirmed'}],
  ['0400410',{code:'0400410',include:'Yes',discipline:'Theatre',subdiscipline:'Technical Theatre',pathway:'Theatre',courseLevel:'Beginning',status:'Administrator Confirmed'}]
]);
const imp={id:'IMP-11111111',filename:'Golden_Import_Synthetic_Test_v2.csv',status:'active',sourceRows:13,acceptedRows:12,heldRows:0,excludedRows:0,exactDuplicates:1,mapping,fldoeCoverage:11/12,audit:{reconciles:true,rawPreserved:true},acceptedRecords:records};

test('synthetic accepted import produces the expected summary and pathway coverage',()=>{
  const s=buildGoldenSummary(imp,refs,pathways);
  assert.equal(s.kind,'synthetic');
  assert.equal(s.ready,true);
  assert.equal(s.sourceRows,13);
  assert.equal(s.activeEnrollmentRecords,12);
  assert.equal(s.uniqueStudents,10);
  assert.equal(s.duplicateRecordsPrevented,1);
  assert.equal(s.unknownCourseCodes.length,1);
  assert.equal(s.unknownCourseCodes[0],'9999999');
  assert.equal(s.coursesNeedingReview.length,1);
  assert.equal(s.pathwayCoverage,11/12);
  assert.equal(s.schools,3);
  assert.deepEqual(s.disciplines,['Music','Theatre']);
});

test('synthetic benchmark can be recorded as synthetic acceptance but not production Golden Import',()=>{
  const s=buildGoldenSummary(imp,refs,pathways);
  assert.equal(certificationRecord(s,'synthetic').status,'Passed');
  assert.throws(()=>certificationRecord(s,'golden'),/ANON-/);
});

test('de-identified district candidate can be certified as Golden Import',()=>{
  const anonRecords=records.map((r,i)=>({...r,mapped:{...r.mapped,student_id:'ANON-'+String(i+1).padStart(4,'0')}}));
  const anon={...imp,id:'IMP-22222222',filename:'district-deidentified.csv',acceptedRecords:anonRecords};
  const s=buildGoldenSummary(anon,refs,pathways);
  assert.equal(datasetKind(anonRecords),'deidentified');
  assert.equal(s.ready,true);
  const cert=certificationRecord(s,'golden');
  assert.equal(cert.status,'Certified');
  assert.equal(cert.id,'golden');
});

test('mixed or unapproved identifiers block certification',()=>{
  const bad={...imp,acceptedRecords:[...records.slice(0,11),rec('123456','School','Fall','1302300','Band 1','9')]};
  const s=buildGoldenSummary(bad,refs,pathways);
  assert.equal(s.ready,false);
  assert.match(s.blockers.join(' '),/Student keys/);
});
