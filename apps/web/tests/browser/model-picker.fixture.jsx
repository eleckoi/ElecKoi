import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { ModelPicker } from '../../src/modules/models/components/ModelPicker.jsx';
import '../../src/app/windows/styles/index.css';

const configs = [
  { id: 'synthetic-official', provider: 'deepseek', name: '合成官方配置', model: 'synthetic-flash', builtin: true,
    model_options: [{ id: 'synthetic-flash', name: '合成 Flash', reasoningEfforts: { off: null, high: 'high' }, reasoningEffort: 'high', topP: .8 }, { id: 'synthetic-pro', name: '合成 Pro', reasoningEfforts: { high: 'high' }, reasoningEffort: 'high' }] },
  { id: 'synthetic-custom', provider: 'custom', name: '合成自定义配置', model: 'synthetic-plain', model_options: [{ id: 'synthetic-plain', name: '合成普通模型' }] },
];
const calls = [];
function Fixture() {
  const [selection,setSelection]=useState({configId:configs[0].id,model:'synthetic-flash'});
  return <main style={{height:'100dvh',background:'var(--chat)',padding:24,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
    <div style={{height:80,border:'1px solid var(--line)',borderRadius:19,padding:12,display:'flex',alignItems:'flex-end',justifyContent:'flex-end'}}>
      <ModelPicker configs={configs} selectedConfigId={selection.configId} selectedModel={selection.model}
        renderModelLabel={owner=><span>{owner.model.name}{owner.model.id==='synthetic-flash'?<Tag tone="info">标签</Tag>:null}</span>}
        onSaveModelConfig={async config=>{calls.push({save:config});return config}}
        onLoadModels={async config=>config.model_options}
        onSelect={async value=>{calls.push({selection:value});setSelection(value)}} />
    </div>
  </main>;
}
window.modelPickerFixture={calls};
createRoot(document.getElementById('root')).render(<Fixture />);
