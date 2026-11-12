import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
import * as cordis from '@deepseek-ai/cordis';
import * as store from '@deepseek-ai/dsh-client-store';
import { ModelLabel, ModelProviderLabel, ModelMenuParameters } from '../../src/modules/models/components/ModelMenuParameters.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';
installBrowserIconSprite();
let parameters={revision:0,entries:{}}; const calls = [], listeners = new Set();
let configs = { configs: [{ id: 'synthetic-config', name: '合成提供商', provider: 'custom', model: 'claude-opus-4-6', model_options: Array.from({length:25}, (_, index) => ({ id: index ? `synthetic-${index}` : 'claude-opus-4-6', name: `合成模型 ${index}`, topP: .8, contextWindowTokens: 64000 })) }] };
let state = { current: { provider: 'synthetic-config', model: 'claude-opus-4-6' }, routable: true, pending: null, error: null, failures: [], status: 'ready',
  groups: [{ id: 'synthetic-config', name: '合成提供商', models: configs.configs[0].model_options.map(option => ({ id: option.id, name: option.name, reasoning: { efforts: [{ id:'low', name:'Low' }, { id:'high', name:'High' }] } })) }] };
const publish = () => [...listeners].forEach(listener => listener());
const catalog = { subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, getSnapshot: () => configs, parameterEdits: new Map(),
  sessionParameters:()=>({subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},getSnapshot:()=>parameters}),
  readSessionModelParameters:async()=>parameters,
  async saveSessionModelParameters(sessionId,provider,model,patch,revision){calls.push({parameters:{sessionId,provider,model,patch,revision}});const key=JSON.stringify([provider,model]);parameters={revision:parameters.revision+1,entries:{...parameters.entries,[key]:{...parameters.entries[key],...patch}}};publish();return parameters;} };

window.modelMenuFixture = { calls };
window.__ModuleLoader__ = { load(entry) {
  const modules = { react:React, 'react/jsx-runtime':jsxRuntime, 'react-dom':ReactDOM, '@deepseek-ai/cordis':cordis, '@deepseek-ai/dsh-client-store':store, '@deepseek-ai/dsh-client-ui-primitives':primitives };
  const {ModelSelect,zh}=entry.factory(name => { if(!(name in modules))throw Error('Unexpected model dependency '+name);return modules[name]; });
  createRoot(document.getElementById('root')).render(<main style={{height:'100dvh',padding:18,display:'flex',alignItems:'flex-end',justifyContent:'flex-end'}}>
    <ModelSelect available locked={false} directory={{subscribe:catalog.subscribe,getSnapshot:()=>state}} load={()=>{}} resolveText={text=>text}
      t={(key,values={})=>Object.entries(values).reduce((text,[key,value])=>text.replaceAll('{'+key+'}',value),zh[key]||key)}
      select={async selection=>{calls.push({selection});state={...state,current:selection};publish();return {ok:true};}}
      renderSlot={(name,owner,options)=>name==='conversation.input.model.label'?<ModelLabel {...owner} catalog={catalog} resolveText={text=>text}/>:name.endsWith('.parameters')?<ModelMenuParameters {...owner} sessionId="synthetic-session" catalog={catalog}/>:name.endsWith('.provider.label')?<ModelProviderLabel {...owner} catalog={catalog}/>:options?.fallback}/>
  </main>);
} };
