# Basic Toggle Example

A simple example demonstrating how to use rivetkit-xstate to create a toggle state machine as a RivetKit actor.

## State Machine

The toggle machine has two states:
- `inactive` - Initial state
- `active` - Toggled state

## Events

- `TOGGLE` - Switches between inactive and active states

## Context

- `count` - Tracks how many times the toggle has been switched

## Testing the Actor

### Via HTTP

**Get current state:**
```bash
curl http://localhost:3000/actors/toggle/http/state
```

**Send TOGGLE event:**
```bash
curl -X POST http://localhost:3000/actors/toggle/http/event \
  -H "Content-Type: application/json" \
  -d '{"type":"TOGGLE"}'
```

### Via WebSocket

```javascript
const ws = new WebSocket('ws://localhost:3000/actors/toggle/ws');

// Receive state updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('State:', data.state);
  console.log('Context:', data.context);
};

// Send TOGGLE event
ws.send(JSON.stringify({ type: 'TOGGLE' }));
```

## Expected Behavior

1. Initial state: `inactive`, count: 0
2. After first TOGGLE: `active`, count: 1
3. After second TOGGLE: `inactive`, count: 2
4. And so on...

The state persists across hibernation cycles thanks to the `persistenceMode: 'full'` configuration.
