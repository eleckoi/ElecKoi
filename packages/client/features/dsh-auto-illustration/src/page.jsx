import { useEffect, useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { AutoIllustrationSettings } from '../../../../../apps/web/src/modules/autoIllustration/index.js'
import { FailureAlert } from '../../../../../apps/web/src/ui/ui/FailureAlert.jsx'
import './page.css'

// The page already displays a failed write and retains the saved selection.
const failureShownInPage = () => {}

export function AutoIllustrationPage({ presetCatalog, modelCatalog }) {
  const [presets, setPresets] = useState([])
  const [id, setId] = useState('')
  const [preset, setPreset] = useState(null)
  const [failure, setFailure] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    presetCatalog.refresh().then(catalog => {
      if (!active) return
      setPresets(catalog.presets.filter(item => item.purpose === 'roleplay'))
      setId(catalog.activePresetIds.roleplay)
    }).catch(error => { if (active) setFailure(error) })
    return () => { active = false }
  }, [presetCatalog])
  useEffect(() => {
    if (!id) return
    let active = true
    setPreset(null); setFailure(null)
    presetCatalog.read(id).then(value => { if (active) setPreset(value) })
      .catch(error => { if (active) setFailure(error) })
    return () => { active = false }
  }, [id, presetCatalog])
  async function update(patch) {
    setSaving(true); setFailure(null)
    try {
      // Fetch the current preset so unrelated editor changes are retained.
      const current = await presetCatalog.read(id)
      const saved = await presetCatalog.save({ ...current, autoIllustration: {
        enabled: false, modelConfigId: '', ...current.autoIllustration, ...patch
      } }, current.regexRules)
      setPreset(saved)
    } catch (error) { setFailure(error); throw error }
    finally { setSaving(false) }
  }
  return <section className="auto-illustration-plugin" aria-label="自动配图配置" aria-busy={saving}>
    <label className="auto-illustration-preset">预设<select value={id} disabled={saving} onChange={event => setId(event.target.value)}>
      {presets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <FailureAlert failure={failure} />
    {preset ? <>
      <div className="auto-illustration-enabled"><span>为此预设自动配图</span>
        <Switch label="为此预设自动配图" checked={preset.autoIllustration?.enabled === true} disabled={saving}
          onChange={enabled => { void update({ enabled }).catch(failureShownInPage) }} />
      </div>
      <fieldset disabled={saving} className="auto-illustration-fields">
        <AutoIllustrationSettings modelCatalog={modelCatalog} configId={preset.autoIllustration?.modelConfigId || ''}
          onSelect={modelConfigId => update({ modelConfigId })} />
      </fieldset>
    </> : !failure && <p role="status">正在读取配图配置…</p>}
  </section>
}
