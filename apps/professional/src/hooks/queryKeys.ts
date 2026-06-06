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
};

