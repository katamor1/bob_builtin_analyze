import type { DependencyEdge, ScopeSymbol } from "./evidenceScopeTypes"
import type { LoadedRepositorySymbolIndex } from "./repositorySymbolIndexLoader"

export type MergedRepositoryScopeData = {
  symbols: ScopeSymbol[]
  dependencyEdges: DependencyEdge[]
}

export function mergeRepositoryScopeData(
  analysisSymbols: ScopeSymbol[],
  analysisEdges: DependencyEdge[],
  repositoryIndex: LoadedRepositorySymbolIndex | undefined
): MergedRepositoryScopeData {
  const symbolsById = new Map<string, ScopeSymbol>()
  for (const symbol of repositoryIndex?.symbols ?? []) symbolsById.set(symbol.id, symbol)
  for (const symbol of analysisSymbols) symbolsById.set(symbol.id, symbol)

  const edgesByKey = new Map<string, DependencyEdge>()
  for (const edge of repositoryIndex?.dependencyEdges ?? []) edgesByKey.set(edgeKey(edge), edge)
  for (const edge of analysisEdges) edgesByKey.set(edgeKey(edge), edge)

  return {
    symbols: [...symbolsById.values()].sort((left, right) => left.id.localeCompare(right.id)),
    dependencyEdges: [...edgesByKey.values()].sort(compareEdges)
  }
}

function edgeKey(edge: DependencyEdge): string {
  return `${edge.from}\u0000${edge.to ?? ""}\u0000${edge.kind}\u0000${edge.resolution}`
}

function compareEdges(left: DependencyEdge, right: DependencyEdge): number {
  return edgeKey(left).localeCompare(edgeKey(right))
    || left.reason.localeCompare(right.reason)
    || (left.targetHint ?? "").localeCompare(right.targetHint ?? "")
}
