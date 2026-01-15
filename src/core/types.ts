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
 * Result type for callbacks that can reject operations
 */
export type CallbackResult =
  | { allowed: true; reason?: never }
  | { allowed: false; reason: string };

/**
 * Context provided to lifecycle callbacks
 */
export interface LifecycleCallbackContext {
  /**
   * Current actor state (RivetKit state)
   */
  state: FsmActorState;

  /**
   * Input provided to onCreate
   */
  input?: { snapshot?: string; context?: unknown };

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Context provided to request callbacks
 */
export interface RequestCallbackContext {
  /**
   * HTTP Request object
   */
  request: Request;

  /**
   * Current XState snapshot
   */
  snapshot: Snapshot<unknown>;

  /**
   * Current RivetKit state
   */
  state: FsmActorState;

  /**
   * Request metadata (headers, method, url, etc.)
   */
  metadata: {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
}

/**
 * Context provided to WebSocket callbacks
 */
export interface WebSocketCallbackContext {
  /**
   * WebSocket connection
   */
  ws: WebSocket;

  /**
   * Current XState snapshot
   */
  snapshot: Snapshot<unknown>;

  /**
   * Current RivetKit state
   */
  state: FsmActorState;

  /**
   * Connection metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Context provided to event callbacks
 */
export interface EventCallbackContext {
  /**
   * The event being sent
   */
  event: EventObject;

  /**
   * Current XState snapshot before event
   */
  snapshot: Snapshot<unknown>;

  /**
   * Current RivetKit state
   */
  state: FsmActorState;

  /**
   * Source of the event (http, websocket, internal)
   */
  source: 'http' | 'websocket' | 'internal';
}

/**
 * Context provided to transition callbacks
 */
export interface TransitionCallbackContext {
  /**
   * Snapshot before transition
   */
  previousSnapshot: Snapshot<unknown>;

  /**
   * Snapshot after transition
   */
  currentSnapshot: Snapshot<unknown>;

  /**
   * Event that triggered the transition
   */
  event: EventObject;

  /**
   * Current RivetKit state
   */
  state: FsmActorState;
}

/**
 * Context provided to state sync callbacks
 */
export interface StateSyncCallbackContext {
  /**
   * Current XState snapshot to be synced
   */
  snapshot: Snapshot<unknown>;

  /**
   * Current RivetKit state
   */
  state: FsmActorState;

  /**
   * Persistence mode being used
   */
  persistenceMode: PersistenceMode;
}

/**
 * Comprehensive hooks for FSM actor lifecycle and operations
 */
export interface FsmActorHooks {
  /**
   * Called before actor is created
   * Can reject actor creation by returning { allowed: false }
   */
  beforeCreate?: (
    ctx: LifecycleCallbackContext
  ) => CallbackResult | Promise<CallbackResult>;

  /**
   * Called after actor is successfully created
   */
  afterCreate?: (ctx: LifecycleCallbackContext) => void | Promise<void>;

  /**
   * Called before actor wakes from hibernation
   * Can reject wake by returning { allowed: false }
   */
  beforeWake?: (
    ctx: LifecycleCallbackContext
  ) => CallbackResult | Promise<CallbackResult>;

  /**
   * Called after actor wakes from hibernation
   */
  afterWake?: (ctx: LifecycleCallbackContext) => void | Promise<void>;

  /**
   * Called before processing an HTTP request
   * Can reject request by returning { allowed: false }
   * Useful for authentication, authorization, rate limiting
   */
  beforeRequest?: (
    ctx: RequestCallbackContext
  ) => CallbackResult | Promise<CallbackResult>;

  /**
   * Called after processing an HTTP request
   */
  afterRequest?: (
    ctx: RequestCallbackContext,
    response: Response
  ) => void | Promise<void>;

  /**
   * Called when a WebSocket connection is established
   * Can reject connection by returning { allowed: false }
   * Useful for authentication, connection limits
   */
  beforeConnect?: (
    ctx: WebSocketCallbackContext
  ) => CallbackResult | Promise<CallbackResult>;

  /**
   * Called when a WebSocket connection is closed
   */
  onDisconnect?: (ctx: WebSocketCallbackContext) => void | Promise<void>;

  /**
   * Called before processing a WebSocket message
   * Can reject message by returning { allowed: false }
   * Can transform the event by returning modified event
   */
  beforeMessage?: (
    ctx: WebSocketCallbackContext & { message: FsmWebSocketMessage }
  ) =>
    | CallbackResult
    | Promise<CallbackResult>
    | { allowed: true; event?: EventObject }
    | Promise<{ allowed: true; event?: EventObject }>;

  /**
   * Called after processing a WebSocket message
   */
  afterMessage?: (
    ctx: WebSocketCallbackContext & { message: FsmWebSocketMessage }
  ) => void | Promise<void>;

  /**
   * Called before sending an event to the XState machine
   * Can reject event by returning { allowed: false }
   * Can transform the event by returning modified event
   * Acts as a guard for all state transitions
   */
  beforeEvent?: (
    ctx: EventCallbackContext
  ) =>
    | CallbackResult
    | Promise<CallbackResult>
    | { allowed: true; event?: EventObject }
    | Promise<{ allowed: true; event?: EventObject }>;

  /**
   * Called after an event is sent to the XState machine
   */
  afterEvent?: (ctx: EventCallbackContext) => void | Promise<void>;

  /**
   * Called before a state transition occurs
   * Can reject transition by returning { allowed: false }
   * Note: This is called during XState's subscription, after the transition
   * Use beforeEvent to prevent transitions before they happen
   */
  beforeTransition?: (
    ctx: TransitionCallbackContext
  ) => CallbackResult | Promise<CallbackResult>;

  /**
   * Called after a state transition completes
   */
  afterTransition?: (
    ctx: TransitionCallbackContext
  ) => void | Promise<void>;

  /**
   * Called before syncing state to RivetKit storage
   * Can prevent sync by returning { allowed: false }
   */
  beforeStateSync?: (
    ctx: StateSyncCallbackContext
  ) => CallbackResult | Promise<CallbackResult>;

  /**
   * Called after syncing state to RivetKit storage
   */
  afterStateSync?: (ctx: StateSyncCallbackContext) => void | Promise<void>;
}

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

  /**
   * Lifecycle and operational hooks
   * Allows custom logic for authentication, authorization, validation, etc.
   */
  hooks?: FsmActorHooks;
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
