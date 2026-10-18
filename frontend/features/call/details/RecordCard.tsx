// Правая карточка нижней панели — выбирается по состоянию звонка (по приоритету сверху вниз).

import TicketCard from "@/shared/ui/TicketCard";
import type { CallState } from "../model/callState";
import BookingCard from "./BookingCard";
import HandoffCard from "./HandoffCard";
import OptionsCard from "./OptionsCard";
import { EmptyCard, OperatorCard } from "./StateCards";

export default function RecordCard({ call, onChoose }: { call: CallState; onChoose: (i: number) => void }) {
  const { options, escalation, ticket, booking, mode, sending } = call;
  if (options.length) return <OptionsCard options={options} disabled={sending} onChoose={onChoose} />;
  if (escalation) return <HandoffCard escalation={escalation} operatorOnLine={mode === "operator"} />;
  if (ticket && booking?.kind !== "pending") return <TicketCard ticket={ticket} />;
  if (booking) return <BookingCard booking={booking} />;
  if (mode !== "ai") return <OperatorCard onLine={mode === "operator"} />;
  return <EmptyCard />;
}
