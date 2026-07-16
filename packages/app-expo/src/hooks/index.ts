/**
 * Hooks for React Native
 */


export interface SessionEventSource {
  emit: (event: string, data: unknown) => void;
}

export { rnSessionEventSource } from "@/lib/platform/rn-session-event-source";

export { useDebounce } from "./use-debounce";
export { useThrottledValue, useThrottledCallback } from "./use-throttled-value";
