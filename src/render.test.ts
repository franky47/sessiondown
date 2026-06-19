import { describe, expect, test } from 'bun:test'

import { render } from '#render'

const claudeFixture = JSON.stringify({
  type: 'user',
  sessionId: 'ses_1',
  cwd: '/a',
  timestamp: '2026-05-11T10:00:00Z',
  message: { role: 'user', content: 'hello' },
})

describe('render', () => {
  test('dispatches to the named agent renderer (frontmatter + body)', () => {
    const out = render(claudeFixture, 'claude-code')
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toContain('\n---\n\n')
    expect(out).toContain('hello')
    expect(out).toContain('<turn n="1" role="user" t="0"/>')
  })
})
