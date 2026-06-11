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
  receipt_sent_at?: string | null;
  receipt_message_event_id?: string | null;
  collection_approved_at?: string | null;
  collection_sent_at?: string | null;
  collection_message_event_id?: string | null;
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

export interface FinanceBankAccount {
  id: string;
  professional_id: string;
  name: string;
  bank_name: string | null;
  account_type: "corrente" | "poupanca" | "caixa" | "gateway" | "outros";
  pix_key: string | null;
  opening_balance: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceCategory {
  id: string;
  professional_id: string;
  name: string;
  type: FinancialTransactionType;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceCostCenter {
  id: string;
  professional_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceGatewaySetting {
  id: string;
  provider: "manual" | "asaas" | "mercadopago" | "efibank" | "stripe" | "outros";
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  professional_id: string;
  name: string;
  sku: string | null;
  unit_price: number;
  stock_quantity: number;
  min_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceSettings {
  bankAccounts: FinanceBankAccount[];
  categories: FinanceCategory[];
  costCenters: FinanceCostCenter[];
  gateways: FinanceGatewaySetting[];
  products: Product[];
}

export interface PosSaleItemInput {
  item_type: "service" | "product" | "package" | "custom";
  service_id?: string | null;
  product_id?: string | null;
  service_package_id?: string | null;
  description: string;
  quantity: number;
  unit_amount: number;
}

export interface CreatePosSaleInput {
  clientId?: string | null;
  items: PosSaleItemInput[];
  paymentMethod: FinancialPaymentMethod;
  discountAmount?: number;
  bankAccountId?: string | null;
  categoryId?: string | null;
  costCenterId?: string | null;
  notes?: string | null;
}

export interface CreatePosSaleOutput {
  sale_id: string;
  transaction_id: string;
  sale: Record<string, unknown>;
  transaction: FinancialTransaction;
}

export interface ReconciliationItem {
  id: string;
  import_id: string;
  professional_id: string;
  occurred_on: string;
  description: string;
  amount: number;
  external_id: string | null;
  suggested_transaction_id: string | null;
  suggestion_score: number | null;
  status: "suggested" | "confirmed" | "ignored" | "unmatched";
  confirmed_transaction_id: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface ImportReconciliationInput {
  bankAccountId?: string | null;
  fileName: string;
  fileType: "csv" | "ofx";
  items: Array<{
    occurred_on: string;
    description: string;
    amount: number;
    external_id?: string | null;
  }>;
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

export interface ApproveBillingCollectionOutput {
  ok: true;
  transaction_id: string;
  client_id: string;
  phone_whatsapp: string | null;
  amount: number;
  description: string;
  message?: string | null;
}
