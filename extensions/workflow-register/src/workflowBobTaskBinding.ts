import type { BobWorkflowTaskBinding } from "./bobWorkflowTypes"
import {
  BOB_2_0_1_PROFILE_DIGEST,
  BOB_2_0_1_TASK_CAPABILITIES
} from "./core/contractV2/bobProfile"

export const AUDITED_BOB_PROFILE_DIGEST = BOB_2_0_1_PROFILE_DIGEST

export const LEGACY_BOB_TASK_BINDING: BobWorkflowTaskBinding = Object.freeze({
  profileDigest: BOB_2_0_1_PROFILE_DIGEST,
  taskCapabilities: BOB_2_0_1_TASK_CAPABILITIES
})
