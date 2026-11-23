import type { CatalogResponse, ModelSelectionSpec } from '../shared/types.ts'

export function modelKey(spec: ModelSelectionSpec | undefined): string {
  if (!spec) return ''
  return `${spec.provider}:::${spec.model}`
}

export function formatModelBadge(spec: ModelSelectionSpec | undefined): string {
  if (!spec) return 'default'
  return `${spec.provider}/${spec.model}${spec.reasoningEffort ? ` (${spec.reasoningEffort})` : ''}`
}

export function ModelPickerRow({
  catalog,
  value,
  onChange,
  disabled,
  compact,
}: {
  catalog: CatalogResponse | null
  value: ModelSelectionSpec | undefined
  onChange: (next: ModelSelectionSpec) => void
  disabled?: boolean
  compact?: boolean
}) {
  const groups = catalog?.groups ?? []
  const selectedGroup = groups.find((g) => g.id === value?.provider)
  const selectedModel = selectedGroup?.models.find((m) => m.id === value?.model)
  const efforts = selectedModel?.reasoning?.efforts ?? []

  const handleModelChange = (encoded: string) => {
    const sep = encoded.indexOf(':::')
    if (sep <= 0) return
    const provider = encoded.slice(0, sep)
    const model = encoded.slice(sep + 3)
    const grp = groups.find((g) => g.id === provider)
    const mdl = grp?.models.find((m) => m.id === model)
    const defaultEffort =
      mdl?.reasoning?.defaultEffort ?? mdl?.reasoning?.efforts?.[0]?.id
    onChange({
      provider,
      model,
      ...(defaultEffort ? { reasoningEffort: defaultEffort } : {}),
    })
  }

  return (
    <div className="dsh-thr-row" style={{ gap: compact ? 4 : 6 }}>
      <select
        className="dsh-thr-select"
        style={{ flex: '1 1 160px', maxWidth: '100%' }}
        disabled={disabled || groups.length === 0}
        value={modelKey(value)}
        onChange={(e) => handleModelChange(e.target.value)}
        aria-label="Model"
      >
        {!value && <option value="">Select model…</option>}
        {value && !selectedModel && (
          <option value={modelKey(value)}>
            {value.provider} / {value.model}
          </option>
        )}
        {groups.map((group) => (
          <optgroup key={group.id} label={group.name || group.id}>
            {group.models.map((m) => (
              <option key={`${group.id}:::${m.id}`} value={`${group.id}:::${m.id}`}>
                {m.displayName || m.name || m.id}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {efforts.length > 0 && (
        <select
          className="dsh-thr-select"
          style={{ flex: '0 0 auto', width: compact ? 86 : 104 }}
          disabled={disabled}
          value={value?.reasoningEffort ?? selectedModel?.reasoning?.defaultEffort ?? efforts[0].id}
          onChange={(e) => {
            if (!value) return
            onChange({
              ...value,
              reasoningEffort: e.target.value || undefined,
            })
          }}
          aria-label="Reasoning effort"
        >
          {efforts.map((eff) => (
            <option key={eff.id} value={eff.id}>
              {eff.name || eff.id}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
