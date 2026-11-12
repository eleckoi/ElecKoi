import React from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { PresetEditorWindow } from '../../src/app/windows/PresetEditorWindow.jsx';
import { PresetListPanel, PresetProvider } from '../../src/modules/presets/components/PresetPanel.jsx';
import { PresetOverview } from '../../src/modules/presets/components/PresetOverview.jsx';
import { WebSearchProvider } from '../../src/modules/agentTools/index.js';
import { AgentToolsDialog } from '../../src/modules/chat/components/AgentToolsDialog.jsx';
import { MobileEditorHarness } from './mobile-editor.harness.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { initialLibrary } from '../helpers/editorWorkspaceSamples.js';
import { editorVersionsFixture, withLibraryVersions } from '../helpers/editorLibraryVersions.js';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/shell/styles/titlebar.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/modules/persona/styles/character-editor.css';
import '../../src/modules/persona/styles/character-list.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';
import '../../src/modules/presets/styles/preset-panel.css';
import '../../src/ui/styles/dsh-editor-controls.css';
import '../../src/ui/styles/unsaved-changes.css';
import '../../src/ui/styles/confirmation-dialog.css';
import '../../src/ui/styles/avatar.css';
import '../../src/ui/styles/avatar-crop.css';
import '../../src/modules/agentTools/styles/web-search-settings.css';
import '../../src/modules/agentTools/styles/roleplay-plan-editor.css';
import '../../src/modules/chat/styles/chat-panel.css';

installBrowserIconSprite();
const q = new URLSearchParams(location.search), key = 'eleckoi-synthetic-preset-editor', id = 'synthetic-preset', theme = q.get('theme') || 'light';
if(q.has('mobile')) document.documentElement.dataset.eleckoiMobile='true';
document.documentElement.dataset.theme = theme; document.body.toggleAttribute('data-ds-dark-theme',theme==='dark'); document.documentElement.style.colorScheme=theme;
if (q.has('reset')) localStorage.removeItem(key);
const largeText = q.has('large') ? q.has('single') ? '字'.repeat(1000000) + '完整原始末尾' : 'a();\n'.repeat(100000) + '完整原始末尾' : '';
const seeds = { id, name: '合成预设', purpose: 'roleplay', modelTags: [{id:'general',label:'通用'}], libraryGroupId:'', promptPositions:[], groups:[], expandedGroupIds:[], regexRules:[],
  profile: { authorName:'合成作者', authorAvatarPath:'', usageInstructions:q.get('large')==='profile'?largeText:'合成使用说明。', timeline:[{id:'update-1',title:'合成更新',note:q.get('large')==='profile'?largeText:'保留原更新记录操作',dateLabel:'2026-11-12'}] },
  entries:Array.from({length:40},(_,i)=>({...createEntryDraft('',i+1,[]),id:`entry-${i}`,title:`合成提示词 ${i+1}`,content:i===0&&q.has('long')?Array.from({length:100000},(_,j)=>`第 ${j} 行合成文字与代码 const n = ${j};\n`).join(''):`完整合成内容 ${i+1}`})),
  toolGroups:[{id:'builtin:web',name:'联网搜索',description:'使用原联网搜索配置',source:'built_in',included:true,enabled:true,members:[{name:'web_search',description:'搜索网页'}]},
    {id:'builtin:variables',name:'剧情变量',description:'查看和修改变量',source:'built_in',included:true,enabled:true,members:[{name:'synthetic_read',description:'完整工具说明'}]}] };
if(q.has('many')) seeds.profile.timeline=Array.from({length:50},(_,index)=>({id:`update-${index}`,title:`合成更新 ${index}`,dateLabel:'2026-11-12',note:index===49?largeText:'短更新记录'}));
if(q.has('emptyProfile')) Object.assign(seeds.profile,{usageInstructions:'',timeline:[]});
let stored = JSON.parse(localStorage.getItem(key) || 'null') || seeds, activePreset = q.get('view')==='tool-menu'?id:'', snapshot, detail;
const listeners=new Set(),details=new Set();window.saveCalls=0;window.saveFails=false;window.presetReadCalls=0;
const catalog=()=>({presets:[{id:stored.id,name:stored.name,purpose:stored.purpose,modelFamily:'general',modelTags:stored.modelTags,libraryGroupId:stored.libraryGroupId,
  activeVersionId:'',activeVersionNumber:1,entryCount:stored.entries.length,profile:stored.profile}],groups:[],activePresetIds:{roleplay:activePreset,creator:''}});
function publish(){snapshot={status:'ready',catalog:catalog(),error:''};detail={status:'ready',preset:stored,error:''};listeners.forEach(fn=>fn());details.forEach(fn=>fn());}
publish();
window.addEventListener('storage',event=>{if(event.key===key&&event.newValue){stored=JSON.parse(event.newValue);publish();}});
const model={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},refresh:async()=>catalog(),adopt:value=>{activePreset=value.activePresetIds.roleplay;publish();},read:async()=>{window.presetReadCalls++;return q.has('blockDetail')?new Promise(()=>{}):stored;},
  getDetailSnapshot:()=>detail,subscribeDetail:(_id,fn)=>{details.add(fn);return()=>details.delete(fn);},
  save:async value=>{window.saveCalls++;if(window.saveFails)throw Error('合成保存失败');stored=structuredClone(value);localStorage.setItem(key,JSON.stringify(stored));publish();return stored;},setActive:async value=>{activePreset=value;publish();return catalog();}};
window.savedPreset=()=>stored;
let regexValue={globalRules:initialLibrary('regex','global').rules,characterRules:[],agentPresetRules:initialLibrary('regex','global').rules.map(rule=>({...rule,id:`preset-${rule.id}`})),globalEnabled:true,agentPresetEnabled:true,versions:[],activeVersionId:'',revision:0,ownerRevision:0};
if(q.get('large')==='regex') regexValue.agentPresetRules[0].replacement=largeText;
if(q.has('character')) regexValue.characterRules=initialLibrary('regex','character').rules;
window.savedRegex=()=>regexValue;
const regexEditor={getSnapshot:()=>({status:'ready',value:regexValue}),subscribe:()=>()=>{},read:async()=>regexValue,save:async value=>regexValue=structuredClone({...value,revision:value.revision+1})};
regexEditor.versions=editorVersionsFixture('regex',()=>regexEditor.read(),async values=>[await regexEditor.save(values[0])]);
const libraries=Object.fromEntries(['global','preset'].map(scope=>[scope,{...initialLibrary('scripts','global'),scope,ownerId:scope==='preset'?id:'',revision:0}]));
if(q.has('character')) libraries.character={...initialLibrary('scripts','global'),scope:'character',ownerId:'synthetic-character',revision:0};
if(q.get('large')==='scripts') Object.assign(libraries.preset.trees[0],{content:largeText,info:largeText,data:{long:largeText}});
window.savedScripts=()=>libraries[q.has('character')?'character':'preset'];
const scripts=withLibraryVersions({read:async scope=>structuredClone(libraries[scope]),subscribe:()=>()=>{},subscribeChanges:()=>()=>{},saveAll:async values=>values.map(value=>libraries[value.scope]=structuredClone({...value,revision:value.revision+1})),openDirectory:async()=>{}},'scripts');
let webSnapshot={status:'ready',mode:'provider_native',writable:true,apiKeyWritable:true,tavilyAvailable:true,maxResults:5};const webListeners=new Set();
const web={getSnapshot:()=>webSnapshot,subscribe:fn=>{webListeners.add(fn);return()=>webListeners.delete(fn);},update:async patch=>{webSnapshot={...webSnapshot,...patch};webListeners.forEach(fn=>fn());},openPluginSettings:()=>{window.pluginSettingsOpened=true;}};
window.editorView=()=>EditorView.findFromDOM(document.querySelector('.cm-editor'));
window.editorViewFor=label=>EditorView.findFromDOM(document.querySelector(`.cm-content[aria-label="${label}"]`));
createRoot(document.getElementById('root')).render(<WebSearchProvider model={web}>{q.get('view')==='mobile-editor'?<MobileEditorHarness presetModel={model} preset={stored} character={q.has('character')} longText={q.has('long')?'合成长文本 const a = 1;\n'.repeat(100000)+'完整末尾':''} configuration={{regexRules:{editor:()=>regexEditor,test:async()=>({output:'合成结果'})},scripts}} />:q.get('view')==='tool-menu'?<AgentToolsDialog presetCatalog={model} onClose={()=>{window.toolMenuClosed=true;}} onManage={()=>{window.toolMenuManaged=true;}} onNotify={(type,message)=>{window.toolMenuNotice={type,message};}} />:q.get('view')==='preset-editor'?<div id="eleckoi-root"><PresetEditorWindow presetCatalog={model} characterConfiguration={{regexRules:{editor:()=>regexEditor,test:async()=>({output:'合成测试结果'})},scripts}} /></div>:<div id="eleckoi-root" className="qq-shell" style={{gridTemplateColumns:'328px minmax(0,1fr)'}}><PresetProvider catalogModel={model} fixedPresetId={id}><aside className="side-panel-shell"><PresetListPanel /></aside><section className="main-panel-content"><PresetOverview /></section></PresetProvider></div>}</WebSearchProvider>);
