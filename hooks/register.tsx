import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { MarkdownPaneFile } from '../types'
import { narrow } from './tables'

const TOOL = 'mcp__markdown-pane__show'
const PANE = 'markdown'
/** One drawing draws 100,000 characters in all; a longer file is cut here and says so. */
const ROOM = 90_000
/** The button's frame, and how it lights up under the pointer. */
const ACCENT = '#4e9af1'
const LIT = '#9cc8ff'
const WASH = '#1f3a5f'
const shown = atom({ plugin: 'markdown-pane', key: 'shown' } as const, null)

const DESCRIPTION = [
  'Shows a Markdown file rendered in the side pane, for the person to read.',
  'Use it when they ask to see, show, open or preview a .md file,',
  'and after writing a report, plan or document they asked for, so they can read it without leaving the conversation.',
  'The pane follows later edits to the file by itself.',
].join(' ')

const isMarkdown = (path: unknown): path is string => typeof path === 'string' && /\.(md|markdown|mdx)$/i.test(path)

/** Files Claude keeps for itself (memory, settings, skills) are not reports: they never open by themselves. */
const isPrivate = (path: string) => /(^|\/)\.claude\//.test(path)

const nameOf = (path: string) => path.split('/').pop() || path

/** Reads the file into the pane's state; a file that cannot be read is shown as that, not thrown. */
const load = async ($: EngineInterface, asked: string) => {
  // The resolved path, so a file opened as `docs/report.md` is known again when a later write names it in full.
  let path = asked
  try {
    path = (await $.fs.stat(asked, { resolve: true })).realPath ?? asked
  } catch {}
  let file: MarkdownPaneFile
  try {
    file = { path, text: await $.fs.read(path) }
  } catch (error) {
    file = { path, text: '', error: error instanceof Error ? error.message : String(error) }
  }
  await update($, shown, () => file)

  return file
}

const open = async ($: EngineInterface, path: string) => {
  const file = await load($, path)
  const opened = await $.ui.open({ id: PANE, title: nameOf(path) })

  return { file, isPlaced: opened.isPlaced }
}

/** The button that opens a file, drawn to be seen: a framed, accented label that lights up under the pointer. */
const openButton = (els: Pick<Elements['terminal'], 'Box' | 'Button'>, id: string, path: string, onPress: () => void) => {
  const { Box, Button } = els

  return (
    <Box
      key={`frame-${id}`}
      alignSelf="flex-start"
      marginLeft={2}
      paddingX={1}
      borderStyle="round"
      borderColor={ACCENT}
      hover={{ borderColor: LIT, backgroundColor: WASH }}
    >
      <Button
        key={`open-${id}`}
        plain
        variant="primary"
        label={`\u25b6 Open ${nameOf(path)} in the side pane`}
        hover={{ bold: true, underline: true }}
        onPress={onPress}
      />
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'show',
      description: DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'The Markdown file, absolute or relative to the working directory.' } },
        required: ['path'],
      },
    })

    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const { path } = e as unknown as { path?: unknown }
    if (typeof path !== 'string' || path === '') return { deny: 'path must name a file.' }
    const { file, isPlaced } = await open($, path)
    if (file.error !== undefined) return { deny: `${path} could not be read: ${file.error}` }

    return {
      result: isPlaced
        ? `${nameOf(file.path)} is open in the side pane. (${file.path})`
        : `${nameOf(file.path)} is ready, but the terminal is too narrow for the pane to open by itself; the person can press the Open button under this row. (${file.path})`,
    }
  })

  // A written Markdown file: the pane follows it when it is the one shown, and a new one opens by itself.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError || !isMarkdown(e.file_path)) return ran
    // The file is written: nothing the pane does may fail the call.
    try {
      const now = await read($, shown)
      if (now?.path === e.file_path) await load($, e.file_path)
      else if (!isPrivate(e.file_path)) await open($, e.file_path)
    } catch {}

    return ran
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    try {
      if ((await read($, shown))?.path === e.file_path) await load($, e.file_path)
    } catch {}

    return ran
  })

  // The show tool's own row says where the file is, and keeps a button that opens it again.
  on('ui.render', { component: 'ToolResult', props: { tool: TOOL } }, async ($, e, next) => {
    const path = typeof e.props.output === 'string' ? /\(([^()]+)\)$/.exec(e.props.output)?.[1] : undefined
    if (path === undefined || e.props.isErrored || e.surface !== 'terminal') return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text dimColor>{`  ${nameOf(path)} is in the side pane.`}</Text>
        {openButton({ Box, Button }, e.requestId, path, () => void open($, path))}
      </Box>
    )
  })

  // Under the result of a call that wrote or edited a Markdown file: a button that opens it, drawn to be seen.
  for (const tool of ['Write', 'Edit'] as const) {
    on('ui.render', { component: 'ToolResult', props: { tool } }, async ($, e, next) => {
      const result = await next(e)
      const path = (e.props.output as { filePath?: unknown } | null | undefined)?.filePath
      if (!isMarkdown(path) || e.props.isErrored) return result
      const { Box, Button } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          {result}
          {openButton({ Box, Button }, e.requestId, path, () => void open($, path))}
        </Box>
      )
    })
  }

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Markdown, Button } = $.ui.resolve(e)
    const file = await read($, shown)
    if (file === null) return <Text dimColor>No file open. Ask to see a Markdown file.</Text>
    const isCut = file.text.length > ROOM

    return (
      <Box flexDirection="column">
        <Text dimColor>{file.path}</Text>
        {file.error !== undefined && <Text>{`This file could not be read: ${file.error}`}</Text>}
        {file.error === undefined && <Markdown text={narrow(isCut ? file.text.slice(0, ROOM) : file.text, e.props.bodyColumns - 1)} />}
        {isCut && <Text dimColor>{`The pane shows the first ${ROOM.toLocaleString('en-US')} characters of this file.`}</Text>}
        <Button key="reload" label="Reload" hotkey="r" onPress={() => void load($, file.path)} />
      </Box>
    )
  })
}
