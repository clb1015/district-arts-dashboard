import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestClassification,aggregateObservedCourses,calculateCoverage,makeConfirmed,classificationIsFull} from '../pathways.mjs';

const refs=new Map([
  ['1302300',{code:'1302300',discipline:'Music Education',title:'Band 1',gradeBand:'Grades 9-12'}],
  ['1302310',{code:'1302310',discipline:'Music Education',title:'Band 2',gradeBand:'Grades 9-12'}],
  ['0400310',{code:'0400310',discipline:'Drama / Theatre Arts',title:'Theatre 1',gradeBand:'Grades 9-12'}],
  ['0400410',{code:'0400410',discipline:'Drama / Theatre Arts',title:'Technical Theatre: Design & Production 1',gradeBand:'Grades 9-12'}]
]);
const records=[
  {mapped:{student_id:'SYN-0001',school:'A',course_code:'1302300',course_title:'Band I'}},
  {mapped:{student_id:'SYN-0002',school:'A',course_code:'1302300',course_title:'Concert Band 1'}},
  {mapped:{student_id:'SYN-0003',school:'B',course_code:'1302310',course_title:'Band 2'}},
  {mapped:{student_id:'SYN-0004',school:'B',course_code:'0400310',course_title:'Theatre 1'}},
  {mapped:{student_id:'SYN-0005',school:'B',course_code:'0400410',course_title:'Technical Theatre 1'}},
  {mapped:{student_id:'SYN-0006',school:'C',course_code:'9999999',course_title:'Local Music Lab'}}
];

test('official music and theatre metadata produce conservative pathway suggestions',()=>{
  const band=suggestClassification(refs.get('1302300'),['Band I']);
  assert.equal(band.discipline,'Music');
  assert.equal(band.subdiscipline,'Band');
  assert.equal(band.pathway,'Band');
  assert.equal(band.courseLevel,'Beginning');
  assert.equal(band.include,'Yes');

  const tech=suggestClassification(refs.get('0400410'),['Technical Theatre 1']);
  assert.equal(tech.discipline,'Theatre');
  assert.equal(tech.subdiscipline,'Technical Theatre');
  assert.equal(tech.pathway,'Theatre');
});

test('unmatched local course remains Review Needed',()=>{
  const local=suggestClassification(null,['Local Music Lab']);
  assert.equal(local.include,'Review Needed');
  assert.equal(local.status,'Review Needed');
  assert.equal(classificationIsFull(local),false);
});

test('observed course aggregation uses course code and preserves title variants',()=>{
  const courses=aggregateObservedCourses(records,refs,new Map());
  const band=courses.find(c=>c.code==='1302300');
  assert.equal(band.enrollmentCount,2);
  assert.equal(band.studentCount,2);
  assert.deepEqual(band.observedTitles,['Band I','Concert Band 1']);
});

test('administrator confirmation is durable and auditable',()=>{
  const suggested=suggestClassification(refs.get('1302300'),['Band I']);
  const confirmed=makeConfirmed(suggested,{code:'1302300',notes:'District band pathway'});
  assert.equal(confirmed.status,'Administrator Confirmed');
  assert.equal(confirmed.audit.length,1);
  assert.equal(classificationIsFull(confirmed),true);
});

test('coverage reports unresolved courses and affected students without exposing IDs',()=>{
  const saved=new Map();
  let courses=aggregateObservedCourses(records,refs,saved);
  const band=courses.find(c=>c.code==='1302300');
  saved.set('1302300',makeConfirmed(band.classification,{code:'1302300'}));
  courses=aggregateObservedCourses(records,refs,saved);
  const cov=calculateCoverage(courses,records,saved);
  assert.equal(cov.courses.total,5);
  assert.equal(cov.courses.review,1);
  assert.equal(cov.enrollment.review,1);
  assert.equal(cov.students.unresolved,1);
});
