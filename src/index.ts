/**
 * rivetkit-xstate
 *
 * Embed XState finite state machines as RivetKit actors
 *
 * @example
 * ```typescript
 * import { createMachine } from 'xstate';
 * import { createFsmActor } from 'rivetkit-xstate';
 *
 * const machine = createMachine({
 *   id: 'toggle',
 *   initial: 'inactive',
 *   states: {
 *     inactive: { on: { TOGGLE: 'active' } },
 *     active: { on: { TOGGLE: 'inactive' } }
 *   }
 * });
 *
 * export const toggle = createFsmActor(machine, {
 *   persistenceMode: 'full',
 *   debug: true
 * });
 * ```
 */

export { createFsmActor } from './core/createFsmActor';

export type {
  FsmActorConfig,
  FsmActorState,
  FsmWebSocketMessage,
  FsmResponse,
  FsmActorRef,
  PersistenceMode,
  ErrorHandlingMode,
  SyncStrategy,
  ErrorCallback,
} from './core/types';

export {
  serializeSnapshot,
  deserializeSnapshot,
  snapshotToRivetState,
  contextToRivetState,
  minimalRivetState,
} from './utils/serialization';

export { Logger } from './utils/logger';
