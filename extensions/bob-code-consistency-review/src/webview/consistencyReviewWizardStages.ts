export type ConsistencyReviewStage =
  | "review"
  | "traceability"
  | "review-result-capture"
  | "triage"

export type ConsistencyStageOutcome =
  | { status: "ok"; catalogPath?: string }
  | { status: "error"; errors: string[] }

export interface ConsistencyReviewStageRequest {
  workspaceRoot: string
  catalogPath?: string
  reportPath?: string
  textEncoding?: string
}

export interface ConsistencyReviewStageHost {
  readonly cspSource: string
  readonly stage: Exclude<ConsistencyReviewStage, "review">
  isActive(): boolean
  nextRenderToken(): string
  render(html: string): boolean
  post(message: Record<string, unknown>): Promise<boolean>
  getWorkspaceRoot(): string | undefined
  showStage(stage: ConsistencyReviewStage): Promise<ConsistencyStageOutcome>
}

export interface ConsistencyReviewStageService {
  initialize(): Promise<ConsistencyStageOutcome>
  handleMessage(message: unknown): Promise<void>
}

export type ConsistencyReviewStageFactory = (
  stage: Exclude<ConsistencyReviewStage, "review">,
  host: ConsistencyReviewStageHost,
  request: ConsistencyReviewStageRequest
) => ConsistencyReviewStageService
