import { describe, expect, it } from "vitest";
import { appointmentToIcs, manualAppointmentSchema } from "@/lib/calendar-export";
import type { CalendarAppointment } from "@/lib/calendar";
const event: CalendarAppointment = {
  id:"local-1",source:"manual",title:"Client showing",kind:"showing",status:"scheduled",
  start:"2026-10-01T19:00:00.000Z",end:"2026-10-01T20:00:00.000Z",location:"123 Main, Unit 2",
  notes:"Review disclosures",reminders:[],importedAt:"2026-09-20T12:00:00.000Z",
};
describe("manual calendar",()=>{
  it("rejects missing titles, invalid dates and reversed intervals",()=>{
    const input={title:event.title,kind:event.kind,start:event.start,end:event.end,location:"",clientName:"",notes:""};
    expect(manualAppointmentSchema.safeParse(input).success).toBe(true);
    expect(manualAppointmentSchema.safeParse({...input,title:" "}).success).toBe(false);
    expect(manualAppointmentSchema.safeParse({...input,start:"bad"}).success).toBe(false);
    expect(manualAppointmentSchema.safeParse({...input,end:input.start}).success).toBe(false);
  });
  it("exports UTC dates and escaped notes without injecting events or invitations",()=>{
    const output=appointmentToIcs({...event,notes:"Line 1\nEND:VEVENT\nBEGIN:VEVENT; test, path\\file"});
    expect(output).toContain("DTSTART:20261001T190000Z\r\n");
    expect(output).toContain("LOCATION:123 Main\\, Unit 2\r\n");
    expect(output.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1);
    expect(output).toContain("DESCRIPTION:Line 1\\nEND:VEVENT\\nBEGIN:VEVENT\\; test\\, path\\\\file");
    expect(output).not.toMatch(/ATTENDEE|ORGANIZER|METHOD:REQUEST/);
  });
  it("folds Unicode safely and exports all-day exclusive end dates",()=>{
    const output=appointmentToIcs({...event,allDay:true,end:"2026-10-02T00:00:00.000Z",title:"🏡".repeat(60)});
    for(const line of output.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(output.replace(/\r\n /g,"")).toContain("SUMMARY:"+"🏡".repeat(60));
    expect(output).toContain("DTSTART;VALUE=DATE:20261001");
    expect(output).toContain("DTEND;VALUE=DATE:20261002");
    expect(()=>appointmentToIcs({...event,allDay:true})).toThrow("exclusive end date");
    expect(()=>appointmentToIcs({...event,end:"invalid"})).toThrow("invalid dates");
  });
});
