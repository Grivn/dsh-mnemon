import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/issue-template-enforcer.yml', import.meta.url), 'utf8')
const script = workflow.match(/^          script: \|\n((?: {12}.*\n|\n)*)/m)?.[1]
if (!script) throw new Error('Issue template workflow must contain an inline script')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const runWorkflow = new AsyncFunction('context', 'github', script.replace(/^ {12}/gm, ''))

const baseSections = [
  ['提交前查重 / Duplicate check', '- [x] I searched open and closed issues.'],
  ['涉及区域 / Affected area', '运行时记忆 / Runtime Memory'],
  ['Issue 类型 / Issue type', 'Bug 报告 / Bug report'],
  ['摘要 / Summary', 'Archiving fails after runtime memory reaches its capacity.'],
  ['预期结果 / Expected outcome', 'Archive the entries and complete the write.'],
  ['详情或复现步骤 / Details or reproduction steps', 'Fill runtime memory and add another entry.'],
  ['环境信息 / Environment', 'macOS, Node.js 24, two active Memory Spaces.'],
]
const bugSections = [
  ['Bug 证据 / Bug evidence', '```log\nError: runtime memory migration route coverage is invalid\n```'],
  ['冒烟测试 / Smoke test', 'Reproduced with multiple entries; changing the routing model succeeds.'],
  ['引用代码 / Code references', 'src/host/subagent.ts, runtime memory routing validation.'],
  ['补丁草案 / Patch proposal', 'Include route validation in the deterministic fallback.'],
]
const body = (sections) => sections.map(([heading, value]) => `### ${heading}\n\n${value}`).join('\n\n')
const bugBody = body([...baseSections, ...bugSections])
const issue = (overrides = {}) => ({ number: 235, state: 'open', body: bugBody, labels: [{ name: 'bug' }], ...overrides })
const missingLabel = () => issue({ labels: [] })

function harness(eventIssue, snapshots = [eventIssue]) {
  let reads = 0
  const get = vi.fn(async () => {
    const snapshot = snapshots[Math.min(reads++, snapshots.length - 1)]
    if (snapshot instanceof Error) throw snapshot
    return { data: structuredClone(snapshot) }
  })
  const update = vi.fn(async () => ({ data: {} }))
  const createComment = vi.fn(async () => ({ data: {} }))
  const context = { repo: { owner: 'omdsh-dev', repo: 'dsh-mnemon' }, payload: { issue: eventIssue } }
  return {
    get, update, createComment,
    run: () => runWorkflow(context, { rest: { issues: { get, update, createComment } } }),
  }
}

describe('issue template enforcement against current issue state', () => {
  it('keeps an issue open when the bug label was added after the event, before the job starts', async () => {
    const check = harness(missingLabel(), [issue()])
    await check.run()
    expect(check.update).not.toHaveBeenCalled()
    expect(check.createComment).not.toHaveBeenCalled()
  })

  it('keeps an issue open when the bug label is added during validation', async () => {
    const check = harness(missingLabel(), [missingLabel(), issue()])
    await check.run()
    expect(check.update).not.toHaveBeenCalled()
    expect(check.createComment).not.toHaveBeenCalled()
  })

  it('accepts required information filled in during validation', async () => {
    const incomplete = issue({ body: body(baseSections) })
    const check = harness(incomplete, [incomplete, issue()])
    await check.run()
    expect(check.update).not.toHaveBeenCalled()
    expect(check.createComment).not.toHaveBeenCalled()
  })

  it.each(['before the job starts', 'during validation'])('skips an issue closed %s', async (timing) => {
    const closed = missingLabel()
    closed.state = 'closed'
    const check = harness(missingLabel(), timing === 'during validation' ? [missingLabel(), closed] : [closed])
    await check.run()
    expect(check.update).not.toHaveBeenCalled()
    expect(check.createComment).not.toHaveBeenCalled()
  })

  it('still closes a bug report whose label remains missing', async () => {
    const check = harness(missingLabel())
    await check.run()
    expect(check.update).toHaveBeenCalledExactlyOnceWith({
      owner: 'omdsh-dev', repo: 'dsh-mnemon', issue_number: 235,
      state: 'closed', state_reason: 'not_planned',
    })
    expect(check.createComment).toHaveBeenCalledTimes(1)
    expect(check.createComment.mock.calls[0][0].body).toContain('include the `bug` label')
    expect(check.createComment.mock.calls[0][0].body).not.toContain('Missing or empty required sections')
  })

  it('reports only the remaining errors after a partial correction', async () => {
    const incompleteBody = body(baseSections)
    const check = harness(issue({ body: incompleteBody, labels: [] }), [
      issue({ body: incompleteBody, labels: [] }),
      issue({ body: incompleteBody }),
    ])
    await check.run()
    expect(check.update).toHaveBeenCalledTimes(1)
    expect(check.createComment.mock.calls[0][0].body).toContain('Missing or empty required sections')
    expect(check.createComment.mock.calls[0][0].body).not.toContain('include the `bug` label')
  })

  it('accepts a complete question without a bug label', async () => {
    const question = body(baseSections.map(([heading, value]) => [heading, value === 'Bug 报告 / Bug report' ? '问题 / Question' : value]))
    const check = harness(issue({ body: question, labels: [] }))
    await check.run()
    expect(check.update).not.toHaveBeenCalled()
    expect(check.createComment).not.toHaveBeenCalled()
  })

  it.each([
    ['an unchecked duplicate search', bugBody.replace('- [x]', '- [ ]'), 'You must confirm that you searched'],
    ['evidence without a log or attachment', bugBody.replace(bugSections[0][1], 'It fails.'), 'Bug evidence must include'],
    ['an empty required section', bugBody.replace(baseSections[6][1], '_No response_'), 'Missing or empty required sections'],
  ])('still rejects %s', async (_name, invalidBody, message) => {
    const check = harness(issue({ body: invalidBody }))
    await check.run()
    expect(check.update).toHaveBeenCalledTimes(1)
    expect(check.createComment.mock.calls[0][0].body).toContain(message)
  })

  it.each(['initial read', 'final read'])('does not close or comment if the %s fails', async (timing) => {
    const failure = new Error('GitHub is unavailable')
    const check = harness(missingLabel(), timing === 'initial read' ? [failure] : [missingLabel(), failure])
    await expect(check.run()).rejects.toThrow('GitHub is unavailable')
    expect(check.update).not.toHaveBeenCalled()
    expect(check.createComment).not.toHaveBeenCalled()
  })

  it('does not claim an issue was closed if the close request fails', async () => {
    const check = harness(missingLabel())
    check.update.mockRejectedValueOnce(new Error('Close request failed'))
    await expect(check.run()).rejects.toThrow('Close request failed')
    expect(check.createComment).not.toHaveBeenCalled()
  })

  it.each([undefined, issue({ pull_request: {} })])('ignores an event without a regular issue', async (eventIssue) => {
    const check = harness(eventIssue)
    await check.run()
    expect(check.get).not.toHaveBeenCalled()
    expect(check.update).not.toHaveBeenCalled()
    expect(check.createComment).not.toHaveBeenCalled()
  })
})
