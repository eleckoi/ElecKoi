// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { configDefaultModel, ModelPicker } from '../../src/modules/models/components/ModelPicker.jsx';

async function withPicker(configs, props, check) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('React', React);
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  try {
    await act(async()=>root.render(<ModelPicker configs={configs} selectedConfigId={configs[0]?.id} selectedModel={configs[0]?.model} {...props} />));
    await act(async()=>container.querySelector('.chat-model-trigger').click());
    await check(document.querySelector('.chat-model-panel'),container);
  } finally {await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
}

describe('model picker configuration selection', () => {
  it('searches all configurations and keeps icons on configuration headings and the outer trigger',async()=>{
    const configs=['Primary','Backup'].map((name,index)=>({id:`synthetic-${index}`,name,provider:'custom',model:`model-${index}-0`,
      model_options:Array.from({length:12},(_,model)=>({id:`model-${index}-${model}`,name:`Model ${index}/${model}`}))}));
    configs.push({id:'synthetic-route',name:'Synthetic route',provider:'custom',builtin:true,model:'route-model',model_options:[{id:'route-model'}]});
    const select=vi.fn(async()=>{}),labels=vi.fn(owner=><span>{owner.model.name}<small data-model-label>Label</small></span>);
    await withPicker(configs,{onSelect:select,renderModelLabel:labels},async(panel,container)=>{
      expect(panel.querySelectorAll('.chat-model-row')).toHaveLength(25);
      expect(panel.querySelectorAll('h3 img')).toHaveLength(2);
      expect([...panel.querySelectorAll('h3')].map(node=>node.textContent)).toEqual(['Primary','Backup','SYSynthetic route']);
      expect(panel.querySelector('h3 img').src).toContain('eleckoi-app-icon');
      expect(panel.querySelectorAll('h3 .chat-model-provider-icon')[2].textContent).toBe('SY');
      expect(panel.querySelectorAll('.chat-model-row img')).toHaveLength(0);
      expect(container.querySelector('.chat-model-trigger img')).not.toBeNull();
      expect(panel.querySelectorAll('[data-model-label]')).toHaveLength(25);
      const search=panel.querySelector('input[type="search"]');
      await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Backup');search.dispatchEvent(new Event('input',{bubbles:true}));});
      expect(panel.querySelectorAll('.chat-model-row')).toHaveLength(12);
      await act(async()=>panel.querySelectorAll('.chat-model-row')[11].click());
      expect(select).not.toHaveBeenCalled();
      await act(async()=>panel.querySelector('.chat-model-save').click());
      expect(select).toHaveBeenCalledWith({capability:'chat',configId:'synthetic-1',model:'model-1-11'});
      expect(labels).toHaveBeenCalledWith(expect.objectContaining({provider:{id:'synthetic-1',name:'Backup'},placement:'option',selected:true}));
    });
  });

  it('keeps catalog capability inheritance and saves a deliberate image capability override',async()=>{
    const config={id:'synthetic-capabilities',name:'Synthetic',provider:'deepseek',builtin:true,model:'synthetic-model',
      model_options:[{id:'synthetic-model',inputModalities:['text']}]};
    const save=vi.fn(async value=>value);
    await withPicker([config],{onSaveModelConfig:save,onSelect:async()=>{}},async panel=>{
      await act(async()=>panel.querySelectorAll('[role="tab"]')[1].click());
      const disclosure=panel.querySelector('.chat-model-capabilities');
      await act(async()=>disclosure.querySelector('summary').click());
      expect(disclosure.querySelector('summary').textContent).toBe('模型能力');
      expect(disclosure.textContent).not.toContain('模型能力声明');
      expect(disclosure.querySelector('.model-input-capabilities').disabled).toBe(true);
      await act(async()=>disclosure.querySelector('.model-capability-toggle').click());
      expect(disclosure.querySelector('.model-input-capabilities').disabled).toBe(false);
      await act(async()=>[...disclosure.querySelectorAll('label')].find(label=>label.textContent==='图片').click());
      await act(async()=>panel.querySelector('.chat-model-save').click());
      expect(save).toHaveBeenCalledWith(expect.objectContaining({model_options:[expect.objectContaining({capabilitiesOverride:true,inputModalities:['text','image'],supportsImageInput:true})]}));
    });
  });

  it('keeps successive parameter edits even when the external model cache still has the old values',async()=>{
    const option={id:'synthetic-model',name:'Synthetic',topP:.6,temperature:.2};
    const config={id:'synthetic-config',provider:'custom',model:option.id,model_options:[option]};
    const save=vi.fn(async value=>value),select=vi.fn(async()=>{});
    await withPicker([config],{onSaveModelConfig:save,onSelect:select,modelOptionsByKey:{'synthetic-config':[option]}},async panel=>{
      await act(async()=>panel.querySelectorAll('[role="tab"]')[1].click());
      for(const [name,value]of [['top-p','0.93'],['temperature','0.7']]){
        const input=panel.querySelector(`[data-parameter="${name}"] input`);
        await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
      }
      expect(panel.querySelector('[data-parameter="top-p"] input').value).toBe('0.93');
      await act(async()=>panel.querySelector('.chat-model-save').click());
      expect(save).toHaveBeenCalledWith(expect.objectContaining({model_options:[expect.objectContaining({topP:.93,temperature:.7})]}));
      expect(option).toMatchObject({topP:.6,temperature:.2});
    });
  });

  it('refreshes successful groups while preserving a failed group and reporting its error',async()=>{
    const configs=['one','two'].map(id=>({id,provider:'custom',name:id,model:id,model_options:[{id,name:`Old ${id}`}]}));
    const load=vi.fn(async config=>{if(config.id==='two')throw Error('Synthetic directory failure');return [{id:'one',name:'Current one'}];});
    const notify=vi.fn(),save=vi.fn(async config=>config);
    await withPicker(configs,{onLoadModels:load,onNotify:notify,onSaveModelConfig:save,onSelect:async()=>{}},async panel=>{
      await act(async()=>panel.querySelector('[aria-label="刷新模型"]').click());
      expect(panel.textContent).toContain('Current one');expect(panel.textContent).toContain('Old two');
      expect(notify).toHaveBeenCalledWith('error','Synthetic directory failure');
      await act(async()=>panel.querySelector('.chat-model-save').click());
      expect(save).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledWith(expect.objectContaining({id:'one'}));
    });
  });

  it('shows an unselected state honestly and saves parameter changes through the supplied model service', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('React', React);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const save = vi.fn(async config => config);
    const select = vi.fn(async () => {});
    try {
      await act(async () => root.render(<ModelPicker configs={[{ id: 'config-test', name: 'Example', model: 'example-model',
        model_options: [{ id: 'example-model', topP: 0.9, reasoningEfforts: { high: 'high' } }] }]}
        selectedConfigId="removed-config" selectedModel="removed-model" onSelect={select} onSaveModelConfig={save} />));
      expect(container.textContent).toContain('选择模型');
      expect(container.textContent).not.toContain('example-model');
      await act(async () => container.querySelector('button[title="选择模型"]').click());
      const dialog = document.querySelector('.chat-model-panel');
      await act(async () => dialog.querySelector('.chat-model-list button').click());
      expect(dialog.querySelector('.chat-model-save').disabled).toBe(false);
      await act(async () => [...dialog.querySelectorAll('[role="tab"]')].find(button => button.textContent === '参数').click());
      const field = [...dialog.querySelectorAll('label')].find(label => label.textContent.startsWith('Top P')).querySelector('input');
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '0.96');
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => dialog.querySelector('.chat-model-save').click());
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ model_options: [expect.objectContaining({ id: 'example-model', topP: 0.96 })] }));
      expect(select).toHaveBeenCalledWith({ capability: 'chat', configId: 'config-test', model: 'example-model' });
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
  it('activates the model saved on the selected configuration', () => {
    expect(configDefaultModel({
      id: 'config-a',
      model: 'model-saved',
      model_options: [{ id: 'model-other' }],
    }, {})).toBe('model-saved');
  });

  it('falls back to the first model when the configuration has no saved model', () => {
    expect(configDefaultModel({
      id: 'config-a',
      model: '',
      model_options: [{ id: 'model-first' }, { id: 'model-second' }],
    }, {})).toBe('model-first');
  });

  it('uses a refreshed model as the fallback without persisting the catalog', () => {
    expect(configDefaultModel({
      id: 'config-a',
      provider: 'custom',
      model: '',
      model_options: [],
    }, {
      'config-a': [{ id: 'model-refreshed' }],
    })).toBe('model-refreshed');
  });
});
