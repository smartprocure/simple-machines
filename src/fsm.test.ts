import { setTimeout } from 'node:timers/promises'
import { WaitOptions } from 'prom-utils'
import { describe, expect, test } from 'vitest'

import { fsm } from './fsm'
import { FsmOptions, StateTransition, StateTransitions } from './types'

type State = 'starting' | 'started' | 'stopping' | 'stopped'

const stateTransitions: StateTransitions<State> = {
  stopped: ['starting'],
  starting: ['started'],
  started: ['stopping'],
  stopping: ['stopped'],
}

const stateMachine = (options: WaitOptions & FsmOptions<State> = {}) =>
  fsm<State>(stateTransitions, 'stopped', {
    name: 'Example state machine',
    onStateChange(change) {
      console.log(change)
    },
    ...options,
  })

test('Initial state', async () => {
  const state = stateMachine()

  // Basic `get` test
  expect(state.get()).toBe('stopped')

  // Basic `is` tests
  // NOTE: `is` can take multiple arguments, for a "one of" check
  expect(state.is('stopped')).toBeTruthy()
  expect(state.is('stopped', 'starting', 'started')).toBeTruthy()
  expect(state.is('started')).toBeFalsy()
  expect(state.is('started', 'starting', 'stopping')).toBeFalsy()
})

test('Valid state changes', () => {
  const state = stateMachine()

  for (const [oldState, newState] of [
    ['stopped', 'starting'],
    ['starting', 'started'],
    ['started', 'stopping'],
    ['stopping', 'stopped'],
  ] as [State, State][]) {
    expect(state.is(oldState)).toBeTruthy()
    expect(state.canChange(newState)).toBeTruthy()
    state.change(newState)
  }
})

test('Invalid state changes', () => {
  const state = stateMachine()
  expect(state.is('stopped')).toBeTruthy()
  expect(state.canChange('starting')).toBeTruthy()

  for (const newState of ['stopped', 'stopping', 'started'] as State[]) {
    expect(state.canChange(newState)).toBeFalsy()
    expect(() => state.change(newState)).toThrow('invalid state transition')
  }
})

describe('maybeChange', () => {
  test('valid transition', () => {
    const state = stateMachine()
    expect(state.is('stopped')).toBeTruthy()

    expect(state.canChange('starting')).toBeTruthy()
    expect(state.maybeChange('starting')).toBeTruthy()
    expect(state.is('starting')).toBeTruthy()
  })

  test('invalid transition', () => {
    const state = stateMachine()
    expect(state.is('stopped')).toBeTruthy()

    for (const newState of ['stopped', 'stopping', 'started'] as State[]) {
      expect(state.canChange(newState)).toBeFalsy()
      expect(state.maybeChange(newState)).toBeFalsy()
      expect(state.is('stopped')).toBeTruthy()
    }
  })
})

describe('waitForChange', () => {
  test('Await immediate state change', async () => {
    expect.assertions(4)
    const state = stateMachine()
    await expect(state.waitForChange('stopped')).resolves.toBeUndefined()
    // `waitForChange` can take multiple arguments, for a "one of" check
    await expect(
      state.waitForChange('stopped', 'started')
    ).resolves.toBeUndefined()

    state.change('starting')
    await expect(state.waitForChange('starting')).resolves.toBeUndefined()
    await expect(
      state.waitForChange('starting', 'stopping')
    ).resolves.toBeUndefined()
  })

  test('Await eventual state change', async () => {
    expect.assertions(2)
    const state = stateMachine()

    global.setTimeout(() => state.change('starting'), 250)
    await expect(state.waitForChange('starting')).resolves.toBeUndefined()
    global.setTimeout(() => state.change('started'), 250)
    await expect(state.waitForChange('started')).resolves.toBeUndefined()
  })

  test('Eventual state change times out', async () => {
    expect.assertions(1)
    const state = stateMachine({ timeout: 250 })

    await expect(state.waitForChange('starting')).rejects.toThrow(
      'Did not complete in 250 ms'
    )
  })
})

describe('getElapsedTime', () => {
  test('should work with initial state', async () => {
    const state = stateMachine()
    await setTimeout(1000)
    expect(state.getElapsedTime()).toBeGreaterThanOrEqual(1000)
  })

  test('should work after state change', async () => {
    const state = stateMachine()
    await setTimeout(1000)
    state.change('starting')
    await setTimeout(1000)
    // Include a little bit of buffer time to account for the delay between
    // changing the state and updating the start time, which is used to
    // calculate elapsed time.
    expect(state.getElapsedTime()).toBeGreaterThanOrEqual(990)
    expect(state.getElapsedTime()).toBeLessThan(2000)
  })
})

describe('onStateChange', () => {
  test('is emitted for a state change', () => {
    let stateChange: StateTransition<State> | undefined = undefined
    const state = stateMachine({
      onStateChange(change) {
        stateChange = change
      },
    })
    state.change('starting')
    expect(stateChange).toMatchObject({
      name: 'Example state machine',
      from: 'stopped',
      to: 'starting',
      elapsedTime: expect.any(Number),
    })
  })
})
