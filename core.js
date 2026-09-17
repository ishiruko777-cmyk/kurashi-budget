/** Money is integer JPY. Dates are local calendar ISO strings; no UTC conversion of user dates. */
export const id=()=>globalThis.crypto.randomUUID();
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const day=(s)=>new Date(s+'T12:00:00Z');
export const iso=(d)=>d.toISOString().slice(0,10);
export const addDays=(s,n)=>{const d=day(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
export const days=(a,b)=>Math.round((day(b)-day(a))/86400000);
export const monthDate=(s,offset,date)=>{const d=day(s);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+offset);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(date,end));return iso(d);};
export const round=(n,mode='ceil')=>Math[mode==='floor'?'floor':mode==='round'?'round':'ceil'](n- (mode==='ceil'?1e-9:0))||0;
export const money=(n)=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(n);
export function emptyState(date=today()){
 return {version:1,accounts:[],cards:[],transactions:[],recurring:[],employers:[],shifts:[],templates:[],advances:[],debts:[],goals:[],overrides:[],categories:['食費','交通費','日用品','娯楽','医療','美容','交際費','その他'].map((name,i)=>({id:`category-${i}`,name,budget:0,active:true})),settings:{minimum:0,buffer:0,dailySpecial:0,referenceDate:addDays(date,30),salaryDay:15,savingsSource:'',confidence:{worked:100,confirmed:90,tentative:50,extra:0}},setupDone:false};
}
const collections=['accounts','cards','transactions','recurring','employers','shifts','templates','advances','debts','goals','overrides','categories'];
export function validateState(s){
 if(!s||s.version!==1||!s.settings||collections.some(k=>!Array.isArray(s[k])))throw Error('対応していないバックアップ形式です。');
 const walk=(v,key='')=>{if(typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>1e12))throw Error('金額・数値が範囲外です。');if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('不正なデータ構造です。');walk(x,k);}};walk(s);
 for(const k of collections){const ids=new Set();for(const x of s[k]){if(!x.id||ids.has(x.id))throw Error('IDが欠けているか重複しています。');ids.add(x.id);}}
 const dateFields=['date','balanceDate','startDate','endDate','dueDate','payDate','referenceDate'];
 const scan=(o)=>{for(const[k,v]of Object.entries(o)){if(dateFields.includes(k)&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(day(v).getTime())||iso(day(v))!==v))throw Error('日付が不正です。');if(v&&typeof v==='object')scan(v);}};scan(s);
 for(const a of s.accounts)if(!Number.isSafeInteger(a.balance)||!a.balanceDate)throw Error('口座残高が不正です。');
 for(const t of s.transactions){if(!['expense','income','transfer','fee','refund','cancel','adjustment'].includes(t.kind)||!t.date||!Number.isSafeInteger(t.amount)||(t.kind!=='adjustment'&&t.amount<0))throw Error('取引が不正です。');if(t.accountId&&!s.accounts.some(a=>a.id===t.accountId))throw Error('取引の口座が見つかりません。');if(t.cardId&&!s.cards.some(c=>c.id===t.cardId))throw Error('取引のカードが見つかりません。');}
 for(const c of s.cards)if(!s.accounts.some(a=>a.id===c.accountId))throw Error('カードの引落口座が見つかりません。');
 const number=(x,k,min=0,max=1e12,integer=false)=>{if(typeof x[k]!=='number'||!Number.isFinite(x[k])||x[k]<min||x[k]>max||(integer&&!Number.isInteger(x[k])))throw Error(`${k} の数値が不正です。`);};
 const ref=(x,k,list,optional=false)=>{if(optional&&!x[k])return;if(!s[list].some(y=>y.id===x[k]))throw Error(`${k} の参照先が見つかりません。`);};
 for(const a of s.accounts){if(a.balanceDate>today())throw Error('口座の開始日は今日以前を指定してください。');}
 for(const t of s.transactions){if(t.kind==='transfer'){ref(t,'toAccountId','accounts');if(t.accountId===t.toAccountId)throw Error('同じ口座には振替できません。');}if(t.confidence!==undefined)number(t,'confidence',0,100);if(t.fee!==undefined)number(t,'fee',0,1e12,true);}
 for(const c of s.cards){number(c,'closeDay',1,31,true);number(c,'payDay',1,31,true);if(c.payOffset!==undefined){number(c,'payOffset',0,12,true);if(c.payOffset===0&&c.payDay<c.closeDay)throw Error('締め日より前の支払日は翌月以降を選択してください。');}if(c.openingOutstanding!==undefined)number(c,'openingOutstanding',0,1e12,true);}
 for(const r of s.recurring){number(r,'amount',0,1e12,true);ref(r,'accountId','accounts');if(!r.startDate||!['daily','weekly','monthly','yearly'].includes(r.cycle))throw Error('定期ルールが不正です。');if(r.endDate&&r.endDate<r.startDate)throw Error('終了日は開始日以降です。');if(r.payDay!==undefined)number(r,'payDay',1,31,true);}
 for(const g of s.goals){number(g,'amount',0,1e12,true);ref(g,'accountId','accounts');if(!g.dueDate)throw Error('期限が未設定です。');}
 for(const e of s.employers){number(e,'hourly',0);number(e,'closeDay',1,31,true);number(e,'payDay',1,31,true);ref(e,'accountId','accounts');if(e.payOffset!==undefined)number(e,'payOffset',0,12,true);}
 for(const sh of [...s.shifts,...s.templates]){ref(sh,'employerId','employers');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(sh.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(sh.end))throw Error('勤務時刻が不正です。');number(sh,'breakMinutes',0,1439,true);}
 for(const a of s.advances){ref(a,'employerId','employers');ref(a,'accountId','accounts');number(a,'amount',0,1e12,true);number(a,'fee',0,a.amount,true);if(!a.date||!a.payDate||a.date>a.payDate)throw Error('先払いは受取日以降の給料日を指定してください。');}
 for(const d of s.debts){ref(d,'accountId','accounts');number(d,'balance',0,1e12,true);number(d,'apr',0,100);number(d,'payment',1,1e12,true);number(d,'payDay',1,31,true);if(!d.startDate)throw Error('返済開始日を入力してください。');}
 for(const c of s.categories)number(c,'budget',0,1e12,true);
 if(!s.settings.confidence)throw Error('信用度設定がありません。');
 for(const k of ['minimum','buffer','dailySpecial'])number(s.settings,k,0,1e12,true);number(s.settings,'salaryDay',1,31,true);
 for(const v of Object.values(s.settings.confidence||{}))if(v<0||v>100)throw Error('信用度は0〜100%です。');
 if(s.settings.minimum<0||s.settings.buffer<0)throw Error('確保額は0円以上です。');
 return s;
}
export function cardDue(date,c){const close=monthDate(date,0,c.closeDay);const cycle=date<=close?date:monthDate(date,1,1);return monthDate(cycle,Number(c.payOffset??1),c.payDay);}
export function payrollDate(date,e){return cardDue(date,{closeDay:e.closeDay,payDay:e.payDay,payOffset:e.payOffset??1});}
const minOf=(v)=>Math.min(...v);
export function shiftPay(shift,e){
 const mins=t=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
 let start=mins(shift.start),end=mins(shift.end);if(end<=start)end+=1440;
 const duration=end-start,breakMin=Math.min(duration,Number(shift.breakMinutes??e.breakMinutes??0));
 // Without a break start, distribute unpaid breaks proportionally over all time bands.
 const ratio=(duration-breakMin)/duration;let base=0,night=0,worked=0,overtime=0;
 for(let m=start;m<end;m++){const date=addDays(shift.date,Math.floor(m/1440)),weekday=day(date).getUTCDay();const rate=Number(e.hourly)+Number(e['weekday'+weekday]||0)+(shift.holiday?Number(e.holidayAdd||0):0);const fraction=ratio/60;base+=rate*fraction;if(m%1440<300||m%1440>=1320)night+=Number(e.hourly)*Number(e.nightRate??25)/100*fraction;const limit=Number(e.overtimeHours??8)*60;const ot=Math.max(0,worked+ratio-limit)-Math.max(0,worked-limit);overtime+=Number(e.hourly)*Number(e.overtimeRate??25)/100*ot/60;worked+=ratio;}
 const gross=base+night+overtime+Number(e.transport||0);return {minutes:round(duration-breakMin),gross:round(gross,e.rounding),net:round(gross*(1-(e.deduct?Number(e.deductionRate||0)/100:0)),e.rounding)};
}
export function payroll(s){
 const groups=new Map();
 for(const shift of s.shifts){const e=s.employers.find(x=>x.id===shift.employerId);if(!e||shift.active===false)continue;const date=payrollDate(shift.date,e),key=`salary:${e.id}:${date}`;let g=groups.get(key);if(!g){g={id:key,source:'salary',name:`${e.name} 給与`,date,accountId:e.accountId,amount:0,trusted:0,worked:0,employerId:e.id};groups.set(key,g);}const p=shiftPay(shift,e);g.amount+=p.net;g.trusted+=p.net*Number(s.settings.confidence[shift.status]??0)/100;if(shift.status==='worked')g.worked+=p.net;}
 for(const g of groups.values()){const e=s.employers.find(x=>x.id===g.employerId);const fixed=round(Number(e.allowance||0)*(1-(e.deduct?Number(e.deductionRate||0)/100:0)));g.amount+=fixed;g.trusted+=fixed*(g.amount>fixed?(g.trusted/(g.amount-fixed)):0);const taken=s.advances.filter(a=>a.employerId===g.employerId&&a.payDate===g.date&&!(a.active===false&&a.status==='planned')&&!s.transactions.some(t=>t.reversesEvent===`advance:${a.id}`)&&!s.overrides.some(o=>o.sourceId===`advance:${a.id}`&&o.skipped)).reduce((n,a)=>n+Number(a.amount),0);g.amount=Math.max(0,g.amount-taken);g.trusted=Math.max(0,round(g.trusted)-taken);g.advanceAvailable=Math.max(0,Math.min(round(g.worked*Number(e.advancePercent||0)/100),Number(e.advanceCap||1e12))-taken);}
 return [...groups.values()];
}
function txEvent(t,s){
 const sign=['income','refund','cancel','adjustment'].includes(t.kind)?1:-1;
 if(t.cardId){const c=s.cards.find(x=>x.id===t.cardId);if(!c)return null;return {id:t.id,source:'card',name:t.name||c.name,date:t.date,amount:t.kind==='adjustment'?-t.amount:-sign*t.amount,cardId:c.id,accountId:c.accountId,cardPurchase:true,dueDate:t.dueDate||cardDue(t.date,c),status:t.status,categoryId:t.categoryId,transactionId:t.id};}
 let amount=t.kind==='transfer'?-Number(t.amount)-Number(t.fee||0):sign*Number(t.amount);if(t.kind==='adjustment')amount=Number(t.amount);
 return {id:t.id,name:t.name||({expense:'支出',income:'収入',transfer:'振替',fee:'手数料',refund:'返金',cancel:'取消',adjustment:'残高調整'})[t.kind],date:t.date,amount,accountId:t.accountId,toAccountId:t.kind==='transfer'?t.toAccountId:null,transferAmount:Number(t.amount),status:t.status,source:t.source||'manual',categoryId:t.categoryId,transactionId:t.id,confidence:t.confidence??(t.kind==='income'?s.settings.confidence.extra:100),...(t.reserveCardId?{cardId:t.reserveCardId,reserveRelease:t.reserveRelease}:{} )};
}
export function generateEvents(s,asOf=today(),horizon=addDays(asOf,90)){
 const events=[],warnings=[];const replacement=new Map(s.overrides.map(o=>[o.sourceId,o]));
 const add=e=>{const o=replacement.get(e.id);if(o?.skipped)return;if(o)e={...e,...(o.status==='actual'?o.snapshot:{}),...o,id:e.id};events.push(e);};
 for(const t of s.transactions){const e=txEvent(t,s);if(e)add(e);}
 for(const r of s.recurring){if(r.active===false)continue;let date=r.startDate,index=0;while(date<=horizon&&(!r.endDate||date<=r.endDate)){const raw={id:`recurring:${r.id}:${date}`,date,name:r.name,amount:Number(r.amount),kind:r.kind||'expense',accountId:r.accountId,cardId:r.cardId,status:'planned',categoryId:r.categoryId,confidence:r.confidence??100,source:r.group||'fixed'};const e=txEvent(raw,s);if(e){delete e.transactionId;add(e);}if(++index>20000){warnings.push('定期予定が多すぎるため、開始日を確認してください。');break;}date=r.cycle==='weekly'?addDays(r.startDate,index*7):r.cycle==='daily'?addDays(r.startDate,index):monthDate(r.startDate,index*(r.cycle==='yearly'?12:1),Number(r.payDay||Number(r.startDate.slice(8))));}}
 for(const g of payroll(s))add({...g,amount:g.amount,confidence:g.amount?g.trusted/g.amount*100:100,status:'planned'});
 for(const a of s.advances)if(!(a.active===false&&a.status==='planned'))add({id:`advance:${a.id}`,source:'advance',name:'給与先払い（手数料差引後）',date:a.date,amount:Number(a.amount)-Number(a.fee||0),accountId:a.accountId,status:a.status||'actual',confidence:100});
 for(const g of s.goals)if(g.active!==false)add({id:`goal:${g.id}`,source:'longterm',name:g.name,date:g.dueDate,amount:-Number(g.amount),accountId:g.accountId,status:'planned'});
 for(const d of s.debts){if(d.active===false)continue;let balance=Number(d.balance),i=0;while(balance>0){const date=monthDate(d.startDate,i,Number(d.payDay));if(date>horizon||i>=1200)break;const key=`debt:${d.id}:${date}`,o=replacement.get(key);const interest=round(balance*Number(d.apr||0)/1200,d.rounding);const reversed=s.transactions.some(t=>t.reversesEvent===key);const amount=o?.skipped||reversed?0:Math.min(balance+interest,o?.amount!==undefined?-Number(o.amount):Number(d.payment));const principal=amount-interest;add({id:key,source:'debt',date,name:d.name,amount:-amount,interest,remaining:balance-principal,accountId:d.accountId,status:'planned'});if(principal<=0&&!o?.skipped){warnings.push(`${d.name}：返済額が利息以下のため元金が減りません。`);}balance-=principal;i++;if(d.months&&i>=d.months&&balance>0){warnings.push(`${d.name}：返済期間末に残る${money(balance)}を仮確保しています。実際の最終返済条件を確認してください。`);add({id:`debt-residual:${d.id}:${date}`,source:'debt',date,name:`${d.name} 残債の仮確保`,amount:-balance,accountId:d.accountId,status:'planned',interest:0,remaining:0});break;}}}
 // Apply bill overrides after aggregation, so a manually confirmed bill replaces all generated lines.
 for(const o of s.overrides)if(o.status==='actual'&&o.snapshot?.cardPurchase&&!events.some(e=>e.id===o.sourceId))events.push({...o.snapshot,...o,id:o.sourceId});
 const purchases=events.filter(e=>e.cardPurchase),bills=new Map();
 for(const c of s.cards){if(Number(c.openingOutstanding)>0){const p={id:`opening-card:${c.id}`,name:c.name,date:c.balanceDate||asOf,amount:Number(c.openingOutstanding),cardId:c.id,accountId:c.accountId,cardPurchase:true,dueDate:c.openingDueDate||cardDue(asOf,c),status:'actual',source:'card'};events.push(p);purchases.push(p);}}
 for(const p of purchases){const key=`bill:${p.cardId}:${p.dueDate}`;let b=bills.get(key);if(!b){const c=s.cards.find(x=>x.id===p.cardId);b={id:key,name:`${c.name} 引落`,source:'card',date:p.dueDate,amount:0,reserveRelease:0,accountId:p.accountId,cardId:p.cardId,status:'planned'};bills.set(key,b);}b.amount-=p.amount;b.reserveRelease+=p.amount;}
 for(const b of bills.values())add(b);
 // Confirmed automatic postings survive archiving or editing their source rule.
 for(const o of s.overrides)if(o.status==='actual'&&o.snapshot&&!events.some(e=>e.id===o.sourceId))events.push({...o.snapshot,...o,id:o.sourceId});
 return {events,warnings:[...new Set(warnings)]};
}
export function calculate(s,asOf=today()){
 const shortEnd=addDays(asOf,90);let end=shortEnd;
 for(const g of s.goals)if(g.active!==false&&g.dueDate>end)end=g.dueDate;
 // Include known card maturities even outside the short window.
 for(const c of s.cards)if(c.openingDueDate>end)end=c.openingDueDate;
 for(const t of s.transactions)if(t.cardId){const c=s.cards.find(c=>c.id===t.cardId);const due=t.dueDate||(c&&cardDue(t.date,c));if(due>end)end=due;}
 const {events,warnings}=generateEvents(s,asOf,end);
 const balances=Object.fromEntries(s.accounts.map(a=>[a.id,Number(a.balance)]));
 const active=s.accounts.filter(a=>a.active!==false),included=new Set(active.filter(a=>a.include!==false).map(a=>a.id));
 const total=()=>[...included].reduce((n,k)=>n+(balances[k]||0),0);
 const exists=k=>Object.hasOwn(balances,k);
 const applyCash=(e,factor=1)=>{if(exists(e.accountId))balances[e.accountId]+=round(e.amount*factor);if(e.toAccountId&&exists(e.toAccountId))balances[e.toAccountId]+=e.transferAmount;};
 const isPosted=e=>e.status==='actual'&&e.date<=asOf;
 let reserved=0;const reserveByCard={};const changeReserve=(cardId,amount)=>{reserveByCard[cardId]=(reserveByCard[cardId]||0)+amount;reserved=Object.values(reserveByCard).reduce((n,v)=>n+Math.max(0,v),0);};const pending=[];
 for(const e of events.sort((a,b)=>a.date.localeCompare(b.date))){
   if(e.cardPurchase){if(e.date<=asOf){changeReserve(e.cardId,e.amount);}else pending.push(e);continue;}
   if(isPosted(e)){
     const a=s.accounts.find(a=>a.id===e.accountId);if(a&&e.date>=a.balanceDate&&!(e.source==='card'&&e.date<a.balanceDate))balances[e.accountId]+=e.amount;
     const dest=s.accounts.find(a=>a.id===e.toAccountId);if(dest&&e.date>=dest.balanceDate)balances[dest.id]+=e.transferAmount;
     if(e.reserveRelease)changeReserve(e.cardId,-e.reserveRelease);
   }else if(e.date<=end)pending.push(e);
 }
 const current={...balances},assets=total(),floor=Number(s.settings.minimum)+Number(s.settings.buffer);
 let minimum=assets-reserved-floor,shortMinimum=minimum,limitingDate=asOf;
 const accountMin={...balances},shortfalls=[],points=[{date:asOf,balance:assets,reserved,available:minimum,accounts:{...balances}}];
 for(const a of active)if(balances[a.id]<0)shortfalls.push({date:asOf,accountId:a.id,amount:-balances[a.id],name:'現在残高'});
 const sorted=pending.sort((a,b)=>a.date.localeCompare(b.date)||(a.amount<0?-1:1)-(b.amount<0?-1:1));
 let income=0,expense=0;
 for(const e of sorted){const date=e.date<asOf?asOf:e.date;if(date>end)continue;
   if(e.cardPurchase){changeReserve(e.cardId,e.amount);}else{const factor=e.amount>0&&!e.toAccountId?Number(e.confidence??100)/100:1;applyCash(e,factor);if(e.reserveRelease)changeReserve(e.cardId,-e.reserveRelease);if(included.has(e.accountId)){if(e.amount>0)income+=round(e.amount*factor);else expense-=e.amount;}}
   const available=total()-reserved-floor;if(available<minimum){minimum=available;limitingDate=date;}if(date<=shortEnd)shortMinimum=Math.min(shortMinimum,available);
   for(const a of active){if(balances[a.id]<accountMin[a.id])accountMin[a.id]=balances[a.id];if(balances[a.id]<0&&!shortfalls.some(w=>w.accountId===a.id))shortfalls.push({date,accountId:a.id,amount:-balances[a.id],name:e.name});}
   points.push({date,balance:total(),reserved,available,accounts:{...balances},eventId:e.id});
 }
 const safe=Math.max(0,Math.floor(minimum)),longReserve=Math.max(0,shortMinimum-minimum),reference=s.settings.referenceDate>=asOf?s.settings.referenceDate:monthDate(asOf,asOf>=monthDate(asOf,0,s.settings.salaryDay)?1:0,s.settings.salaryDay),dayCount=Math.max(1,days(asOf,reference)+1);
 const savings=Object.fromEntries(active.filter(a=>included.has(a.id)).map(a=>[a.id,Math.max(0,Math.min(safe,Math.floor(accountMin[a.id])))]));
 const source=s.settings.savingsSource||active.find(a=>included.has(a.id))?.id;
 const overdue=pending.filter(e=>!e.cardPurchase&&e.date<asOf);
 return {asOf,end,shortEnd,assets,current,minimum,safe,shortSafe:Math.max(0,shortMinimum),longReserve,limitingDate,income,expense,floor,reservedNow:points[0].reserved,points,events:pending.filter(e=>!e.cardPurchase).sort((a,b)=>a.date.localeCompare(b.date)),allEvents:events,shortfalls,warnings,overdue,savings,savingsSource:source,savable:savings[source]||0,daily:round(Math.max(0,safe-Number(s.settings.dailySpecial||0))/dayCount),dayCount,reference};
}
export function budgetPeriod(s,date=today()){const n=s.settings.salaryDay;const start=monthDate(date,date<monthDate(date,0,n)?-1:0,n);return {start,end:addDays(monthDate(start,1,n),-1)};}
export function budgets(s,date=today()){
 const {start,end}=budgetPeriod(s,date),generated=generateEvents(s,date,date).events;return s.categories.map(c=>{let used=0;for(const t of s.transactions){if(t.status!=='actual'||t.date<start||t.date>end||t.categoryId!==c.id)continue;if(['expense','fee'].includes(t.kind))used+=t.amount;if(['refund','cancel'].includes(t.kind))used-=t.amount;if(t.kind==='transfer')used+=Number(t.fee||0);}for(const e of generated){if(e.transactionId||e.status!=='actual'||e.date<start||e.date>end||e.categoryId!==c.id||e.reserveRelease!==undefined)continue;used+=e.cardPurchase?e.amount:-Math.min(e.amount,0);}return {...c,used,remaining:Number(c.budget||0)-used};});
}
export function cancelTransaction(s,transactionId,date=today()){
 const t=s.transactions.find(t=>t.id===transactionId);if(!t)throw Error('取引が見つかりません。');
 if(t.status==='planned'){s.transactions=s.transactions.filter(x=>x.id!==t.id);return;}
 if(s.transactions.some(x=>x.reverses===t.id))throw Error('すでに取消済みです。');
 if(t.kind==='transfer'){s.transactions.push({...t,id:id(),date,accountId:t.toAccountId,toAccountId:t.accountId,fee:0,name:`取消：${t.name||'振替'}`,reverses:t.id});if(t.fee)s.transactions.push({id:id(),date,kind:'refund',amount:t.fee,accountId:t.accountId,status:'actual',name:'振替手数料の取消',reverses:t.id});}
 else {let dueDate;if(t.cardId){const c=s.cards.find(c=>c.id===t.cardId);const original=t.dueDate||cardDue(t.date,c);const paid=s.overrides.some(o=>o.sourceId===`bill:${c.id}:${original}`&&o.status==='actual');dueDate=paid?cardDue(date,c):original;}s.transactions.push({...t,id:id(),date,kind:['income','refund','cancel'].includes(t.kind)?'expense':t.kind==='adjustment'?'adjustment':'cancel',amount:t.kind==='adjustment'?-t.amount:t.amount,name:`取消：${t.name||'取引'}`,reverses:t.id,...(t.cardId?{dueDate}:{} )});}
}
export function cancelGeneratedEvent(s,e,date=today()){
 if(e.status!=='actual')throw Error('確定済みの予定を選択してください。');
 if(s.transactions.some(t=>t.reversesEvent===e.id))throw Error('すでに取消済みです。');
 const t={id:id(),name:`取消：${e.name}`,date,status:'actual',accountId:e.accountId,categoryId:e.categoryId,reversesEvent:e.id,kind:e.amount<0?'refund':'expense',amount:Math.abs(e.amount)};
 if(e.cardPurchase){t.cardId=e.cardId;t.kind=e.amount>0?'cancel':'expense';const paid=s.overrides.some(o=>o.sourceId===`bill:${e.cardId}:${e.dueDate}`&&o.status==='actual');t.dueDate=paid?cardDue(date,s.cards.find(c=>c.id===e.cardId)):e.dueDate;}
 if(e.reserveRelease){t.reserveCardId=e.cardId;t.reserveRelease=-e.reserveRelease;s.transactions.push({id:id(),name:`再確認：${e.name}`,date,status:'planned',kind:'expense',amount:-e.amount,accountId:e.accountId,reserveCardId:e.cardId,reserveRelease:e.reserveRelease,source:'card'});}
 s.transactions.push(t);
}
