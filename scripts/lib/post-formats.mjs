export const FORMATS = ['question', 'checklist', 'two_sides', 'mini_story', 'punchline'];
export function nextFormat(posts, date) {
  const recent=posts.filter(p=>p.date<=date&&p.postFormat).sort((a,b)=>b.date.localeCompare(a.date));
  return FORMATS.find(f=>!recent.some(p=>p.postFormat===f)) || [...FORMATS].sort((a,b)=>recent.findIndex(p=>p.postFormat===b)-recent.findIndex(p=>p.postFormat===a))[0];
}
export function graphicMode(pillar,format){return ['tip','engagement'].includes(pillar)||(['booking','hiring'].includes(pillar)&&format!=='mini_story');}
