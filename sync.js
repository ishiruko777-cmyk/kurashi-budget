import {validateState,emptyState} from './core.js';
import {mergeStates,hasHouseholdData,sameState} from './sync-core.js';
import {firebaseConfig} from './firebase-config.js';

export function createSync({key,getState,applyState,onStatus,disabled=false,sdkLoader}){
 let config=firebaseConfig,api,auth,db,user,unsubscribe,meta=null,busy=false,again=false,conflict=null,timer;
 let status={message:'このブラウザに保存',configured:false,signedIn:false};
 try{config=JSON.parse(localStorage.getItem(key+'-firebase-config'))||config;meta=JSON.parse(localStorage.getItem(key+'-sync'));}catch{}
 const report=(message,extra={})=>{status={...status,message,...extra};onStatus(status);};
 const persist=()=>localStorage.setItem(key+'-sync',JSON.stringify(meta));
 const parse=doc=>{const value=doc.data();if(!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.json!=='string')throw Error('クラウドデータの形式が不正です。');return {revision:value.revision,state:validateState(JSON.parse(value.json))};};
 const saveLocal=next=>{applyState(validateState(structuredClone(next)));};
 async function reconcile(choice){
  if(!user||!api)return;
  if(busy){again=true;return;}busy=true;const session=user.uid,local=structuredClone(getState());
  report('同期中…',{conflict:false});
  try{
   const result=await api.runTransaction(db,async tx=>{
    const ref=api.doc(db,'households',session),snapshot=await tx.get(ref);
    const cloud=snapshot.exists()?parse(snapshot):null;
    let next=local;
    if(choice){
     if(!conflict||(cloud?.revision||0)!==conflict.revision){const e=Error('ほかの端末でさらに更新されました。内容を再確認してください。');e.cloud=cloud||{state:emptyState(),revision:0};throw e;}
     next=choice==='cloud'?(cloud?.state||emptyState()):local;
    }else if(meta?.uid&&meta.uid!==session&&hasHouseholdData(local)){
     const e=Error('別のGoogleアカウントです。引き継ぐ内容を確認してください。');e.cloud=cloud||{state:emptyState(),revision:0};throw e;
    }else if(cloud){
     if(meta?.uid===session&&meta.base){const merged=mergeStates(meta.base,local,cloud.state);if(merged.conflicts.length){const e=Error('同じ項目が両端末で変更されています。');e.cloud=cloud;throw e;}next=merged.state;}
     else if(hasHouseholdData(local)&&!sameState(local,cloud.state)){const e=Error('この端末とクラウドに別のデータがあります。');e.cloud=cloud;throw e;}
     else next=cloud.state;
    }
    validateState(next);const json=JSON.stringify(next);
    if(new TextEncoder().encode(json).length>800000)throw Error('同期データの上限に達しました。バックアップ出力をご利用ください。');
    const changed=!cloud||!sameState(next,cloud.state),revision=(cloud?.revision||0)+(changed?1:0);
    if(changed)tx.set(ref,{json,revision,updatedAt:api.serverTimestamp()});
    return {state:next,revision};
   });
   if(user?.uid!==session)return;
   // An edit made while the network request was running must remain on this device.
   const latest=getState(),merged=mergeStates(local,latest,result.state);
   if(merged.conflicts.length){conflict={state:result.state,revision:result.revision};report('同期後の変更を確認してください',{conflict:true});return;}
   saveLocal(merged.state);meta={uid:session,base:result.state,revision:result.revision};persist();conflict=null;
   again=again||!sameState(merged.state,result.state);report(again?'未同期の変更を送信中…':'同期済み',{conflict:false,error:false,lastSynced:new Date().toISOString()});
  }catch(e){
   if(user?.uid!==session)return;
   if(e.cloud){conflict=e.cloud;report(e.message,{conflict:true});}
   else report('未同期：'+friendlyError(e),{error:true});
  }finally{busy=false;if(again&&!conflict){again=false;schedule();}}
 }
 function schedule(){clearTimeout(timer);if(user&&!conflict)timer=setTimeout(()=>reconcile(),600);}
 async function start(){
  if(disabled||!config.apiKey||!config.projectId){report('同期は未設定',{configured:false});return;}
  try{
   const root='https://www.gstatic.com/firebasejs/12.19.0/';
   const [appModule,authModule,firestoreModule]=sdkLoader?await sdkLoader():await Promise.all([import(root+'firebase-app.js'),import(root+'firebase-auth.js'),import(root+'firebase-firestore.js')]);
   api={...authModule,...firestoreModule};const app=appModule.initializeApp(config,'kurashi-budget');auth=api.getAuth(app);db=api.getFirestore(app);
   report('Googleログインで同期できます',{configured:true});
   api.onAuthStateChanged(auth,u=>{
    unsubscribe?.();clearTimeout(timer);user=u;conflict=null;
    report(u?'接続中…':'Googleログインで同期できます',{signedIn:!!u,email:u?.email||'',conflict:false});
    if(u){unsubscribe=api.onSnapshot(api.doc(db,'households',u.uid),{includeMetadataChanges:true},snapshot=>{
     if(user?.uid!==u.uid||conflict)return;
     if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
     try{if(!snapshot.exists()||meta?.uid!==u.uid||parse(snapshot).revision!==meta?.revision||!sameState(getState(),meta.base))schedule();else if(!busy)report('同期済み',{error:false});}catch(e){report('未同期：'+e.message,{error:true});}
    },e=>report('未同期：'+friendlyError(e)));schedule();}
   });
  }catch(e){report('同期を開始できません：'+friendlyError(e));}
 }
 window.addEventListener('online',schedule);
 return {
  start,schedule,getStatus:()=>status,
  login:()=>{if(!auth)throw Error('Firebaseの設定を先に完了してください。');return api.signInWithPopup(auth,new api.GoogleAuthProvider()).catch(e=>{report('ログインできません：'+friendlyError(e),{error:true});throw Error(friendlyError(e));});},
  logout:async()=>{if(busy)throw Error('同期完了後にログアウトしてください。');await api.signOut(auth);},
  configure:value=>{if(!value.apiKey||!value.authDomain||!value.projectId||!value.appId)throw Error('FirebaseのWebアプリ設定を入力してください。');localStorage.setItem(key+'-firebase-config',JSON.stringify(value));location.reload();},
  conflict:()=>conflict,
  resolve:choice=>reconcile(choice),
  retry:()=>reconcile(),
  dispose:()=>{clearTimeout(timer);unsubscribe?.();user=null;},
 };
}
function friendlyError(e){const code=e.code||'';if(code.includes('permission-denied'))return 'アクセスが拒否されました。Firestoreのルールを確認してください。';if(code.includes('unauthorized-domain'))return 'このサイトのドメインがログイン許可リストにありません。';if(code.includes('popup-blocked'))return 'ログイン画面がブロックされました。Safariでこのサイトのポップアップを許可してください。';if(code.includes('popup-closed')||code.includes('cancelled-popup'))return 'ログインを中断しました。';if(code.includes('network-request-failed'))return 'Googleログインに接続できません。通常のSafari・Chromeで開いて再試行してください。';if(code.includes('unavailable'))return '通信できません。端末内の変更は保存されています。接続後に再試行します。';return e.message||'通信に失敗しました。';}
