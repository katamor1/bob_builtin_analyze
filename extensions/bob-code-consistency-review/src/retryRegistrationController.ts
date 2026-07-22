export interface DisposableLike {
  dispose: () => void
}

export type RegistrationAttemptResult<Api> =
  | { registered: false; registrations: DisposableLike[]; api?: undefined }
  | { registered: true; registrations: DisposableLike[]; api: Api }

export interface RetryRegistrationControllerOptions<Api> {
  retryDelaysMs: readonly number[]
  register: () => Promise<RegistrationAttemptResult<Api>>
  currentApi: () => Api | undefined
  subscribeChanges: (listener: () => void) => DisposableLike
  own: (...disposables: DisposableLike[]) => void
  reportError: (error: unknown) => void
}

/** Optional extension integrationをAPI世代単位で安全に再試行する。 */
export function startRetryRegistrationController<Api>(
  options: RetryRegistrationControllerOptions<Api>
): DisposableLike {
  let disposed = false
  let providersRegistered = false
  let generation = 0
  let registeredApi: Api | undefined
  let registrationAttempt: Promise<boolean> | undefined
  let activeRegistrations: DisposableLike[] = []
  let retryIndex = 0
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const clearRetryTimers = (): void => {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
  }

  const disposeRegistrations = (registrations: DisposableLike[], errors: unknown[]): void => {
    for (const registration of [...registrations].reverse()) {
      try {
        registration.dispose()
      } catch (error) {
        errors.push(error)
      }
    }
    registrations.length = 0
  }

  const reportCleanupErrors = (errors: unknown[]): void => {
    if (errors.length === 0) return
    if (errors.length === 1) {
      options.reportError(errors[0])
      return
    }
    options.reportError(new AggregateError(
      errors,
      `Provider registration cleanup failed: ${errors.map((error) => String(error)).join("; ")}`
    ))
  }

  const resetRegistration = (errors: unknown[]): void => {
    generation += 1
    registrationAttempt = undefined
    const registrations = activeRegistrations
    activeRegistrations = []
    registeredApi = undefined
    providersRegistered = false
    disposeRegistrations(registrations, errors)
  }

  const scheduleRetry = (): void => {
    if (disposed || providersRegistered || retryIndex >= options.retryDelaysMs.length) return
    const timer = setTimeout(() => {
      timers.delete(timer)
      void attempt()
    }, options.retryDelaysMs[retryIndex])
    retryIndex += 1
    timers.add(timer)
  }

  const performAttempt = async (attemptGeneration: number): Promise<boolean> => {
    const result = await options.register()
    if (disposed || attemptGeneration !== generation) {
      const errors: unknown[] = []
      disposeRegistrations(result.registrations, errors)
      reportCleanupErrors(errors)
      return false
    }
    if (!result.registered) {
      const errors: unknown[] = []
      disposeRegistrations(result.registrations, errors)
      reportCleanupErrors(errors)
      scheduleRetry()
      return false
    }
    if (result.api === undefined) {
      const errors: unknown[] = []
      disposeRegistrations(result.registrations, errors)
      reportCleanupErrors(errors)
      options.reportError(new Error("Provider registration succeeded without API identity."))
      scheduleRetry()
      return false
    }

    activeRegistrations = result.registrations
    registeredApi = result.api
    providersRegistered = true
    return true
  }

  const attempt = async (): Promise<boolean> => {
    if (disposed || providersRegistered) return providersRegistered
    if (registrationAttempt) return registrationAttempt

    const attemptGeneration = generation
    const currentAttempt = performAttempt(generation)
    registrationAttempt = currentAttempt
    try {
      return await currentAttempt
    } catch (error) {
      options.reportError(error)
      if (!disposed && attemptGeneration === generation) scheduleRetry()
      return false
    } finally {
      if (registrationAttempt === currentAttempt) registrationAttempt = undefined
    }
  }

  const changeSubscription = options.subscribeChanges(() => {
    const currentApi = options.currentApi()
    if (providersRegistered && currentApi === registeredApi) return
    const errors: unknown[] = []
    resetRegistration(errors)
    retryIndex = 0
    clearRetryTimers()
    try {
      reportCleanupErrors(errors)
    } finally {
      void attempt()
    }
  })

  const controller: DisposableLike = {
    dispose: () => {
      if (disposed) return
      disposed = true
      clearRetryTimers()
      const errors: unknown[] = []
      resetRegistration(errors)
      try {
        changeSubscription.dispose()
      } catch (error) {
        errors.push(error)
      }
      reportCleanupErrors(errors)
    }
  }

  options.own(controller)
  void attempt()
  return controller
}
