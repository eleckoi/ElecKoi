import { useEffect, useState } from 'react';
import { CheckCircle, Eye, EyeSlash, SpinnerGap, Trash } from '@phosphor-icons/react';
import {
  loadWebSearchSettings,
  removeTavilyApiKey,
  saveAndTestTavilyApiKey,
  testTavilyConnection,
  updateWebSearchSettings,
} from '../api/webSearchApi.js';

const RESULT_COUNTS = [3, 5, 8];

export function WebSearchSettings() {
  const [settings, setSettings] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadWebSearchSettings()
      .then((value) => { if (active) setSettings(value); })
      .catch((cause) => { if (active) setError(messageOf(cause, '读取联网搜索配置失败')); });
    return () => { active = false; };
  }, []);

  async function update(patch) {
    if (!settings || busy) return;
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    setBusy('settings');
    setNotice('');
    setError('');
    try {
      setSettings(await updateWebSearchSettings({ mode: next.mode, maxResults: next.maxResults }));
    } catch (cause) {
      setSettings(previous);
      setError(messageOf(cause, '保存联网搜索配置失败'));
    } finally {
      setBusy('');
    }
  }

  async function saveAndTest() {
    if (busy) return;
    const value = apiKey.trim();
    if (!value) {
      setError('请先填写 Tavily API Key');
      return;
    }
    setBusy('save');
    setNotice('');
    setError('');
    try {
      const result = await saveAndTestTavilyApiKey(value);
      setSettings(result.settings);
      setApiKey('');
      setNotice(connectionText(result.connection, 'API Key 已加密保存'));
    } catch (cause) {
      setError(messageOf(cause, 'Tavily 连接失败'));
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
      const result = await testTavilyConnection(apiKey);
      setNotice(connectionText(result.connection, 'Tavily 连接正常'));
    } catch (cause) {
      setError(messageOf(cause, 'Tavily 连接失败'));
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
      setSettings(await removeTavilyApiKey());
      setApiKey('');
      setNotice('已移除 Tavily API Key');
    } catch (cause) {
      setError(messageOf(cause, '移除 Tavily API Key 失败'));
    } finally {
      setBusy('');
    }
  }

  if (!settings) {
    return <div className="web-search-config-state" aria-live="polite">{error || '正在读取配置'}</div>;
  }

  return <div className="web-search-config" aria-busy={Boolean(busy)}>
    <fieldset className="web-search-config-fieldset">
      <legend>搜索方式</legend>
      <div className="web-search-mode" role="radiogroup" aria-label="搜索方式">
        <button type="button" role="radio" aria-checked={settings.mode === 'provider_native'} onClick={() => update({ mode: 'provider_native' })}>
          <strong>模型原生</strong><span>DeepSeek 官方</span>
        </button>
        <button type="button" role="radio" aria-checked={settings.mode === 'tavily'} onClick={() => update({ mode: 'tavily' })}>
          <strong>Tavily</strong><span>{settings.apiKeyConfigured ? '已配置' : '需要 API Key'}</span>
        </button>
      </div>
    </fieldset>

    {settings.mode === 'tavily' ? <fieldset className="web-search-config-fieldset">
      <legend>API Key</legend>
      <div className="web-search-key-field">
        <input
          type={showKey ? 'text' : 'password'}
          name="tavily-api-key"
          autoComplete="off"
          value={apiKey}
          maxLength={2048}
          placeholder={settings.apiKeyConfigured ? '已加密保存，填写可替换' : '填写 Tavily API Key'}
          aria-label="Tavily API Key"
          onChange={(event) => { setApiKey(event.target.value); setNotice(''); setError(''); }}
          onKeyDown={(event) => { if (event.key === 'Enter') saveAndTest(); }}
        />
        <button type="button" aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowKey((value) => !value)}>
          {showKey ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      <div className="web-search-key-actions">
        {apiKey.trim() ? <button type="button" className="is-primary" onClick={saveAndTest}>
          {busy === 'save' ? <SpinnerGap className="is-spinning" aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}保存并测试
        </button> : null}
        {settings.apiKeyConfigured ? <button type="button" onClick={testConnection}>
          {busy === 'test' ? <SpinnerGap className="is-spinning" aria-hidden="true" /> : null}测试连接
        </button> : null}
        {settings.apiKeyConfigured ? <button type="button" className="is-danger" onClick={removeKey}>
          <Trash aria-hidden="true" />移除
        </button> : null}
      </div>
    </fieldset> : null}

    <fieldset className="web-search-config-fieldset">
      <legend>返回结果</legend>
      <div className="web-search-results" role="radiogroup" aria-label="返回结果数量">
        {RESULT_COUNTS.map((count) => <button type="button" role="radio" aria-checked={settings.maxResults === count} key={count} onClick={() => update({ maxResults: count })}>{count} 条</button>)}
      </div>
    </fieldset>

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
