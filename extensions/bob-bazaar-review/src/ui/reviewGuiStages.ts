import type { ReviewRunContext } from "../reviewRuns/reviewRunTypes"

export type BazaarReviewStage =
  | "review"
  | "review-result-capture"
  | "triage"
  | "review-results"

export interface BazaarReviewStageHost {
  readonly cspSource: string
  readonly stage: BazaarReviewStage
  isActive(): boolean
  nextRenderToken(): string
  render(html: string): boolean
  post(message: Record<string, unknown>): Promise<boolean>
  getActiveReviewRun(): ReviewRunContext | undefined
  commitActiveReviewRun(expected: ReviewRunContext | undefined, next: ReviewRunContext): boolean
  getWorkspaceRoot(): string | undefined
  showStage(stage: BazaarReviewStage): Promise<boolean>
}

export interface BazaarReviewStageRequest {
  campaignId?: string
}

export interface BazaarReviewStageService {
  initialize(): Promise<void>
  handleMessage(message: unknown): Promise<void>
}

export type BazaarReviewStageFactory = (
  stage: Exclude<BazaarReviewStage, "review">,
  host: BazaarReviewStageHost,
  request: BazaarReviewStageRequest
) => BazaarReviewStageService
