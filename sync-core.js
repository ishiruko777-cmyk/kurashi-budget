import {validateSplitState} from './split.js?v=aabd4d155268';
/** Three-way merge: independent edits survive; conflicting fields require a user decision. */
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function mergeStates(base,local,remote){
 const conflicts=[];
 function merge(b,l,r,path){
  if(same(l,r))return l;
  if(same(b,l))return r;
  if(same(b,r))return l;
  if([b,l,r].every(v=>Array.isArray(v)&&v.every(x=>x&&typeof x.id==='string'))){
   const bm=new Map(b.map(x=>[x.id,x])),lm=new Map(l.map(x=>[x.id,x])),rm=new Map(r.map(x=>[x.id,x]));
   return [...new Set([...r,...l].map(x=>x.id))].map(k=>merge(bm.get(k),lm.get(k),rm.get(k),path+'.'+k)).filter(x=>x!==undefined);
  }
  if([b,l,r].every(v=>v&&typeof v==='object'&&!Array.isArray(v))){
   const out={};for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){const v=merge(b[k],l[k],r[k],path+'.'+k);if(v!==undefined)out[k]=v;}return out;
  }
  conflicts.push(path);return l;
 }
 const state=merge(base,local,remote,'data');
 // Two devices collecting the same receivable need review even below its limit.
 const changedReceipts=(before,after)=>new Set((after.transactions||[]).filter(t=>t.kind==='reimbursement'&&!same(t,(before.transactions||[]).find(b=>b.id===t.id))).map(t=>t.expenseId));
 const localReceipts=changedReceipts(base,local),remoteReceipts=changedReceipts(base,remote);
 for(const parent of localReceipts)if(remoteReceipts.has(parent)&&!same(local.transactions.filter(t=>t.expenseId===parent),remote.transactions.filter(t=>t.expenseId===parent)))conflicts.push('data.splitReceipts.'+parent);
 // Two independent override IDs must not hide two actual payments behind one recurrence.
 if(Array.isArray(state.transactions)){
  const activeLinks=new Map();
  for(const t of state.transactions)if((t.recurringSourceId||t.salarySourceId)&&!t.reverses&&!state.transactions.some(x=>x.reverses===t.id)){
   const previous=activeLinks.get(t.recurringSourceId||t.salarySourceId);
   if(previous&&previous!==t.id)conflicts.push('data.cashflowLinks.'+(t.recurringSourceId||t.salarySourceId));
   activeLinks.set(t.recurringSourceId||t.salarySourceId,t.id);
  }
 }
 if(Array.isArray(state.transactions)&&Array.isArray(state.accounts)){try{validateSplitState(state);}catch{conflicts.push('data.splitSettlements');}}
 return {state,conflicts};
}
export function hasHouseholdData(s){return s.setupDone||s.accounts.length>0||s.transactions.length>0;}
export const sameState=same;
