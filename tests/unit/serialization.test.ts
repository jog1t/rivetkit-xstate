import { describe, it, expect } from 'vitest';
import {
  serializeSnapshot,
  deserializeSnapshot,
  snapshotToRivetState,
  contextToRivetState,
  minimalRivetState,
} from '../../src/utils/serialization';

describe('serialization utilities', () => {
  describe('serializeSnapshot', () => {
    it('should serialize a snapshot to JSON string', () => {
      const snapshot = {
        value: 'active',
        context: { count: 5 },
        status: 'active' as const,
        output: undefined,
        error: undefined,
      };

      const serialized = serializeSnapshot(snapshot);
      expect(typeof serialized).toBe('string');
      expect(JSON.parse(serialized)).toEqual({
        value: 'active',
        context: { count: 5 },
        status: 'active',
        output: undefined,
        error: undefined,
      });
    });

    it('should handle nested context', () => {
      const snapshot = {
        value: 'running',
        context: {
          user: { name: 'Alice', age: 30 },
          settings: { theme: 'dark' },
        },
        status: 'active' as const,
        output: undefined,
        error: undefined,
      };

      const serialized = serializeSnapshot(snapshot);
      const deserialized = JSON.parse(serialized);
      expect(deserialized.context).toEqual(snapshot.context);
    });

    it('should throw on circular references', () => {
      const circular: any = { value: 'test', context: {} };
      circular.context.self = circular;

      expect(() => serializeSnapshot(circular as any)).toThrow();
    });
  });

  describe('deserializeSnapshot', () => {
    it('should deserialize a JSON string to snapshot', () => {
      const original = {
        value: 'inactive',
        context: { count: 0 },
        status: 'active',
        output: undefined,
        error: undefined,
      };

      const serialized = JSON.stringify(original);
      const deserialized = deserializeSnapshot(serialized);

      expect(deserialized).toEqual(original);
    });

    it('should throw on invalid JSON', () => {
      expect(() => deserializeSnapshot('not valid json')).toThrow();
    });
  });

  describe('snapshotToRivetState', () => {
    it('should convert snapshot to RivetKit state (full mode)', () => {
      const snapshot = {
        value: 'green',
        context: { cycleCount: 3 },
        status: 'active' as const,
        output: undefined,
        error: undefined,
      };

      const metadata = { version: '1.0.0' };
      const rivetState = snapshotToRivetState(snapshot, metadata);

      expect(rivetState).toHaveProperty('snapshot');
      expect(rivetState.metadata).toEqual(metadata);
      expect(typeof rivetState.snapshot).toBe('string');

      // Verify snapshot can be deserialized
      const deserialized = JSON.parse(rivetState.snapshot!);
      expect(deserialized.value).toBe('green');
      expect(deserialized.context).toEqual({ cycleCount: 3 });
    });

    it('should work without metadata', () => {
      const snapshot = {
        value: 'idle',
        context: {},
        status: 'active' as const,
        output: undefined,
        error: undefined,
      };

      const rivetState = snapshotToRivetState(snapshot);
      expect(rivetState).toHaveProperty('snapshot');
      expect(rivetState.metadata).toBeUndefined();
    });
  });

  describe('contextToRivetState', () => {
    it('should convert snapshot to context-only RivetKit state', () => {
      const snapshot = {
        value: 'running',
        context: { speed: 100, direction: 'north' },
        status: 'active' as const,
        output: undefined,
        error: undefined,
      };

      const rivetState = contextToRivetState(snapshot);

      expect(rivetState.context).toEqual({ speed: 100, direction: 'north' });
      expect(rivetState.stateValue).toBe('running');
      expect(rivetState.snapshot).toBeUndefined();
    });
  });

  describe('minimalRivetState', () => {
    it('should create minimal state with only metadata', () => {
      const metadata = { name: 'TestActor' };
      const rivetState = minimalRivetState(metadata);

      expect(rivetState.snapshot).toBeUndefined();
      expect(rivetState.context).toBeUndefined();
      expect(rivetState.stateValue).toBeUndefined();
      expect(rivetState.metadata).toEqual(metadata);
    });

    it('should work without metadata', () => {
      const rivetState = minimalRivetState();

      expect(Object.keys(rivetState)).toHaveLength(1);
      expect(rivetState.metadata).toBeUndefined();
    });
  });

  describe('round-trip serialization', () => {
    it('should preserve data through serialize/deserialize cycle', () => {
      const original = {
        value: { nested: 'state' },
        context: {
          complex: {
            nested: {
              data: [1, 2, 3],
              map: { a: 1, b: 2 },
            },
          },
        },
        status: 'active' as const,
        output: { result: 'success' },
        error: undefined,
      };

      const serialized = serializeSnapshot(original);
      const deserialized = deserializeSnapshot(serialized);

      expect(deserialized.value).toEqual(original.value);
      expect(deserialized.context).toEqual(original.context);
      expect(deserialized.output).toEqual(original.output);
    });
  });
});
