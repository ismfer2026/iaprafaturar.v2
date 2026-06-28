import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Copy, Languages, Loader2, Send, Sparkles } from "lucide-react";
import { Button, Input } from "@iaprafaturar/ui";
import type { Locale } from "@/i18n";
import { useI18n } from "@/i18n";
import { callPublicCreateAccount, isPublicCreateAccountError } from "@/lib/publicCreateAccount";

type StepKey = "name" | "email" | "phone";

interface Message {
  id: string;
  role: "agent" | "user";
  text: string;
}

const STEPS: StepKey[] = ["name", "email", "phone"];

function normalizeLocale(value: string | null): Locale {
  if (value === "en-US" || value === "es-419" || value === "pt-BR") return value;
  if (value?.toLowerCase().startsWith("en")) return "en-US";
  if (value?.toLowerCase().startsWith("es")) return "es-419";
  return "pt-BR";
}

function initialQuestion(ref: string | undefined): string {
  return ref
    ? "Recebi seu convite. Vou preparar seu acesso em poucos passos. Para comecar: qual e seu nome ou o nome da sua clinica?"
    : "Vou preparar seu acesso em poucos passos. Para comecar: qual e seu nome ou o nome da sua clinica?";
}

function nextQuestion(step: StepKey): string {
  if (step === "email") return "Perfeito. Qual e-mail voce quer usar para acessar sua conta?";
  return "Otimo. Qual WhatsApp devo vincular ao seu acesso?";
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

export default function PublicProfessionalOnboardingFlowPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setLocale } = useI18n();
  const lang = useMemo(() => normalizeLocale(searchParams.get("lang")), [searchParams]);
  const ref = searchParams.get("ref")?.trim() || undefined;

  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [createAccountUrl, setCreateAccountUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { id: "m0", role: "agent", text: initialQuestion(ref) },
  ]);

  function append(role: Message["role"], text: string) {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role, text }]);
  }

  function start() {
    setLocale(lang);
    setStarted(true);
  }

  async function finish(collectedPhone: string) {
    setIsLoading(true);
    setError(null);

    try {
      const data = await callPublicCreateAccount({
        mode: "create_preaccount",
        email: email.trim().toLowerCase(),
        name: name.trim(),
        phone_whatsapp: normalizePhone(collectedPhone),
        ref,
        lang,
        conversation: "public-professional-onboarding",
        collected_data: {
          entry_path: "/entrar",
          ref: ref ?? null,
          lang,
          flow: "professional_invite_webflow",
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone_whatsapp: normalizePhone(collectedPhone),
        },
      });

      if (isPublicCreateAccountError(data)) {
        setError("Nao consegui preparar sua conta com esses dados. Revise e tente novamente.");
        return;
      }

      const params = new URLSearchParams({
        pid: data.professional_id,
        email: data.email,
        lang,
      });
      if (ref) params.set("ref", ref);
      const url = `/criar-conta?${params.toString()}`;
      setCreateAccountUrl(url);
      append("agent", "Tudo pronto. Agora crie sua senha para entrar no iaprafaturar.");
    } catch {
      setError("Nao foi possivel concluir agora. Tente novamente em alguns instantes.");
    } finally {
      setIsLoading(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value || isLoading || createAccountUrl) return;

    setError(null);
    append("user", value);
    setInput("");

    const currentStep = STEPS[stepIndex]!;
    if (currentStep === "name") {
      setName(value);
      setStepIndex(1);
      append("agent", nextQuestion("email"));
      return;
    }

    if (currentStep === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        append("agent", "Esse e-mail parece invalido. Pode me enviar novamente?");
        return;
      }
      setEmail(value);
      setStepIndex(2);
      append("agent", nextQuestion("phone"));
      return;
    }

    if (normalizePhone(value).length < 8) {
      append("agent", "Esse WhatsApp parece incompleto. Pode me enviar com DDD?");
      return;
    }

    void finish(value);
  }

  function copyLink() {
    if (!createAccountUrl) return;
    void navigator.clipboard.writeText(`${window.location.origin}${createAccountUrl}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-bold text-yellow-300">iaprafaturar</span>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80">
            <Languages className="h-3.5 w-3.5" />
            {lang}
          </div>
        </div>

        {!started ? (
          <section className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/25 bg-white/15 shadow-xl">
              <Sparkles className="h-10 w-10" />
            </div>
            <h1 className="max-w-xl text-3xl font-black leading-tight sm:text-5xl">
              Vamos configurar seu acesso com a Rosane
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-white/75">
              Em poucos passos eu preparo sua conta e libero o link para criar sua senha.
            </p>
            {ref ? (
              <p className="mt-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85">
                Convite aplicado: {ref}
              </p>
            ) : null}
            <Button
              type="button"
              size="lg"
              className="mt-8 gap-2 rounded-2xl bg-yellow-400 px-10 py-6 text-lg font-black text-zinc-950 shadow-2xl shadow-yellow-400/30 hover:bg-yellow-300"
              onClick={start}
            >
              Comecar agora
              <ArrowRight className="h-5 w-5" />
            </Button>
          </section>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/95 text-zinc-950 shadow-2xl">
            <div className="border-b border-zinc-100 bg-white px-4 py-4">
              <p className="text-sm font-bold text-primary-800">Rosane</p>
              <p className="text-xs text-zinc-500">Onboarding publico do iaprafaturar</p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-zinc-50 px-4 py-5">
              {messages.map((message) => (
                <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <p
                    className={
                      message.role === "user"
                        ? "max-w-[82%] rounded-2xl rounded-br-sm bg-primary-700 px-4 py-3 text-sm leading-6 text-white"
                        : "max-w-[82%] rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-800 shadow-sm"
                    }
                  >
                    {message.text}
                  </p>
                </div>
              ))}

              {isLoading ? (
                <div className="flex justify-start">
                  <p className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparando seu link...
                  </p>
                </div>
              ) : null}

              {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

              {createAccountUrl ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Link criado
                  </div>
                  <p className="mt-2 break-all text-xs text-emerald-700">{`${window.location.origin}${createAccountUrl}`}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" className="gap-2" onClick={copyLink}>
                      <Copy className="h-4 w-4" />
                      {copied ? "Copiado" : "Copiar"}
                    </Button>
                    <Button type="button" className="gap-2" onClick={() => navigate(createAccountUrl)}>
                      Criar senha
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <form onSubmit={submit} className="flex gap-2 border-t border-zinc-100 bg-white p-3">
              <Input
                value={input}
                disabled={isLoading || Boolean(createAccountUrl)}
                placeholder={
                  stepIndex === 0 ? "Digite seu nome..." : stepIndex === 1 ? "Digite seu e-mail..." : "Digite seu WhatsApp..."
                }
                onChange={(event) => setInput(event.target.value)}
              />
              <Button type="submit" size="icon" disabled={isLoading || Boolean(createAccountUrl) || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
