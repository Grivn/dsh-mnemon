import { useState } from 'react'
import type { MemorySourcePageProps } from 'dsh-mnemon/client'
import { collectionStyles, managementError } from 'dsh-mnemon-workspace-kit/client'
export function SkillFiles(props: MemorySourcePageProps) {
  const zh = props.locale.startsWith('zh'),
    [files, setFiles] = useState<string[]>([]),
    [path, setPath] = useState(''),
    [content, setContent] = useState(''),
    [version, setVersion] = useState(''),
    [revision, setRevision] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(''),
    [skills, setSkills] = useState<Array<{name:string;description:string}>>([]),
    [definition, setDefinition] = useState('')
  async function run(operation: string, name?: string) {
    if (!props.management) return
    setBusy(true)
    setError('')
    try {
      const result =
        operation === 'save-skill-file'
          ? await props.management.mutate(
              operation,
              { path, content, digest: version },
              { confirmed: true, expectedRevision: revision },
            )
          : await props.management.read(operation, { path, ...(name ? { name } : {}) })
      setRevision(result.revision)
      if (operation === 'native-skills') setSkills(result.value as Array<{name:string;description:string}>)
      else if (operation === 'native-skill') { const value = result.value as {content:string;truncated:boolean}; setDefinition(value.content + (value.truncated ? (zh ? '\n内容有截断。' : '\nContent was bounded.') : '')) }
      else if (operation === 'skill-files') setFiles(result.value as string[])
      else {
        const value = result.value as { path: string; content: string; digest: string }
        setPath(value.path)
        setContent(value.content)
        setVersion(value.digest)
      }
    } catch (error) {
      setError(managementError(error, zh))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section data-mnemon-collection aria-label={zh ? '技能文件' : 'Skill files'}>
      <style>{collectionStyles}</style>
      <h2>{zh ? '技能文件' : 'Skill files'}</h2>
      <p>
        {zh
          ? '浏览插件配置中指定的技能目录。文件内容修改会在原位置保存；过期版本不会覆盖新内容。'
          : 'Browse configured skill directories. Edits save to the original file; stale versions cannot overwrite newer content.'}
      </p>
      <button disabled={busy} onClick={() => void run('skill-files')}>
        {zh ? '读取技能目录' : 'Load skill directories'}
      </button>
      <label>
        {zh ? '筛选文件' : 'Filter files'}
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <ul>
        {files
          .filter((file) => file.toLowerCase().includes(query.toLowerCase()))
          .map((file) => (
            <li key={file}>
              <button
                onClick={() => {
                  setPath(file)
                  setVersion('')
                  setContent('')
                }}
              >
                {file}
              </button>
            </li>
          ))}
      </ul>
      <label>
        {zh ? '技能文件路径' : 'Skill file path'}
        <input
          value={path}
          onChange={(event) => {
            setPath(event.target.value)
            setVersion('')
          }}
        />
      </label>
      <button disabled={busy || !path} onClick={() => void run('skill-file')}>
        {zh ? '打开文件' : 'Open file'}
      </button>
      {version && (
        <>
          <label>
            {zh ? '技能文件内容' : 'Skill file content'}
            <textarea rows={14} value={content} onChange={(event) => setContent(event.target.value)} />
          </label>
          <button disabled={busy || !props.writable} onClick={() => void run('save-skill-file')}>
            {zh ? '保存技能文件' : 'Save skill file'}
          </button>
        </>
      )}
      <h3>{zh ? '原生可用技能' : 'Enabled native skills'}</h3>
      <button disabled={busy} onClick={() => void run('native-skills')}>{zh ? '读取原生技能目录' : 'Load native skill catalog'}</button>
      <ul>{skills.map(skill => <li key={skill.name}><strong>{skill.name}</strong> · {skill.description} <button disabled={busy} onClick={() => void run('native-skill', skill.name)}>{zh ? '读取技能 ' : 'Read skill '}{skill.name}</button></li>)}</ul>
      {definition && <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{definition}</pre>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
