import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CancelFinancialTransactionInput,
  CancelFinancialTransactionOutput,
  CreateFinancialTransactionInput,
  CreateFinancialTransactionOutput,
  FinancialSummary,
  FinancialTransactionStatus,
  FinancialTransactionType,
  FinancialTransactionWithClient,
  MarkTransactionPaidInput,
  MarkTransactionPaidOutput,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export interface FinancialFilters {
  status?: FinancialTransactionStatus | null;
  type?: FinancialTransactionType | null;
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
