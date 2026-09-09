import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { listSkillFiles, readSkillFile, saveSkillFile } from '../src/files.ts'
describe('configured skill files', () => {
  it('lists and edits bounded Markdown, rejects stale edits and paths outside roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mnemon-skills-')),
      skills = join(root, 'skills'),
      file = join(skills, 'SKILL.md'),
      outside = join(root, 'outside.md')
    await mkdir(skills)
    await writeFile(file, '# Original')
    await writeFile(outside, 'private')
    await symlink(outside, join(skills, 'escape.md'))
    expect((await listSkillFiles([skills])).some((path) => path.endsWith('SKILL.md'))).toBe(true)
    const before = await readSkillFile([skills], file)
    await saveSkillFile([skills], file, '# Reviewed', before.digest)
    await expect(saveSkillFile([skills], file, '# Stale', before.digest)).rejects.toThrow(/changed/)
    await expect(readSkillFile([skills], outside)).rejects.toThrow()
    await expect(readSkillFile([skills], join(skills, 'escape.md'))).rejects.toThrow()
    expect((await readSkillFile([skills], file)).content).toBe('# Reviewed')
  })
})

it('allows only one concurrent save from the same observed file version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mnemon-skill-race-')),
    file = join(root, 'SKILL.md')
  await writeFile(file, 'Original')
  const before = await readSkillFile([root], file)
  const results = await Promise.allSettled([
    saveSkillFile([root], file, 'First edit', before.digest),
    saveSkillFile([root], file, 'Second edit', before.digest),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
})
