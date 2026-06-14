import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApproveBillingCollectionOutput,
  CancelFinancialTransactionInput,
  CancelFinancialTransactionOutput,
  CreatePosSaleInput,
  CreatePosSaleOutput,
  CreateFinancialTransactionInput,
  CreateFinancialTransactionOutput,
  FinanceSettings,
  FinancialSummary,
  FinancialTransactionStatus,
  FinancialTransactionType,
  FinancialTransactionWithClient,
  ImportReconciliationInput,
  MarkTransactionPaidInput,
  MarkTransactionPaidOutput,
  ReconciliationItem,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export interface FinancialFilters {
  status?: FinancialTransactionStatus | null;
  type?: FinancialTransactionType | null;
  clientId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

interface FinancialTransactionRow extends FinancialTransactionWithClient {
  clients?: { full_name: string | null } | null;
}

function toCreateTransactionArgs(input: CreateFinancialTransactionInput) {
  return {
    p_type: input.type,
    p_amount: input.amount,
    p_discount_amount: input.discountAmount ?? 0,
    p_status: input.status,
    p_payment_method: input.paymentMethod ?? null,
    p_due_date: input.dueDate ?? null,
    p_paid_at: input.paidAt ?? null,
    p_description: input.description,
    p_notes: input.notes ?? null,
    p_client_id: input.clientId ?? null,
    p_appointment_id: input.appointmentId ?? null,
    p_session_id: input.sessionId ?? null,
  };
}

export function useFinancialTransactions(professionalId: string | null, filters: FinancialFilters = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.financialTransactions(professionalId, filters),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      let queryBuilder = supabase
        .from("financial_transactions")
        .select("*, clients(full_name)")
        .eq("professional_id", professionalId)
        .order("created_at", { ascending: false });

      if (filters.status) queryBuilder = queryBuilder.eq("status", filters.status);
      if (filters.type) queryBuilder = queryBuilder.eq("type", filters.type);
      if (filters.clientId) queryBuilder = queryBuilder.eq("client_id", filters.clientId);
      if (filters.dateFrom) queryBuilder = queryBuilder.gte("created_at", filters.dateFrom);
      if (filters.dateTo) queryBuilder = queryBuilder.lt("created_at", filters.dateTo);

      const { data, error } = await queryBuilder;
      if (error) throw error;

      return ((data ?? []) as FinancialTransactionRow[]).map((transaction) => ({
        ...transaction,
        client_name: transaction.clients?.full_name ?? null,
        clients: undefined,
      })) as FinancialTransactionWithClient[];
    },
  });

  const invalidateFinance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["crm", "financial-transactions", professionalId] }),
      queryClient.invalidateQueries({ queryKey: ["crm", "financial-summary", professionalId] }),
      queryClient.invalidateQueries({ queryKey: crmKeys.financeSettings(professionalId) }),
      queryClient.invalidateQueries({ queryKey: crmKeys.reconciliationItems(professionalId) }),
      queryClient.invalidateQueries({ queryKey: crmKeys.dashboard(professionalId) }),
      queryClient.invalidateQueries({ queryKey: ["crm", "sessions", professionalId] }),
    ]);
  };

  const createTransaction = useMutation({
    mutationFn: async (input: CreateFinancialTransactionInput) => {
      const { data, error } = await supabase.rpc("create_financial_transaction", toCreateTransactionArgs(input));
      if (error) throw error;
      return data as CreateFinancialTransactionOutput;
    },
    onSuccess: invalidateFinance,
  });

  const markPaid = useMutation({
    mutationFn: async (input: MarkTransactionPaidInput) => {
      const { data, error } = await supabase.rpc("mark_transaction_paid", {
        p_transaction_id: input.transactionId,
        p_payment_method: input.paymentMethod,
        p_paid_at: input.paidAt ?? null,
      });

      if (error) throw error;
      return data as MarkTransactionPaidOutput;
    },
    onSuccess: invalidateFinance,
  });

  const cancelTransaction = useMutation({
    mutationFn: async (input: CancelFinancialTransactionInput) => {
      const { data, error } = await supabase.rpc("cancel_financial_transaction", {
        p_transaction_id: input.transactionId,
        p_reason: input.reason,
      });

      if (error) throw error;
      return data as CancelFinancialTransactionOutput;
    },
    onSuccess: invalidateFinance,
  });

  const approveBillingCollection = useMutation({
    mutationFn: async (input: { transactionId: string; message?: string | null }) => {
      const { data, error } = await supabase.rpc("approve_billing_collection", {
        p_financial_transaction_id: input.transactionId,
        p_message: input.message ?? null,
      });

      if (error) throw error;
      const approval = data as ApproveBillingCollectionOutput;

      const { error: functionError } = await supabase.functions.invoke("billing-collection-agent", {
        body: {
          transaction_id: input.transactionId,
        },
      });

      if (functionError) throw functionError;
      return approval;
    },
    onSuccess: invalidateFinance,
  });

  const createPosSale = useMutation({
    mutationFn: async (input: CreatePosSaleInput) => {
      const { data, error } = await supabase.rpc("create_pos_sale", {
        p_client_id: input.clientId ?? null,
        p_items: input.items,
        p_payment_method: input.paymentMethod,
        p_discount_amount: input.discountAmount ?? 0,
        p_bank_account_id: input.bankAccountId ?? null,
        p_category_id: input.categoryId ?? null,
        p_cost_center_id: input.costCenterId ?? null,
        p_notes: input.notes ?? null,
      });

      if (error) throw error;
      return data as CreatePosSaleOutput;
    },
    onSuccess: invalidateFinance,
  });

  const markReceiptSent = useMutation({
    mutationFn: async (transactionId: string) => {
      const { data, error } = await supabase.functions.invoke("finance-receipt-agent", {
        body: {
          transaction_id: transactionId,
        },
      });
      if (error) throw error;
      return data as { ok: boolean; transaction_id: string; status: string; message_event_id?: string | null };
    },
    onSuccess: invalidateFinance,
  });

  return {
    ...query,
    createTransaction: createTransaction.mutateAsync,
    isCreatingTransaction: createTransaction.isPending,
    createTransactionError: createTransaction.error,
    markPaid: markPaid.mutateAsync,
    isMarkingPaid: markPaid.isPending,
    markPaidError: markPaid.error,
    cancelTransaction: cancelTransaction.mutateAsync,
    isCancellingTransaction: cancelTransaction.isPending,
    cancelTransactionError: cancelTransaction.error,
    approveBillingCollection: approveBillingCollection.mutateAsync,
    isApprovingBillingCollection: approveBillingCollection.isPending,
    approveBillingCollectionError: approveBillingCollection.error,
    createPosSale: createPosSale.mutateAsync,
    isCreatingPosSale: createPosSale.isPending,
    createPosSaleError: createPosSale.error,
    markReceiptSent: markReceiptSent.mutateAsync,
    isMarkingReceiptSent: markReceiptSent.isPending,
  };
}

export function useFinancialSummary(
  professionalId: string | null,
  dateFrom?: string | null,
  dateTo?: string | null,
) {
  return useQuery({
    queryKey: crmKeys.financialSummary(professionalId, dateFrom, dateTo),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase.rpc("get_financial_summary", {
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
      });

      if (error) throw error;
      return data as FinancialSummary;
    },
  });
}

export function useFinanceSettings(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.financeSettings(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_finance_settings");
      if (error) throw error;
      return data as FinanceSettings;
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (input: Partial<FinanceSettings>) => {
      const { data, error } = await supabase.rpc("upsert_finance_settings", {
        p_bank_accounts: input.bankAccounts ?? [],
        p_categories: input.categories ?? [],
        p_cost_centers: input.costCenters ?? [],
        p_gateways: input.gateways ?? [],
      });
      if (error) throw error;
      return data as FinanceSettings;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.financeSettings(professionalId) });
    },
  });

  return {
    ...query,
    saveSettings: saveSettings.mutateAsync,
    isSavingSettings: saveSettings.isPending,
  };
}

export function useReconciliation(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.reconciliationItems(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");
      const { data, error } = await supabase
        .from("finance_reconciliation_items")
        .select("*")
        .eq("professional_id", professionalId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ReconciliationItem[];
    },
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: crmKeys.reconciliationItems(professionalId) }),
      queryClient.invalidateQueries({ queryKey: ["crm", "financial-transactions", professionalId] }),
    ]);
  };

  const importItems = useMutation({
    mutationFn: async (input: ImportReconciliationInput) => {
      const { data, error } = await supabase.rpc("import_reconciliation_items", {
        p_bank_account_id: input.bankAccountId ?? null,
        p_file_name: input.fileName,
        p_file_type: input.fileType,
        p_items: input.items,
      });
      if (error) throw error;
      return data as { import_id: string; item_count: number; auto_applied: false };
    },
    onSuccess: invalidate,
  });

  const confirmMatch = useMutation({
    mutationFn: async (input: { reconciliationItemId: string; transactionId: string }) => {
      const { data, error } = await supabase.rpc("confirm_reconciliation_match", {
        p_reconciliation_item_id: input.reconciliationItemId,
        p_financial_transaction_id: input.transactionId,
      });
      if (error) throw error;
      return data as { reconciliation_item_id: string; transaction_id: string; status: "confirmed" };
    },
    onSuccess: invalidate,
  });

  const ignoreItem = useMutation({
    mutationFn: async (reconciliationItemId: string) => {
      const { data, error } = await supabase.rpc("ignore_reconciliation_item", {
        p_reconciliation_item_id: reconciliationItemId,
      });
      if (error) throw error;
      return data as { reconciliation_item_id: string; status: "ignored" };
    },
    onSuccess: invalidate,
  });

  return {
    ...query,
    importItems: importItems.mutateAsync,
    isImportingItems: importItems.isPending,
    confirmMatch: confirmMatch.mutateAsync,
    isConfirmingMatch: confirmMatch.isPending,
    ignoreItem: ignoreItem.mutateAsync,
    isIgnoringItem: ignoreItem.isPending,
  };
}

export interface FinanceReceiptSettings {
  enabled?: boolean;
  auto_send?: boolean;
  include_notes?: boolean;
  footer?: string;
}

export function useFinanceReceiptSettings(professionalId: string | null) {
  const queryClient = useQueryClient();
  const key = ["crm", "finance-receipt-settings", professionalId] as const;
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_finance_receipt_settings");
      if (error) throw error;
      return data as FinanceReceiptSettings;
    },
  });
  const mutation = useMutation({
    mutationFn: async (settings: FinanceReceiptSettings) => {
      const { data, error } = await supabase.rpc("upsert_finance_receipt_settings", { p_settings: settings });
      if (error) throw error;
      return data as FinanceReceiptSettings;
    },
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });
  return {
    ...query,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    setLocal: (settings: FinanceReceiptSettings) => queryClient.setQueryData(key, settings),
  };
}
