import { useState, type FormEvent } from "react";
import { Bot, Send } from "lucide-react";
import { Button, Card, CardContent, Input } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";

interface Message {
  role: "admin" | "nexus";
  content: string;
}

export default function NexusPage() {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "nexus", content: t("nexus.pending") }
  ]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      { role: "admin", content: text },
      { role: "nexus", content: t("nexus.pending") }
    ]);
    setInput("");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-5 sm:px-6 lg:min-h-screen">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("nexus.title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("nexus.subtitle")}</p>
      </div>

      <Card className="flex min-h-[60vh] flex-1 flex-col rounded-lg">
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
            <Button type="submit" aria-label={t("nexus.send")}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
