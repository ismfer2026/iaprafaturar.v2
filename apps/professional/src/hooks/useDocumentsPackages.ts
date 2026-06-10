import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AnamneseTemplate,
  ClientPackageWithDetails,
  ContractWithClient,
  ConvertApprovedQuoteOutput,
  CreateContractFromModeloInput,
  CreateContractOutput,
  CreateModeloInput,
  CreateModeloOutput,
  CreateQuoteInput,
  CreateQuoteOutput,
  CreateServicePackageInput,
  CreateServicePackageOutput,
  MarkContractSignedManualOutput,
  Modelo,
  QuoteStatus,
  QuoteWithClient,
  SellClientPackageInput,
  SellClientPackageOutput,
  SendQuoteDryRunOutput,
  SendQuoteForApprovalOutput,
  ServicePackageWithService,
  UpdateAnamneseTemplateInput,
  UpdateAnamneseTemplateOutput,
  UseClientPackageSessionInput,
  UseClientPackageSessionOutput,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

interface ServicePackageRow extends ServicePackageWithService {
  services?: { name: string | null } | null;
}

interface ClientPackageRow extends ClientPackageWithDetails {
  clients?: { full_name: string | null } | null;
  service_packages?: { name: string | null; price: number | null } | null;
}

interface QuoteRow extends QuoteWithClient {
  clients?: { full_name: string | null } | null;
}

interface ContractRow extends ContractWithClient {
  clients?: { full_name: string | null } | null;
  modelos?: { name: string | null } | null;
}

function mapServicePackage(row: ServicePackageRow): ServicePackageWithService {
  return {
    ...row,
    service_name: row.services?.name ?? null,
    services: undefined,
  } as ServicePackageWithService;
}

function mapClientPackage(row: ClientPackageRow): ClientPackageWithDetails {
  return {
    ...row,
    client_name: row.clients?.full_name ?? null,
    package_name: row.service_packages?.name ?? null,
    package_price: row.service_packages?.price ?? null,
    clients: undefined,
    service_packages: undefined,
  } as ClientPackageWithDetails;
}

function mapQuote(row: QuoteRow): QuoteWithClient {
  return {
    ...row,
    client_name: row.clients?.full_name ?? null,
    clients: undefined,
  } as QuoteWithClient;
}

function mapContract(row: ContractRow): ContractWithClient {
  return {
    ...row,
    client_name: row.clients?.full_name ?? null,
    modelo_name: row.modelos?.name ?? null,
    clients: undefined,
    modelos: undefined,
  } as ContractWithClient;
}

export function useServicePackages(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.servicePackages(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase
        .from("service_packages")
        .select("*, services(name)")
        .eq("professional_id", professionalId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as ServicePackageRow[]).map(mapServicePackage);
    },
  });

  const createServicePackage = useMutation({
    mutationFn: async (input: CreateServicePackageInput) => {
      const { data, error } = await supabase.rpc("create_service_package", {
        p_name: input.name,
        p_service_id: input.serviceId ?? null,
        p_total_sessions: input.totalSessions,
        p_price: input.price,
        p_validity_days: input.validityDays ?? null,
        p_description: input.description ?? null,
        p_is_public: input.isPublic ?? true,
      });

      if (error) throw error;
      return data as CreateServicePackageOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.servicePackages(professionalId) });
    },
  });

  return {
    ...query,
    createServicePackage: createServicePackage.mutateAsync,
    isCreatingServicePackage: createServicePackage.isPending,
    createServicePackageError: createServicePackage.error,
  };
}

export function useClientPackages(professionalId: string | null, clientId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.clientPackages(professionalId, clientId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      let queryBuilder = supabase
        .from("client_packages")
        .select("*, clients(full_name), service_packages(name, price)")
        .eq("professional_id", professionalId)
        .order("created_at", { ascending: false });

      if (clientId) queryBuilder = queryBuilder.eq("client_id", clientId);

      const { data, error } = await queryBuilder;
      if (error) throw error;
      return ((data ?? []) as ClientPackageRow[]).map(mapClientPackage);
    },
  });

  const invalidatePackages = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["crm", "client-packages", professionalId] }),
      queryClient.invalidateQueries({ queryKey: ["crm", "financial-transactions", professionalId] }),
      queryClient.invalidateQueries({ queryKey: ["crm", "sessions", professionalId] }),
      queryClient.invalidateQueries({ queryKey: ["crm", "appointments", professionalId] }),
      queryClient.invalidateQueries({ queryKey: crmKeys.client(professionalId, clientId ?? null) }),
    ]);
  };

  const sellClientPackage = useMutation({
    mutationFn: async (input: SellClientPackageInput) => {
      const { data, error } = await supabase.rpc("sell_client_package", {
        p_client_id: input.clientId,
        p_service_package_id: input.servicePackageId,
        p_payment_method: input.paymentMethod,
        p_amount: input.amount ?? null,
        p_purchased_at: input.purchasedAt ?? null,
        p_expires_at: input.expiresAt ?? null,
      });

      if (error) throw error;
      return data as SellClientPackageOutput;
    },
    onSuccess: invalidatePackages,
  });

  const useClientPackageSession = useMutation({
    mutationFn: async (input: UseClientPackageSessionInput) => {
      const { data, error } = await supabase.rpc("use_client_package_session", {
        p_client_package_id: input.clientPackageId,
        p_session_id: input.sessionId,
        p_appointment_id: input.appointmentId ?? null,
      });

      if (error) throw error;
      return data as UseClientPackageSessionOutput;
    },
    onSuccess: invalidatePackages,
  });

  return {
    ...query,
    sellClientPackage: sellClientPackage.mutateAsync,
    isSellingClientPackage: sellClientPackage.isPending,
    sellClientPackageError: sellClientPackage.error,
    useClientPackageSession: useClientPackageSession.mutateAsync,
    isUsingClientPackageSession: useClientPackageSession.isPending,
    useClientPackageSessionError: useClientPackageSession.error,
  };
}

export function useQuotes(professionalId: string | null, status?: QuoteStatus | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.quotes(professionalId, status),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      let queryBuilder = supabase
        .from("quotes")
        .select("*, clients(full_name)")
        .eq("professional_id", professionalId)
        .order("created_at", { ascending: false });

      if (status) queryBuilder = queryBuilder.eq("status", status);

      const { data, error } = await queryBuilder;
      if (error) throw error;
      return ((data ?? []) as QuoteRow[]).map(mapQuote);
    },
  });

  const invalidateQuotes = async () => {
    await queryClient.invalidateQueries({ queryKey: ["crm", "quotes", professionalId] });
  };

  const createQuote = useMutation({
    mutationFn: async (input: CreateQuoteInput) => {
      const { data, error } = await supabase.rpc("create_quote", {
        p_client_id: input.clientId,
        p_title: input.title,
        p_items: input.items,
        p_discount_amount: input.discountAmount ?? 0,
        p_expires_at: input.expiresAt ?? null,
        p_notes: input.notes ?? null,
      });

      if (error) throw error;
      return data as CreateQuoteOutput;
    },
    onSuccess: invalidateQuotes,
  });

  const sendQuoteDryRun = useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await supabase.rpc("send_quote_dry_run", {
        p_quote_id: quoteId,
      });

      if (error) throw error;
      return data as SendQuoteDryRunOutput;
    },
    onSuccess: invalidateQuotes,
  });

  const sendQuoteForApproval = useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await supabase.rpc("send_quote_for_approval", {
        p_quote_id: quoteId,
      });

      if (error) throw error;
      return data as SendQuoteForApprovalOutput;
    },
    onSuccess: invalidateQuotes,
  });

  const convertApprovedQuote = useMutation({
    mutationFn: async (input: { quoteId: string; target: "contract" | "package"; servicePackageId?: string | null }) => {
      const { data, error } = await supabase.rpc("convert_approved_quote", {
        p_quote_id: input.quoteId,
        p_target: input.target,
        p_service_package_id: input.servicePackageId ?? null,
      });

      if (error) throw error;
      return data as ConvertApprovedQuoteOutput;
    },
    onSuccess: async () => {
      await Promise.all([
        invalidateQuotes(),
        queryClient.invalidateQueries({ queryKey: ["crm", "contracts", professionalId] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "client-packages", professionalId] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "financial-transactions", professionalId] }),
      ]);
    },
  });

  return {
    ...query,
    createQuote: createQuote.mutateAsync,
    isCreatingQuote: createQuote.isPending,
    sendQuoteDryRun: sendQuoteDryRun.mutateAsync,
    isSendingQuoteDryRun: sendQuoteDryRun.isPending,
    sendQuoteForApproval: sendQuoteForApproval.mutateAsync,
    isSendingQuoteForApproval: sendQuoteForApproval.isPending,
    convertApprovedQuote: convertApprovedQuote.mutateAsync,
    isConvertingApprovedQuote: convertApprovedQuote.isPending,
  };
}

export function useModelos(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.modelos(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase
        .from("modelos")
        .select("*")
        .eq("professional_id", professionalId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as Modelo[];
    },
  });

  const createModelo = useMutation({
    mutationFn: async (input: CreateModeloInput) => {
      const { data, error } = await supabase.rpc("create_modelo", {
        p_name: input.name,
        p_type: input.type,
        p_content: input.content,
        p_variables: input.variables ?? [],
      });

      if (error) throw error;
      return data as CreateModeloOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.modelos(professionalId) });
    },
  });

  return {
    ...query,
    createModelo: createModelo.mutateAsync,
    isCreatingModelo: createModelo.isPending,
  };
}

export function useContracts(professionalId: string | null, clientId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.contracts(professionalId, clientId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      let queryBuilder = supabase
        .from("contracts")
        .select("*, clients(full_name), modelos(name)")
        .eq("professional_id", professionalId)
        .order("created_at", { ascending: false });

      if (clientId) queryBuilder = queryBuilder.eq("client_id", clientId);

      const { data, error } = await queryBuilder;
      if (error) throw error;
      return ((data ?? []) as ContractRow[]).map(mapContract);
    },
  });

  const invalidateContracts = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["crm", "contracts", professionalId] }),
      queryClient.invalidateQueries({ queryKey: crmKeys.client(professionalId, clientId ?? null) }),
    ]);
  };

  const createContractFromModelo = useMutation({
    mutationFn: async (input: CreateContractFromModeloInput) => {
      const { data, error } = await supabase.rpc("create_contract_from_modelo", {
        p_client_id: input.clientId,
        p_modelo_id: input.modeloId,
        p_type: input.type ?? null,
        p_quote_id: input.quoteId ?? null,
        p_client_package_id: input.clientPackageId ?? null,
        p_expires_at: input.expiresAt ?? null,
      });

      if (error) throw error;
      return data as CreateContractOutput;
    },
    onSuccess: invalidateContracts,
  });

  const markContractSignedManual = useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await supabase.rpc("mark_contract_signed_manual", {
        p_contract_id: contractId,
      });

      if (error) throw error;
      return data as MarkContractSignedManualOutput;
    },
    onSuccess: invalidateContracts,
  });

  return {
    ...query,
    createContractFromModelo: createContractFromModelo.mutateAsync,
    isCreatingContract: createContractFromModelo.isPending,
    markContractSignedManual: markContractSignedManual.mutateAsync,
    isMarkingContractSignedManual: markContractSignedManual.isPending,
  };
}

export function useAnamneseTemplates(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.anamneseTemplates(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase
        .from("anamnese_templates")
        .select("*")
        .eq("professional_id", professionalId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as AnamneseTemplate[];
    },
  });

  const updateAnamneseTemplate = useMutation({
    mutationFn: async (input: UpdateAnamneseTemplateInput) => {
      const { data, error } = await supabase.rpc("update_anamnese_template", {
        p_template_id: input.templateId,
        p_name: input.name,
        p_fields: input.fields,
      });

      if (error) throw error;
      return data as UpdateAnamneseTemplateOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.anamneseTemplates(professionalId) });
    },
  });

  return {
    ...query,
    updateAnamneseTemplate: updateAnamneseTemplate.mutateAsync,
    isUpdatingAnamneseTemplate: updateAnamneseTemplate.isPending,
  };
}
