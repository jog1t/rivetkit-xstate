# Secure Chat Room Example

A comprehensive example demonstrating how to use rivetkit-xstate hooks for authentication, authorization, and security in a chat room application.

## Features Demonstrated

### Authentication & Authorization
- **beforeConnect**: Authenticate WebSocket connections with tokens
- **beforeEvent**: Role-based access control (RBAC) for all events
- **Event validation**: Message length, spam detection, banned user checks

### Roles
- **User**: Can send messages
- **Moderator**: Can send messages, ban users, set slow mode, clear messages
- **Admin**: Full control including lock/unlock room

### Audit Logging
- **afterEvent**: Complete audit trail of all actions
- **afterTransition**: State change logging
- **afterStateSync**: Persistence confirmation

### State Management
- **beforeTransition**: Business rule validation
- **beforeStateSync**: Custom persistence logic
- **onDisconnect**: Cleanup and logging

## State Machine

### States
- `open` - Normal chat operation
- `locked` - Room locked by admin

### Events

#### User-level Events
- `SEND_MESSAGE` - Send a chat message (all roles)

#### Moderator-level Events
- `BAN_USER` - Ban a user from the room
- `SET_SLOW_MODE` - Enable rate limiting
- `CLEAR_MESSAGES` - Clear all messages

#### Admin-level Events
- `LOCK_ROOM` - Lock the room (no messages allowed)
- `UNLOCK_ROOM` - Unlock the room

## Testing with RivetKit Actions

### Via RivetKit Client SDK

```typescript
import { RivetClient } from 'rivet-client';

const client = new RivetClient({ endpoint: 'http://localhost:3000' });
const chatActor = client.actor('secureChatRoom');

// Get current state
const state = await chatActor.call('getState');
console.log(state);

// Send message as user
try {
  await chatActor.call('sendEvent', {
    type: 'SEND_MESSAGE',
    userId: 'user3',
    userRole: 'user',
    user: 'Regular User',
    text: 'Hello world!',
  });
} catch (error) {
  console.error('Failed:', error); // Will fail if user is banned
}

// Try to ban user (will fail for non-moderators)
try {
  await chatActor.call('sendEvent', {
    type: 'BAN_USER',
    userId: 'user3',
    userRole: 'user', // Regular user
    targetUserId: 'user4',
  });
} catch (error) {
  console.error('Insufficient permissions'); // Expected
}

// Ban user as moderator (will succeed)
await chatActor.call('sendEvent', {
  type: 'BAN_USER',
  userId: 'user2',
  userRole: 'moderator',
  targetUserId: 'user4',
});

// Lock room as admin
await chatActor.call('sendEvent', {
  type: 'LOCK_ROOM',
  userId: 'user1',
  userRole: 'admin',
});
```

### Via WebSocket

```javascript
const ws = new WebSocket('ws://localhost:3000/actors/secureChatRoom/ws');

ws.onopen = () => {
  // Send authenticated message
  ws.send(JSON.stringify({
    type: 'SEND_MESSAGE',
    userId: 'user3',
    userRole: 'user',
    user: 'Regular User',
    text: 'Hello via WebSocket!'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'STATE') {
    console.log('State update:', data.state);
    console.log('Messages:', data.context.messages);
  } else if (data.type === 'ERROR') {
    console.error('Error:', data.error);
  }
};

// Try to send without permission (will be rejected)
ws.send(JSON.stringify({
  type: 'LOCK_ROOM',
  userId: 'user3',
  userRole: 'user' // Not an admin
}));
// WebSocket will receive ERROR message
```

## Expected Behaviors

### Successful Operations

```typescript
// ✅ User sends message
{ type: 'SEND_MESSAGE', userRole: 'user', text: 'Hi!' }
// → Succeeds

// ✅ Moderator bans user
{ type: 'BAN_USER', userRole: 'moderator', userId: 'baduser' }
// → Succeeds

// ✅ Admin locks room
{ type: 'LOCK_ROOM', userRole: 'admin' }
// → Succeeds
```

### Rejected Operations

```typescript
// ❌ User tries to ban
{ type: 'BAN_USER', userRole: 'user', userId: 'someone' }
// → Rejected: "Insufficient permissions"

// ❌ Banned user sends message
{ type: 'SEND_MESSAGE', userId: 'banneduser', text: 'Hello?' }
// → Rejected: "You are banned from sending messages"

// ❌ Empty message
{ type: 'SEND_MESSAGE', text: '' }
// → Rejected: "Message cannot be empty"

// ❌ Message too long
{ type: 'SEND_MESSAGE', text: 'x'.repeat(501) }
// → Rejected: "Message too long (max 500 characters)"

// ❌ Non-admin tries to unlock
{ type: 'UNLOCK_ROOM', userRole: 'moderator' }
// → Rejected: "Insufficient permissions. Admin role required"
```

## Hook Execution Flow

```
1. WebSocket Connection
   └─> beforeConnect (auth check)
       ├─> ✅ Allowed → Connection established
       └─> ❌ Rejected → Connection closed

2. Message Received
   └─> beforeMessage (could transform event)
       └─> beforeEvent (RBAC check)
           ├─> ✅ Allowed → Event sent to XState
           │   └─> State Transition
           │       └─> beforeTransition (business rules)
           │           └─> State Change
           │               └─> beforeStateSync
           │                   └─> State Persisted
           │                       └─> afterStateSync
           │                           └─> afterTransition
           │                               └─> afterEvent (audit log)
           │                                   └─> afterMessage
           └─> ❌ Rejected → Error sent to client

3. Disconnection
   └─> onDisconnect (cleanup)
```

## Real-World Enhancements

For production use, consider adding:

- **Token-based auth**: JWT validation in `beforeConnect`
- **Rate limiting**: Track message frequency per user
- **Content moderation**: Integrate profanity filters in `beforeEvent`
- **Message persistence**: Database writes in `afterEvent`
- **Webhooks**: Notify external systems in `afterTransition`
- **Metrics**: Track event counts, rejection rates
- **Session management**: Associate WebSocket with authenticated session
- **IP blocking**: Check IP addresses in `beforeConnect`
- **Encrypted messages**: Decrypt in `beforeMessage`

## Key Takeaways

1. **beforeConnect**: Perfect for authentication and connection limits
2. **beforeEvent**: Ideal for RBAC, validation, and guards
3. **afterEvent**: Use for audit logging and side effects
4. **beforeTransition**: Business rule validation (though can't prevent)
5. **onDisconnect**: Cleanup and session management

This pattern makes it easy to build secure, auditable, real-time applications with clear separation of concerns.
