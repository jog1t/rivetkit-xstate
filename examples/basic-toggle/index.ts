/**
 * Basic Toggle FSM Actor Example
 *
 * This example demonstrates how to create a simple toggle state machine
 * as a RivetKit actor using rivetkit-xstate.
 *
 * Usage:
 * 1. Deploy this actor to Rivet
 * 2. Send events via WebSocket or HTTP POST to /event
 * 3. Query state via HTTP GET to /state
 */

import { createMachine } from 'xstate';
import { createFsmActor } from 'rivetkit-xstate';

// Define a simple toggle machine
const toggleMachine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  context: {
    count: 0,
  },
  states: {
    inactive: {
      on: {
        TOGGLE: {
          target: 'active',
          actions: ({ context }) => {
            context.count++;
          },
        },
      },
    },
    active: {
      on: {
        TOGGLE: {
          target: 'inactive',
          actions: ({ context }) => {
            context.count++;
          },
        },
      },
    },
  },
});

// Create the RivetKit actor
export const toggle = createFsmActor(toggleMachine, {
  persistenceMode: 'full',
  errorHandling: 'catch',
  debug: true,
  metadata: {
    name: 'Toggle Example',
    version: '1.0.0',
  },
});
