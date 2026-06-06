export type FinancialTransactionType = "receita" | "despesa";

export type FinancialTransactionStatus = "pendente" | "pago" | "cancelado" | "estornado";

export type FinancialPaymentMethod =
  | "pix"
  | "dinheiro"
  | "cartao_credito"
  | "cartao_debito"
  | "transferencia"
  | "outros";

export interface FinancialTransaction {
  id: string;
  professional_id: string;
  client_id: string | null;
  session_id: string | null;
  appointment_id: string | null;
  client_package_id: string | null;
  type: FinancialTransactionType;
  category_id: string | null;
  cost_center_id: string | null;
  bank_account_id: string | null;
  amount: number;
  discount_amount: number;
  net_amount: number;
  status: FinancialTransactionStatus;
  payment_method: FinancialPaymentMethod | null;
  payment_gateway: "manual" | string;
  gateway_transaction_id: string | null;
  installments: number;
  installment_number: number;
  parent_transaction_id: string | null;
  due_date: string | null;
  paid_at: string | null;
  description: string;
  source: "manual" | "pdv" | "pacote" | "assinatura" | "gateway";
  notes: string | null;
  conciliacao_item_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialSummary {
  paidIncome: number;
  pendingIncome: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

export interface FinancialTransactionWithClient extends FinancialTransaction {
  client_name?: string | null;
}

export interface CreateFinancialTransactionInput {
  type: FinancialTransactionType;
  amount: number;
  discountAmount?: number;
  status: Extract<FinancialTransactionStatus, "pendente" | "pago">;
  paymentMethod?: FinancialPaymentMethod | null;
  dueDate?: string | null;
  paidAt?: string | null;
  description: string;
  notes?: string | null;
  clientId?: string | null;
  appointmentId?: string | null;
  sessionId?: string | null;
}

export interface CreateFinancialTransactionOutput {
  transaction_id: string;
  status: Extract<FinancialTransactionStatus, "pendente" | "pago">;
  transaction: FinancialTransaction;
}

export interface MarkTransactionPaidInput {
  transactionId: string;
  paymentMethod: FinancialPaymentMethod;
  paidAt?: string | null;
}

export interface MarkTransactionPaidOutput {
  transaction_id: string;
  status: "pago";
  changed: boolean;
  transaction?: FinancialTransaction;
}

export interface CancelFinancialTransactionInput {
  transactionId: string;
  reason: string;
}

export interface CancelFinancialTransactionOutput {
  transaction_id: string;
  status: "cancelado";
}
