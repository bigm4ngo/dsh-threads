import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createIsolatedWorktree, inspectGitRepo, runGit } from './git.ts'

test('inspectGitRepo detects clean/dirty state and createIsolatedWorktree isolates from HEAD', async () => {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-git-'))
  try {
    await runGit(['init'], repoDir)
    await runGit(['config', 'user.email', 'test@example.com'], repoDir)
    await runGit(['config', 'user.name', 'Test User'], repoDir)
    await writeFile(path.join(repoDir, 'README.md'), 'hello\n', 'utf8')
    await runGit(['add', 'README.md'], repoDir)
    await runGit(['commit', '-m', 'init'], repoDir)

    const cleanInfo = await inspectGitRepo(repoDir)
    assert.equal(cleanInfo.isGitRepo, true)
    assert.equal(cleanInfo.dirty, false)
    assert.ok(cleanInfo.headCommit)

    await writeFile(path.join(repoDir, 'dirty.txt'), 'untracked\n', 'utf8')
    const dirtyInfo = await inspectGitRepo(repoDir)
    assert.equal(dirtyInfo.dirty, true)
    assert.equal(dirtyInfo.untrackedCount, 1)

    const wt = await createIsolatedWorktree({
      repoRoot: cleanInfo.repoRoot!,
      baseCommit: cleanInfo.headCommit!,
      kind: 'handoff',
      label: 'Claude Opus',
    })

    assert.match(wt.branch, /^dsh-threads\/handoff\/claude-opus-/)
    assert.equal((await stat(wt.path)).isDirectory(), true)
    assert.equal(await readFile(path.join(wt.path, 'README.md'), 'utf8'), 'hello\n')
    assert.equal(
      await readFile(path.join(cleanInfo.repoRoot!, '.agents', 'worktrees', '.gitignore'), 'utf8'),
      '*\n',
    )
  } finally {
    await rm(repoDir, { recursive: true, force: true })
  }
})
