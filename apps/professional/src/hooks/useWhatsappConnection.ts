import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface WhatsappConnectionState {
  provider: "evolution_go" | "meta_waba";
  connection_mode: "qr" | "pairing_code" | "waba";
  status: "disconnected" | "connecting" | "connected" | "error";
  is_connected: boolean;
  phone_number: string | null;
  number_kind: "personal" | "business" | "unknown" | null;
  qr_code?: string | null;
  qr_expires_at?: string | null;
  pairing_code?: string | null;
  dry_run?: boolean;
}

async function invokeWhatsapp(body: Record<string, unknown>): Promise<WhatsappConnectionState> {
  const { data, error } = await supabase.functions.invoke<WhatsappConnectionState>(
    "professional-whatsapp-connection",
    { body },
  );
  if (error) throw error;
  if (!data) throw new Error("empty response");
  return data;
}

export function useWhatsappConnection(professionalId: string | null) {
  const queryClient = useQueryClient();
  const connectionKey = ["whatsapp-connection", professionalId];
  const settingsKey = ["assistant-settings", professionalId];

  const query = useQuery<WhatsappConnectionState>({
    queryKey: connectionKey,
    enabled: Boolean(professionalId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "connecting" ? 5000 : false;
    },
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId required");
      return invokeWhatsapp({
        professional_id: professionalId,
        action: "status",
        provider: "evolution_go",
        connection_mode: "qr",
      });
    },
  });

  const setCache = (data: WhatsappConnectionState) => {
    queryClient.setQueryData(connectionKey, data);
    queryClient.invalidateQueries({ queryKey: settingsKey });
  };

  const startQr = useMutation<WhatsappConnectionState>({
    mutationFn: async () => {
      if (!professionalId) throw new Error("professionalId required");
      return invokeWhatsapp({
        professional_id: professionalId,
        action: "start",
        provider: "evolution_go",
        connection_mode: "qr",
        number_kind: "business",
      });
    },
    onSuccess: setCache,
  });

  const startPairing = useMutation<WhatsappConnectionState, Error, string>({
    mutationFn: async (phoneNumber: string) => {
      if (!professionalId) throw new Error("professionalId required");
      return invokeWhatsapp({
        professional_id: professionalId,
        action: "start",
        provider: "evolution_go",
        connection_mode: "pairing_code",
        phone_number: phoneNumber,
        number_kind: "business",
      });
    },
    onSuccess: setCache,
  });

  const disconnect = useMutation<WhatsappConnectionState>({
    mutationFn: async () => {
      if (!professionalId) throw new Error("professionalId required");
      return invokeWhatsapp({
        professional_id: professionalId,
        action: "disconnect",
        provider: "evolution_go",
        connection_mode: "qr",
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(connectionKey, data);
      queryClient.invalidateQueries({ queryKey: settingsKey });
    },
  });

  return { query, startQr, startPairing, disconnect };
}
