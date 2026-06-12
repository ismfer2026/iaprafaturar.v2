import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Send } from "lucide-react";
import { Button, Card, CardContent, Input } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

interface Message {
  role: "admin" | "nexus";
  content: string;
}

export default function NexusPage() {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [amount, setAmount] = useState("200");
  const [reason, setReason] = useState("nexus_admin_credit");
  const [proposal, setProposal] = useState<{ proposal_id: string; confirmation_token: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "nexus", content: t("nexus.ready") }
  ]);
  const chat = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke<{ reply: string }>("admin-ai-gateway", {
        body: { mode: "panel_chat", channel: "panel", message },
      });
      if (error) throw error;
      return data?.reply ?? t("common.error");
    },
    onSuccess: (reply) => setMessages((current) => [...current, { role: "nexus", content: reply }]),
    onError: () => setMessages((current) => [...current, { role: "nexus", content: t("common.error") }]),
  });
  const proposeCredits = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("nexus_create_action_proposal", {
        p_action_type: "add_ai_credits",
        p_payload: { professional_id: professionalId, amount: Number(amount || 0), reason },
        p_reason: reason,
      });
      if (error) throw error;
      return data as { proposal_id: string; confirmation_token: string };
    },
    onSuccess: (data) => {
      setProposal(data);
      setMessages((current) => [...current, { role: "nexus", content: `${t("nexus.proposed")} ${data.confirmation_token}` }]);
    },
  });
  const confirmAndExecute = useMutation({
    mutationFn: async () => {
      if (!proposal) return;
      const confirm = await supabase.rpc("nexus_confirm_action", {
        p_proposal_id: proposal.proposal_id,
        p_confirmation_token: proposal.confirmation_token,
      });
      if (confirm.error) throw confirm.error;
      const execute = await supabase.rpc("nexus_execute_confirmed_action", {
        p_proposal_id: proposal.proposal_id,
      });
      if (execute.error) throw execute.error;
    },
    onSuccess: () => {
      setMessages((current) => [...current, { role: "nexus", content: t("nexus.executed") }]);
      setProposal(null);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      { role: "admin", content: text },
    ]);
    chat.mutate(text);
    setInput("");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-5 sm:px-6 lg:min-h-screen">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("nexus.title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("nexus.subtitle")}</p>
      </div>

      <Card className="flex min-h-[48vh] flex-1 flex-col rounded-lg">
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex-1 space-y-3">
            {messages.map((message, index) => (
              <div key={index} className={message.role === "admin" ? "flex justify-end" : "flex justify-start"}>
                <div className={message.role === "admin"
                  ? "max-w-[85%] rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white"
                  : "max-w-[85%] rounded-lg border bg-white px-3 py-2 text-sm text-zinc-700"}
                >
                  {message.role === "nexus" ? <Bot className="mb-2 h-4 w-4 text-violet-600" /> : null}
                  {message.content}
                </div>
              </div>
            ))}
          </div>

          <form className="flex gap-2" onSubmit={submit}>
            <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder={t("nexus.placeholder")} />
            <Button type="submit" variant="outline" aria-label={t("nexus.send")} disabled={chat.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_120px_1fr_auto]">
          <Input value={professionalId} onChange={(event) => setProfessionalId(event.target.value)} placeholder={t("nexus.professionalId")} />
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={t("nexus.amount")} />
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("nexus.reason")} />
          {proposal ? (
            <Button type="button" onClick={() => confirmAndExecute.mutate()} disabled={confirmAndExecute.isPending}>{t("nexus.confirm")}</Button>
          ) : (
            <Button type="button" onClick={() => proposeCredits.mutate()} disabled={!professionalId || !amount || proposeCredits.isPending}>{t("nexus.propose")}</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
