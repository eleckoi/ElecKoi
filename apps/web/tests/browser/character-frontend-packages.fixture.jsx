import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CharacterFrontendPanel } from '../../src/modules/authorFrontend/components/CharacterFrontendPanel.jsx';
import { NativeFrontendProvider } from '../../src/modules/authorFrontend/hooks/NativeFrontendContext.jsx';
import '../../src/ui/styles/dsh-editor-controls.css';

const characterId = 'synthetic-layout-character';
const source = '<!doctype html><meta name="eleckoi-author-api" content="0.1.0"><style>body{margin:0}</style><p>Synthetic package preview</p>';
const project = { id: 'synthetic-package', name: 'Synthetic package with a long name', scope: 'character', characterId,
  entryFile: 'scripts/entry.js', updatedAt: 'synthetic-1', files: ['index.html', 'assets/image.png', ...Array.from({length:1200},(_,i)=>`scripts/item-${String(i).padStart(4,'0')}.js`), 'scripts/entry.js'],
  manifest: { manifestVersion:1,sdkVersion:'0.1.0',scope:'character',entryFile:'index.html',bindings:[{target:'root',view:'chat',entryFile:'index.html'}] } };
const root = createRoot(document.getElementById('root'));
const connection = value => ({ getSnapshot:()=>value,subscribe:()=>()=>{} });
const runtime = { mountProjectDocument:()=>()=>{} };
window.renderPackages = (active=true, empty=false) => {
  const state={scope:'character',characterId,projects:empty?[]:[project],selectedProjectId:active?project.id:null,revision:1};
  const service={watch:(_owner,publish)=>{publish(state);return()=>{};},projects:{readFile:async(_owner,_id,{path})=>({ok:true,value:{content:path==='index.html'?source:'// '+path+'\n'+Array.from({length:180},(_,i)=>`const value${i} = ${i};`).join('\n')}})}};
  flushSync(()=>root.render(<NativeFrontendProvider connection={connection(service)} authorConnection={connection(runtime)}>
    <CharacterFrontendPanel key={`${active}:${empty}`} characterId={characterId}/></NativeFrontendProvider>));
  window.packageSeat=document.querySelector('.character-frontend-editor').shadowRoot;
};
