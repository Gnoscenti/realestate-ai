import { useMemo, useState } from "react";
import { CalendarCheck, Check, Copy, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { answerFaq, listFaqs, type FaqSide } from "@/lib/faq-assistants";
import { generateShowingSequence } from "@/lib/showing-sequences";
import type { AgentProfile, Lead, Property } from "@/data/seed";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.message("Select text to copy");
  }
}

export function ShowingFollowUpPanel(props: {
  lead?: Lead | null;
  property?: Property | null;
  profile?: AgentProfile | null;
  onLogged?: () => void;
}) {
  const seq = useMemo(
    () =>
      generateShowingSequence({
        lead: props.lead,
        property: props.property,
        profile: props.profile,
      }),
    [props.lead, props.property, props.profile],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-4 w-4 text-[var(--color-primary)]" />
          {seq.title}
        </CardTitle>
        <CardDescription>
          Pre-tour confirm → same-day feedback → day 1 / 3 / 7 nurture. Copy and
          send; auto-SMS stays off until a provider is wired.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {seq.touches.map((step) => (
          <div
            key={step.id}
            data-testid={`showing-touch-${step.id}`}
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{step.label}</Badge>
                <span className="text-xs text-[var(--color-fg-subtle)]">{step.channel}</span>
                <span className="text-xs text-[var(--color-fg-subtle)]">{step.purpose}</span>
              </div>
              {step.subject && (
                <p className="mt-1 text-xs font-medium">Subject: {step.subject}</p>
              )}
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-fg-muted)]">
                {step.body}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void copyText(step.subject ? `Subject: ${step.subject}\n\n${step.body}` : step.body)}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
          </div>
        ))}
        <Button
          onClick={() => {
            props.onLogged?.();
            toast.success("Logged — schedule touches from the sequence");
          }}
        >
          <Check className="h-4 w-4" />
          Log sequence started
        </Button>
      </CardContent>
    </Card>
  );
}

export function BuyerSellerFaqPanel(props: { profile?: AgentProfile | null }) {
  const [faqSide, setFaqSide] = useState<FaqSide>("buyer");
  const [faqQuery, setFaqQuery] = useState("Do I need a pre-approval before touring?");
  const faq = useMemo(
    () => answerFaq(faqQuery, faqSide, props.profile),
    [faqQuery, faqSide, props.profile],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4 text-[var(--color-primary)]" />
          Buyer &amp; seller FAQ assistant
        </CardTitle>
        <CardDescription>
          Instant process answers. Fair Housing–safe — not legal or lending advice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={faqSide === "buyer" ? "default" : "outline"}
            onClick={() => {
              setFaqSide("buyer");
              setFaqQuery("Do I need a pre-approval before touring?");
            }}
          >
            Buyer FAQs
          </Button>
          <Button
            size="sm"
            variant={faqSide === "seller" ? "default" : "outline"}
            onClick={() => {
              setFaqSide("seller");
              setFaqQuery("How do you price my home?");
            }}
          >
            Seller FAQs
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {listFaqs(faqSide).map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant="outline"
              className="h-auto max-w-full whitespace-normal text-left text-xs"
              onClick={() => setFaqQuery(item.question)}
            >
              {item.question}
            </Button>
          ))}
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {faq.matched?.question || "Answer"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg)]">{faq.answer}</p>
          <p className="mt-3 text-[11px] text-[var(--color-fg-subtle)]">{faq.disclaimer}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void copyText(`${faq.answer}\n\n${faq.disclaimer}`)}>
            <Copy className="h-4 w-4" />
            Copy answer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
