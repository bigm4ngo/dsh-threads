# dsh-threads

Provider-neutral side chats, fork trees, prompt edit & retry, and cross-provider handoff for **DeepSeek Harness (DSH) Web**.

Works across any LLM provider configured in your DSH profile without tying workflows to a single model or backend.

## Features

- **Side Chats**: Multi-turn, read-only streaming Q&A (with live thinking/reasoning output when supported by the model) anchored to the current session, a specific turn, or a highlighted passage. Side chats stay out of the main transcript and left sidebar, support switching models or reasoning effort mid-thread, and can merge findings back into the parent session or be promoted into a full session.
- **Fork Tree & Merge-Back**: Visualize and navigate branches, edit-retries, promoted side chats, and handoffs in the right-sidebar **Threads** tab and the session header lineage pill. Merge edited or AI-distilled findings back into any parent session.
- **Edit & Retry Earlier Prompts**: Non-destructively branch from before any earlier turn to revise a prompt or switch models without touching files on disk.
- **Portable Provider Handoff**: Move an ongoing task to a fresh session or a different model/provider with an editable handoff packet, an explicit **Transfer Manifest** (*Moves* vs *Stays behind*), optional **AI Distill**, and workspace safety guards.
- **Inline Controls & Slash Commands**: Quick actions under every turn (`Side chat`, `Edit & Retry`, `Branch`), a chat text-selection popover (`Quote`, `Side chat`, plus `Claude /btw` on Claude Code sessions when Oh My Claude is installed), and `/side` and `/handoff` slash commands.

## Requirements

- **DeepSeek Harness**: `>=0.2.2-alpha.2 <0.3.0` (`web` profile)
- **Node.js**: `>=22.0.0`
- **Git** *(optional)*: required only when using isolated Git worktree mode

## Install

```bash
# From GitHub
dsh plugin --profile web add github:bigm4ngo/dsh-threads

# Or from a local checkout
dsh plugin --profile web add "link:/path/to/dsh-threads"
```

Restart `dsh web` (or reload the host daemon) and refresh the browser tab. Pre-built host and client bundles ship in `lib/`, so no local build step is needed.

## Usage Guide

Open the **Threads** panel from any session in any of four ways:

- Click **Threads** in the session header (or click the lineage pill when a session has branches or side chats).
- Click **Side chat**, **Edit & Retry**, or **Branch** underneath any turn.
- Highlight text inside a message and click **Side chat** in the selection popover.
- Run `/side` or `/handoff` in the composer.

The right-sidebar **Threads** tab is organized into four sub-tabs:

### 1. Side Chats

Ask follow-up questions about the current conversation without polluting the main session history or cluttering the left sidebar.

1. Open **Threads → Side Chats** (or highlight a passage in chat and click **Side chat**, or run `/side <question>`).
2. Pick any available model and reasoning effort from the inline model selector (defaults to the current session's model).
3. Ask follow-up questions in the side-chat composer. Text and reasoning stream live; click **Stop** at any time to cancel a response in progress while keeping partial output.
4. When you have an answer worth bringing back:
   - **Add findings to parent**: Review or edit the findings (optionally click **AI Distill** to condense the thread), then choose **Insert into draft** (appends below any unfinished text in the parent typing box without overwriting it) or **Send now**.
   - **Promote to session**: Graduate the side chat into a full DSH session in either the **Same workspace** or a **New isolated Git worktree**, via **Open in typing box** or **Promote & Send now**.

### 2. Fork Tree & Merge-Back

Keep track of related sessions and combine work from branches back into the main thread.

1. Open **Threads → Fork Tree** (or click the header lineage pill).
2. **Branch a session**: Pick a turn (or *Latest completed turn*), choose a model and workspace mode, optionally enter an opening prompt, and click **Branch (Draft)** or **Branch & Send**.
3. **Navigate the tree**: Click any session title or **Open** to switch between parent and child threads. Running status, branch type, model, side-chat count, and Git worktree branch are shown inline.
4. **Link existing sessions**: Use the **Link** selector at the bottom of the tab to attach another session as a child of the current thread.
5. **Merge back**: Click **Merge back** on any child branch to edit or **AI Distill** a summary and either **Insert into draft** or **Send now** to its parent session.

### 3. Edit & Retry Earlier Prompts

Revise an earlier prompt and replay from that point without losing the original conversation.

1. Open **Threads → Turns** (or click **Edit & Retry** under a turn).
2. Click **Edit & Retry** on the turn you want to change.
3. Revise the prompt text, optionally switch the target model/effort or workspace mode, and choose:
   - **Open in typing box**: Creates the branch and places your edited prompt in the composer (recommended if you want to review or re-attach files).
   - **Fork & Send now**: Creates the branch and submits immediately.

> **Note:** Fork-and-edit only branches conversation history — it never modifies or reverts files on disk. Retrying Turn 1 starts a fresh session in the workspace; retrying Turn N forks at the prior completed turn boundary.

### 4. Portable Provider Handoff

Continue a task in a fresh session or switch to a different provider/model with clean, inspectable context.

1. Open **Threads → Handoff** (or run `/handoff [instruction]`).
2. Select the **Target model & provider**.
3. Choose a **Workspace mode** (see below).
4. Pick which turns to include (*All turns*, *Last 5 turns*, or *Custom turns*) and optionally add a next instruction for the receiving model.
5. Inspect the **Transfer Manifest** (*Moves* vs *Stays behind* plus any warnings) and edit the packet text directly, or click **AI Distill** to compress it into a structured brief.
6. Click **Open in typing box** to review before sending, or **Handoff & Send now** to start immediately.

### Workspace Modes

Whenever you branch, retry, promote a side chat, or hand off a session, you can choose how the workspace directory is handled:

| Mode | Best for | Behavior & Safety |
| --- | --- | --- |
| **Same workspace** | Sequential baton pass (one session stops, the next picks up) | Shares the current directory, including uncommitted edits. If the source session is still running, `dsh-threads` blocks concurrent overlap and prompts you to stop the source session first or switch to an isolated worktree. |
| **New isolated Git worktree** | Parallel work or safe experiments | Creates `<repoRoot>/.agents/worktrees/dsh-threads-<kind>-<slug>-<id>` on a dedicated branch from committed `HEAD`. Your original checkout (and any uncommitted changes in it) stays untouched. |

### Slash Commands

| Command | Description |
| --- | --- |
| `/side [question]` | Opens **Threads → Side Chats**; when a question is provided, immediately creates and streams a new side chat. |
| `/handoff [instruction]` | Opens **Threads → Handoff**, pre-filling the optional instruction for the receiving model. |

## State & Configuration

- **Persistence**: Side chats and session lineage edges are stored atomically in `~/.local/state/dsh-threads/state.json`.
- **Environment overrides**: Respects `XDG_STATE_HOME` and `DSH_THREADS_STATE_DIR` (takes precedence when set).
- **Local HTTP API**: Mounted under `/dsh-threads/api/*` with Server-Sent Events on `/dsh-threads/api/events`, protected by DSH's built-in request authentication and same-origin checks.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

## License

[MIT](LICENSE)
