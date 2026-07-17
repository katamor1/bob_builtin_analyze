export type WorkspaceTrustCheck = () => boolean

export function workspaceTrustError(action: string): string {
  return `ワークスペースは信頼されていません。「${action}」を実行する前に、このワークスペースを信頼してください。`
}

export function requireWorkspaceTrust(isWorkspaceTrusted: WorkspaceTrustCheck | undefined, action: string): void {
  if (isWorkspaceTrusted && !isWorkspaceTrusted()) throw new Error(workspaceTrustError(action))
}
