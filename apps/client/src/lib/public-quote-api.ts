import { readFunctionErrorBody } from "@/lib/function-error";
import { supabase } from "@/lib/supabase";

export interface PublicQuoteContext {
  ok: true;
  quote: {
    title: string;
    items: Array<Record<string, unknown>>;
    subtotal: number;
    discount_amount: number;
    total_amount: number;
    expires_at: string | null;
    notes: string | null;
    public_snapshot?: unknown;
  };
  professional: {
    name: string;
    slug: string;
  };
  client: {
    full_name: string;
  };
}

export interface PublicQuoteError {
  ok: false;
  error:
    | "not_found"
    | "expired"
    | "already_approved"
    | "already_rejected"
    | "already_converted"
    | "invalid_input"
    | "signature_required"
    | "internal_error";
}

export type PublicQuoteContextResult = PublicQuoteContext | PublicQuoteError;

export async function getPublicQuoteContext(token: string): Promise<PublicQuoteContextResult> {
  const { data, error } = await supabase.functions.invoke<PublicQuoteContextResult>("public-quote-handler", {
    body: {
      mode: "get_context",
      token
    }
  });

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicQuoteError>(error);
    if (errorBody) return errorBody;
    throw error;
  }
  if (!data) throw new Error("empty_public_quote_context");
  return data;
}

export async function decidePublicQuote(input: {
  token: string;
  decision: "approved" | "rejected";
  typedName?: string;
  acceptedTerms?: boolean;
}): Promise<{ ok: true; status: string } | PublicQuoteError> {
  const { data, error } = await supabase.functions.invoke<{ ok: true; status: string } | PublicQuoteError>(
    "public-quote-handler",
    {
      body: {
        mode: "decide",
        token: input.token,
        decision: input.decision,
        signature: {
          typedName: input.typedName,
          acceptedTerms: input.acceptedTerms
        }
      }
    }
  );

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicQuoteError>(error);
    if (errorBody) return errorBody;
    throw error;
  }
  if (!data) throw new Error("empty_public_quote_decision_response");
  return data;
}
