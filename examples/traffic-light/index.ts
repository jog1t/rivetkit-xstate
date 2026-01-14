/**
 * Traffic Light FSM Actor Example
 *
 * This example demonstrates a more complex state machine with timed transitions
 * and multiple states. Shows how XState's timer features work within RivetKit.
 */

import { createMachine } from 'xstate';
import { createFsmActor } from 'rivetkit-xstate';

// Define a traffic light machine with automatic transitions
const trafficLightMachine = createMachine({
  id: 'trafficLight',
  initial: 'red',
  context: {
    cycleCount: 0,
    emergencyMode: false,
  },
  states: {
    red: {
      entry: ({ context }) => {
        context.cycleCount++;
      },
      on: {
        TIMER: 'green',
        EMERGENCY: 'yellow',
      },
      // In a real deployment, you'd use after: { 5000: 'green' }
      // but for manual testing, we'll use explicit events
    },
    yellow: {
      on: {
        TIMER: 'red',
        EMERGENCY_CLEAR: {
          target: 'red',
          actions: ({ context }) => {
            context.emergencyMode = false;
          },
        },
      },
    },
    green: {
      on: {
        TIMER: 'yellow',
        EMERGENCY: {
          target: 'yellow',
          actions: ({ context }) => {
            context.emergencyMode = true;
          },
        },
      },
    },
  },
});

// Create the RivetKit actor
export const trafficLight = createFsmActor(trafficLightMachine, {
  persistenceMode: 'full',
  errorHandling: 'callback',
  errorCallback: (error, snapshot) => {
    console.error('Traffic light error:', error);
    console.error('State at error:', snapshot.value);
  },
  debug: true,
  metadata: {
    name: 'Traffic Light Example',
    location: 'Main & 1st',
  },
});
