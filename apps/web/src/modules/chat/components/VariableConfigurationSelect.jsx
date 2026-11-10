import { useEffect, useRef, useState } from 'react';
import { MenuSurface, IconCheckOutlineRegular as Check } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretDown, FolderSimple } from '../../../ui/icons/interfaceIcons.jsx';
import { MobileConversationOverlay } from '../../../mobile/MobileConversationOverlay.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { resolveFailure } from '../../../utils/failureText.js';

export function VariableConfigurationSelect({ conversationId, model, mobile, sending, refreshKey }) {
  const t = useProductTranslation(), root = useRef(null), alive = useRef(0), reading = useRef(0), mutation = useRef(false);
  const [configuration, setConfiguration] = useState(null), [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  async function read() {
    if (mutation.current) return;
    const generation = ++reading.current, owner = alive.current;
    setLoading(true);
    try {
      const result = await model.readVariableConfiguration(conversationId);
      if (alive.current === owner && reading.current === generation) { setConfiguration(result); setError(''); }
    } catch (cause) {
      if (alive.current === owner && reading.current === generation) setError(resolveFailure(cause, { fallback: t('读取变量配置失败') }).text);
    } finally { if (alive.current === owner && reading.current === generation) setLoading(false); }
  }
  useEffect(() => {
    mutation.current = false; setSaving(false); setConfiguration(null); setOpen(false);
    return () => { alive.current++; };
  }, [conversationId, model]);
  useEffect(() => { void read(); }, [conversationId, model, refreshKey]);
  useEffect(() => {
    if (!open || mobile) return undefined;
    const outside = event => { if (!root.current?.contains(event.target) && !saving) setOpen(false); };
    const keys = event => { if (event.key === 'Escape') { event.stopImmediatePropagation(); if (!saving) setOpen(false); } };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', keys, true); };
  }, [open, mobile, saving]);
  async function select(versionId) {
    if (!configuration || saving || loading || sending) return;
    if (versionId === configuration.versionId) { setOpen(false); return; }
    const generation = alive.current;
    mutation.current = true; reading.current++;
    setSaving(true); setError('');
    try {
      const result = await model.selectVariableVersion(conversationId, versionId, configuration.versionId);
      if (alive.current === generation) { setConfiguration(result); setOpen(false); }
    } catch (cause) {
      if (alive.current === generation) setError(resolveFailure(cause, { fallback: t('切换变量配置失败') }).text);
    } finally { if (alive.current === generation) { mutation.current = false; setSaving(false); } }
  }
  const version = configuration?.versions.find(item => item.id === configuration.versionId);
  const name = version ? version.name || t('未命名版本') : configuration?.versionId ? t('版本不存在') : t('选择变量配置');
  const options = <div className="vm-config-options" role="menu" aria-label={t('选择变量配置')}>
    {configuration?.versions.map(item => <button type="button" role="menuitemradio" aria-checked={configuration.versionId === item.id} disabled={saving || loading || sending} key={item.id} onClick={() => void select(item.id)}>
      <FolderSimple size={mobile ? 20 : 17} /><span>{item.name || t('未命名版本')}</span>{configuration.versionId === item.id && <Check size={17} />}
    </button>)}
    <i aria-hidden="true" />
    <button type="button" role="menuitemradio" aria-checked={configuration?.versionId === ''} disabled={!configuration || saving || loading || sending} onClick={() => void select('')}><span className="vm-no-config">—</span><span>{t('不关联配置')}</span>{configuration?.versionId === '' && <Check size={17} />}</button>
  </div>;
  return <section className="vm-config-area">
    <div className="vm-config-bar"><span>{t('当前使用')}</span><div ref={root} className="vm-config-anchor">
      <button type="button" className="vm-config-trigger" disabled={loading || saving || sending} aria-haspopup={mobile ? 'dialog' : 'menu'} aria-expanded={open}
        title={sending ? t('请先等待当前回复结束，再切换变量配置。') : undefined} onClick={() => { setOpen(value => !value); void read(); }}>
        <FolderSimple size={19} /><strong>{loading ? t('正在读取…') : name}</strong><CaretDown size={15} />
      </button>
      {open && !mobile && <MenuSurface className="vm-config-menu">{options}{error && <p role="alert" className="vm-error">{error}</p>}</MenuSurface>}
    </div></div>
    {error && !open && <p className="vm-error" role="alert">{error}<button type="button" onClick={() => void read()}>{t('重试')}</button></p>}
    {open && mobile && <MobileConversationOverlay kind="sheet" elevated title={t('选择变量配置')} className="vm-config-sheet" busy={saving} onClose={() => setOpen(false)}>
      {options}{error && <p role="alert" className="vm-error">{error}</p>}
    </MobileConversationOverlay>}
  </section>;
}
