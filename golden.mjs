import {REQUIRED_FIELDS} from './core.mjs';
import {aggregateObservedCourses,calculateCoverage,classificationIsFull} from './pathways.mjs';

const norm=v=>String(v??'').trim();

export function datasetKind(records){
  const ids=records.map(r=>norm(r?.mapped?.student_id)).filter(Boolean);
  if(!ids.length) return 'empty';
  if(ids.every(id=>/^SYN-/i.test(id))) return 'synthetic';
  if(ids.every(id=>/^ANON-/i.test(id))) return 'deidentified';
  return 'mixed-or-unapproved';
}

export function buildGoldenSummary(importRecord, referenceMap, savedPathways=new Map()){
  const records=importRecord?.acceptedRecords||[];
  const courses=aggregateObservedCourses(records,referenceMap,savedPathways);
  const coverage=calculateCoverage(courses,records,savedPathways);
  const mappedFields=importRecord?.mapping||{};
  const missingMappings=REQUIRED_FIELDS.filter(f=>!mappedFields[f]);

  const students=new Set(records.map(r=>norm(r?.mapped?.student_id)).filter(Boolean));
  const schools=new Set(records.map(r=>norm(r?.mapped?.school)).filter(Boolean));
  const grades=new Set(records.map(r=>norm(r?.mapped?.grade)).filter(Boolean));
  const termCounts={Fall:0,Spring:0,Yearlong:0,Summer:0,Other:0};
  for(const r of records){
    const t=norm(r?.mapped?.term);
    if(Object.prototype.hasOwnProperty.call(termCounts,t)) termCounts[t]++;
    else if(t) termCounts.Other++;
  }

  const unknownCodes=[...new Set(records
    .filter(r=>['local','unmatched'].includes(r?.mapped?.course_match_type))
    .map(r=>norm(r?.mapped?.course_code)).filter(Boolean))];

  const reviewCourses=courses.filter(c=>{
    const cl=savedPathways.get(c.code)||c.classification;
    return cl?.include==='Review Needed' || cl?.status==='Review Needed' || !classificationIsFull(cl);
  });

  const disciplines=[...new Set(courses.map(c=>{
    const cl=savedPathways.get(c.code)||c.classification;
    return cl?.include==='No' ? null : cl?.discipline;
  }).filter(d=>d && d!=='Other / Review Needed'))].sort();

  const eligibleCoverage=coverage.enrollment.full+coverage.enrollment.partial+coverage.enrollment.review;
  const pathwayCoverage=eligibleCoverage ? coverage.enrollment.full/eligibleCoverage : 0;

  const blockers=[];
  if(!importRecord || importRecord.status!=='active') blockers.push('Selected import is not active.');
  if(missingMappings.length) blockers.push('Required mappings are incomplete.');
  if(importRecord?.heldRows) blockers.push('Held enrollment records remain unresolved.');
  if(importRecord?.audit?.reconciles!==true) blockers.push('Source-row reconciliation is not balanced.');
  if(importRecord?.audit?.rawPreserved!==true) blockers.push('Raw source preservation is not confirmed.');
  if(typeof importRecord?.fldoeCoverage!=='number') blockers.push('FLDOE course-match coverage is unavailable.');
  if(records.length===0) blockers.push('No active enrollment records are available.');
  if(datasetKind(records)==='mixed-or-unapproved') blockers.push('Student keys are mixed or not approved pseudonymous identifiers.');

  const kind=datasetKind(records);
  return {
    kind,
    blockers,
    ready:blockers.length===0,
    importId:importRecord?.id||'',
    filename:importRecord?.filename||'',
    createdAt:importRecord?.createdAt||'',
    sourceRows:importRecord?.sourceRows||0,
    activeEnrollmentRecords:records.length,
    uniqueStudents:students.size,
    duplicateRecordsPrevented:importRecord?.exactDuplicates||0,
    heldRecords:importRecord?.heldRows||0,
    excludedRecords:importRecord?.excludedRows||0,
    fldoeCoverage:importRecord?.fldoeCoverage||0,
    pathwayCoverage,
    unknownCourseCodes:unknownCodes,
    coursesNeedingReview:reviewCourses.map(c=>c.code),
    terms:termCounts,
    schools:schools.size,
    grades:[...grades].sort((a,b)=>Number(a)-Number(b)),
    disciplines,
    pathwayCoverageDetail:coverage,
    observedCourseCount:courses.length
  };
}

export function certificationRecord(summary,type){
  if(!summary?.ready) throw new Error('Import does not meet certification gates.');
  if(type==='synthetic' && summary.kind!=='synthetic') throw new Error('Synthetic acceptance requires SYN- student keys.');
  if(type==='golden' && summary.kind!=='deidentified') throw new Error('Production Golden Import requires ANON- student keys.');
  return {
    id:type==='golden'?'golden':'synthetic-acceptance',
    type,
    status:type==='golden'?'Certified':'Passed',
    importId:summary.importId,
    fingerprint:null,
    certifiedAt:new Date().toISOString(),
    summary:{
      sourceRows:summary.sourceRows,
      activeEnrollmentRecords:summary.activeEnrollmentRecords,
      uniqueStudents:summary.uniqueStudents,
      duplicateRecordsPrevented:summary.duplicateRecordsPrevented,
      heldRecords:summary.heldRecords,
      excludedRecords:summary.excludedRecords,
      fldoeCoverage:summary.fldoeCoverage,
      pathwayCoverage:summary.pathwayCoverage,
      unknownCourseCodes:summary.unknownCourseCodes,
      coursesNeedingReview:summary.coursesNeedingReview,
      terms:summary.terms,
      schools:summary.schools,
      grades:summary.grades,
      disciplines:summary.disciplines
    }
  };
}
