import { createElement } from 'react'
import { subscribeThreadsEvents } from './api.ts'
import { DraftRelay } from './draft-bridge.ts'
import type { DshClientContext, SidebarRightTabProps } from './dsh-types.ts'
import { LineageHeaderPill, ThreadsHeaderButton } from './HeaderControls.tsx'
import { SelectionPopover, type SelectionPopoverProps } from './SelectionPopover.tsx'
import { ensureThreadsStyles } from './styles.ts'
import { ThreadsIcon } from './ThreadsIcon.tsx'
import { ThreadsTabBody, ThreadsTabTitle } from './ThreadsTab.tsx'
import { TurnTailControls } from './TurnTailControls.tsx'
import { publishThreadsIntent, THREADS_TAB_KIND } from './ui-bus.ts'

export const name = 'dsh-threads'

export const inject = [
  'slots',
  'sessions',
  'workspaces',
  'uiWorkspace',
  'uiSession',
  'uiConversation',
  'sidebarRight',
  'sidebarRightTabs',
]

export function apply(ctx: DshClientContext): void {
  ctx.effect(() => ensureThreadsStyles(), 'dsh-threads: styles')

  if (ctx.sidebarRightTabs) {
    ctx.effect(
      () =>
        ctx.sidebarRightTabs!.register({
          id: THREADS_TAB_KIND,
          kind: THREADS_TAB_KIND,
          priority: 'extension',
          title: () => 'Threads',
          guide: [
            {
              id: 'threads',
              order: 25,
              title: () => 'Threads',
              description: () => 'Side chats, fork tree, edit & retry, and provider handoff',
              icon: ThreadsIcon,
            },
          ],
        }),
      'dsh-threads: sidebar tab',
    )
  }

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: THREADS_TAB_KIND,
          },
          (props: Omit<SidebarRightTabProps, 'ctx'>) =>
            createElement(ThreadsTabBody, { ...props, ctx }),
        ),
      ),
    'dsh-threads: slot sidebar.right.pane.tab',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab.title',
            key: THREADS_TAB_KIND,
          },
          (props: Omit<SidebarRightTabProps, 'ctx'>) =>
            createElement(ThreadsTabTitle, { ...props, ctx }),
        ),
      ),
    'dsh-threads: slot sidebar.right.pane.tab.title',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('conversation.input.dock', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'dsh-threads-draft-relay',
            order: 90,
          },
          DraftRelay,
        ),
      ),
    'dsh-threads: slot conversation.input.dock',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('conversation.session.header.actions', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.actions',
            id: 'dsh-threads-lineage',
            order: 20,
          },
          (props: { sessionId?: string }) =>
            createElement(LineageHeaderPill, { sessionId: props.sessionId, ctx }),
        ),
      ),
    'dsh-threads: slot conversation.session.header.actions',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('conversation.session.header.utilities', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.utilities',
            id: 'dsh-threads-trigger',
            order: 30,
          },
          (props: { sessionId?: string }) =>
            createElement(ThreadsHeaderButton, { sessionId: props.sessionId, ctx }),
        ),
      ),
    'dsh-threads: slot conversation.session.header.utilities',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('conversation.chat.turnTail', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.turnTail',
            id: 'dsh-threads-turn-actions',
            order: 40,
          },
          (props: { sessionId?: string; turn?: number | { turn?: number }; seq?: number }) =>
            createElement(TurnTailControls, { ...props, ctx }),
        ),
      ),
    'dsh-threads: slot conversation.chat.turnTail',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('conversation.chat.text-interaction', () => {
        try {
          return ctx.slots.register(
            {
              name: 'conversation.chat.text-interaction',
              key: 'quote',
              priority: -2,
              locale: 'messageQuotes',
            },
            (props: Omit<SelectionPopoverProps, 'ctx'>) =>
              createElement(SelectionPopover, { ...props, ctx }),
          )
        } catch (err) {
          console.warn('[dsh-threads] selection popover not registered:', err)
          return () => {}
        }
      }),
    'dsh-threads: slot conversation.chat.text-interaction',
  )

  ctx.effect(
    () =>
      subscribeThreadsEvents((ev) => {
        if (ev.type === 'open-ui') {
          publishThreadsIntent(
            {
              sessionId: ev.sessionId,
              tab: ev.tab,
              ...(ev.sideChatId ? { sideChatId: ev.sideChatId } : {}),
              ...(ev.quote ? { quote: ev.quote } : {}),
              ...(ev.anchorTurn !== undefined ? { anchorTurn: ev.anchorTurn } : {}),
              ...(ev.anchorSeq !== undefined ? { anchorSeq: ev.anchorSeq } : {}),
              ...(ev.note ? { note: ev.note } : {}),
            },
            ctx,
          )
        }
      }),
    'dsh-threads: events',
  )
}
