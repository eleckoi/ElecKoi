import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle, Eye, EyeSlash, SpinnerGap, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { useWebSearchModel } from '../model/WebSearchContext.jsx';

export function WebSearchSettings({ onBeforeOpenPluginSettings, onOpenPluginSettings }) {
  const tUi = useProductTranslation();
  const model = useWebSearchModel();
  const settings = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [resultCount, setResultCount] = useState(String(settings.maxResults ?? 5));
  useEffect(() => setResultCount(String(settings.maxResults ?? 5)), [settings.maxResults]);

  function commitResultCount() {
    const count = Number(resultCount);
    if (!resultCount.trim() || !Number.isInteger(count) || count < 0 || count > 20) {
      setError(tUi("Tavily API 返回结果数量必须在 0 到 20 之间。"));
      return;
    }
    if (count !== settings.maxResults) void update({ maxResults: count });
  }

  async function update(patch) {
    if (settings.status !== 'ready' || busy) return;
    setBusy('settings');
    setNotice('');
    setError('');
    try {
      await model.update(patch);
    } catch (cause) {
      setError(messageOf(cause, tUi("保存联网搜索配置失败")));
    } finally {
      setBusy('');
    }
  }

  async function saveAndTest() {
    if (busy) return;
    const value = apiKey.trim();
    if (!value) {
      setError(tUi("请先填写 Tavily API Key"));
      return;
    }
    setBusy('save');
    setNotice('');
    setError('');
    try {
      const result = await model.saveAndTest(value);
      setApiKey('');
      setNotice(connectionText(result.connection, tUi("API Key 已保存")));
    } catch (cause) {
      setError(messageOf(cause, tUi("Tavily 连接失败")));
    } finally {
      setBusy('');
    }
  }

  async function testConnection() {
    if (busy) return;
    setBusy('test');
    setNotice('');
    setError('');
    try {
      const result = await model.test(apiKey);
      setNotice(connectionText(result.connection, tUi("Tavily 连接正常")));
    } catch (cause) {
      setError(messageOf(cause, tUi("Tavily 连接失败")));
    } finally {
      setBusy('');
    }
  }

  async function removeKey() {
    if (busy) return;
    setBusy('remove');
    setNotice('');
    setError('');
    try {
      await model.removeKey();
      setApiKey('');
      setNotice(tUi("已移除 Tavily API Key"));
    } catch (cause) {
      setError(messageOf(cause, tUi("移除 Tavily API Key 失败")));
    } finally {
      setBusy('');
    }
  }

  if (settings.status !== 'ready') {
    return <div className="web-search-config-state" aria-live="polite">{error || settings.error || tUi("正在读取配置")}</div>;
  }

  return <div className="web-search-config" aria-busy={Boolean(busy)}>
    <fieldset className="web-search-config-fieldset">
      <legend>{tUi("搜索方式")}</legend>
      <div className="web-search-mode" role="group" aria-label={tUi("搜索方式")}>
        <button type="button" disabled={!settings.writable || Boolean(busy)} aria-pressed={settings.mode === 'provider_native' || settings.mode === 'deepseek_search_api'} onClick={() => {
          if (settings.mode === 'tavily') void update({ mode: 'provider_native' });
        }}>
          <strong>DeepSeek</strong><span>{settings.mode === 'deepseek_search_api' ? tUi("Web 搜索 API") : tUi("Messages 搜索")}</span>
        </button>
        <button type="button" disabled={!settings.writable || !settings.tavilyAvailable || Boolean(busy)} aria-pressed={settings.mode === 'tavily'} onClick={() => update({ mode: 'tavily' })}>
          <strong>Tavily</strong><span>{settings.apiKeyConfigured ? tUi("已配置") : tUi("需要 API Key")}</span>
        </button>
      </div>
      {settings.mode !== 'tavily' ? <div className="web-search-key-actions">
        <button type="button" disabled={Boolean(busy)} onClick={() => {
          if (onBeforeOpenPluginSettings?.() === false) return;
          try {
            model.openPluginSettings();
            onOpenPluginSettings?.();
          } catch (cause) {
            setError(messageOf(cause, tUi("网页搜索插件设置暂时无法打开")));
          }
        }}>{tUi("前往官方插件配置")}</button>
      </div> : null}
    </fieldset>

    {settings.mode === 'tavily' ? <fieldset className="web-search-config-fieldset">
      <legend>API Key</legend>
      <div className="web-search-key-field">
        <input
          type={showKey ? 'text' : 'password'}
          name="tavily-api-key"
          autoComplete="off"
          value={apiKey}
          placeholder={settings.apiKeyConfigured ? tUi("已保存，填写可替换") : tUi("填写 Tavily API Key")}
          aria-label="Tavily API Key"
          disabled={!settings.apiKeyWritable || Boolean(busy)}
          onChange={(event) => { setApiKey(event.target.value); setNotice(''); setError(''); }}
          onKeyDown={(event) => { if (event.key === 'Enter') saveAndTest(); }}
        />
        <button type="button" aria-label={showKey ? tUi("隐藏 API Key") : tUi("显示 API Key")} onClick={() => setShowKey((value) => !value)}>
          {showKey ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      <div className="web-search-key-actions">
        {apiKey.trim() ? <button type="button" className="is-primary" disabled={!settings.apiKeyWritable || Boolean(busy)} onClick={saveAndTest}>
          {busy === 'save' ? <SpinnerGap className="is-spinning" aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}{tUi("保存并测试")}</button> : null}
        {settings.apiKeyConfigured ? <button type="button" disabled={Boolean(busy)} onClick={testConnection}>
          {busy === 'test' ? <SpinnerGap className="is-spinning" aria-hidden="true" /> : null}{tUi("测试连接")}</button> : null}
        {settings.apiKeyConfigured ? <button type="button" className="is-danger" disabled={!settings.apiKeyWritable || Boolean(busy)} onClick={removeKey}>
          <Trash aria-hidden="true" />{tUi("移除")}</button> : null}
      </div>
    </fieldset> : null}

    {settings.mode === 'tavily' ? <fieldset className="web-search-config-fieldset">
      <legend>{tUi("返回结果")}</legend>
      <label className="web-search-option"><span>{tUi("条数")}</span><input type="number" min="0" max="20" step="1" aria-label={tUi("返回结果数量")} disabled={!settings.writable || Boolean(busy)}
        value={resultCount} onChange={(event) => setResultCount(event.target.value)} onBlur={commitResultCount}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} /></label>
    </fieldset> : null}

    {notice || error ? <div className={`web-search-config-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{notice || error}</div> : null}
  </div>;
}

function messageOf(error, fallback) {
  return typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : fallback;
}

function connectionText(connection, prefix) {
  return connection.limit > 0
    ? `${prefix} · ${connection.plan} · ${connection.used} / ${connection.limit} credits`
    : `${prefix} · ${connection.plan}`;
}
