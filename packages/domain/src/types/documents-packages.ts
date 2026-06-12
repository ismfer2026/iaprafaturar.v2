import type { FinancialPaymentMethod } from "./financial";

export type ClientPackageStatus = "ativo" | "esgotado" | "expirado" | "cancelado";
export type QuoteStatus = "rascunho" | "enviado" | "aprovado" | "rejeitado" | "expirado" | "convertido";
export type ModeloType =
  | "contrato"
  | "termo_lgpd"
  | "consentimento_clinico"
  | "responsabilidade"
  | "contrato_pacote"
  | "orcamento";
export type ContractStatus = "rascunho" | "enviado" | "assinado_manual" | "cancelado" | "expirado";

export interface ServicePackage {
  id: string;
  professional_id: string;
  service_id: string | null;
  name: string;
  slug: string;
  total_sessions: number;
  price: number;
  validity_days: number | null;
  description: string | null;
  is_active: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ServicePackageWithService extends ServicePackage {
  service_name?: string | null;
}

export interface ClientPackage {
  id: string;
  professional_id: string;
  client_id: string;
  service_package_id: string;
  financial_transaction_id: string | null;
  sessions_total: number;
  sessions_used: number;
  sessions_remaining: number;
  purchased_at: string;
  expires_at: string | null;
  status: ClientPackageStatus;
  created_at: string;
  updated_at: string;
}

export interface ClientPackageWithDetails extends ClientPackage {
  client_name?: string | null;
  package_name?: string | null;
  package_price?: number | null;
}

export interface PackageSessionUsage {
  id: string;
  professional_id: string;
  client_package_id: string;
  session_id: string;
  appointment_id: string | null;
  used_at: string;
  used_by: string | null;
}

export interface CreateServicePackageInput {
  name: string;
  serviceId?: string | null;
  totalSessions: number;
  price: number;
  validityDays?: number | null;
  description?: string | null;
  isPublic?: boolean;
}

export interface CreateServicePackageOutput {
  service_package_id: string;
  service_package: ServicePackage;
}

export interface SellClientPackageInput {
  clientId: string;
  servicePackageId: string;
  paymentMethod: FinancialPaymentMethod;
  amount?: number | null;
  purchasedAt?: string | null;
  expiresAt?: string | null;
}

export interface SellClientPackageOutput {
  client_package_id: string;
  financial_transaction_id: string;
  client_package: ClientPackage;
}

export interface UseClientPackageSessionInput {
  clientPackageId: string;
  sessionId: string;
  appointmentId?: string | null;
}

export interface UseClientPackageSessionOutput {
  usage_id: string;
  client_package: ClientPackage;
}

export interface QuoteItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Quote {
  id: string;
  professional_id: string;
  client_id: string;
  quote_number: string;
  title: string;
  items: QuoteItem[];
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  status: QuoteStatus;
  expires_at: string | null;
  notes: string | null;
  sent_at: string | null;
  public_token?: string | null;
  public_token_expires_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  expired_at?: string | null;
  followup_sent_at?: string | null;
  pdf_url?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface QuoteWithClient extends Quote {
  client_name?: string | null;
}

export interface CreateQuoteInput {
  clientId: string;
  title: string;
  items: QuoteItem[];
  discountAmount?: number;
  expiresAt?: string | null;
  notes?: string | null;
}

export interface CreateQuoteOutput {
  quote_id: string;
  quote: Quote;
}

export interface SendQuoteDryRunOutput {
  quote_id: string;
  status: "enviado";
  dry_run: true;
}

export interface SendQuoteForApprovalOutput {
  quote_id: string;
  status: "enviado";
  public_token: string;
  public_token_expires_at: string;
}

export interface ConvertApprovedQuoteOutput {
  ok: true;
  target: "contract" | "package";
  contract_id?: string;
  client_package_id?: string;
  financial_transaction_id?: string;
}

export interface Modelo {
  id: string;
  professional_id: string;
  name: string;
  type: ModeloType;
  content: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateModeloInput {
  name: string;
  type: ModeloType;
  content: string;
  variables?: string[];
}

export interface CreateModeloOutput {
  modelo_id: string;
  modelo: Modelo;
}

export interface Contract {
  id: string;
  professional_id: string;
  client_id: string;
  modelo_id: string | null;
  quote_id: string | null;
  client_package_id: string | null;
  type: ModeloType;
  content_snapshot: string | null;
  status: ContractStatus;
  external_url: string | null;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ContractWithClient extends Contract {
  client_name?: string | null;
  modelo_name?: string | null;
}

export interface CreateContractFromModeloInput {
  clientId: string;
  modeloId: string;
  type?: ModeloType | null;
  quoteId?: string | null;
  clientPackageId?: string | null;
  expiresAt?: string | null;
}

export interface CreateContractOutput {
  contract_id: string;
  contract: Contract;
}

export interface MarkContractSignedManualOutput {
  contract_id: string;
  status: "assinado_manual";
}

export interface AnamneseTemplate {
  id: string;
  professional_id: string;
  name: string;
  fields: Record<string, unknown>;
  is_default: boolean;
  version: number;
  previous_version_id: string | null;
  root_template_id: string;
  published_at: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UpdateAnamneseTemplateInput {
  templateId: string;
  name: string;
  fields: Record<string, unknown>;
  isDefault?: boolean;
}

export interface UpdateAnamneseTemplateOutput {
  template_id: string;
  template: AnamneseTemplate;
}

export interface CreateAnamneseTemplateVersionInput {
  templateId: string;
  name: string;
  fields: Record<string, unknown>;
  isDefault?: boolean;
}

export interface CreateAnamneseTemplateVersionOutput {
  template_id: string;
  template: AnamneseTemplate;
  previous_version_id: string;
}
