import { nearDuplicates } from './content.ts'
import { extractEntities, type Entity } from './entities.ts'
import type { Clip, ReviewState } from './model.ts'

export type Suggestion = { id: string; clip: Clip; type: 'category' | 'tag' | 'duplicate' | Entity['type']; value: string; evidence: string; entity?: Entity; related?: Clip; state?: ReviewState; method: string }

export function suggestionsFor(clip: Clip, clips: Clip[]): Suggestion[] {
  const suggestions: Suggestion[] = extractEntities(clip).map(entity => ({
    id: entity.id, clip, type: entity.type, value: entity.value, evidence: entity.evidence, entity, method: 'Pattern · ' + entity.origin.toUpperCase(),
  }))
  const { prediction } = clip
  if (prediction?.category) suggestions.unshift({
    id: 'category:' + prediction.category + ':' + prediction.version, clip, type: 'category', value: prediction.category,
    evidence: (clip.body.trim() || clip.processing?.passages[0]?.text || clip.title).slice(0, 205),
    method: 'Local ML',
  })
  if (prediction?.category) suggestions.push({
    id: 'tag:' + prediction.category, clip, type: 'tag', value: prediction.category.toLowerCase(),
    evidence: 'Based on the capture’s suggested category.', method: 'From local category',
  })
  for (const candidate of nearDuplicates(clip, clips).slice(0, 3)) {
    if (candidate.clip.id < clip.id) continue
    suggestions.push({
      id: 'duplicate:' + candidate.clip.id, clip, type: 'duplicate', value: candidate.clip.title,
      evidence: candidate.clip.body.slice(0, 205), related: candidate.clip, method: 'Word overlap · ' + Math.round(candidate.similarity * 100) + '%',
    })
  }
  return suggestions.map(suggestion => ({ ...suggestion, state: clip.reviewed?.[suggestion.id]?.state, value: clip.reviewed?.[suggestion.id]?.value ?? suggestion.value }))
}

export function decide(clip: Clip, suggestion: Suggestion, state?: ReviewState, edited?: string): Clip {
  const reviewed = { ...clip.reviewed }
  if (!state) { delete reviewed[suggestion.id]; return { ...clip, reviewed } }
  const value = edited?.trim().slice(0, 280) || suggestion.value.slice(0, 280)
  reviewed[suggestion.id] = { state, value }
  if (state !== 'accepted') return { ...clip, reviewed }
  if (suggestion.type === 'category') return { ...clip, reviewed, category: value.slice(0, 60) }
  if (suggestion.type === 'tag') return { ...clip, reviewed, tags: [...new Set([...(clip.tags ?? []), value.toLowerCase().slice(0, 36)])].slice(0, 30) }
  if (suggestion.type === 'action' || (suggestion.type === 'deadline' && (!suggestion.entity?.ambiguous || /^\d{4}-\d\d-\d\d$/.test(value)))) {
    return { ...clip, reviewed, tasks: [...(clip.tasks ?? []).filter(task => task.id !== suggestion.id), { id: suggestion.id, label: value, complete: false }] }
  }
  return { ...clip, reviewed }
}
