# Traffic Light Example

A more complex example showing a traffic light state machine with multiple states and event handling.

## State Machine

The traffic light has three states:
- `red` - Stop (initial state)
- `yellow` - Caution
- `green` - Go

## Events

- `TIMER` - Advances to the next state in the cycle
- `EMERGENCY` - Immediately switches to yellow (emergency mode)
- `EMERGENCY_CLEAR` - Clears emergency mode and returns to red

## Context

- `cycleCount` - Number of complete cycles (increments each time red is entered)
- `emergencyMode` - Boolean indicating if in emergency mode

## State Transitions

Normal flow:
```
red → (TIMER) → green → (TIMER) → yellow → (TIMER) → red
```

Emergency flow:
```
any state → (EMERGENCY) → yellow → (EMERGENCY_CLEAR) → red
```

## Testing the Actor

### Simulate Normal Traffic Flow

```bash
# Check initial state (should be red)
curl http://localhost:3000/actors/trafficLight/http/state

# Progress through cycle
curl -X POST http://localhost:3000/actors/trafficLight/http/event \
  -H "Content-Type: application/json" \
  -d '{"type":"TIMER"}'

# Now in green, send another TIMER
curl -X POST http://localhost:3000/actors/trafficLight/http/event \
  -H "Content-Type: application/json" \
  -d '{"type":"TIMER"}'

# Now in yellow, one more TIMER to complete cycle
curl -X POST http://localhost:3000/actors/trafficLight/http/event \
  -H "Content-Type: application/json" \
  -d '{"type":"TIMER"}'

# Back to red, cycleCount should be 2
```

### Trigger Emergency Mode

```bash
# From any state, trigger emergency
curl -X POST http://localhost:3000/actors/trafficLight/http/event \
  -H "Content-Type: application/json" \
  -d '{"type":"EMERGENCY"}'

# Clear emergency
curl -X POST http://localhost:3000/actors/trafficLight/http/event \
  -H "Content-Type: application/json" \
  -d '{"type":"EMERGENCY_CLEAR"}'
```

### Via WebSocket for Realtime Updates

```javascript
const ws = new WebSocket('ws://localhost:3000/actors/trafficLight/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Light:', data.state);
  console.log('Cycle count:', data.context.cycleCount);
  console.log('Emergency:', data.context.emergencyMode);
};

// Simulate traffic cycle
setInterval(() => {
  ws.send(JSON.stringify({ type: 'TIMER' }));
}, 3000);
```

## Features Demonstrated

- Multiple state transitions
- Context mutations
- Entry actions
- Event-driven state changes
- Custom error handling with callback
- Metadata attachment
