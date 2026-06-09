import type {
  PublicCreateAccountCompleteOutput,
  PublicCreateAccountErrorOutput,
  PublicCreateAccountInput,
  PublicCreateAccountPreaccountOutput,
  PublicCreateAccountStatusOutput,
} from "@iaprafaturar/contracts/edge-functions/public-create-account";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string;
const supabaseAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string;

export type PublicCreateAccountOutput =
  | PublicCreateAccountStatusOutput
  | PublicCreateAccountPreaccountOutput
  | PublicCreateAccountCompleteOutput
  | PublicCreateAccountErrorOutput;

export function isPublicCreateAccountError(
  data: PublicCreateAccountOutput,
): data is PublicCreateAccountErrorOutput {
  return data.ok === false;
}

export async function callPublicCreateAccount(
  input: PublicCreateAccountInput,
): Promise<PublicCreateAccountOutput> {
  const response = await fetch(`${supabaseUrl}/functions/v1/public-create-account`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${supabaseAnonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as PublicCreateAccountOutput;
  return data;
}
