import _debug from 'debug'
import makeError from 'make-error'
import { WaitOptions, waitUntil } from 'prom-utils'

import { FsmOptions, StateTransitions } from './types'

export const StateError = makeError('StateError')

const debug = _debug('simple-machines')

/**
 * Simple finite state machine with explicit allowed state transitions,
 * initial state, and options around how long to wait for state transitions
 * when using waitForChange as well as explicitly naming the machine for
 * better debugging when using multiple machines simultaneously.
 */
export function fsm<T extends string>(
  stateTransitions: StateTransitions<T>,
  initState: T,
  options: WaitOptions & FsmOptions<T> = {}
) {
  let state = initState
  const name = options.name || 'fsm'
  const onStateChange = options.onStateChange
  let startTime = new Date()

  /**
   * Get the current state. Prefer `is` for checking the state.
   */
  const get = () => state

  /**
   * Is state currently one of `states`?
   */
  const is = (...states: T[]) => states.includes(state)

  /**
   * Can the machine be transitioned to `state`?
   */
  const canChange = (newState: T) => stateTransitions[state]?.includes(newState)

  /**
   * The elapsed time in ms the FSM has been in the current state.
   */
  const getElapsedTime = () => new Date().getTime() - startTime.getTime()

  const _change = (newState: T) => {
    const oldState = state
    state = newState
    const elapsedTime = getElapsedTime()
    debug(
      '%s changed state from %s to %s. Elapsed %d ms',
      name,
      oldState,
      newState,
      elapsedTime
    )
    if (onStateChange) {
      onStateChange({
        name,
        from: oldState,
        to: newState,
        elapsedTime,
      })
    }
    startTime = new Date()
  }

  /**
   * Transition state to `newState`. Throws if `newState` is not a valid
   * transitional state for the current state.
   */
  const change = (newState: T) => {
    debug('%s changing state from %s to %s', name, state, newState)
    if (!canChange(newState)) {
      throw new StateError(
        `${name} invalid state transition - ${state} to ${newState}`
      )
    }
    _change(newState)
  }

  /**
   * Wait for state to change to one of `newStates`. Times out after 5 seconds
   * by default.
   */
  const waitForChange = async (...newStates: T[]) => {
    debug(
      '%s waiting for state change from %s to %s',
      name,
      state,
      newStates.join(' or ')
    )
    await waitUntil(() => newStates.includes(state), options)
  }

  /**
   * Change states, if valid. Returns a boolean indicating if the state was changed.
   */
  const maybeChange = (newState: T) => {
    debug('%s changing state from %s to %s', name, state, newState)
    if (canChange(newState)) {
      _change(newState)
      return true
    }
    return false
  }

  return {
    get,
    change,
    waitForChange,
    is,
    canChange,
    maybeChange,
    getElapsedTime,
  }
}
