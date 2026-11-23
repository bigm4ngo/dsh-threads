import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { GitRepoInfo, WorktreeInfo } from '../shared/types.ts'

const execFileAsync = promisify(execFile)

const GIT_OVERRIDE_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_QUARANTINE_PATH',
] as const

export function buildGitEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv }
  for (const key of GIT_OVERRIDE_VARS) {
    delete env[key]
  }
  env.GIT_TERMINAL_PROMPT = '0'
  env.LC_ALL = 'C'
  return env
}

export interface GitRunResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function runGit(
  args: string[],
  cwd: string,
  options: { maxBuffer?: number } = {},
): Promise<GitRunResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      env: buildGitEnv(),
      encoding: 'utf8',
      maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
    })
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      code?: number | string
      stdout?: string
      stderr?: string
    }
    if (typeof err.code === 'number') {
      return {
        exitCode: err.code,
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? err.message,
      }
    }
    throw error
  }
}

async function ensureDirectory(dirPath: string): Promise<boolean> {
  try {
    const info = await stat(dirPath)
    return info.isDirectory()
  } catch {
    return false
  }
}

export async function inspectGitRepo(cwd: string): Promise<GitRepoInfo> {
  const target = cwd.trim()
  if (!target || !(await ensureDirectory(target))) {
    return {
      isGitRepo: false,
      dirty: false,
      untrackedCount: 0,
      reason: 'Directory does not exist',
    }
  }

  const top = await runGit(['rev-parse', '--show-toplevel'], target)
  if (top.exitCode !== 0) {
    return {
      isGitRepo: false,
      dirty: false,
      untrackedCount: 0,
      reason: top.stderr.trim() || 'Not a git repository',
    }
  }
  const repoRoot = top.stdout.trim()

  const statusRes = await runGit(['status', '--porcelain=v1', '-z'], repoRoot)
  let dirty = false
  let untrackedCount = 0
  if (statusRes.exitCode === 0 && statusRes.stdout.length > 0) {
    const entries = statusRes.stdout.split('\0').filter((entry) => entry.length > 0)
    for (const entry of entries) {
      if (entry.startsWith('?? ')) {
        untrackedCount += 1
        dirty = true
      } else if (/^[MADRCU?! ]{2} /.test(entry)) {
        dirty = true
      }
    }
  }

  const headRes = await runGit(['rev-parse', '--verify', 'HEAD'], repoRoot)
  if (headRes.exitCode !== 0) {
    return {
      isGitRepo: true,
      repoRoot,
      dirty,
      untrackedCount,
      reason: 'Repository has no commits yet',
    }
  }
  const headCommit = headRes.stdout.trim()

  const branchRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)
  const rawBranch = branchRes.exitCode === 0 ? branchRes.stdout.trim() : ''
  const branch = rawBranch && rawBranch !== 'HEAD' ? rawBranch : undefined

  return {
    isGitRepo: true,
    repoRoot,
    headCommit,
    headShort: headCommit.slice(0, 7),
    branch,
    dirty,
    untrackedCount,
  }
}

export function slugifyBranchSegment(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '')
  return cleaned || 'thread'
}

export async function createIsolatedWorktree(options: {
  repoRoot: string
  baseCommit: string
  kind: 'fork' | 'edit-retry' | 'handoff' | 'promoted-side'
  label: string
  worktreeBaseDir?: string
}): Promise<WorktreeInfo> {
  const worktreeBaseDir = options.worktreeBaseDir
    ? path.resolve(options.worktreeBaseDir)
    : path.join(options.repoRoot, '.agents', 'worktrees')

  await mkdir(worktreeBaseDir, { recursive: true })
  const ignoreFile = path.join(worktreeBaseDir, '.gitignore')
  try {
    const existing = await readFile(ignoreFile, 'utf8')
    if (existing !== '*\n') {
      await writeFile(ignoreFile, '*\n', 'utf8')
    }
  } catch {
    await writeFile(ignoreFile, '*\n', 'utf8')
  }

  const shortId = randomUUID().slice(0, 8)
  const slug = slugifyBranchSegment(options.label)
  const dirName = `dsh-threads-${options.kind}-${slug}-${shortId}`
  const worktreePath = path.join(worktreeBaseDir, dirName)
  const branch = `dsh-threads/${options.kind}/${slug}-${shortId}`

  const res = await runGit(
    ['-c', 'advice.detachedHead=false', 'worktree', 'add', '-b', branch, worktreePath, options.baseCommit],
    options.repoRoot,
  )
  if (res.exitCode !== 0) {
    throw new Error(res.stderr.trim() || `git worktree add failed (${res.exitCode})`)
  }

  return {
    path: worktreePath,
    branch,
    baseCommit: options.baseCommit,
    repoRoot: options.repoRoot,
  }
}
