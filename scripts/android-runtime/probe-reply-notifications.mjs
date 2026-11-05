import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { initProfile, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-app-boot';
import { ELECKOI_ANDROID_BUNDLES } from '../../apps/android-host/dist/index.mjs';

// This probe uses an isolated Host and a synthetic provider, never the connected phone or real credentials.
const classpath=readFileSync(resolve(process.argv[2]),'utf8').trim();
const root=mkdtempSync(join(tmpdir(),'eleckoi-reply-probe-'));
const children=[];
const text='通知回归正文 '+ '长正文'.repeat(1000)+' 末尾完整保留';
let requests=0, releaseModel, java, hostDiagnostic='';
const modelHeld=new Promise(resolveHeld=>{ releaseModel=resolveHeld; });
const server=createServer(async (request,response)=>{
  request.resume(); await once(request,'end'); requests++;
  await modelHeld;
  const item={id:'message-'+requests,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
  response.writeHead(200,{'content-type':'text/event-stream'});
  for (const event of [
    {type:'response.created',response:{id:'response-'+requests,model:'test-model',status:'in_progress',output:[]}},
    {type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},
    {type:'response.content_part.added',output_index:0,content_index:0,item_id:item.id,part:{type:'output_text',text:'',annotations:[]}},
    {type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:text},
    {type:'response.completed',response:{id:'response-'+requests,model:'test-model',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}
  ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  response.end();
});
await new Promise(listen=>server.listen(0,'127.0.0.1',listen));
try {
  const profile=join(root,'home','profiles','android');
  initProfile(profile,[...PROFILE_TEMPLATES.web.bundles,...ELECKOI_ANDROID_BUNDLES]);
  const paddingPlugin=join(root,'notification-padding.mjs');
  writeFileSync(paddingPlugin,`export function apply(ctx) {
    let first=true;
    ctx.on('agent/turn-stopping', ({agent}) => {
      if(!first) return;
      first=false;
      for(let i=0;i<30;i++) agent.session.append('notification-probe/padding',{index:i},{ignorable:true});
    },{global:true});
  }`);
  writeFileSync(join(profile,'cordis.patch.yml'),JSON.stringify([
    {id:'llm-pi-ai',config:{providers:{synthetic:{api:'openai-responses',baseURL:`http://127.0.0.1:${server.address().port}/v1`,
      apiKeyEnv:'ELECKOI_NOTIFICATION_PROBE_KEY',models:[{id:'test-model',contextWindow:65536,maxTokens:8192}]}}}},
    {id:'agent-default-model',config:{provider:'synthetic',model:'test-model'}},
    {insert:[{name:paddingPlugin}]},
  ]));
  const config=join(root,'runtime.json');
  writeFileSync(config,JSON.stringify({schemaVersion:1,runtimeDataRoot:join(root,'data'),homeRoot:join(root,'home'),
    workspaceRoot:join(root,'workspace'),productDatabasePath:join(root,'data','product.sqlite'),productMediaRoot:join(root,'media'),resourceRoot:resolve('apps/desktop/resources/dsh')}));
  const host=spawn(process.execPath,[resolve('apps/android-host/dist/host.mjs'),'--config',config],{
    env:{...process.env,ELECKOI_NOTIFICATION_PROBE_KEY:'synthetic-probe-key'},stdio:['pipe','pipe','pipe'],windowsHide:true});
  children.push(host);
  host.stderr.on('data',data=>{hostDiagnostic+=data;});
  const ready=await new Promise((resolveReady,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Notification Host startup timed out')),90000);
    createInterface({input:host.stdout}).on('line',line=>{
      if(!line.startsWith('ELECKOI_HOST\t')) return;
      const value=JSON.parse(line.slice('ELECKOI_HOST\t'.length));
      if(value.type==='ready') {clearTimeout(timer);resolveReady(value);}
      if(value.type==='fatal') {clearTimeout(timer);reject(new Error(value.message));}
    });
    host.once('error',error=>{clearTimeout(timer);reject(error);});
    host.once('exit',()=>{clearTimeout(timer);reject(new Error('Notification Host exited: '+hostDiagnostic));});
  });
  console.log('Isolated Host ready');
  const auth=await fetch(ready.url,{redirect:'manual'});
  const cookie=auth.headers.get('set-cookie').split(';',1)[0]; await auth.body?.cancel();
  async function call(method,args) {
    const response=await fetch(new URL('/api/'+method,ready.url),{method:'POST',headers:{cookie,origin:new URL(ready.url).origin,'content-type':'application/json'},
      body:JSON.stringify({type:'client-request',rpcId:'reply-probe',method,payload:{args}}),signal:AbortSignal.timeout(30000)});
    const {result}=await response.json();
    assert.equal(result.ok,true,method+' '+JSON.stringify(result.error)); return result.value;
  }
  const observed=[]; const waiters=new Set();
  function waitFor(predicate) {
    if(observed.some(predicate)) return Promise.resolve();
    return new Promise((accept,reject)=>{
      const waiter=value=>{if(predicate(value)) {clearTimeout(timer);waiters.delete(waiter);accept();}};
      const timer=setTimeout(()=>{waiters.delete(waiter);reject(new Error('Native notification probe timed out'));},30000);
      waiters.add(waiter);
    });
  }
  java=spawn(join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'),['-cp',classpath,'com.eleckoi.app.RealReplyMonitorProbe',ready.url,cookie],
    {stdio:['pipe','pipe','pipe'],windowsHide:true}); children.push(java);
  let javaDiagnostic=''; java.stderr.on('data',data=>{javaDiagnostic+=data;});
  createInterface({input:java.stdout}).on('line',line=>{
    const value=JSON.parse(line); observed.push(value); for(const waiter of waiters) waiter(value);
    if(value.type==='diagnostic') console.log(value.message);
  });
  java.once('exit',code=>{if(code!==0) console.error('Native notification probe failed: '+javaDiagnostic);});
  await waitFor(value=>value.type==='diagnostic'&&value.message.startsWith('Reply observer connected:'));
  console.log('Native monitor control ready');
  const created=await call('eleckoiConversations/create',{input:{title:'Synthetic notification conversation'}});
  const conversationId=created.conversation.id;
  const prepared=await call('eleckoiConversations/preparePrompt',{conversationId,text:'合成通知回归'});
  console.log('Conversation prepared');
  const projection=await call('session/projections',{request:{sessionId:prepared.runtimeSessionId}});
  assert(!Object.hasOwn(projection.values,'turnBoundary'),'Private turnBoundary must stay off the public wire');
  await call('session/prompt',{request:{requestId:'notification-regression',sessionId:prepared.runtimeSessionId,mode:'queue',content:[{type:'text',text:'合成通知回归'}]}});
  await waitFor(value=>value.type==='running'&&value.active);
  releaseModel();
  await waitFor(value=>value.type==='completed');
  const completed=observed.filter(value=>value.type==='completed');
  assert.equal(completed.length,1); assert(completed[0].text===text,'Native completion must preserve the complete UTF-8 reply');
  await waitFor(value=>value.type==='running'&&!value.active && observed.some(item=>item.type==='completed'));
  const completedProjection=await call('session/projections',{request:{sessionId:prepared.runtimeSessionId}});
  console.log('First completion cursor: '+completedProjection.asOfSeq);
  const firstPage=await call('session/page',{request:{address:{kind:'session',sessionId:prepared.runtimeSessionId},throughSeq:completedProjection.asOfSeq}});
  const input=firstPage.records.find(record=>record.event.type==='user/message').event;
  await call('eleckoiConversations/regenerateMessage',{conversationId,eventSeq:input.seq,requestId:'notification-regenerate'});
  await call('eleckoiConversations/startRegeneration',{conversationId,requestId:'notification-regenerate',cancelled:false});
  await waitFor(value=>value.type==='completed'&&observed.filter(item=>item.type==='completed').length>=2);
  assert.equal(observed.filter(value=>value.type==='completed').length,2);
  assert.equal(observed.filter(value=>value.type==='completed')[1].text,text);
  const regenerated=observed.filter(value=>value.type==='completed')[1];
  assert(regenerated.seq<completed[0].seq,'Regression must complete below the previous journal cursor');
  console.log('Shorter regenerated completion cursor: '+regenerated.seq);
  await call('eleckoiConversations/regenerateMessage',{conversationId,eventSeq:input.seq,requestId:'notification-regenerate-again'});
  await call('eleckoiConversations/startRegeneration',{conversationId,requestId:'notification-regenerate-again',cancelled:false});
  await waitFor(value=>value.type==='completed'&&observed.filter(item=>item.type==='completed').length>=3);
  assert.equal(observed.filter(value=>value.type==='completed')[2].seq,regenerated.seq,'Repeated regeneration reuses the same sequence range');
  const next=await call('eleckoiConversations/preparePrompt',{conversationId,text:'后续合成输入'});
  await call('session/prompt',{request:{requestId:'notification-next-turn',sessionId:next.runtimeSessionId,mode:'queue',content:[{type:'text',text:'后续合成输入'}]}});
  await waitFor(value=>value.type==='completed'&&observed.filter(item=>item.type==='completed').length>=4);
  assert.equal(observed.filter(value=>value.type==='completed').length,4);
  for(const value of observed.filter(value=>value.type==='completed')) assert.equal(value.text,text);
  java.stdin.end(); await once(java,'exit'); assert.equal(java.exitCode,0,javaDiagnostic);
  host.stdin.write('{"type":"shutdown"}\n'); await once(host,'exit'); assert.equal(host.exitCode,0);
  console.log('Actual Android Host → public Session control/follow/page → native Java monitor: initial completion, shorter regeneration, repeated same-range regeneration, subsequent prompt, complete UTF-8 replies and no duplicate completions passed.');
} catch(error) {
  console.error(hostDiagnostic); throw error;
} finally {
  releaseModel();
  for (const child of children) if(child.exitCode===null) {const exited=once(child,'exit');child.kill();await exited;}
  server.closeAllConnections(); await new Promise(close=>server.close(close));
  const absolute=resolve(root);
  if(!absolute.startsWith(resolve(tmpdir())+sep)||!basename(absolute).startsWith('eleckoi-reply-probe-')) throw new Error('Unexpected probe directory');
  rmSync(absolute,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
