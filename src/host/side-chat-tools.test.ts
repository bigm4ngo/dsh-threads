import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveSideChatToolchain,
  summarizeToolCall,
  type SkillRegistryLike,
  type ToolDefinitionLike,
  type ToolsServiceLike,
  type WebServiceLike,
} from './side-chat-tools.ts'

function fakeTool(name: string, run: (args: unknown) => Promise<unknown>): ToolDefinitionLike {
  return {
    name,
    description: `${name} description`,
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    execute: (args) => run(args),
    output: {
      render: (_args, val) => [{ type: 'text', text: String(val) }],
    },
  }
}

test('resolveSideChatToolchain strips mutating tools and allows only read-only tools', async () => {
  let disposed = false
  const readTool = fakeTool('read', async () => 'file contents here')
  const bashTool = fakeTool('bash', async () => 'should never run')
  const writeTool = fakeTool('write', async () => 'should never run')
  const editTool = fakeTool('edit', async () => 'should never run')
  const webSearchTool = fakeTool('web_search', async () => 'search output')

  const tools: ToolsServiceLike = {
    async resolve() {
      return {
        view: () =>
          new Map<string, ToolDefinitionLike>([
            ['read', readTool],
            ['bash', bashTool],
            ['write', writeTool],
            ['edit', editTool],
            ['web_search', webSearchTool],
          ]),
        dispose: () => {
          disposed = true
        },
      }
    },
  }

  const chain = await resolveSideChatToolchain({
    tools,
    agent: { id: 'a1' },
    cwd: '/tmp/proj',
    model: { provider: 'openrouter', model: 'm1' },
    signal: AbortSignal.timeout(5000),
  })

  try {
    assert.deepEqual(chain.toolNames, ['web_search', 'read'])
    assert.deepEqual(
      chain.schemas.map((s) => s.name),
      ['web_search', 'read'],
    )

    const okRes = await chain.execute(
      { id: 'c1', name: 'read', arguments: '{"path":"foo.ts"}' },
      AbortSignal.timeout(5000),
    )
    assert.equal(okRes.isError, false)
    assert.equal(okRes.text, 'file contents here')

    const denied = await chain.execute(
      { id: 'c2', name: 'bash', arguments: '{"command":"rm -rf /"}' },
      AbortSignal.timeout(5000),
    )
    assert.equal(denied.isError, true)
    assert.match(denied.text, /not permitted in read-only side chats/i)

    const badJson = await chain.execute(
      { id: 'c3', name: 'read', arguments: '{not-json' },
      AbortSignal.timeout(5000),
    )
    assert.equal(badJson.isError, true)
    assert.match(badJson.text, /Invalid JSON arguments/i)
  } finally {
    chain.dispose()
  }

  assert.equal(disposed, true)
})

test('resolveSideChatToolchain provides fallback web & skill tools and filters modelInvocable skills', async () => {
  const web: WebServiceLike = {
    searchReady: async () => true,
    fetchReady: async () => true,
    search: async ({ query }) => ({
      content: `Summary for ${query}`,
      sources: [{ url: 'https://example.com/docs', title: 'Docs', snippet: 'Helpful snippet' }],
    }),
    fetch: async ({ url }) => ({
      url,
      statusCode: 200,
      body: { kind: 'html', content: '<h1>Title</h1><script>evil()</script><p>Body text</p>' },
    }),
  }

  const skills: SkillRegistryLike = {
    list: async () => [
      {
        name: 'research-notes',
        description: 'Summarize findings cleanly',
        invocation: { modelInvocable: true, userInvocable: true },
      },
      {
        name: 'hidden-admin',
        description: 'Internal user-only command',
        invocation: { modelInvocable: false, userInvocable: true },
      },
    ],
    get: async (name) =>
      name === 'research-notes'
        ? {
            name: 'research-notes',
            description: 'Summarize findings cleanly',
            invocation: { modelInvocable: true, userInvocable: true },
            content: 'Step 1: Cite links.',
          }
        : undefined,
  }

  const chain = await resolveSideChatToolchain({
    web,
    skills,
    cwd: '/tmp/proj',
    model: { provider: 'openrouter', model: 'm1' },
    signal: AbortSignal.timeout(5000),
  })

  assert.deepEqual(chain.toolNames, ['web_search', 'web_fetch', 'skill'])
  const skillSchema = chain.schemas.find((s) => s.name === 'skill')
  assert.ok(skillSchema?.description.includes('`research-notes`'))
  assert.equal(skillSchema?.description.includes('hidden-admin'), false)

  const searchOut = await chain.execute(
    { id: 'c1', name: 'web_search', arguments: JSON.stringify({ queries: ['dsh plugins'] }) },
    AbortSignal.timeout(5000),
  )
  assert.equal(searchOut.isError, false)
  assert.match(searchOut.text, /Summary for dsh plugins/)
  assert.match(searchOut.text, /https:\/\/example\.com\/docs/)

  const fetchOut = await chain.execute(
    { id: 'c2', name: 'web_fetch', arguments: JSON.stringify({ url: 'https://example.com/docs' }) },
    AbortSignal.timeout(5000),
  )
  assert.equal(fetchOut.isError, false)
  assert.match(fetchOut.text, /Body text/)
  assert.equal(fetchOut.text.includes('evil()'), false)

  const skillOut = await chain.execute(
    { id: 'c3', name: 'skill', arguments: JSON.stringify({ name: 'research-notes' }) },
    AbortSignal.timeout(5000),
  )
  assert.equal(skillOut.isError, false)
  assert.match(skillOut.text, /<skill_content name="research-notes">/)
  assert.match(skillOut.text, /Step 1: Cite links\./)

  const blockedSkill = await chain.execute(
    { id: 'c4', name: 'skill', arguments: JSON.stringify({ name: 'hidden-admin' }) },
    AbortSignal.timeout(5000),
  )
  assert.equal(blockedSkill.isError, true)
})

test('resolveSideChatToolchain respects searchReady === false and summarizeToolCall formats args', async () => {
  const web: WebServiceLike = {
    searchReady: async () => false,
    fetchReady: async () => true,
    search: async () => ({ sources: [] }),
    fetch: async ({ url }) => ({ url, statusCode: 200, body: { kind: 'text', content: 'ok' } }),
  }

  const chain = await resolveSideChatToolchain({
    web,
    model: { provider: 'openrouter', model: 'm1' },
    signal: AbortSignal.timeout(5000),
  })
  assert.deepEqual(chain.toolNames, ['web_fetch'])

  assert.equal(summarizeToolCall('web_search', '{"queries":["a","b"]}'), 'a, b')
  assert.equal(summarizeToolCall('web_fetch', '{"url":"https://a.test"}'), 'https://a.test')
  assert.equal(summarizeToolCall('read', '{"path":"src/x.ts","offset":10}'), 'src/x.ts:L10')
  assert.equal(summarizeToolCall('grep', '{"pattern":"foo","path":"src"}'), 'foo in src')
  assert.equal(summarizeToolCall('skill', '{"name":"my-skill"}'), 'my-skill')
})
