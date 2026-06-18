import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface ChatMessage {
  id: string;
  role: "nerissa" | "user";
  text: string;
}

interface ChatState {
  messages: ChatMessage[];
  stepIndex: number;
  totalSteps: number;
  completed: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useOnboardingChat() {
  const initialized = useRef(false);
  const [state, setState] = useState<ChatState>({
    messages: [],
    stepIndex: 0,
    totalSteps: 4,
    completed: false,
    isLoading: false,
    error: null,
  });

  const send = useCallback(async (message: string | null) => {
    // Guard against double-invocation in React StrictMode dev
    if (message === null && initialized.current) return;
    if (message === null) initialized.current = true;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      messages:
        message !== null
          ? [...prev.messages, { id: crypto.randomUUID(), role: "user" as const, text: message }]
          : prev.messages,
    }));

    try {
      const { data, error } = await supabase.functions.invoke("onboarding-chat", {
        body: { message },
      });

      if (error) throw error;

      const result = data as {
        reply: string;
        step_index: number;
        total_steps: number;
        completed: boolean;
      };

      setState((prev) => ({
        ...prev,
        isLoading: false,
        messages: [
          ...prev.messages,
          { id: crypto.randomUUID(), role: "nerissa" as const, text: result.reply },
        ],
        stepIndex: result.step_index,
        totalSteps: result.total_steps,
        completed: result.completed,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Não consegui processar sua resposta. Tente de novo.",
      }));
    }
  }, []);

  return { ...state, send };
}
