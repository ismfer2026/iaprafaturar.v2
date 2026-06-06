export interface WhatsAppMessageReceivedEvent {
  event_id: string;
  source_webhook: "admin" | "professional";
  instance_name: string | null;
  phone: string;
  professional_id: string | null;
  message_preview: string;
  received_at: string;
}

export interface WhatsAppInstanceConnectedEvent {
  event_id: string;
  professional_id: string;
  instance_name: string;
  phone: string | null;
  connected_at: string;
}

export interface WhatsAppInstanceDisconnectedEvent {
  event_id: string;
  professional_id: string;
  instance_name: string;
  disconnected_at: string;
  reason: string | null;
}
