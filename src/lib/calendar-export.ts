import { z } from "zod";
import { APPOINTMENT_KIND_LABEL, type CalendarAppointment } from "./calendar";

export const manualAppointmentSchema = z.object({
  title: z.string().trim().min(1, "Enter an appointment title.").max(200),
  kind: z.enum(Object.keys(APPOINTMENT_KIND_LABEL) as [CalendarAppointment["kind"], ...CalendarAppointment["kind"][]]),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  location: z.string().trim().max(500),
  clientName: z.string().trim().max(200),
  notes: z.string().trim().max(5000),
}).refine(value => Date.parse(value.end) > Date.parse(value.start), {
  message: "End time must be after the start time.", path: ["end"],
});

const escapeText = (value: string) => value.replace(/\\/g, "\\\\")
  .replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,")
  .split("").filter(ch => ch.charCodeAt(0) >= 32 || ch === "\t").join("");
const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** RFC5545: fold at UTF-8 character boundaries, counting the continuation space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "", length = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (length + bytes > 75) { lines.push(current); current = " "; length = 1; }
    current += ch; length += bytes;
  }
  lines.push(current);
  return lines.join("\r\n");
}

/** Local export only: no attendee, organizer, invitation or background reminder is sent. */
export function appointmentToIcs(appointment: CalendarAppointment): string {
  const a = appointment;
  if (!Number.isFinite(Date.parse(a.start)) || !Number.isFinite(Date.parse(a.end)) || Date.parse(a.end) <= Date.parse(a.start)) {
    throw new Error("This appointment has invalid dates. Correct its start and end before exporting.");
  }
  if (a.allDay && a.end.slice(0,10) <= a.start.slice(0,10)) {
    throw new Error("An all-day appointment needs an exclusive end date after its start date.");
  }
  const dateLine = (name: string, value: string) => a.allDay
    ? name + ";VALUE=DATE:" + value.slice(0, 10).replace(/-/g, "")
    : name + ":" + stamp(value);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RealEstate AI//Local Calendar//EN",
    "BEGIN:VEVENT", "UID:" + escapeText(a.id) + "@realestate-ai.local",
    "DTSTAMP:" + stamp(new Date().toISOString()),
    dateLine("DTSTART", a.start), dateLine("DTEND", a.end),
    "SUMMARY:" + escapeText(a.title),
    "LOCATION:" + escapeText(a.location || ""),
    "DESCRIPTION:" + escapeText([a.clientName ? "Client: " + a.clientName : "", a.notes || "", ...a.reminders].filter(Boolean).join("\n")),
    "STATUS:" + (a.status === "cancelled" ? "CANCELLED" : a.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"),
    "END:VEVENT", "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
}

export function downloadTextFile(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
