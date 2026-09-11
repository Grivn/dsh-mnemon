import assert from 'node:assert/strict'

/** Return chunk-local indexes to exercise Host validation; storage and tools stay real. */
export function runtimeRoutingModel(report) {
  return request => {
    const terminal = (request.tools ?? []).find(tool => tool.function?.name?.startsWith('mnemon_subagent_result_'))?.function
    const text = (request.messages ?? []).map(message => typeof message.content === 'string' ? message.content
      : (message.content ?? []).map(item => item.text ?? '').join('\n')).join('\n')
    if (!terminal || !text.includes('<runtime-memory-routing-excerpts>')) return 'Runtime routing fixture ready.'
    const excerpt = text.split('<runtime-memory-routing-excerpts>')[1].split('</runtime-memory-routing-excerpts>')[0]
    const indexes = [...excerpt.matchAll(/^(\d+)\. \[importance=/gm)].map(match => Number(match[1]))
    const memoryBodyId = text.match(/^\d+\. id=(.+)$/m)?.[1].trim()
    assert(indexes.length > 0 && memoryBodyId, 'routing fixture requires real sources and destinations')
    const sourceIndexes = indexes.map((_value, index) => index + 1)
    report({ allowedIndexes: indexes, returnedIndexes: sourceIndexes, memoryBodyId })
    return { name: terminal.name, args: { action: 'planned', summary: 'Fixture router restarts numbering in each chunk.', routes: [{ sourceIndexes, memoryBodyId }] } }
  }
}
