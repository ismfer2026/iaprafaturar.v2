import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, ChevronRight, Loader, Send } from "lucide-react";
import { Button, Input } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { buildPublicPath, readRefParam } from "@/lib/public-flow-state";

type PageState = "loading" | "chat" | "done" | "error";

interface Message {
  id: string;
  sender: "cliente" | "agente";
  content: string;
  timestamp: Date;
}

interface CadastroAgentResponse {
  ok?: boolean;
  error?: string;
  reply?: string;
  collected_data?: Record<string, unknown>;
  is_complete?: boolean;
  portal_url?: string;
  session_token?: string;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatTime(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale === "es-419" ? "es-419" : locale, { hour: "2-digit", minute: "2-digit" });
}

function firstNameFromData(data: Record<string, unknown>): string {
  const firstName = data["first_name"];
  if (typeof firstName === "string" && firstName.trim()) return firstName.trim();
  const fullName = data["full_name"];
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim().split(/\s+/)[0] ?? "";
  return "";
}

export default function PublicClientOnboardingPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const ref = readRefParam(location.search);

  const [pageState, setPageState] = useState<PageState>("loading");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);
  const [collectedData, setCollectedData] = useState<Record<string, unknown>>({});
  const [portalUrl, setPortalUrl] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [clientName, setClientName] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  const startedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    if (pageState !== "chat" || isThinking) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [isThinking, pageState]);

  function appendMessage(sender: Message["sender"], content: string) {
    setMessages((current) => [
      ...current,
      { id: makeId(sender), sender, content, timestamp: new Date() },
    ]);
  }

  async function invokeAgent(input: {
    message: string;
    conversation: Array<{ role: string; content: string }>;
    collectedData: Record<string, unknown>;
  }) {
    const { data, error } = await supabase.functions.invoke<CadastroAgentResponse>("cadastro-agent", {
      body: {
        mode: "web_chat",
        slug,
        message: input.message,
        conversation: input.conversation,
        collected_data: input.collectedData,
        locale,
        ...(ref ? { ref } : {}),
      },
    });

    if (error) throw error;
    if (!data || data.ok === false) throw new Error(data?.error ?? "cadastro_agent_failed");
    return data;
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!slug) {
      setErrorDetail("missing_slug");
      setPageState("error");
      return;
    }

    async function start() {
      setPageState("chat");
      setIsThinking(true);
      try {
        const data = await invokeAgent({ message: "INICIO", conversation: [], collectedData: {} });
        const reply = data.reply || "Oi! Para comecar, qual e o seu nome?";
        appendMessage("agente", reply);
        setConversation([{ role: "assistant", content: reply }]);
        setCollectedData(data.collected_data ?? {});
      } catch (error) {
        setErrorDetail(error instanceof Error ? error.message : String(error));
        setPageState("error");
      } finally {
        setIsThinking(false);
      }
    }

    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = inputValue.trim();
    if (!text || isThinking) return;

    setInputValue("");
    appendMessage("cliente", text);
    const nextConversation = [...conversation, { role: "user", content: text }];
    setConversation(nextConversation);
    setIsThinking(true);

    try {
      const data = await invokeAgent({ message: text, conversation: nextConversation, collectedData });
      const nextCollected = data.collected_data ?? collectedData;
      setCollectedData(nextCollected);
      const firstName = firstNameFromData(nextCollected);
      if (firstName) setClientName(firstName);

      const reply = data.reply || "Pode repetir sua ultima resposta?";
      appendMessage("agente", reply);
      setConversation([...nextConversation, { role: "assistant", content: reply }]);

      if (data.is_complete) {
        if (data.portal_url) setPortalUrl(data.portal_url);
        if (data.session_token) setSessionToken(data.session_token);
        window.setTimeout(() => setPageState("done"), 900);
      }
    } catch (error) {
      console.error("[PublicClientOnboardingPage] cadastro-agent error:", error);
      appendMessage("agente", "Tive um problema tecnico. Pode repetir sua ultima resposta?");
    } finally {
      setIsThinking(false);
    }
  }

  function openPortal() {
    if (sessionToken) {
      navigate(buildPublicPath(`/portal/${sessionToken}`, { lang: locale, ...(ref ? { ref } : {}) }), { replace: true });
      return;
    }
    if (portalUrl) window.location.href = portalUrl;
  }

  if (pageState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-white">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D6E6E]">
            <span className="text-2xl font-black text-white">ia</span>
          </div>
          <Loader className="mx-auto h-5 w-5 animate-spin text-[#0D6E6E]" />
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-white p-4">
        <div className="max-w-md space-y-4 text-center">
          <AlertCircle size={56} className="mx-auto text-red-500" />
          <h1 className="text-2xl font-bold">{t("common.notFound.title")}</h1>
          <p className="text-sm text-zinc-500">{t("clientOnboarding.error.load")}</p>
          {location.search.includes("debug=1") && errorDetail ? (
            <pre className="max-h-48 overflow-auto rounded border bg-white p-3 text-left text-xs text-zinc-600">{errorDetail}</pre>
          ) : null}
        </div>
      </div>
    );
  }

  if (pageState === "done") {
    const firstName = clientName || "Voce";
    return (
      <div
        className="flex min-h-screen items-center justify-center p-4"
        style={{ background: "linear-gradient(160deg, #0D6E6E 0%, #1a1a2e 60%)" }}
      >
        <div className="w-full max-w-md space-y-6 text-center text-white">
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 rounded-full bg-white/15" />
            <CheckCircle2 size={80} className="relative z-10 text-[#4DB6AC]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black">Cadastro concluido</h1>
            <p className="text-sm leading-6 text-white/70">
              {firstName}, seus dados foram recebidos. Agora voce pode acessar seu portal para acompanhar agendamentos e informacoes.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="h-14 w-full gap-2 rounded-2xl bg-[#4DB6AC] text-base font-black text-white hover:bg-[#43a49a]"
            onClick={openPortal}
          >
            Abrir portal do cliente
            <ChevronRight className="h-5 w-5" />
          </Button>
          <p className="text-xs text-white/40">iaprafaturar</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#F8FFFE", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: "#0D6E6E",
          padding: "14px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>ia</span>
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Cadastro inteligente</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>Assistente da clinica</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "80px 16px 96px" }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: "flex",
              justifyContent: message.sender === "cliente" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: "78%",
                padding: "10px 14px",
                borderRadius: message.sender === "cliente" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                backgroundColor: message.sender === "cliente" ? "#0D6E6E" : "#fff",
                color: message.sender === "cliente" ? "#fff" : "#111",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              }}
            >
              <p style={{ fontSize: 14, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{message.content}</p>
              <p
                style={{
                  fontSize: 10,
                  margin: "4px 0 0",
                  color: message.sender === "cliente" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.35)",
                  textAlign: "right",
                }}
              >
                {formatTime(message.timestamp, locale)}
              </p>
            </div>
          </div>
        ))}

        {isThinking ? (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "16px 16px 16px 4px",
                padding: "12px 16px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 150, 300].map((delay) => (
                  <div
                    key={delay}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "#0D6E6E",
                      animation: "client-onboarding-bounce 1s infinite",
                      animationDelay: `${delay}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "#fff",
          borderTop: "1px solid #E8F5F5",
          padding: "12px 16px",
        }}
      >
        <form onSubmit={handleSendMessage} style={{ display: "flex", gap: 8 }}>
          <Input
            ref={inputRef}
            value={inputValue}
            placeholder="Digite sua resposta..."
            disabled={isThinking}
            onChange={(event) => setInputValue(event.target.value)}
            style={{ flex: 1, borderRadius: 12 }}
          />
          <Button
            type="submit"
            disabled={isThinking || !inputValue.trim()}
            style={{ backgroundColor: "#0D6E6E", borderRadius: 12, padding: "0 16px" }}
            className="hover:opacity-90"
          >
            {isThinking ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
          </Button>
        </form>
      </div>

      <style>{`
        @keyframes client-onboarding-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
