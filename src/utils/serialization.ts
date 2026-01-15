import type { Snapshot } from 'xstate';
import type { FsmActorState } from '../core/types';

/**
 * Serializes an XState snapshot to JSON string
 */
export function serializeSnapshot(snapshot: Snapshot<unknown>): string {
  try {
    return JSON.stringify({
      value: snapshot.value,
      context: snapshot.context,
      status: snapshot.status,
      output: snapshot.output,
      error: snapshot.error,
    });
  } catch (error) {
    throw new Error(
      `Failed to serialize XState snapshot: ${(error as Error).message}`
    );
  }
}

/**
 * Deserializes a JSON string to an XState snapshot-like object
 */
export function deserializeSnapshot(serialized: string): Partial<Snapshot<unknown>> {
  try {
    const parsed = JSON.parse(serialized);
    return {
      value: parsed.value,
      context: parsed.context,
      status: parsed.status,
      output: parsed.output,
      error: parsed.error,
    };
  } catch (error) {
    throw new Error(
      `Failed to deserialize XState snapshot: ${(error as Error).message}`
    );
  }
}

/**
 * Creates RivetKit state from XState snapshot (full mode)
 */
export function snapshotToRivetState(
  snapshot: Snapshot<unknown>,
  metadata?: Record<string, unknown>
): FsmActorState {
  return {
    snapshot: serializeSnapshot(snapshot),
    metadata,
  };
}

/**
 * Creates RivetKit state from XState context only (context-only mode)
 */
export function contextToRivetState(
  snapshot: Snapshot<unknown>,
  metadata?: Record<string, unknown>
): FsmActorState {
  return {
    context: snapshot.context,
    stateValue: snapshot.value,
    metadata,
  };
}

/**
 * Creates minimal RivetKit state (none mode)
 */
export function minimalRivetState(
  metadata?: Record<string, unknown>
): FsmActorState {
  return {
    metadata,
  };
}
