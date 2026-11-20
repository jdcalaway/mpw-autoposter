export const FORMATS = ['question', 'checklist', 'two_sides', 'mini_story', 'punchline'];
// Formats each pillar may use. Booking posts must end in an ask to book, so they
// skip the comment-bait formats (question, checklist).
export const PILLAR_FORMATS = { booking: ['punchline', 'mini_story', 'two_sides'] };
export function nextFormat(posts, date, pillar) {
  const allowed = PILLAR_FORMATS[pillar] || FORMATS;
  const recent=posts.filter(p=>p.date<=date&&p.postFormat).sort((a,b)=>b.date.localeCompare(a.date));
  return allowed.find(f=>!recent.some(p=>p.postFormat===f)) || [...allowed].sort((a,b)=>recent.findIndex(p=>p.postFormat===b)-recent.findIndex(p=>p.postFormat===a))[0];
}
export function graphicMode(pillar,format){return ['tip','engagement'].includes(pillar)||(['booking','hiring'].includes(pillar)&&format!=='mini_story');}
