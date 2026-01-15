import { actor } from 'rivet';
import {
  type AnyStateMachine,
  createActor as createXStateActor,
  type Snapshot,
  type EventObject,
} from 'xstate';
import type {
  FsmActorConfig,
  FsmActorState,
  FsmWebSocketMessage,
  FsmResponse,
  CallbackResult,
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
 * Helper to check callback result and throw if rejected
 */
function checkCallbackResult(result: CallbackResult, operation: string): void {
  if (!result.allowed) {
    throw new Error(`${operation} rejected: ${result.reason}`);
  }
}

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
 * export const toggle = createFsmActor(toggleMachine, {
 *   persistenceMode: 'full',
 *   debug: true,
 *   hooks: {
 *     beforeEvent: async (ctx) => {
 *       // Check permissions, validate event, etc.
 *       return { allowed: true };
 *     }
 *   }
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
    hooks = {},
  } = config;

  const logger = new Logger(debug, `[rivetkit-xstate:${machine.id || 'fsm'}]`);

  // Store previous snapshot for transition callbacks
  let previousSnapshot: Snapshot<unknown> | null = null;
  let lastEvent: EventObject | null = null;

  return actor({
    state: {
      fsm: {} as FsmActorState,
    },

    /**
     * Initialize the XState actor when the RivetKit actor is created
     */
    onCreate: async (ctx, input?: { snapshot?: string; context?: unknown }) => {
      logger.log('Creating FSM actor');

      // Call beforeCreate hook
      if (hooks.beforeCreate) {
        const result = await hooks.beforeCreate({
          state: ctx.state.fsm,
          input,
          metadata,
        });
        checkCallbackResult(result, 'Actor creation');
      }

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
        (ctx as any).hooks = hooks;
        (ctx as any).persistenceMode = persistenceMode;
        (ctx as any).metadata = metadata;

        // Subscribe to state changes
        xstateActor.subscribe({
          next: async (snapshot: Snapshot<unknown>) => {
            logger.log('State transition:', snapshot.value);

            // Call beforeTransition hook
            if (hooks.beforeTransition && previousSnapshot) {
              try {
                const result = await hooks.beforeTransition({
                  previousSnapshot,
                  currentSnapshot: snapshot,
                  event: lastEvent || { type: 'INIT' },
                  state: ctx.state.fsm,
                });
                checkCallbackResult(result, 'State transition');
              } catch (error) {
                logger.error('beforeTransition hook rejected:', error);
                // Note: Can't actually roll back transition at this point
                // Use beforeEvent hook to prevent transitions proactively
              }
            }

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
              await syncStateToRivet(
                ctx,
                snapshot,
                persistenceMode,
                metadata,
                hooks,
                logger
              );
            }

            // Call afterTransition hook
            if (hooks.afterTransition && previousSnapshot) {
              await hooks.afterTransition({
                previousSnapshot,
                currentSnapshot: snapshot,
                event: lastEvent || { type: 'INIT' },
                state: ctx.state.fsm,
              });
            }

            // Update previous snapshot for next transition
            previousSnapshot = snapshot;
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
        previousSnapshot = snapshot;
        await syncStateToRivet(
          ctx,
          snapshot,
          persistenceMode,
          metadata,
          hooks,
          logger
        );

        logger.log('FSM actor initialized', {
          initialState: snapshot.value,
          persistenceMode,
        });

        // Call afterCreate hook
        if (hooks.afterCreate) {
          await hooks.afterCreate({
            state: ctx.state.fsm,
            input,
            metadata,
          });
        }
      } catch (error) {
        logger.error('Failed to create FSM actor:', error);
        throw error;
      }
    },

    /**
     * Restore XState actor on wake from hibernation
     */
    onWake: async (ctx) => {
      logger.log('Waking FSM actor from hibernation');

      // Call beforeWake hook
      if (hooks.beforeWake) {
        const result = await hooks.beforeWake({
          state: ctx.state.fsm,
          metadata,
        });
        checkCallbackResult(result, 'Actor wake');
      }

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
        (ctx as any).hooks = hooks;
        (ctx as any).persistenceMode = persistenceMode;
        (ctx as any).metadata = metadata;

        // Re-subscribe to state changes
        xstateActor.subscribe({
          next: async (snapshot: Snapshot<unknown>) => {
            if (hooks.beforeTransition && previousSnapshot) {
              try {
                const result = await hooks.beforeTransition({
                  previousSnapshot,
                  currentSnapshot: snapshot,
                  event: lastEvent || { type: 'WAKE' },
                  state: ctx.state.fsm,
                });
                checkCallbackResult(result, 'State transition');
              } catch (error) {
                logger.error('beforeTransition hook rejected:', error);
              }
            }

            if (syncStrategy === 'on-transition') {
              await syncStateToRivet(
                ctx,
                snapshot,
                persistenceMode,
                metadata,
                hooks,
                logger
              );
            }

            if (hooks.afterTransition && previousSnapshot) {
              await hooks.afterTransition({
                previousSnapshot,
                currentSnapshot: snapshot,
                event: lastEvent || { type: 'WAKE' },
                state: ctx.state.fsm,
              });
            }

            previousSnapshot = snapshot;
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
        previousSnapshot = xstateActor.getSnapshot();

        logger.log('FSM actor restored', {
          currentState: xstateActor.getSnapshot().value,
        });

        // Call afterWake hook
        if (hooks.afterWake) {
          await hooks.afterWake({
            state: ctx.state.fsm,
            metadata,
          });
        }
      } catch (error) {
        logger.error('Failed to wake FSM actor:', error);
        throw error;
      }
    },

    /**
     * RivetKit actions - type-safe actor operations
     */
    actions: {
      /**
       * Get current FSM state
       */
      getState: (ctx): FsmResponse => {
        const xstateActor = (ctx as any).xstateActor;
        if (!xstateActor) {
          throw new Error('FSM actor not initialized');
        }

        const snapshot = xstateActor.getSnapshot();
        return {
          state: snapshot.value,
          context: snapshot.context,
          done: snapshot.status === 'done',
          output: snapshot.output,
          error: ctx.state.fsm.lastError,
        };
      },

      /**
       * Send an event to the FSM
       */
      sendEvent: async (ctx, event: EventObject) => {
        const xstateActor = (ctx as any).xstateActor;
        const hooks = (ctx as any).hooks || {};
        const persistenceMode = (ctx as any).persistenceMode;
        const metadata = (ctx as any).metadata;

        if (!xstateActor) {
          throw new Error('FSM actor not initialized');
        }

        const snapshot = xstateActor.getSnapshot();

        // Call beforeEvent hook
        if (hooks.beforeEvent) {
          const result = await hooks.beforeEvent({
            event,
            snapshot,
            state: ctx.state.fsm,
            source: 'internal',
          });

          if ('allowed' in result && !result.allowed) {
            throw new Error(`Event rejected: ${result.reason}`);
          }

          // Check if event was transformed
          if ('event' in result && result.event) {
            event = result.event;
          }
        }

        logger.log('Sending event:', event);
        lastEvent = event;

        // Send event to XState
        xstateActor.send(event);

        // Sync if configured
        if (syncStrategy === 'on-event') {
          const newSnapshot = xstateActor.getSnapshot();
          await syncStateToRivet(
            ctx,
            newSnapshot,
            persistenceMode,
            metadata,
            hooks,
            logger
          );
        }

        // Call afterEvent hook
        if (hooks.afterEvent) {
          await hooks.afterEvent({
            event,
            snapshot: xstateActor.getSnapshot(),
            state: ctx.state.fsm,
            source: 'internal',
          });
        }

        // Return updated state
        const newSnapshot = xstateActor.getSnapshot();
        return {
          state: newSnapshot.value,
          context: newSnapshot.context,
          done: newSnapshot.status === 'done',
          output: newSnapshot.output,
        };
      },

      /**
       * Manually trigger state synchronization
       */
      syncState: async (ctx) => {
        const xstateActor = (ctx as any).xstateActor;
        const hooks = (ctx as any).hooks || {};
        const persistenceMode = (ctx as any).persistenceMode;
        const metadata = (ctx as any).metadata;

        if (!xstateActor) {
          throw new Error('FSM actor not initialized');
        }

        const snapshot = xstateActor.getSnapshot();
        await syncStateToRivet(
          ctx,
          snapshot,
          persistenceMode,
          metadata,
          hooks,
          logger
        );

        return { success: true };
      },
    },

    /**
     * Handle WebSocket connections - bidirectional event streaming
     */
    onWebSocket: async (ctx, ws: WebSocket) => {
      const xstateActor = (ctx as any).xstateActor;
      const hooks = (ctx as any).hooks || {};
      const persistenceMode = (ctx as any).persistenceMode;
      const metadata = (ctx as any).metadata;

      if (!xstateActor) {
        ws.close(1011, 'FSM actor not initialized');
        return;
      }

      const snapshot = xstateActor.getSnapshot();

      // Call beforeConnect hook
      if (hooks.beforeConnect) {
        try {
          const result = await hooks.beforeConnect({
            ws,
            snapshot,
            state: ctx.state.fsm,
            metadata,
          });

          if (!result.allowed) {
            ws.close(1008, `Connection rejected: ${result.reason}`);
            return;
          }
        } catch (error) {
          logger.error('beforeConnect hook failed:', error);
          ws.close(1011, 'Connection hook failed');
          return;
        }
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
      ws.addEventListener('message', async (msgEvent) => {
        try {
          const message: FsmWebSocketMessage = JSON.parse(msgEvent.data);

          // Call beforeMessage hook
          if (hooks.beforeMessage) {
            const result = await hooks.beforeMessage({
              ws,
              snapshot: xstateActor.getSnapshot(),
              state: ctx.state.fsm,
              metadata,
              message,
            });

            if ('allowed' in result && !result.allowed) {
              ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  error: `Message rejected: ${result.reason}`,
                })
              );
              return;
            }

            // Check if event was transformed
            if ('event' in result && result.event) {
              lastEvent = result.event;
              xstateActor.send(result.event);
            } else {
              lastEvent = message;
              xstateActor.send(message);
            }
          } else {
            lastEvent = message;
            xstateActor.send(message);
          }

          logger.log('Received WebSocket event:', message);

          // Sync if configured
          if (syncStrategy === 'on-event') {
            const snapshot = xstateActor.getSnapshot();
            await syncStateToRivet(
              ctx,
              snapshot,
              persistenceMode,
              metadata,
              hooks,
              logger
            );
          }

          // Call afterMessage hook
          if (hooks.afterMessage) {
            await hooks.afterMessage({
              ws,
              snapshot: xstateActor.getSnapshot(),
              state: ctx.state.fsm,
              metadata,
              message,
            });
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
      ws.addEventListener('close', async () => {
        logger.log('WebSocket disconnected');
        unsubscribe();

        // Call onDisconnect hook
        if (hooks.onDisconnect) {
          await hooks.onDisconnect({
            ws,
            snapshot: xstateActor.getSnapshot(),
            state: ctx.state.fsm,
            metadata,
          });
        }
      });
    },
  });
}

/**
 * Helper function to sync XState state to RivetKit persistent state
 */
async function syncStateToRivet(
  ctx: any,
  snapshot: Snapshot<unknown>,
  mode: string,
  metadata: Record<string, unknown>,
  hooks: any,
  logger: Logger
): Promise<void> {
  // Call beforeStateSync hook
  if (hooks.beforeStateSync) {
    try {
      const result = await hooks.beforeStateSync({
        snapshot,
        state: ctx.state.fsm,
        persistenceMode: mode,
      });

      if (!result.allowed) {
        logger.warn('State sync rejected:', result.reason);
        return;
      }
    } catch (error) {
      logger.error('beforeStateSync hook failed:', error);
      return;
    }
  }

  // Perform sync
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

  // Call afterStateSync hook
  if (hooks.afterStateSync) {
    await hooks.afterStateSync({
      snapshot,
      state: ctx.state.fsm,
      persistenceMode: mode,
    });
  }
}
