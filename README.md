# rivetkit-xstate

Embed [XState](https://stately.ai/docs/xstate) finite state machines as [RivetKit](https://rivet.dev) actors.

## Features

- **Seamless Integration**: Run XState machines as long-lived RivetKit actors
- **Full State Persistence**: State automatically persists across hibernation cycles
- **Realtime Updates**: WebSocket support for live state synchronization
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

### Sending Events

**Via HTTP:**
```bash
curl -X POST http://localhost:3000/actors/toggle/http/event \
  -H "Content-Type: application/json" \
  -d '{"type":"TOGGLE"}'
```

**Via WebSocket:**
```javascript
const ws = new WebSocket('ws://localhost:3000/actors/toggle/ws');

// Send event
ws.send(JSON.stringify({ type: 'TOGGLE' }));

// Receive state updates
ws.onmessage = (event) => {
  const { state, context } = JSON.parse(event.data);
  console.log('New state:', state, 'Context:', context);
};
```

### Querying State

**Via HTTP:**
```bash
curl http://localhost:3000/actors/toggle/http/state
```

**Response:**
```json
{
  "state": "active",
  "context": { "count": 5 },
  "done": false,
  "output": null
}
```

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

## Examples

See the [`examples/`](./examples) directory for complete examples:

- **[basic-toggle](./examples/basic-toggle)** - Simple two-state toggle machine
- **[traffic-light](./examples/traffic-light)** - Multi-state machine with complex transitions

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
- `config` - Optional configuration object

**Returns:** RivetKit actor ready for deployment

### HTTP Endpoints

When deployed, your FSM actor exposes:

- `GET /actors/{actorName}/http/state` - Get current state
- `POST /actors/{actorName}/http/event` - Send event to machine

### WebSocket Events

**Client → Server (Events):**
```json
{ "type": "EVENT_NAME", ...payload }
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
