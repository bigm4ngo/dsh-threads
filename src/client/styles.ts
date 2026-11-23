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

.dsh-thr-body-side {
  overflow: hidden;
  padding: 0;
  gap: 0;
}

.dsh-thr-body-side > .dsh-thr-muted,
.dsh-thr-body-side > .dsh-thr-err {
  margin: 10px 12px 0;
}

.dsh-thr-side-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dsh-thr-side-header {
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--dsw-alias-bg-base, transparent);
}

.dsh-thr-side-header-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dsh-thr-side-header-bar .dsh-thr-side-chips {
  flex: 1;
  min-width: 0;
  padding-bottom: 0;
}

.dsh-thr-btn-sm {
  padding: 3px 8px;
  font-size: 11.5px;
  flex-shrink: 0;
}

.dsh-thr-side-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-thr-side-footer {
  flex-shrink: 0;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--dsw-alias-bg-base, transparent);
}

.dsh-thr-side-drawer {
  max-height: 42vh;
  overflow-y: auto;
}

.dsh-thr-side-composer {
  padding: 8px;
  gap: 6px;
}

.dsh-thr-draft-wrap {
  position: relative;
  width: 100%;
}

.dsh-thr-draft-editor {
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  max-height: 150px;
  overflow-y: auto;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base, transparent));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  border-radius: 7px;
  padding: 6px 8px;
  white-space: pre-wrap;
  word-break: break-word;
  outline: none;
}

.dsh-thr-draft-editor:focus {
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-draft-editor[data-empty="true"]::before {
  content: attr(data-placeholder);
  color: var(--dsw-alias-label-tertiary, rgba(128, 128, 128, 0.68));
  pointer-events: none;
}

.dsh-thr-quote-chip {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  box-sizing: border-box;
  max-width: min(85%, 260px);
  margin: 0 2px;
  padding: 0;
  vertical-align: baseline;
  color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #3b82f6));
  font-size: inherit;
  line-height: inherit;
}

.dsh-thr-quote-marker,
.dsh-thr-quote-remove {
  display: inline-grid;
  place-items: center;
  align-self: center;
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  color: inherit;
  user-select: none;
}

.dsh-thr-quote-marker {
  pointer-events: none;
}

.dsh-thr-quote-remove {
  appearance: none;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.dsh-thr-quote-mark,
.dsh-thr-quote-close {
  grid-area: 1 / 1;
  transition: opacity 0.12s ease;
}

.dsh-thr-quote-close {
  opacity: 0;
}

.dsh-thr-quote-chip[data-removable]:hover .dsh-thr-quote-mark,
.dsh-thr-quote-chip[data-removable]:focus-within .dsh-thr-quote-mark {
  opacity: 0;
}

.dsh-thr-quote-chip[data-removable]:hover .dsh-thr-quote-close,
.dsh-thr-quote-chip[data-removable]:focus-within .dsh-thr-quote-close {
  opacity: 1;
}

.dsh-thr-quote-source {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-thr-quote-hover {
  position: absolute;
  z-index: 40;
  left: 0;
  bottom: calc(100% + 6px);
  width: max-content;
  max-width: min(280px, 80vw);
  max-height: 180px;
  overflow-y: auto;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #1e1e1e));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));
  box-shadow: var(--dsw-elevation-panel, 0 8px 24px rgba(0, 0, 0, 0.25));
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  pointer-events: none;
}

.dsh-thr-draft-wrap > .dsh-thr-quote-hover {
  bottom: auto;
  transform: translateY(-100%);
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

.dsh-thr-btn-danger-solid {
  background: var(--dsw-alias-state-error-primary, #dc2626);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
  font-weight: 500;
}

.dsh-thr-btn-danger-solid:hover:not(:disabled) {
  filter: brightness(1.06);
  background: var(--dsw-alias-state-error-primary, #dc2626);
  color: var(--dsw-alias-label-primary-inverted, #fff);
}

.dsh-thr-confirm-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 9px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, inherit);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 9%, var(--dsw-alias-bg-layer-1, transparent));
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 40%, transparent);
}

.dsh-thr-confirm-title {
  font-weight: 600;
  color: var(--dsw-alias-state-error-primary, #dc2626);
  word-break: break-word;
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

.dsh-thr-msg-wrap {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.dsh-thr-msg-wrap-user {
  align-self: flex-end;
  align-items: flex-end;
  max-width: 92%;
}

.dsh-thr-msg-wrap-assistant {
  align-items: stretch;
}

.dsh-thr-msg {
  border-radius: 9px;
  padding: 8px 10px;
  font-size: 12.5px;
  word-break: break-word;
}

.dsh-thr-msg-user {
  max-width: 100%;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 12%, var(--dsw-alias-bg-layer-2, transparent));
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 28%, transparent);
}

.dsh-thr-user-content {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}

.dsh-thr-user-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.dsh-thr-tools-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}

.dsh-thr-tool-row {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  border-radius: 7px;
  padding: 4px 7px;
  background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.05));
  font-size: 11.5px;
}

.dsh-thr-tool-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  min-width: 0;
  list-style: none;
}

.dsh-thr-tool-summary::-webkit-details-marker {
  display: none;
}

.dsh-thr-tool-status {
  flex-shrink: 0;
  font-size: 10.5px;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25));
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
}

.dsh-thr-tool-status-running {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 45%, transparent);
  color: var(--dsw-alias-brand-primary, #3b82f6);
}

.dsh-thr-tool-status-done {
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 45%, transparent);
  color: var(--dsw-alias-state-success-primary, #16a34a);
}

.dsh-thr-tool-status-error {
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 45%, transparent);
  color: var(--dsw-alias-state-error-primary, #dc2626);
}

.dsh-thr-tool-arg {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
}

.dsh-thr-tool-body {
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.16));
  max-height: 140px;
  overflow-y: auto;
  font-size: 11px;
  line-height: 1.4;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  white-space: pre-wrap;
  word-break: break-word;
}

.dsh-thr-tools-toggle {
  appearance: none;
  font: inherit;
  font-size: 11px;
  line-height: 1.2;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  cursor: pointer;
  white-space: nowrap;
}

.dsh-thr-tools-toggle:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
}

.dsh-thr-tools-toggle:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dsh-thr-tools-toggle-on {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 50%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 12%, transparent);
  color: var(--dsw-alias-brand-primary, #3b82f6);
  font-weight: 500;
}

.dsh-thr-msg-assistant {
  background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.05));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));
}

.dsh-thr-msg-head,
.dsh-thr-msg-actions,
.dsh-thr-codeblock-head {
  user-select: none;
}

.dsh-thr-msg-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px;
}

.dsh-thr-msg-actions-user {
  justify-content: flex-end;
}

.dsh-thr-msg-action-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.9));
  font: inherit;
  font-size: 11px;
  line-height: 1.2;
  padding: 2px 6px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  opacity: 0.72;
  transition: opacity 0.12s, background-color 0.12s, color 0.12s;
}

.dsh-thr-msg-action-btn:hover,
.dsh-thr-msg-action-btn:focus-visible {
  opacity: 1;
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.12));
}

.dsh-thr-side-sel-popover {
  position: absolute;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: var(--dsw-alias-button-floating-fill, var(--dsw-specific-menu, #1e1e1e));
  border: 1px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.3));
  box-shadow: var(--dsw-elevation-panel, 0 8px 24px rgba(0, 0, 0, 0.25));
  pointer-events: auto;
}

.dsh-thr-side-sel-popover-above {
  transform: translate(-50%, -100%);
}

.dsh-thr-side-sel-popover-below {
  transform: translate(-50%, 0);
}

.dsh-thr-side-sel-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  padding: 4px 9px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}

.dsh-thr-side-sel-btn:hover,
.dsh-thr-side-sel-btn:focus-visible {
  background: var(--dsw-alias-button-floating-hover, var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.16)));
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

export function ensureThreadsStyles(): () => void {
  if (typeof document === 'undefined') {
    return () => {}
  }
  const existing = document.getElementById(STYLE_ELEMENT_ID)
  const isStyle =
    existing !== null &&
    (typeof HTMLStyleElement !== 'undefined'
      ? existing instanceof HTMLStyleElement
      : existing.tagName?.toUpperCase() === 'STYLE')
  const style = isStyle ? existing : document.createElement('style')
  if (!isStyle) {
    style.id = STYLE_ELEMENT_ID
    document.head.appendChild(style)
  }
  style.setAttribute('data-plugin', 'dsh-threads')
  style.textContent = CSS_TEXT
  return () => {
    if (style.parentNode) {
      style.remove()
    }
  }
}
