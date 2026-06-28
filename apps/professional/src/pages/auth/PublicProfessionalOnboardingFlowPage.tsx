import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ChevronRight, Copy, ExternalLink, Loader, Send } from "lucide-react";
import { Button, Input } from "@iaprafaturar/ui";
import type { Locale } from "@/i18n";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

type PageState = "welcome" | "chat" | "concluido" | "erro";
interface Message {
  id: string;
  sender: "profissional" | "agente";
  content: string;
  timestamp: Date;
}

function normalizeLocale(value: string | null): Locale {
  if (value === "en-US" || value === "es-419" || value === "pt-BR") return value;
  if (value?.toLowerCase().startsWith("en")) return "en-US";
  if (value?.toLowerCase().startsWith("es")) return "es-419";
  return "pt-BR";
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function PublicProfessionalOnboardingFlowPage() {
  const [searchParams] = useSearchParams();
  const { setLocale } = useI18n();
  const lang = useMemo(() => normalizeLocale(searchParams.get("lang")), [searchParams]);
  const refCode = searchParams.get("ref")?.trim() || "";

  const [pageState, setPageState] = useState<PageState>("welcome");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [criarContaUrl, setCriarContaUrl] = useState("");
  const [profName, setProfName] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);
  const [collectedData, setCollectedData] = useState<Record<string, unknown>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocale(lang);
  }, [lang, setLocale]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    if (pageState !== "chat" || isThinking) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [isThinking, pageState]);

  const appendMessage = (sender: Message["sender"], content: string) => {
    setMessages((current) => [
      ...current,
      {
        id: makeId(sender),
        sender,
        content,
        timestamp: new Date(),
      },
    ]);
  };

  const invokeAgent = async (input: {
    message: string;
    conversation: Array<{ role: string; content: string }>;
    collectedData: Record<string, unknown>;
  }) => {
    const { data, error } = await supabase.functions.invoke("onboarding-agent", {
      body: {
        mode: "web_chat",
        message: input.message,
        conversation: input.conversation,
        collected_data: input.collectedData,
        ref_code: refCode,
        locale: lang,
      },
    });

    if (error) throw error;
    return data as {
      reply?: string;
      collected_data?: Record<string, unknown>;
      is_complete?: boolean;
      criar_conta_url?: string;
    };
  };

  const startChat = async () => {
    setPageState("chat");
    setIsThinking(true);

    try {
      const data = await invokeAgent({ message: "INICIO", conversation: [], collectedData: {} });
      const reply = data.reply || "Oi! Para comecar, qual e o seu nome?";
      appendMessage("agente", reply);
      setConversation([{ role: "assistant", content: reply }]);
      setCollectedData(data.collected_data ?? {});
    } catch {
      setPageState("erro");
    } finally {
      setIsThinking(false);
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const userText = message.trim();
    if (!userText || isThinking) return;

    setMessage("");
    appendMessage("profissional", userText);
    const nextConversation = [...conversation, { role: "user", content: userText }];
    setConversation(nextConversation);
    setIsThinking(true);

    try {
      const data = await invokeAgent({ message: userText, conversation: nextConversation, collectedData });
      if (data.collected_data) {
        setCollectedData(data.collected_data);
        const firstName = data.collected_data["first_name"];
        if (typeof firstName === "string") setProfName(firstName);
      }

      const reply = data.reply || "Pode repetir sua ultima resposta?";
      appendMessage("agente", reply);
      setConversation([...nextConversation, { role: "assistant", content: reply }]);

      if (data.is_complete && data.criar_conta_url) {
        setCriarContaUrl(data.criar_conta_url);
        window.setTimeout(() => setPageState("concluido"), 1200);
      }
    } catch {
      appendMessage("agente", "Tive um problema tecnico. Pode repetir sua ultima resposta?");
    } finally {
      setIsThinking(false);
    }
  };

  const handleCopy = () => {
    if (!criarContaUrl) return;
    void navigator.clipboard.writeText(criarContaUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString(lang === "es-419" ? "es-419" : lang, { hour: "2-digit", minute: "2-digit" });

  const languagePill = (
    <div
      style={{
        position: "fixed",
        top: 14,
        right: 14,
        zIndex: 60,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.12)",
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        padding: "7px 10px",
        backdropFilter: "blur(10px)",
      }}
    >
      {lang}
    </div>
  );

  if (pageState === "erro") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center" style={{ background: "#F8FFFE" }}>
        <div className="max-w-sm space-y-4">
          <p className="text-4xl">!</p>
          <h1 className="text-xl font-bold">Nao foi possivel iniciar</h1>
          <p className="text-sm text-zinc-500">Tente novamente em alguns instantes.</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (pageState === "concluido") {
    const firstName = profName.trim().split(/\s+/)[0] || "Pronto";
    const steps = [
      { n: "1", title: "Crie sua senha", desc: "Abra o link abaixo e defina sua senha de acesso." },
      { n: "2", title: "Instale o app", desc: "Salve o iaprafaturar na tela inicial do seu celular." },
      { n: "3", title: "Configure a Rosane", desc: "Conecte WhatsApp, agenda e preferenciais da clinica." },
    ];

    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "linear-gradient(160deg, #0D6E6E 0%, #1a1a2e 60%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 20px",
        }}
      >
        {languagePill}
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <CheckCircle2 size={44} color="#4DB6AC" />
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", margin: "0 0 8px" }}>
            {firstName}, seu acesso esta quase pronto
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", margin: "0 0 32px" }}>
            Agora falta criar sua senha e entrar no painel.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            {steps.map(({ n, title, desc }) => (
              <div
                key={n}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  padding: "12px 16px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#0D6E6E",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {n}
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: 16,
              border: "1px solid rgba(255,255,255,0.15)",
              marginBottom: 12,
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                fontWeight: 700,
                marginBottom: 8,
                letterSpacing: "0.05em",
              }}
            >
              LINK DE ACESSO
            </p>
            <p style={{ fontSize: 11, color: "#4DB6AC", fontFamily: "monospace", wordBreak: "break-all", marginBottom: 12 }}>
              {criarContaUrl}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCopy}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: copied ? "rgba(77,182,172,0.3)" : "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Copy size={14} />
                {copied ? "Copiado" : "Copiar link"}
              </button>
              <a
                href={criarContaUrl}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "linear-gradient(135deg, #0D6E6E, #4DB6AC)",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  textDecoration: "none",
                  boxShadow: "0 4px 16px rgba(13,110,110,0.5)",
                }}
              >
                <ExternalLink size={14} />
                Abrir agora
              </a>
            </div>
          </div>

          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>iaprafaturar</p>
        </div>
      </div>
    );
  }

  if (pageState === "welcome") {
    const features = [
      { icon: "IA", text: "Assistente inteligente" },
      { icon: "AG", text: "Agenda automatica" },
      { icon: "CRM", text: "CRM da clinica" },
      { icon: "$", text: "Mais faturamento" },
    ];

    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "linear-gradient(160deg, #0D6E6E 0%, #1a1a2e 60%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 20px",
        }}
      >
        {languagePill}
        <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 22 }}>ia</span>
          </div>

          <p style={{ fontSize: 12, fontWeight: 700, color: "#4DB6AC", letterSpacing: "0.1em", marginBottom: 12 }}>
            ONBOARDING INTELIGENTE
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "#fff", margin: "0 0 16px", lineHeight: 1.2 }}>
            iaprafaturar
          </h1>

          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.8)", margin: "0 0 12px", lineHeight: 1.6 }}>
            Vou fazer algumas perguntas para preparar sua conta e liberar sua{" "}
            <strong style={{ color: "#4DB6AC" }}>assistente de IA</strong>.
          </p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", margin: "0 0 40px" }}>
            Leva menos de 2 minutos.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 40 }}>
            {features.map(({ icon, text }) => (
              <div
                key={text}
                style={{
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 13, color: "#4DB6AC", fontWeight: 900, minWidth: 24 }}>{icon}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={startChat}
            style={{
              width: "100%",
              padding: "18px",
              background: "linear-gradient(135deg, #0D6E6E, #4DB6AC)",
              border: "none",
              borderRadius: 16,
              color: "#fff",
              fontSize: 17,
              fontWeight: 900,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              boxShadow: "0 6px 24px rgba(13,110,110,0.6)",
            }}
          >
            Comecar agora
            <ChevronRight size={20} />
          </button>
          {refCode ? (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 14 }}>
              Codigo de convite: {refCode}
            </p>
          ) : null}
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
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>iaprafaturar</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Configurando seu acesso</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "80px 16px 96px" }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: msg.sender === "profissional" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: "78%",
                padding: "10px 14px",
                borderRadius: msg.sender === "profissional" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                backgroundColor: msg.sender === "profissional" ? "#0D6E6E" : "#fff",
                color: msg.sender === "profissional" ? "#fff" : "#111",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              }}
            >
              <p style={{ fontSize: 14, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{msg.content}</p>
              <p
                style={{
                  fontSize: 10,
                  margin: "4px 0 0",
                  color: msg.sender === "profissional" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.35)",
                  textAlign: "right",
                }}
              >
                {formatTime(msg.timestamp)}
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
                      animation: "public-onboarding-bounce 1s infinite",
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
        <form onSubmit={handleSend} style={{ display: "flex", gap: 8 }}>
          <Input
            ref={inputRef}
            placeholder="Digite sua resposta..."
            disabled={isThinking}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            style={{ flex: 1, borderRadius: 12 }}
          />
          <Button
            type="submit"
            disabled={isThinking || !message.trim()}
            style={{ backgroundColor: "#0D6E6E", borderRadius: 12, padding: "0 16px" }}
            className="hover:opacity-90"
          >
            {isThinking ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
          </Button>
        </form>
      </div>

      <style>{`
        @keyframes public-onboarding-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
