"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Lightbulb, Send, Sparkles } from "lucide-react";
import { useExpenseStore } from "@/store/expense-store";
import { buildCoachReply, getCoachInsights } from "@/lib/analytics";
import { useHaptic } from "@/hooks/use-haptic";
import { cn } from "@/lib/utils";
import type { CoachMessage } from "@/lib/types";

const SUGGESTIONS = [
  "Am I overspending anywhere?",
  "What does my cash flow look like?",
  "Any tips to save more?",
  "How much are my subscriptions?",
];

function loadChat(): CoachMessage[] {
  try {
    const raw = localStorage.getItem("coach-chat");
    return raw ? (JSON.parse(raw) as CoachMessage[]) : [];
  } catch {
    return [];
  }
}

function saveChat(messages: CoachMessage[]): void {
  try {
    localStorage.setItem("coach-chat", JSON.stringify(messages.slice(-50)));
  } catch {
    // storage full / private mode — fine
  }
}

/**
 * AI Financial Coach.
 *
 * Deterministic, offline rule-based engine today (`buildCoachReply`); swap in a
 * real LLM call behind the same function signature for deeper reasoning.
 */
export function CoachView() {
  const expenses = useExpenseStore((s) => s.expenses);
  const subscriptions = useExpenseStore((s) => s.subscriptions);
  const haptic = useHaptic();

  const insights = useMemo(
    () => getCoachInsights(expenses, subscriptions),
    [expenses, subscriptions],
  );

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadChat());
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || typing) return;
    haptic("tap");
    const userMsg: CoachMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setTyping(true);
    // Simulate model latency for a natural feel.
    setTimeout(() => {
      const reply: CoachMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: buildCoachReply(question, expenses, subscriptions),
        createdAt: new Date().toISOString(),
      };
      const done = [...next, reply];
      setMessages(done);
      setTyping(false);
      saveChat(done);
      haptic("success");
    }, 700);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Insights header */}
      <div className="flex flex-col gap-3 px-4 pt-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-amber-400" />
          <h2 className="text-base font-semibold">Financial coach</h2>
        </div>
        {insights.length > 0 && (
          <div className="flex flex-col gap-2">
            {insights.map((i) => (
              <div
                key={i.id}
                className={cn(
                  "rounded-2xl border px-3 py-2.5 text-sm",
                  i.kind === "warning" && "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
                  i.kind === "tip" && "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                  i.kind === "success" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  i.kind === "info" && "border-primary/20 bg-primary/10 text-primary",
                )}
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  <Lightbulb className="size-3.5" /> {i.title}
                </p>
                <p className="mt-0.5 text-xs opacity-90">{i.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat thread */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto mt-6 flex max-w-xs flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white">
              <Bot className="size-6" />
            </span>
            <p className="text-sm text-muted-foreground">
              Ask me anything about your spending habits.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
              m.role === "user"
                ? "self-end bg-primary text-primary-foreground"
                : "self-start border bg-card",
            )}
          >
            {m.content}
          </div>
        ))}
        {typing && (
          <div className="flex items-center gap-1 self-start rounded-2xl border bg-card px-3.5 py-2.5">
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form
        className="border-t bg-background/80 px-4 py-3 backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your coach…"
            className="min-w-0 flex-1 rounded-full border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            aria-label="Send"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            disabled={!input.trim() || typing}
          >
            <Send className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
