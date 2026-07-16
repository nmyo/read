import { useCallback, useState } from "react";
import type { MessageV2 } from "@readany/core/types/message";
import type { ChatStreamingStep } from "@readany/core/stores/chat-store";

export function useStreamingChat(_opts?: any) {
  const [isStreaming] = useState(false);
  const [currentMessage] = useState<MessageV2 | null>(null);
  const [currentStep] = useState<ChatStreamingStep>("idle");
  const sendMessage = useCallback(async (..._args: any[]) => {}, []);
  const stopStream = useCallback(() => {}, []);
  return { isStreaming, currentMessage, currentStep, sendMessage, stopStream };
}
export type StreamingChatOptions = any;
export type StreamingState = any;
