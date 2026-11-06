import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { useState } from 'react';
import { Check, Trash } from '@phosphor-icons/react';
import { DshSearchIcon } from '../ui/icons/dshComposerIcons.jsx';
import { MobileDialog } from './MobileChrome.jsx';

export function MobileModelPicker({ editor }) {
  const tUi = useProductTranslation();
  const [query, setQuery] = useState('');
  const keyword = query.trim().toLocaleLowerCase();
  const items = editor.modelItems.filter(item => !keyword || [item.id, item.name].some(value => value?.toLocaleLowerCase().includes(keyword)));
  return <MobileDialog title={tUi("模型列表")} className="mobile-model-sheet" onClose={() => editor.setModelMenuOpen(false)}>
    <div className="mobile-model-picker-tools">
      <div className="mobile-model-search"><DshSearchIcon size={19} /><input type="search" aria-label={tUi("搜索模型")} placeholder={tUi("搜索模型")} value={query} onChange={event => setQuery(event.target.value)} /></div>
    </div>
    <div className="mobile-model-picker-list">
      {items.map(item => <div key={item.id} className="mobile-model-picker-row">
        <button type="button" className="mobile-model-choice" aria-pressed={editor.form.model === item.id} onClick={() => editor.selectModel(item.id)}>
          <span><strong>{item.id}</strong>{item.name !== item.id && <small>{item.name}</small>}</span>
          {editor.form.model === item.id && <Check size={19} aria-hidden="true" />}
        </button>
        {editor.removableModelIds.has(item.id) && <button type="button" className="mobile-model-remove" aria-label={tUi("删除模型 {value0}", {value0: item.id})} onClick={() => editor.deleteModel(item.id)}><Trash size={19} /></button>}
      </div>)}
      {!items.length && <p className="mobile-model-picker-empty">{keyword ? tUi("没有匹配的模型") : tUi("暂无模型")}</p>}
    </div>
  </MobileDialog>;
}

export function MobileManualModel({ editor }) {
  const tUi = useProductTranslation();
  return <MobileDialog title={tUi("添加模型")} className="mobile-model-manual-dialog" onClose={() => editor.setManualModelOpen(false)}>
    <label className="mobile-field"><span>{tUi("模型名")}</span><input value={editor.manualModelName} onChange={event => editor.setManualModelName(event.target.value)} placeholder={tUi("填写服务商提供的完整模型名")} onKeyDown={event => {
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); editor.addManualModel(); }
    }} /></label>
    <div className="mobile-model-manual-actions"><button type="button" onClick={() => editor.setManualModelOpen(false)}>{tUi("取消")}</button><button type="button" className="mobile-primary" onClick={editor.addManualModel}>{tUi("添加并使用")}</button></div>
  </MobileDialog>;
}
