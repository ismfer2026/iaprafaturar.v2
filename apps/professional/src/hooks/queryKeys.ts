export const crmKeys = {
  dashboard: (professionalId: string | null) => ["crm", "dashboard", professionalId] as const,
  reports: (professionalId: string | null, month: string | null) =>
    ["crm", "reports", professionalId, month ?? "current"] as const,
  clients: (professionalId: string | null, stage?: string | null) =>
    ["crm", "clients", professionalId, stage ?? "all"] as const,
  client: (professionalId: string | null, clientId: string | null) =>
    ["crm", "client", professionalId, clientId] as const,
  services: (professionalId: string | null) => ["crm", "services", professionalId] as const,
  appointments: (professionalId: string | null, rangeKey?: string | null) =>
    ["crm", "appointments", professionalId, rangeKey ?? "all"] as const,
  sessions: (professionalId: string | null, clientId?: string | null) =>
    ["crm", "sessions", professionalId, clientId ?? "all"] as const,
  anamneseFichas: (professionalId: string | null, clientId?: string | null) =>
    ["crm", "anamnese-fichas", professionalId, clientId ?? "all"] as const,
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
  financeSettings: (professionalId: string | null) => ["crm", "finance-settings", professionalId] as const,
  inventory: (professionalId: string | null) => ["crm", "inventory", professionalId] as const,
  reconciliationItems: (professionalId: string | null) => ["crm", "reconciliation-items", professionalId] as const,
  funnelBoard: (professionalId: string | null) => ["crm", "funnel-board", professionalId] as const,
  conversations: (professionalId: string | null) => ["crm", "conversations", professionalId] as const,
  conversationMessages: (professionalId: string | null, conversationId: string | null) =>
    ["crm", "conversation-messages", professionalId, conversationId] as const,
  shadowSuggestions: (professionalId: string | null) => ["crm", "shadow-suggestions", professionalId] as const,
  servicePackages: (professionalId: string | null) => ["crm", "service-packages", professionalId] as const,
  clientPackages: (professionalId: string | null, clientId?: string | null) =>
    ["crm", "client-packages", professionalId, clientId ?? "all"] as const,
  quotes: (professionalId: string | null, status?: string | null) =>
    ["crm", "quotes", professionalId, status ?? "all"] as const,
  modelos: (professionalId: string | null) => ["crm", "modelos", professionalId] as const,
  contracts: (professionalId: string | null, clientId?: string | null) =>
    ["crm", "contracts", professionalId, clientId ?? "all"] as const,
  anamneseTemplates: (professionalId: string | null) => ["crm", "anamnese-templates", professionalId] as const,
  teamMembers: (professionalId: string | null) => ["crm", "team-members", professionalId] as const,
  notificationSettings: (professionalId: string | null) => ["crm", "notification-settings", professionalId] as const,
  scheduleSettings: (professionalId: string | null) => ["crm", "schedule-settings", professionalId] as const,
  growthOverview: (professionalId: string | null) => ["crm", "growth-overview", professionalId] as const,
  campaigns: (professionalId: string | null) => ["crm", "campaigns", professionalId] as const,
  rfm: (professionalId: string | null) => ["crm", "rfm", professionalId] as const,
  rewards: (professionalId: string | null) => ["crm", "rewards", professionalId] as const,
  birthdays: (professionalId: string | null, month: number | null, search: string) =>
    ["crm", "birthdays", professionalId, month ?? "all", search] as const,
  partners: (professionalId: string | null) => ["crm", "partners", professionalId] as const,
};
