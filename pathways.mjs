export const DISCIPLINES=['Music','Visual Art','Theatre','Dance','Other / Review Needed'];
export const SUBDISCIPLINES={
  'Music':['Band','Orchestra','Chorus','Guitar','Keyboard / Piano','Modern Band','Digital Music / Music Technology','General Music','Music Theory','Music Appreciation','Other Music'],
  'Visual Art':['General Visual Art','Drawing','Painting','Ceramics','Sculpture','Photography','Digital Art','Portfolio','Advanced / AP Visual Art','Other Visual Art'],
  'Theatre':['Theatre / Drama','Acting','Musical Theatre','Technical Theatre','Theatre Production','Directing','Other Theatre'],
  'Dance':['General Dance','Ballet','Jazz Dance','Modern / Contemporary','Dance Technique','Choreography','Dance Production','Other Dance'],
  'Other / Review Needed':['Review Needed']
};
export const COURSE_LEVELS=['Exploratory','Beginning','Intermediate','Advanced','Honors','AP','Ensemble','Other','Unknown'];
export const INCLUDE_VALUES=['Yes','No','Review Needed'];
export const CLASSIFICATION_STATUSES=['Administrator Confirmed','Approved SDOC Rule','Suggested','Review Needed'];

const norm=v=>String(v??'').trim();
const lower=v=>norm(v).toLowerCase();

export function disciplineFromFlorida(reference){
  const d=lower(reference?.discipline);
  if(d.includes('music')) return 'Music';
  if(d.includes('theatre') || d.includes('theater') || d.includes('drama')) return 'Theatre';
  if(d.includes('dance')) return 'Dance';
  if(d.includes('visual') || d.includes('art')) return 'Visual Art';
  return 'Other / Review Needed';
}

export function subdisciplineFromTitle(discipline,title){
  const t=lower(title);
  if(discipline==='Music'){
    if(/modern band|rock band/.test(t)) return 'Modern Band';
    if(/digital music|music technology|recording|audio production|music production|electronic music/.test(t)) return 'Digital Music / Music Technology';
    if(/band|wind ensemble|marching/.test(t)) return 'Band';
    if(/orchestra|string/.test(t)) return 'Orchestra';
    if(/chorus|choral|choir|vocal/.test(t)) return 'Chorus';
    if(/guitar/.test(t)) return 'Guitar';
    if(/keyboard|piano/.test(t)) return 'Keyboard / Piano';
    if(/theory/.test(t)) return 'Music Theory';
    if(/appreciation|music history|world music/.test(t)) return 'Music Appreciation';
    if(/general music|music grade|elementary music|music interm/.test(t)) return 'General Music';
    return 'Other Music';
  }
  if(discipline==='Visual Art'){
    if(/advanced placement|\bap\b/.test(t)) return 'Advanced / AP Visual Art';
    if(/portfolio/.test(t)) return 'Portfolio';
    if(/drawing/.test(t)) return 'Drawing';
    if(/painting/.test(t)) return 'Painting';
    if(/ceramic/.test(t)) return 'Ceramics';
    if(/sculpt/.test(t)) return 'Sculpture';
    if(/photo/.test(t)) return 'Photography';
    if(/digital art/.test(t)) return 'Digital Art';
    return 'General Visual Art';
  }
  if(discipline==='Theatre'){
    if(/musical theatre|music theatre/.test(t)) return 'Musical Theatre';
    if(/technical theatre|technical theater|tech thea|costume|scenery|makeup|hair/.test(t)) return 'Technical Theatre';
    if(/direct|stage management/.test(t)) return 'Directing';
    if(/acting/.test(t)) return 'Acting';
    if(/production/.test(t)) return 'Theatre Production';
    return 'Theatre / Drama';
  }
  if(discipline==='Dance'){
    if(/ballet/.test(t)) return 'Ballet';
    if(/jazz/.test(t)) return 'Jazz Dance';
    if(/modern|contemporary/.test(t)) return 'Modern / Contemporary';
    if(/technique/.test(t)) return 'Dance Technique';
    if(/choreograph/.test(t)) return 'Choreography';
    if(/production/.test(t)) return 'Dance Production';
    return 'General Dance';
  }
  return 'Review Needed';
}

export function pathwayFromSubdiscipline(discipline,sub){
  if(discipline==='Music'){
    const map={
      'Band':'Band','Orchestra':'Orchestra','Chorus':'Chorus','Guitar':'Guitar',
      'Keyboard / Piano':'Keyboard / Piano','Modern Band':'Modern Band',
      'Digital Music / Music Technology':'Digital Music','General Music':'General Music',
      'Music Theory':'Music Theory','Music Appreciation':'Music Appreciation','Other Music':'Music'
    };
    return map[sub]||'Music';
  }
  if(discipline==='Visual Art') return 'Visual Art';
  if(discipline==='Theatre') return 'Theatre';
  if(discipline==='Dance') return 'Dance';
  return 'Review Needed';
}

export function courseLevelFromTitle(title){
  const t=lower(title);
  if(/advanced placement|(^|\W)ap(\W|$)/.test(t)) return 'AP';
  if(/honors|\bhon\b/.test(t)) return 'Honors';
  if(/beginning|\bbasic\b/.test(t)) return 'Beginning';
  if(/explor|introduction|\bintro\b|appreciation/.test(t)) return 'Exploratory';
  const match=t.match(/(?:^|\s)([1-6])(?:\s|$)/);
  if(match){
    const n=Number(match[1]);
    if(n===1) return 'Beginning';
    if(n===2) return 'Intermediate';
    return 'Advanced';
  }
  if(/ensemble|symphonic|wind ensemble|concert band|concert chorus|chamber|marching/.test(t)) return 'Ensemble';
  return 'Unknown';
}

export function suggestClassification(reference, observedTitles=[]){
  const title=reference?.title || observedTitles[0] || '';
  const discipline=disciplineFromFlorida(reference);
  if(discipline==='Other / Review Needed'){
    return {include:'Review Needed',discipline,subdiscipline:'Review Needed',pathway:'Review Needed',courseLevel:courseLevelFromTitle(title),status:'Review Needed',notes:''};
  }
  const subdiscipline=subdisciplineFromTitle(discipline,title);
  return {
    include:'Yes',
    discipline,
    subdiscipline,
    pathway:pathwayFromSubdiscipline(discipline,subdiscipline),
    courseLevel:courseLevelFromTitle(title),
    status:'Suggested',
    notes:''
  };
}

export function classificationIsFull(c){
  if(!c) return false;
  if(c.include==='No') return true;
  if(c.include!=='Yes') return false;
  return Boolean(c.discipline && c.discipline!=='Other / Review Needed' &&
    c.subdiscipline && c.subdiscipline!=='Review Needed' &&
    c.pathway && c.pathway!=='Review Needed' &&
    c.courseLevel && c.courseLevel!=='Unknown' &&
    c.status && c.status!=='Review Needed');
}

export function aggregateObservedCourses(records, referenceMap, savedMap=new Map()){
  const groups=new Map();
  for(const record of records){
    const m=record.mapped||{};
    const code=norm(m.course_code); if(!code) continue;
    let g=groups.get(code);
    if(!g){
      g={code,reference:referenceMap.get(code)||null,titles:new Set(),schools:new Set(),students:new Set(),enrollmentCount:0};
      groups.set(code,g);
    }
    if(m.course_title) g.titles.add(norm(m.course_title));
    if(m.school) g.schools.add(norm(m.school));
    if(m.student_id) g.students.add(norm(m.student_id));
    g.enrollmentCount++;
  }
  return [...groups.values()].map(g=>{
    const observedTitles=[...g.titles].sort();
    const saved=savedMap.get(g.code)||null;
    const classification=saved || suggestClassification(g.reference,observedTitles);
    return {
      code:g.code,
      officialTitle:g.reference?.title||'Local / unmatched course',
      floridaDiscipline:g.reference?.discipline||'Not in Florida reference',
      gradeBand:g.reference?.gradeBand||'Local / unknown',
      observedTitles,
      schools:[...g.schools].sort(),
      enrollmentCount:g.enrollmentCount,
      studentCount:g.students.size,
      classification,
      isSaved:Boolean(saved)
    };
  }).sort((a,b)=>{
    const ar=classificationIsFull(a.classification)?1:0;
    const br=classificationIsFull(b.classification)?1:0;
    if(ar!==br) return ar-br;
    return b.enrollmentCount-a.enrollmentCount || a.code.localeCompare(b.code);
  });
}

export function calculateCoverage(courses, records, savedMap=new Map()){
  let fully=0, partially=0, review=0, excluded=0;
  const statusByCode=new Map();
  for(const course of courses){
    const c=savedMap.get(course.code)||course.classification;
    let status='review';
    if(c?.include==='No'){excluded++; status='excluded';}
    else if(classificationIsFull(c)){fully++; status='full';}
    else if(c && Object.values(c).some(v=>norm(v))){partially++; status='partial';}
    else {review++;}
    if(c?.include==='Review Needed' || c?.status==='Review Needed'){ if(status==='partial'){partially--;review++;} status='review'; }
    statusByCode.set(course.code,status);
  }

  const enrollment={full:0,partial:0,review:0,excluded:0};
  const students=new Map();
  for(const r of records){
    const code=norm(r.mapped?.course_code);
    const status=statusByCode.get(code)||'review';
    enrollment[status]=(enrollment[status]||0)+1;
    const sid=norm(r.mapped?.student_id);
    if(sid){
      const s=students.get(sid)||{hasIncluded:false,unresolved:false};
      if(status==='full') s.hasIncluded=true;
      else if(status==='partial' || status==='review'){s.hasIncluded=true;s.unresolved=true;}
      students.set(sid,s);
    }
  }
  let studentsFully=0, studentsUnresolved=0;
  for(const s of students.values()){
    if(s.unresolved) studentsUnresolved++;
    else if(s.hasIncluded) studentsFully++;
  }
  return {
    courses:{total:courses.length,fully,partially,review,excluded},
    enrollment,
    students:{fully:studentsFully,unresolved:studentsUnresolved}
  };
}

export function makeConfirmed(existing, updates, actor='Administrator'){
  const next={...existing,...updates,status:'Administrator Confirmed'};
  const before={...existing}; delete before.audit;
  const after={...next}; delete after.audit;
  const changes={};
  for(const key of ['include','discipline','subdiscipline','pathway','courseLevel','status','notes']){
    if(norm(before[key])!==norm(after[key])) changes[key]={from:before[key]??'',to:after[key]??''};
  }
  return {...next,audit:[...(existing?.audit||[]),{changedAt:new Date().toISOString(),actor,changes}]};
}
