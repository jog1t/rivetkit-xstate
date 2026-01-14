import type { ActorRefFrom, AnyStateMachine, EventObject, Snapshot } from 'xstate';

/**
 * Persistence mode for XState state across RivetKit hibernation cycles
 */
export type PersistenceMode = 'full' | 'context-only' | 'none';

/**
 * Error handling strategy for XState machine errors
 */
export type ErrorHandlingMode = 'crash' | 'catch' | 'callback';

/**
 * State synchronization strategy
 */
export type SyncStrategy = 'on-transition' | 'on-event' | 'manual';

/**
 * Error callback for when XState machine encounters an error
 */
export type ErrorCallback = (error: Error, snapshot: Snapshot<unknown>) => void;

/**
 * Configuration options for FSM actor
 */
export interface FsmActorConfig {
  /**
   * How to persist XState state across hibernation
   * @default 'full'
   */
  persistenceMode?: PersistenceMode;

  /**
   * Delay before RivetKit actor hibernates (milliseconds)
   * @default undefined (use RivetKit defaults)
   */
  hibernationDelay?: number;

  /**
   * How to handle errors from the XState machine
   * - 'crash': Let the error crash the RivetKit actor (fail-fast)
   * - 'catch': Catch errors and expose via error states (resilient)
   * - 'callback': Catch errors and call the errorCallback function
   * @default 'crash'
   */
  errorHandling?: ErrorHandlingMode;

  /**
   * Callback function for handling XState errors (only used when errorHandling is 'callback')
   */
  errorCallback?: ErrorCallback;

  /**
   * When to synchronize XState state to RivetKit persistent state
   * @default 'on-transition'
   */
  syncStrategy?: SyncStrategy;

  /**
   * Additional metadata to attach to the actor
   */
  metadata?: Record<string, unknown>;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Internal state stored in RivetKit for XState machine
 */
export interface FsmActorState {
  /**
   * Serialized XState state snapshot (for 'full' persistence mode)
   */
  snapshot?: string;

  /**
   * XState context (for 'context-only' mode)
   */
  context?: unknown;

  /**
   * Current state value (for 'context-only' mode)
   */
  stateValue?: unknown;

  /**
   * Last error encountered (if any)
   */
  lastError?: {
    message: string;
    timestamp: number;
  };

  /**
   * Metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * WebSocket message structure for XState events
 */
export interface FsmWebSocketMessage {
  /**
   * Event type
   */
  type: string;

  /**
   * Event payload
   */
  [key: string]: unknown;
}

/**
 * Response structure for RivetKit requests
 */
export interface FsmResponse {
  /**
   * Current state value
   */
  state: unknown;

  /**
   * Current context
   */
  context: unknown;

  /**
   * Whether the machine is in a final state
   */
  done: boolean;

  /**
   * Output value (if in final state)
   */
  output?: unknown;

  /**
   * Error information (if any)
   */
  error?: {
    message: string;
    timestamp: number;
  };
}

/**
 * Type-safe FSM actor reference
 */
export interface FsmActorRef<TMachine extends AnyStateMachine> {
  /**
   * The underlying XState actor
   */
  actor: ActorRefFrom<TMachine>;

  /**
   * Send an event to the XState machine
   */
  send: (event: EventObject) => void;

  /**
   * Get current state snapshot
   */
  getSnapshot: () => Snapshot<unknown>;

  /**
   * Subscribe to state changes
   */
  subscribe: (callback: (snapshot: Snapshot<unknown>) => void) => () => void;

  /**
   * Manually trigger state synchronization to RivetKit
   */
  sync: () => Promise<void>;
}
