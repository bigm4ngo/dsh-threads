const STYLE_ELEMENT_ID = 'dsh-threads-styles'

const CSS_TEXT = `
.dsh-thr-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, inherit));
  font-size: 13px;
  line-height: 1.45;
}

.dsh-thr-subtabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  flex-shrink: 0;
  overflow-x: auto;
}

.dsh-thr-subtab {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 5px 9px 6px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dsh-thr-subtab:hover {
  color: var(--dsw-alias-label-primary, inherit);
}

.dsh-thr-subtab-active {
  color: var(--dsw-alias-label-primary, inherit);
  border-bottom-color: var(--dsw-alias-brand-primary, #3b82f6);
  font-weight: 600;
}

.dsh-thr-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-thr-card {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  border-radius: 10px;
  padding: 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.04));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-thr-card-accent {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 40%, var(--dsw-alias-border-l2, rgba(128,128,128,0.22)));
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 6%, var(--dsw-alias-bg-layer-1, transparent));
}

.dsh-thr-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dsh-thr-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dsh-thr-muted {
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  font-size: 12px;
}

.dsh-thr-faint {
  color: var(--dsw-alias-label-tertiary, rgba(128, 128, 128, 0.7));
  font-size: 11px;
}

.dsh-thr-err {
  color: var(--dsw-alias-state-error-primary, #dc2626);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 35%, transparent);
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 12px;
  white-space: normal;
  word-break: break-word;
}

.dsh-thr-warn {
  color: var(--dsw-alias-state-warn-primary, #d97706);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 35%, transparent);
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 12px;
  white-space: normal;
}

.dsh-thr-ok {
  color: var(--dsw-alias-state-success-primary, #16a34a);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 35%, transparent);
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 12px;
}

.dsh-thr-btn {
  appearance: none;
  font: inherit;
  font-size: 12px;
  line-height: 1.35;
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.dsh-thr-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
}

.dsh-thr-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dsh-thr-btn-primary {
  background: var(--dsw-alias-brand-primary, #3b82f6);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
  font-weight: 500;
}

.dsh-thr-btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
  background: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-btn-danger {
  color: var(--dsw-alias-state-error-primary, #dc2626);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 40%, transparent);
}

.dsh-thr-btn-xs {
  appearance: none;
  font: inherit;
  font-size: 11px;
  line-height: 1.2;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  cursor: pointer;
  white-space: nowrap;
}

.dsh-thr-btn-xs:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
}

.dsh-thr-btn-xs:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dsh-thr-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.26));
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  white-space: nowrap;
}

.dsh-thr-pill-brand {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 45%, transparent);
  color: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-pill-ok {
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 45%, transparent);
  color: var(--dsw-alias-state-success-primary, #16a34a);
}

.dsh-thr-pill-warn {
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 45%, transparent);
  color: var(--dsw-alias-state-warn-primary, #d97706);
}

.dsh-thr-input,
.dsh-thr-select,
.dsh-thr-textarea {
  box-sizing: border-box;
  font: inherit;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base, transparent));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  border-radius: 7px;
  padding: 5px 8px;
  min-width: 0;
}

.dsh-thr-input:focus,
.dsh-thr-select:focus,
.dsh-thr-textarea:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-textarea {
  width: 100%;
  resize: vertical;
  line-height: 1.45;
  font-family: inherit;
}

.dsh-thr-mono {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.dsh-thr-blockquote {
  margin: 0;
  padding: 4px 8px;
  border-left: 2px solid var(--dsw-alias-brand-primary, #3b82f6);
  background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.06));
  border-radius: 0 6px 6px 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  white-space: pre-wrap;
  word-break: break-word;
}

.dsh-thr-side-chips {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.dsh-thr-side-chip {
  appearance: none;
  font: inherit;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25));
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  cursor: pointer;
  white-space: nowrap;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-thr-side-chip-active {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 14%, transparent);
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
  color: var(--dsw-alias-label-primary, inherit);
  font-weight: 500;
}

.dsh-thr-msg-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-thr-msg {
  border-radius: 9px;
  padding: 8px 10px;
  font-size: 12.5px;
  word-break: break-word;
}

.dsh-thr-msg-user {
  align-self: flex-end;
  max-width: 92%;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 12%, var(--dsw-alias-bg-layer-2, transparent));
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 28%, transparent);
  white-space: pre-wrap;
}

.dsh-thr-msg-assistant {
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.05));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));
}

.dsh-thr-md {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsh-thr-p {
  margin: 0;
}

.dsh-thr-h1,
.dsh-thr-h2,
.dsh-thr-h3 {
  margin: 4px 0 2px;
  font-size: 13px;
  font-weight: 600;
}

.dsh-thr-list {
  margin: 0;
  padding-left: 18px;
}

.dsh-thr-hr {
  border: none;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));
  margin: 4px 0;
}

.dsh-thr-inline-code {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.9em;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.14);
}

.dsh-thr-codeblock {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
  border-radius: 7px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.16);
}

.dsh-thr-codeblock-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.18));
}

.dsh-thr-pre {
  margin: 0;
  padding: 7px 8px;
  overflow-x: auto;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  line-height: 1.4;
}

.dsh-thr-link {
  color: var(--dsw-alias-brand-primary, #3b82f6);
  text-decoration: underline;
}

.dsh-thr-header-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  font: inherit;
  font-size: 12px;
  padding: 3px 7px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  white-space: nowrap;
}

.dsh-thr-header-btn:hover {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
}

.dsh-thr-lineage-pill {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  font: inherit;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-thr-lineage-pill:hover {
  color: var(--dsw-alias-label-primary, inherit);
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-turntail {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dsh-thr-popover-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dsh-thr-popover-btn {
  appearance: none;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  cursor: pointer;
  white-space: nowrap;
}

.dsh-thr-popover-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.12));
}

.dsh-thr-popover-panel {
  width: 310px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #1e1e1e));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));
  border-radius: 10px;
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.25));
}

.dsh-thr-tree-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.04));
}

.dsh-thr-tree-node-current {
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 8%, transparent);
}

.dsh-thr-thinking {
  margin-bottom: 6px;
  border-left: 2px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  padding-left: 8px;
}

.dsh-thr-thinking > summary {
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  user-select: none;
}

.dsh-thr-thinking-body {
  margin-top: 4px;
  max-height: 160px;
  overflow-y: auto;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  white-space: pre-wrap;
  word-break: break-word;
}

.dsh-thr-stream-text {
  position: relative;
}

.dsh-thr-cursor {
  display: inline-block;
  width: 6px;
  height: 13px;
  margin-left: 3px;
  vertical-align: -2px;
  border-radius: 1px;
  background: var(--dsw-alias-brand-primary, #3b82f6);
  animation: dsh-thr-blink 1s steps(2, start) infinite;
}

@keyframes dsh-thr-blink {
  to {
    opacity: 0.2;
  }
}
`

export function ensureThreadsStyles(): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ELEMENT_ID)
  if (existing instanceof HTMLStyleElement) {
    existing.textContent = CSS_TEXT
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = CSS_TEXT
  document.head.appendChild(style)
}
