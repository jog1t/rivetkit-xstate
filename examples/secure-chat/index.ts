/**
 * Secure Chat Room FSM Actor with Authentication & Authorization
 *
 * This example demonstrates how to use hooks for:
 * - WebSocket connection authentication
 * - Role-based access control for events
 * - State transition guards
 * - Audit logging
 */

import { createMachine, assign } from 'xstate';
import { createFsmActor } from 'rivetkit-xstate';

// Mock user database
const users = {
  'token-admin': { id: 'user1', role: 'admin', name: 'Admin User' },
  'token-mod': { id: 'user2', role: 'moderator', name: 'Mod User' },
  'token-user': { id: 'user3', role: 'user', name: 'Regular User' },
};

// Extract token from WebSocket URL or message
function extractToken(ws: WebSocket): string | null {
  // In real app, parse from ws.url or first message
  return 'token-user'; // Simplified for example
}

function authenticateToken(token: string | null) {
  if (!token) return null;
  return users[token as keyof typeof users] || null;
}

// Define chat room state machine
const chatRoomMachine = createMachine({
  id: 'chatRoom',
  initial: 'open',
  context: {
    messages: [] as Array<{
      user: string;
      text: string;
      timestamp: number;
    }>,
    bannedUsers: [] as string[],
    mode: 'normal' as 'normal' | 'slow' | 'locked',
  },
  states: {
    open: {
      on: {
        SEND_MESSAGE: {
          actions: assign(({ context, event }) => {
            context.messages.push({
              user: event.user,
              text: event.text,
              timestamp: Date.now(),
            });
          }),
        },
        BAN_USER: {
          actions: assign(({ context, event }) => {
            context.bannedUsers.push(event.userId);
          }),
        },
        SET_SLOW_MODE: {
          actions: assign(({ context }) => {
            context.mode = 'slow';
          }),
        },
        LOCK_ROOM: 'locked',
        CLEAR_MESSAGES: {
          actions: assign(({ context }) => {
            context.messages = [];
          }),
        },
      },
    },
    locked: {
      on: {
        UNLOCK_ROOM: 'open',
      },
    },
  },
});

// Create FSM actor with comprehensive hooks
export const secureChatRoom = createFsmActor(chatRoomMachine, {
  persistenceMode: 'full',
  debug: true,
  hooks: {
    /**
     * Authenticate WebSocket connections
     */
    beforeConnect: async ({ ws, snapshot }) => {
      const token = extractToken(ws);
      const user = authenticateToken(token);

      if (!user) {
        return {
          allowed: false,
          reason: 'Invalid authentication token',
        };
      }

      // Check if user is banned
      const bannedUsers = snapshot.context?.bannedUsers || [];
      if (bannedUsers.includes(user.id)) {
        return {
          allowed: false,
          reason: 'User is banned from this chat room',
        };
      }

      console.log(`User ${user.name} (${user.role}) connected`);
      return { allowed: true };
    },

    /**
     * Log disconnections
     */
    onDisconnect: async ({ ws }) => {
      const token = extractToken(ws);
      const user = authenticateToken(token);
      console.log(`User ${user?.name} disconnected`);
    },

    /**
     * Validate and authorize events before processing
     */
    beforeEvent: async ({ event, snapshot }) => {
      // Extract user from event metadata
      // In real app, this would come from authenticated session
      const userRole = (event as any).userRole || 'user';
      const userId = (event as any).userId || 'unknown';

      // Check if room is locked
      if (snapshot.value === 'locked' && event.type !== 'UNLOCK_ROOM') {
        return {
          allowed: false,
          reason: 'Room is locked. Only UNLOCK_ROOM is allowed.',
        };
      }

      // Role-based access control
      switch (event.type) {
        case 'SEND_MESSAGE': {
          // Check if user is banned
          const bannedUsers = snapshot.context?.bannedUsers || [];
          if (bannedUsers.includes(userId)) {
            return {
              allowed: false,
              reason: 'You are banned from sending messages',
            };
          }

          // Check message content for spam/profanity
          const text = (event as any).text || '';
          if (text.length === 0) {
            return {
              allowed: false,
              reason: 'Message cannot be empty',
            };
          }

          if (text.length > 500) {
            return {
              allowed: false,
              reason: 'Message too long (max 500 characters)',
            };
          }

          // In slow mode, check rate limiting (simplified)
          const mode = snapshot.context?.mode;
          if (mode === 'slow') {
            // In real app, check last message timestamp per user
            console.log('Slow mode active - rate limiting applied');
          }

          return { allowed: true };
        }

        case 'BAN_USER': {
          // Only moderators and admins can ban
          if (userRole !== 'moderator' && userRole !== 'admin') {
            return {
              allowed: false,
              reason: 'Insufficient permissions. Only moderators can ban users.',
            };
          }

          // Can't ban yourself
          const targetUserId = (event as any).userId;
          if (targetUserId === userId) {
            return {
              allowed: false,
              reason: 'Cannot ban yourself',
            };
          }

          return { allowed: true };
        }

        case 'SET_SLOW_MODE':
        case 'CLEAR_MESSAGES': {
          // Only moderators and admins
          if (userRole !== 'moderator' && userRole !== 'admin') {
            return {
              allowed: false,
              reason: 'Insufficient permissions. Moderator role required.',
            };
          }
          return { allowed: true };
        }

        case 'LOCK_ROOM':
        case 'UNLOCK_ROOM': {
          // Only admins can lock/unlock
          if (userRole !== 'admin') {
            return {
              allowed: false,
              reason: 'Insufficient permissions. Admin role required.',
            };
          }
          return { allowed: true };
        }

        default:
          return { allowed: true };
      }
    },

    /**
     * Audit log after successful events
     */
    afterEvent: async ({ event, snapshot }) => {
      const userId = (event as any).userId || 'unknown';
      const userRole = (event as any).userRole || 'user';

      console.log('[AUDIT]', {
        timestamp: new Date().toISOString(),
        userId,
        userRole,
        event: event.type,
        state: snapshot.value,
        payload: event,
      });
    },

    /**
     * Validate state transitions
     */
    beforeTransition: async ({ previousSnapshot, currentSnapshot, event }) => {
      // Example: Prevent certain transitions based on business rules
      if (
        previousSnapshot.value === 'open' &&
        currentSnapshot.value === 'locked'
      ) {
        // Check if there are active connections (simplified)
        const messageCount =
          (currentSnapshot.context?.messages || []).length || 0;

        if (messageCount > 100) {
          console.log(
            'Warning: Locking room with many messages. Consider archiving first.'
          );
        }
      }

      return { allowed: true };
    },

    /**
     * Post-transition actions
     */
    afterTransition: async ({ previousSnapshot, currentSnapshot }) => {
      // Log state changes
      if (previousSnapshot.value !== currentSnapshot.value) {
        console.log(
          `State changed: ${previousSnapshot.value} → ${currentSnapshot.value}`
        );
      }
    },

    /**
     * Control state persistence
     */
    beforeStateSync: async ({ snapshot, persistenceMode }) => {
      // Could implement custom logic like:
      // - Compress large message arrays
      // - Redact sensitive data before persistence
      // - Prevent sync under certain conditions

      const messageCount = (snapshot.context?.messages || []).length;
      if (messageCount > 1000) {
        console.log(
          'Warning: Large message history. Consider implementing pagination.'
        );
      }

      return { allowed: true };
    },

    /**
     * Post-sync actions
     */
    afterStateSync: async ({ snapshot }) => {
      // Could trigger external events like:
      // - Notify monitoring system
      // - Update cache
      // - Trigger webhooks
      console.log('State synced to storage', {
        state: snapshot.value,
        messageCount: (snapshot.context?.messages || []).length,
      });
    },
  },
});
