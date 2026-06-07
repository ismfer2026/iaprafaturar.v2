export const crmKeys = {
  dashboard: (professionalId: string | null) => ["crm", "dashboard", professionalId] as const,
  clients: (professionalId: string | null, stage?: string | null) =>
    ["crm", "clients", professionalId, stage ?? "all"] as const,
  client: (professionalId: string | null, clientId: string | null) =>
    ["crm", "client", professionalId, clientId] as const,
  services: (professionalId: string | null) => ["crm", "services", professionalId] as const,
  appointments: (professionalId: string | null, dateKey?: string | null) =>
    ["crm", "appointments", professionalId, dateKey ?? "all"] as const,
  sessions: (professionalId: string | null, clientId?: string | null) =>
    ["crm", "sessions", professionalId, clientId ?? "all"] as const,
  financialTransactions: (
    professionalId: string | null,
    filters?: { status?: string | null; type?: string | null; dateFrom?: string | null; dateTo?: string | null },
  ) =>
    [
      "crm",
      "financial-transactions",
      professionalId,
      filters?.status ?? "all",
      filters?.type ?? "all",
      filters?.dateFrom ?? "open",
      filters?.dateTo ?? "open",
    ] as const,
  financialSummary: (professionalId: string | null, dateFrom?: string | null, dateTo?: string | null) =>
    ["crm", "financial-summary", professionalId, dateFrom ?? "open", dateTo ?? "open"] as const,
  conversations: (professionalId: string | null) => ["crm", "conversations", professionalId] as const,
  conversationMessages: (professionalId: string | null, conversationId: string | null) =>
    ["crm", "conversation-messages", professionalId, conversationId] as const,
  shadowSuggestions: (professionalId: string | null) => ["crm", "shadow-suggestions", professionalId] as const,
};
