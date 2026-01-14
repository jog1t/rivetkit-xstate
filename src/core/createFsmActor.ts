import { actor } from 'rivet';
import {
  type AnyStateMachine,
  createActor as createXStateActor,
  type Snapshot,
} from 'xstate';
import type {
  FsmActorConfig,
  FsmActorState,
  FsmWebSocketMessage,
  FsmResponse,
} from './types';
import {
  serializeSnapshot,
  deserializeSnapshot,
  snapshotToRivetState,
  contextToRivetState,
  minimalRivetState,
} from '../utils/serialization';
import { Logger } from '../utils/logger';

/**
 * Creates a RivetKit actor that embeds an XState finite state machine.
 *
 * @example
 * ```typescript
 * import { createMachine } from 'xstate';
 * import { createFsmActor } from 'rivetkit-xstate';
 *
 * const toggleMachine = createMachine({
 *   id: 'toggle',
 *   initial: 'inactive',
 *   states: {
 *     inactive: { on: { TOGGLE: 'active' } },
 *     active: { on: { TOGGLE: 'inactive' } }
 *   }
 * });
 *
 * const toggleActor = createFsmActor(toggleMachine, {
 *   persistenceMode: 'full',
 *   debug: true
 * });
 * ```
 *
 * @param machine - The XState machine definition
 * @param config - Configuration options for the FSM actor
 * @returns A RivetKit actor that can be deployed
 */
export function createFsmActor<TMachine extends AnyStateMachine>(
  machine: TMachine,
  config: FsmActorConfig = {}
) {
  const {
    persistenceMode = 'full',
    errorHandling = 'crash',
    syncStrategy = 'on-transition',
    debug = false,
    metadata = {},
    errorCallback,
  } = config;

  const logger = new Logger(debug, `[rivetkit-xstate:${machine.id || 'fsm'}]`);

  return actor({
    state: {
      fsm: {} as FsmActorState,
    },

    /**
     * Initialize the XState actor when the RivetKit actor is created
     */
    onCreate: async (ctx, input?: { snapshot?: string; context?: unknown }) => {
      logger.log('Creating FSM actor');

      try {
        // Create XState actor
        const xstateActor = createXStateActor(machine, {
          snapshot: input?.snapshot
            ? deserializeSnapshot(input.snapshot)
            : undefined,
          input: input?.context,
        });

        // Store reference in context (non-persisted ephemeral data)
        (ctx as any).xstateActor = xstateActor;

        // Subscribe to state changes
        xstateActor.subscribe({
          next: (snapshot: Snapshot<unknown>) => {
            logger.log('State transition:', snapshot.value);

            // Handle errors
            if (snapshot.status === 'error' && snapshot.error) {
              const error = snapshot.error as Error;
              logger.error('XState error:', error);

              if (errorHandling === 'crash') {
                throw error;
              } else if (errorHandling === 'callback' && errorCallback) {
                errorCallback(error, snapshot);
              }

              // Store error in state
              ctx.state.fsm.lastError = {
                message: error.message,
                timestamp: Date.now(),
              };
            }

            // Sync state based on strategy
            if (syncStrategy === 'on-transition') {
              syncStateToRivet(ctx, snapshot, persistenceMode, metadata);
            }
          },
          error: (error: Error) => {
            logger.error('XState actor error:', error);

            if (errorHandling === 'crash') {
              throw error;
            } else if (errorHandling === 'callback' && errorCallback) {
              errorCallback(error, xstateActor.getSnapshot());
            }
          },
          complete: () => {
            logger.log('XState actor completed');
          },
        });

        // Start the actor
        xstateActor.start();

        // Initial state sync
        const snapshot = xstateActor.getSnapshot();
        syncStateToRivet(ctx, snapshot, persistenceMode, metadata);

        logger.log('FSM actor initialized', {
          initialState: snapshot.value,
          persistenceMode,
        });
      } catch (error) {
        logger.error('Failed to create FSM actor:', error);
        throw error;
      }
    },

    /**
     * Handle HTTP requests - returns current state and accepts events
     */
    onRequest: async (ctx, request: Request): Promise<Response | void> => {
      const xstateActor = (ctx as any).xstateActor;
      if (!xstateActor) {
        return new Response('FSM actor not initialized', { status: 500 });
      }

      const url = new URL(request.url);

      // GET - Return current state
      if (request.method === 'GET' && url.pathname.endsWith('/state')) {
        const snapshot = xstateActor.getSnapshot();
        const response: FsmResponse = {
          state: snapshot.value,
          context: snapshot.context,
          done: snapshot.status === 'done',
          output: snapshot.output,
          error: ctx.state.fsm.lastError,
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // POST - Send event
      if (request.method === 'POST' && url.pathname.endsWith('/event')) {
        try {
          const event = await request.json();
          logger.log('Sending event via HTTP:', event);

          xstateActor.send(event);

          // Sync if manual strategy
          if (syncStrategy === 'on-event') {
            const snapshot = xstateActor.getSnapshot();
            syncStateToRivet(ctx, snapshot, persistenceMode, metadata);
          }

          const snapshot = xstateActor.getSnapshot();
          const response: FsmResponse = {
            state: snapshot.value,
            context: snapshot.context,
            done: snapshot.status === 'done',
            output: snapshot.output,
          };

          return new Response(JSON.stringify(response), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          logger.error('Failed to process event:', error);
          return new Response(
            JSON.stringify({ error: (error as Error).message }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      }

      // Let RivetKit handle other routes
      return;
    },

    /**
     * Handle WebSocket connections - bidirectional event streaming
     */
    onWebSocket: (ctx, ws: WebSocket) => {
      const xstateActor = (ctx as any).xstateActor;
      if (!xstateActor) {
        ws.close(1011, 'FSM actor not initialized');
        return;
      }

      logger.log('WebSocket connected');

      // Send initial state
      const initialSnapshot = xstateActor.getSnapshot();
      ws.send(
        JSON.stringify({
          type: 'STATE',
          state: initialSnapshot.value,
          context: initialSnapshot.context,
        })
      );

      // Subscribe to state changes and broadcast to this connection
      const unsubscribe = xstateActor.subscribe({
        next: (snapshot: Snapshot<unknown>) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'STATE',
                state: snapshot.value,
                context: snapshot.context,
                done: snapshot.status === 'done',
                output: snapshot.output,
              })
            );
          }
        },
      });

      // Handle incoming events from WebSocket
      ws.addEventListener('message', (event) => {
        try {
          const message: FsmWebSocketMessage = JSON.parse(event.data);
          logger.log('Received WebSocket event:', message);

          // Send event to XState machine
          xstateActor.send(message);

          // Sync if configured
          if (syncStrategy === 'on-event') {
            const snapshot = xstateActor.getSnapshot();
            syncStateToRivet(ctx, snapshot, persistenceMode, metadata);
          }
        } catch (error) {
          logger.error('Failed to process WebSocket message:', error);
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              error: (error as Error).message,
            })
          );
        }
      });

      // Cleanup on disconnect
      ws.addEventListener('close', () => {
        logger.log('WebSocket disconnected');
        unsubscribe();
      });
    },

    /**
     * Restore XState actor on wake from hibernation
     */
    onWake: async (ctx) => {
      logger.log('Waking FSM actor from hibernation');

      try {
        const storedState = ctx.state.fsm;

        // Recreate XState actor from persisted state
        const xstateActor = createXStateActor(machine, {
          snapshot: storedState.snapshot
            ? deserializeSnapshot(storedState.snapshot)
            : undefined,
        });

        // Store reference
        (ctx as any).xstateActor = xstateActor;

        // Re-subscribe to state changes
        xstateActor.subscribe({
          next: (snapshot: Snapshot<unknown>) => {
            if (syncStrategy === 'on-transition') {
              syncStateToRivet(ctx, snapshot, persistenceMode, metadata);
            }
          },
          error: (error: Error) => {
            logger.error('XState actor error after wake:', error);
            if (errorHandling === 'crash') {
              throw error;
            } else if (errorHandling === 'callback' && errorCallback) {
              errorCallback(error, xstateActor.getSnapshot());
            }
          },
        });

        // Start the actor
        xstateActor.start();

        logger.log('FSM actor restored', {
          currentState: xstateActor.getSnapshot().value,
        });
      } catch (error) {
        logger.error('Failed to wake FSM actor:', error);
        throw error;
      }
    },
  });
}

/**
 * Helper function to sync XState state to RivetKit persistent state
 */
function syncStateToRivet(
  ctx: any,
  snapshot: Snapshot<unknown>,
  mode: string,
  metadata: Record<string, unknown>
): void {
  switch (mode) {
    case 'full':
      ctx.state.fsm = snapshotToRivetState(snapshot, metadata);
      break;
    case 'context-only':
      ctx.state.fsm = contextToRivetState(snapshot, metadata);
      break;
    case 'none':
      ctx.state.fsm = minimalRivetState(metadata);
      break;
  }
}
