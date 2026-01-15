# rivetkit-xstate

Embed [XState](https://stately.ai/docs/xstate) finite state machines as [RivetKit](https://rivet.dev) actors.

## Features

- **Seamless Integration**: Run XState machines as long-lived RivetKit actors
- **Full State Persistence**: State automatically persists across hibernation cycles
- **Realtime Updates**: WebSocket support for live state synchronization
- **Comprehensive Hooks**: Authentication, authorization, validation, and audit logging
- **RivetKit Actions**: Type-safe actor operations via built-in action system
- **Flexible Configuration**: Choose your persistence mode, error handling, and sync strategy
- **Type-Safe**: Full TypeScript support with type inference
- **Zero Config**: Works out of the box with sensible defaults

## Installation

```bash
npm install rivetkit-xstate xstate rivet
# or
pnpm add rivetkit-xstate xstate rivet
# or
yarn add rivetkit-xstate xstate rivet
```

## Quick Start

```typescript
import { createMachine } from 'xstate';
import { createFsmActor } from 'rivetkit-xstate';

// Define your XState machine
const toggleMachine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  context: { count: 0 },
  states: {
    inactive: {
      on: {
        TOGGLE: {
          target: 'active',
          actions: ({ context }) => { context.count++; }
        }
      }
    },
    active: {
      on: {
        TOGGLE: {
          target: 'inactive',
          actions: ({ context }) => { context.count++; }
        }
      }
    }
  }
});

// Create a RivetKit actor from the machine
export const toggle = createFsmActor(toggleMachine, {
  persistenceMode: 'full',
  debug: true
});
```

## Usage

### Using RivetKit Actions

The FSM actor exposes three built-in actions:

**Via RivetKit Client SDK:**
```typescript
import { RivetClient } from 'rivet-client';

const client = new RivetClient({ endpoint: 'http://localhost:3000' });
const toggleActor = client.actor('toggle');

// Get current state
const state = await toggleActor.call('getState');
console.log(state); // { state: 'inactive', context: { count: 0 }, done: false }

// Send event
const newState = await toggleActor.call('sendEvent', { type: 'TOGGLE' });
console.log(newState); // { state: 'active', context: { count: 1 }, done: false }

// Manually trigger state sync
await toggleActor.call('syncState');
```

### Using WebSocket

**Realtime bidirectional communication:**
```javascript
const ws = new WebSocket('ws://localhost:3000/actors/toggle/ws');

// Receive initial state and updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'STATE') {
    console.log('State:', data.state);
    console.log('Context:', data.context);
  } else if (data.type === 'ERROR') {
    console.error('Error:', data.error);
  }
};

// Send events
ws.send(JSON.stringify({ type: 'TOGGLE' }));
```

### Available Actions

| Action | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `getState` | None | `FsmResponse` | Get current FSM state |
| `sendEvent` | `EventObject` | Updated state | Send event to FSM |
| `syncState` | None | `{ success: boolean }` | Force state sync |

## Configuration

### FsmActorConfig Options

```typescript
interface FsmActorConfig {
  /**
   * How to persist XState state across hibernation
   * - 'full': Persist entire state snapshot (default, recommended)
   * - 'context-only': Only persist context and state value
   * - 'none': No persistence (stateless)
   */
  persistenceMode?: 'full' | 'context-only' | 'none';

  /**
   * How to handle errors from the XState machine
   * - 'crash': Let errors crash the actor (default)
   * - 'catch': Catch errors and expose via error state
   * - 'callback': Call custom error handler
   */
  errorHandling?: 'crash' | 'catch' | 'callback';

  /**
   * Custom error handler (when errorHandling is 'callback')
   */
  errorCallback?: (error: Error, snapshot: Snapshot<unknown>) => void;

  /**
   * When to sync state to RivetKit
   * - 'on-transition': After each state transition (default)
   * - 'on-event': After each event
   * - 'manual': Only when manually triggered
   */
  syncStrategy?: 'on-transition' | 'on-event' | 'manual';

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Additional metadata to attach to the actor
   */
  metadata?: Record<string, unknown>;

  /**
   * Hibernation delay in milliseconds
   */
  hibernationDelay?: number;
}
```

### Persistence Modes

#### Full Persistence (Recommended)
```typescript
createFsmActor(machine, { persistenceMode: 'full' });
```
- Persists complete XState snapshot
- Supports all XState features including history states
- Slightly larger state footprint
- Best for most use cases

#### Context-Only Persistence
```typescript
createFsmActor(machine, { persistenceMode: 'context-only' });
```
- Only persists context and current state value
- Smaller state size
- May lose some XState internal state
- Good for simple machines with minimal state

#### No Persistence
```typescript
createFsmActor(machine, { persistenceMode: 'none' });
```
- No state persistence
- Actor resets on every wake
- Useful for ephemeral/stateless operations

### Error Handling

#### Crash Mode (Default)
```typescript
createFsmActor(machine, { errorHandling: 'crash' });
```
Errors crash the actor (fail-fast behavior).

#### Catch Mode
```typescript
createFsmActor(machine, { errorHandling: 'catch' });
```
Errors are caught and exposed in the `lastError` field of state.

#### Callback Mode
```typescript
createFsmActor(machine, {
  errorHandling: 'callback',
  errorCallback: (error, snapshot) => {
    console.error('Machine error:', error);
    // Send to monitoring service, etc.
  }
});
```
Custom error handling logic.

## Hooks

Hooks allow you to inject custom logic at various points in the actor lifecycle. Perfect for authentication, authorization, validation, and audit logging.

### Available Hooks

#### Lifecycle Hooks

**beforeCreate / afterCreate**
```typescript
hooks: {
  beforeCreate: async ({ state, input, metadata }) => {
    // Validate creation, check quotas, etc.
    return { allowed: true };
  },
  afterCreate: async ({ state, input, metadata }) => {
    // Log creation, notify monitoring, etc.
  }
}
```

**beforeWake / afterWake**
```typescript
hooks: {
  beforeWake: async ({ state, metadata }) => {
    // Check if wake is allowed
    return { allowed: true };
  },
  afterWake: async ({ state, metadata }) => {
    // Reinitialize resources after hibernation
  }
}
```

#### WebSocket Hooks

**beforeConnect**
```typescript
hooks: {
  beforeConnect: async ({ ws, snapshot, state, metadata }) => {
    // Authenticate WebSocket connection
    const token = extractToken(ws);
    const user = await authenticateToken(token);

    if (!user) {
      return { allowed: false, reason: 'Invalid token' };
    }

    return { allowed: true };
  }
}
```

**onDisconnect**
```typescript
hooks: {
  onDisconnect: async ({ ws, snapshot, state, metadata }) => {
    // Cleanup, update online status, etc.
    console.log('User disconnected');
  }
}
```

**beforeMessage / afterMessage**
```typescript
hooks: {
  beforeMessage: async ({ ws, snapshot, state, metadata, message }) => {
    // Validate message, rate limit, etc.
    if (message.text.length > 500) {
      return { allowed: false, reason: 'Message too long' };
    }

    // Can transform the event
    return {
      allowed: true,
      event: { ...message, timestamp: Date.now() }
    };
  },
  afterMessage: async ({ ws, snapshot, state, metadata, message }) => {
    // Log message, update metrics, etc.
  }
}
```

#### Event Hooks

**beforeEvent / afterEvent**
```typescript
hooks: {
  beforeEvent: async ({ event, snapshot, state, source }) => {
    // Role-based access control
    const userRole = event.userRole;

    if (event.type === 'DELETE' && userRole !== 'admin') {
      return { allowed: false, reason: 'Admin only' };
    }

    // Can transform the event
    return {
      allowed: true,
      event: { ...event, processedAt: Date.now() }
    };
  },
  afterEvent: async ({ event, snapshot, state, source }) => {
    // Audit log
    console.log('[AUDIT]', {
      event: event.type,
      state: snapshot.value,
      source
    });
  }
}
```

#### Transition Hooks

**beforeTransition / afterTransition**
```typescript
hooks: {
  beforeTransition: async ({
    previousSnapshot,
    currentSnapshot,
    event,
    state
  }) => {
    // Validate transition (note: can't actually prevent at this point)
    // Use beforeEvent to prevent transitions proactively
    console.log(`Transitioning: ${previousSnapshot.value} → ${currentSnapshot.value}`);
    return { allowed: true };
  },
  afterTransition: async ({
    previousSnapshot,
    currentSnapshot,
    event,
    state
  }) => {
    // Notify external systems, trigger side effects
    if (currentSnapshot.value === 'completed') {
      await notifyCompletion();
    }
  }
}
```

#### State Sync Hooks

**beforeStateSync / afterStateSync**
```typescript
hooks: {
  beforeStateSync: async ({ snapshot, state, persistenceMode }) => {
    // Control when state is persisted
    const messageCount = snapshot.context?.messages?.length || 0;

    if (messageCount > 10000) {
      return { allowed: false, reason: 'Too many messages' };
    }

    return { allowed: true };
  },
  afterStateSync: async ({ snapshot, state, persistenceMode }) => {
    // Trigger cache updates, webhooks, etc.
    await updateCache(snapshot);
  }
}
```

### Common Use Cases

#### Authentication & Authorization
```typescript
export const secureActor = createFsmActor(machine, {
  hooks: {
    beforeConnect: authenticateWebSocket,
    beforeEvent: checkPermissions,
    afterEvent: auditLog,
  }
});
```

#### Rate Limiting
```typescript
const rateLimiter = new Map();

export const limitedActor = createFsmActor(machine, {
  hooks: {
    beforeEvent: async ({ event }) => {
      const userId = event.userId;
      const count = rateLimiter.get(userId) || 0;

      if (count > 100) {
        return { allowed: false, reason: 'Rate limit exceeded' };
      }

      rateLimiter.set(userId, count + 1);
      return { allowed: true };
    }
  }
});
```

#### Validation
```typescript
export const validatedActor = createFsmActor(machine, {
  hooks: {
    beforeEvent: async ({ event, snapshot }) => {
      // Validate event payload
      if (event.type === 'UPDATE' && !event.data) {
        return { allowed: false, reason: 'Missing data' };
      }

      // Validate state constraints
      if (snapshot.value === 'locked') {
        return { allowed: false, reason: 'State is locked' };
      }

      return { allowed: true };
    }
  }
});
```

### Hook Return Types

Hooks that can reject operations return `CallbackResult`:

```typescript
type CallbackResult =
  | { allowed: true; reason?: never }
  | { allowed: false; reason: string };
```

Some hooks can also transform events:

```typescript
type EventTransformResult =
  | CallbackResult
  | { allowed: true; event?: EventObject };
```

## Examples

See the [`examples/`](./examples) directory for complete examples:

- **[basic-toggle](./examples/basic-toggle)** - Simple two-state toggle machine
- **[traffic-light](./examples/traffic-light)** - Multi-state machine with complex transitions
- **[secure-chat](./examples/secure-chat)** - Chat room with authentication, authorization, and hooks

## Architecture

### Integration Flow

```
┌─────────────────────────────────────────────┐
│         RivetKit Actor Interface            │
│  (onCreate, onWake, onRequest, onWebSocket) │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│       FSM Actor Adapter Layer               │
│  • Event mapping (Rivet ↔ XState)          │
│  • State synchronization                    │
│  • Lifecycle coordination                   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         XState State Machine                │
│  • Machine definition                       │
│  • Context management                       │
│  • Transition logic                         │
└─────────────────────────────────────────────┘
```

### Lifecycle

1. **onCreate**: XState actor is created and started, state is synced to RivetKit
2. **onRequest**: HTTP requests query state or send events
3. **onWebSocket**: WebSocket connections enable realtime bidirectional communication
4. **Hibernation**: State is persisted to RivetKit storage
5. **onWake**: XState actor is recreated from persisted state

## API Reference

### createFsmActor(machine, config?)

Creates a RivetKit actor from an XState machine.

**Parameters:**
- `machine` - XState machine definition (from `createMachine()`)
- `config` - Optional configuration object (see FsmActorConfig)

**Returns:** RivetKit actor ready for deployment

### RivetKit Actions

The FSM actor automatically exposes these actions via RivetKit's action system:

#### `getState()`

Get the current FSM state.

**Parameters:** None

**Returns:** `FsmResponse`
```typescript
{
  state: unknown;        // Current state value
  context: unknown;      // Current context
  done: boolean;         // Whether in final state
  output?: unknown;      // Output if in final state
  error?: {              // Last error (if any)
    message: string;
    timestamp: number;
  };
}
```

**Example:**
```typescript
const state = await actor.call('getState');
```

#### `sendEvent(event)`

Send an event to the FSM.

**Parameters:**
- `event: EventObject` - The event to send to the machine

**Returns:** Updated state (same structure as `FsmResponse`)

**Example:**
```typescript
const newState = await actor.call('sendEvent', {
  type: 'TOGGLE',
  userId: '123',
  timestamp: Date.now()
});
```

#### `syncState()`

Manually trigger state synchronization to RivetKit storage.

**Parameters:** None

**Returns:** `{ success: boolean }`

**Example:**
```typescript
await actor.call('syncState');
```

### WebSocket Protocol

**Client → Server (Send Events):**
```json
{
  "type": "EVENT_NAME",
  ...eventPayload
}
```

**Server → Client (State Updates):**
```json
{
  "type": "STATE",
  "state": "currentState",
  "context": { ... },
  "done": false,
  "output": null
}
```

**Server → Client (Errors):**
```json
{
  "type": "ERROR",
  "error": "Error message"
}
```

## Roadmap

- [ ] Child actor spawning as separate RivetKit actors
- [ ] XState Inspector integration
- [ ] Actor registry for child actor lookup
- [ ] Parallel state machine support testing
- [ ] History state preservation improvements
- [ ] Performance optimizations

## Contributing

Contributions are welcome! Please open an issue or PR.

## License

MIT

## Resources

- [XState Documentation](https://stately.ai/docs/xstate)
- [RivetKit Documentation](https://rivet.dev/docs)
- [Examples](./examples)

---

Built with ❤️ for the RivetKit and XState communities.
