/** Receivables are descriptive only. Only recorded receipts create cash events. */
export function splitInfo(s,t,asOf='9999-12-31'){
 const own=t.split?.ownAmount??t.amount,advanced=t.amount-own;
 const receipts=s.transactions.filter(r=>r.kind==='reimbursement'&&r.expenseId===t.id&&r.date<=asOf);
 const recovered=receipts.reduce((n,r)=>n+r.amount,0),outstanding=advanced-recovered;
 return {own,advanced,recovered,outstanding,receipts,status:recovered===0?'未精算':outstanding===0?'精算済み':'一部精算'};
}
export function validateSplitState(s,asOf){
 const receipts=new Set();
 for(const t of s.transactions){
  if(t.split!=null){
   if(!['expense','cancel'].includes(t.kind)||t.debtId||t.debtOperationId||t.debtSettlement||!Number.isSafeInteger(t.split.ownAmount)||t.split.ownAmount<0||t.split.ownAmount>=t.amount)throw Error('立替は通常の支出で、自分の負担額を決済金額未満の整数にしてください。');
   if(splitInfo(s,t).outstanding<0)throw Error('回収済み金額が立替金額を超えます。精算記録を先に修正してください。');
  }
  if(t.kind!=='reimbursement')continue;
  const key=JSON.stringify([t.expenseId,t.date,t.accountId,t.amount,t.name||'',t.memo||'']);
  if(receipts.has(key))throw Error('同じ内容の精算がすでにあります。履歴を確認してください。別の受取ならメモで区別してください。');
  receipts.add(key);
  const parent=s.transactions.find(p=>p.id===t.expenseId);
  if(!parent?.split||parent.kind!=='expense'||parent.status!=='actual'||parent.reverses||s.transactions.some(r=>r.reverses===parent.id))throw Error('精算先の有効な立替支出が見つかりません。');
  if(t.status!=='actual'||t.date<parent.date||(asOf&&t.date>asOf)||!Number.isSafeInteger(t.amount)||t.amount<=0||!s.accounts.some(a=>a.id===t.accountId)||t.cardId||t.debitCardId||t.toAccountId||t.fee||t.split||t.reverses||t.reserveCardId||t.salarySourceId||t.recurringSourceId||t.debtId||t.debtOperationId||t.debtSettlement)throw Error('精算は支出日以降・今日以前の受取済み金額と、受取口座を指定してください。');
 }
}
