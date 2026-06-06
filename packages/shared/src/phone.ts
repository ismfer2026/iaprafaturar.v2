/**
 * Normaliza telefone para E.164 sem o +
 * Input: qualquer formato brasileiro (ex: "(11) 99999-8888", "+5511999998888", "11999998888")
 * Output: "5511999998888"
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("55") && digits.length >= 12) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

/**
 * Formata número E.164 para exibição no padrão brasileiro
 * Input: "5511999998888"
 * Output: "(11) 99999-8888"
 */
export function formatPhoneBR(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;

  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }

  return e164;
}

/**
 * Valida se o número parece um celular brasileiro válido (E.164 sem +)
 */
export function isValidBrazilianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (!digits.startsWith("55")) return false;
  const local = digits.slice(2);
  return local.length === 10 || local.length === 11;
}
