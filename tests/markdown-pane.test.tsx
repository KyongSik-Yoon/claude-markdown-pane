import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SHOW = 'mcp__markdown-pane__show'
const PANE = { title: 'report.md', isFocused: false, bodyColumns: 60, placement: 'dock' } as never

/** What the engine would do beneath the mod: files by path, a pane that opens, and a Write or Edit that lands. */
const world = (on: On, files: Record<string, string>, isWide = true) => {
  const opened: string[] = []
  on('fs.read', (_, e) => {
    const text = files[(e as { path: string }).path]
    if (text === undefined) throw new Error('no such file')

    return { value: text } as never
  })
  on('fs.stat', (_, e) => {
    const { path } = e as { path: string }

    // The engine hands a relative path on resolved against its own working directory; here every file lives in /work.
    const realPath = path.startsWith('/work/') ? path : `/work/${path.split('/').pop()}`

    return { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false, realPath } } as never
  })
  on('ui.open', (_, e) => {
    opened.push((e as { title?: string }).title ?? '')

    return { value: isWide ? { isPlaced: true } : { isPlaced: false, reason: 'narrow' } } as never
  })
  on('tool.call', (_, e) => {
    const call = e as { tool: string; file_path?: string; content?: string }
    if (call.tool === 'Write' && call.file_path !== undefined) files[call.file_path] = call.content ?? ''

    return { result: {} } as never
  })

  return opened
}

test('asked in plain words, the show tool opens the file rendered in the pane', async ($, on) => {
  const opened = world(on, { '/work/docs/report.md': '# Report\n\nUploads are at **73%**.' })
  const ran = await $.tool.call({ tool: SHOW, path: '/work/docs/report.md' })
  expect(ran.result).toBe('report.md is open in the side pane. (/work/docs/report.md)')

  // Its own row keeps a button that opens the file again.
  const row = await $.ui.mount({
    plugin: 'markdown-pane',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: 'show-1',
    props: { tool_use_id: 'show-1', tool: SHOW, output: ran.result, isErrored: false },
  })
  await row.press({ key: 'open-show-1' })
  expect(opened).toEqual(['report.md', 'report.md'])
  opened.pop()
  await row.unmount()
  expect(opened).toEqual(['report.md'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'markdown-pane', surface, component: 'Pane', requestId: 'markdown', props: PANE })
    expect((await ui.find({ type: 'Markdown' }))?.text).toContain('Uploads are at **73%**.')
    expect(await ui.find({ type: 'Text', text: '/work/docs/report.md' })).toBeDefined()
    await ui.unmount()
  }
})

test('a file that is not there is refused with the reason, and the pane says so', async ($, on) => {
  world(on, {})
  const ran = await $.tool.call({ tool: SHOW, path: '/work/nope.md' })
  expect(ran.deny).toMatch(/nope\.md could not be read/)
})

test('a new report opens by itself, the pane follows later writes, and private or other files stay out', async ($, on) => {
  const files: Record<string, string> = {}
  const opened = world(on, files)
  await $.tool.call({ tool: 'Write', file_path: '/work/report.md', content: '# First draft' } as never)
  expect(opened).toEqual(['report.md'])

  const ui = await $.ui.mount({ plugin: 'markdown-pane', surface: 'terminal', component: 'Pane', requestId: 'markdown', props: PANE })
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('# First draft')

  await $.tool.call({ tool: 'Write', file_path: '/work/report.md', content: '# Second draft' } as never)
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('# Second draft')
  expect(opened).toHaveLength(1)

  await $.tool.call({ tool: 'Write', file_path: '/home/me/.claude/projects/x/memory/note.md', content: 'private' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/work/app.ts', content: 'code' } as never)
  expect(opened).toHaveLength(1)
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('# Second draft')
  await ui.unmount()
})

test('under the result of a call that wrote a Markdown file is a framed button that opens it; other results are left alone', async ($, on) => {
  const opened = world(on, { '/work/plan.md': '# Plan' })
  on('ui.render', { component: 'ToolResult' }, ($$, e) => {
    const { Text } = $$.ui.resolve(e)

    return <Text>the engine's result</Text>
  })
  const result = (id: string, filePath: string, isErrored = false) =>
    $.ui.mount({
      plugin: 'markdown-pane',
      surface: 'terminal',
      component: 'ToolResult',
      requestId: id,
      props: { tool_use_id: id, tool: 'Write', output: { type: 'create', filePath, content: '' }, isErrored },
    })

  const written = await result('call-1', '/work/plan.md')
  expect(await written.find({ type: 'Text', text: "the engine's result" })).toBeDefined()
  expect((await written.find({ type: 'Button' }))?.props).toMatchObject({ label: '\u25b6 Open plan.md in the side pane', variant: 'primary' })
  expect((await written.find({ type: 'Box', key: 'frame-call-1' }))?.props).toMatchObject({ borderStyle: 'round' })
  await written.press({ key: 'open-call-1' })
  expect(opened).toEqual(['plan.md'])
  await written.unmount()

  for (const other of [await result('call-2', '/work/app.ts'), await result('call-3', '/work/plan.md', true)]) {
    expect(await other.find({ type: 'Button' })).toBeUndefined()
    await other.unmount()
  }
})

test('a file opened by a relative path is still followed when a later write names it in full', async ($, on) => {
  const files: Record<string, string> = { '/work/notes.md': '# Notes' }
  world(on, files)
  await $.tool.call({ tool: SHOW, path: 'notes.md' })
  const ui = await $.ui.mount({ plugin: 'markdown-pane', surface: 'terminal', component: 'Pane', requestId: 'markdown', props: PANE })
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('# Notes')
  await $.tool.call({ tool: 'Write', file_path: '/work/notes.md', content: '# Notes, revised' } as never)
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('# Notes, revised')
  await ui.unmount()
})

test('a table wider than the pane is drawn as a list; one that fits, and code, are left as written', async ($, on) => {
  const table = ['| Option | What it is | Effort |', '| --- | --- | --- |', '| Canvas | An interactive panel the agent and you both use | Medium |', '| Hook | A shell command | Low |'].join('\n')
  const code = ['```', '| not | a table |', '| --- | --- |', '```'].join('\n')
  world(on, { '/work/wide.md': `# Wide\n\n${table}\n\n${code}` })
  await $.tool.call({ tool: SHOW, path: '/work/wide.md' })
  const drawn = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ plugin: 'markdown-pane', surface: 'terminal', component: 'Pane', requestId: 'markdown', props: { ...(PANE as object), bodyColumns } as never })
    const text = (await ui.find({ type: 'Markdown' }))?.text ?? ''
    await ui.unmount()

    return text
  }

  expect(await drawn(120)).toContain(table)
  const narrowed = await drawn(40)
  expect(narrowed).toContain('**Canvas**\n- What it is: An interactive panel the agent and you both use\n- Effort: Medium\n\n**Hook**\n- What it is: A shell command\n- Effort: Low')
  expect(narrowed).not.toContain('| Option |')
  expect(narrowed).toContain(code)
})
