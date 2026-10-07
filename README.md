# markdown-pane

A Claude Code mod that opens Markdown files, rendered, in a side pane. There
is no command to remember.

- **Click:** when Claude writes or edits a `.md` file, a framed button appears
  under that row: `▶ Open report.md in the side pane`.
- **Ask:** say "show me the report" or "open the README in the side pane".
- **Automatic:** a newly written `.md` file opens by itself when the terminal
  is wide enough for a sidebar.
- **Live:** while a file is open, later writes and edits by Claude refresh the
  pane. A Reload button covers changes made elsewhere.
- **Responsive tables:** a table that fits the pane stays a table; a wider one
  is drawn as a short list per row, so it never wraps into noise.

Files under a `.claude/` folder (memory, settings, skills) never open by
themselves. Files longer than 90,000 characters are cut, with a note.

## Install

At the Claude Code prompt in a terminal:

```
/plugin install markdown-pane --marketplace JorgeRomero123/claude-markdown-pane
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in
every session).

## Notes

- The button needs a layout where the terminal reports mouse clicks (the
  fullscreen layout). Elsewhere, ask Claude to show the file.
- The pane docks beside the conversation in the fullscreen layout from 110
  columns; otherwise it sits above the prompt.
- Markdown is rendered as text: images in the file are not shown.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

The mod API is early access and may change between Claude Code releases.

## License

MIT
