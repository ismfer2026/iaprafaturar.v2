import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Send, Wifi } from "lucide-react";
import { Button, cn } from "@iaprafaturar/ui";
import { useOnboardingChat } from "@/hooks/useOnboardingChat";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { messages, stepIndex, totalSteps, completed, isLoading, error, send } = useOnboardingChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    send(null);
  }, [send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isLoading && !completed && messages.length > 0) {
      inputRef.current?.focus();
    }
  }, [isLoading, completed, messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading || completed) return;
    setInput("");
    send(text);
  }

  const progressPercent = totalSteps > 0 ? Math.round((Math.min(stepIndex, totalSteps) / totalSteps) * 100) : 0;

  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white shadow-sm">
            N
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-950">Nerissa</p>
            <p className="text-xs text-primary-600">IA para Faturar — Configuração</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-zinc-500 sm:block">
            {completed ? "Concluído!" : `Passo ${Math.min(stepIndex + 1, totalSteps)} de ${totalSteps}`}
          </span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100 sm:w-28">
            <div
              className="h-full rounded-full bg-primary-600 transition-all duration-500"
              style={{ width: `${completed ? 100 : progressPercent}%` }}
            />
          </div>
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "nerissa" && (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white shadow-sm">
                N
              </div>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                msg.role === "nerissa"
                  ? "rounded-tl-sm bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-100"
                  : "rounded-tr-sm bg-primary-600 text-white",
              )}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex items-end gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white shadow-sm">
              N
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-white px-4 py-3.5 shadow-sm ring-1 ring-zinc-100">
              <span
                className="h-2 w-2 animate-bounce rounded-full bg-zinc-400"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="h-2 w-2 animate-bounce rounded-full bg-zinc-400"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="h-2 w-2 animate-bounce rounded-full bg-zinc-400"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          </div>
        )}

        {/* Completion CTAs */}
        {completed && !isLoading && (
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
            <Button
              className="gap-2"
              onClick={() => navigate("/configuracoes/agentes")}
            >
              <Wifi className="h-4 w-4" />
              Conectar WhatsApp agora
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => navigate("/dashboard")}
            >
              Explorar o dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-center text-xs text-red-600">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!completed && (
        <div className="border-t border-zinc-200 bg-white px-4 py-3">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isLoading ? "Nerissa está digitando..." : "Digite sua resposta..."}
              disabled={isLoading}
              className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm transition-all hover:bg-primary-700 disabled:opacity-40 disabled:shadow-none"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
