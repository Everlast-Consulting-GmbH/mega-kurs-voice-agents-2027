import { describe, expect, it } from "vitest";
import { makeEvent, type JarvisEvent, type Lead } from "@jarvis/contracts";
import { initialState, reduce, type HudState } from "@/lib/events/reducer";
import { demoData } from "@/lib/apps/fixtures";
import { buildOffer, findLead, focusView, offerHtml, offerMailDraft, splitAmount } from "@/lib/apps/offer";
import { SCENARIOS } from "../../../tools/mock-events/src/scenarios";

const TODAY = new Date(2026, 9, 14, 9, 0);
const leads = demoData(TODAY).leads;

/** Replays a mock scenario through the real reducer, like the HUD does. */
function replay(name: string): HudState {
  let s = initialState;
  for (const step of SCENARIOS[name]!) if ("type" in step) s = reduce(s, makeEvent(step.type, step.payload as never) as JarvisEvent, step.at);
  return s;
}

describe("focus on a lead (reported: empty Angebot view)", () => {
  it("leads-widget: Müller GmbH focus renders content, not an empty card", () => {
    const s = replay("leads-widget");
    const focus = s.focus!;
    expect(focus).toMatchObject({ entity: "lead", entityId: "L-007", label: "Müller GmbH" });
    const view = focusView(s, focus, leads, TODAY);
    expect(view.facts.length + (view.offer ? 1 : 0)).toBeGreaterThan(0);
    expect(view.offer?.title).toContain("Müller GmbH");
  });

  it("matches the label before the id (fixtures number Müller L-001, the mock world L-007)", () => {
    expect(leads.find((l) => l.id === "L-007")?.company).toBe("Autohaus Krämer");
    expect(findLead({ entityId: "L-007", label: "Müller GmbH" }, leads)?.company).toBe("Müller GmbH");
    expect(findLead({ entityId: "L-003", label: "Angebot" }, leads)?.company).toBe("Brandt AG");
    expect(findLead({ entityId: "L-999", label: "Schulz AG" }, leads)).toBeUndefined();
  });

  it("keeps other entities on the conversation facts", () => {
    const s = replay("boot-briefing");
    const view = focusView(s, { ...s.focus!, entity: "mail" }, leads, TODAY);
    expect(view.offer).toBeNull();
  });
});

describe("buildOffer", () => {
  const mueller = leads.find((l) => l.company === "Müller GmbH")!;
  const offer = buildOffer(mueller, TODAY);

  it("derives the net total exactly from valueEur", () => {
    expect(offer.lines.reduce((a, l) => a + l.amountEur, 0)).toBe(84000);
    expect(offer.lines.map((l) => l.amountEur)).toEqual([12600, 37800, 16800, 8400, 8400]);
    expect(offer).toMatchObject({ netEur: 84000, vatEur: 15960, grossEur: 99960, number: "AN-2026-001", issuedAt: "14.10.2026", validUntil: "13.11.2026" });
    expect(offer.recipient).toEqual({ company: "Müller GmbH", name: "Thomas Müller", email: mueller.email, city: "München" });
  });

  it("splits odd totals without losing a euro", () => {
    for (const v of [9500, 18000, 22001, 120000, 1]) expect(splitAmount(v).reduce((a, b) => a + b, 0)).toBe(v);
  });

  it("is stable for the same lead and day", () => {
    expect(buildOffer(mueller, TODAY)).toEqual(offer);
  });

  it("prepares a mail draft and a print page, both marked as demo", () => {
    const draft = offerMailDraft(offer, "Leo");
    expect(draft).toMatchObject({ to: mueller.email, subject: "Angebot KI-Assistent für Müller GmbH (AN-2026-001)" });
    expect(draft.body).toContain("84.000 € netto");
    const html = offerHtml({ ...offer, situation: "<script>x</script>" });
    expect(html).toContain("99.960 €");
    expect(html).toContain("kein verbindliches Angebot");
    expect(html).not.toContain("<script>x");
  });
});

it("works for a live-shaped lead record", () => {
  const live: Lead = { ...leads[0]!, id: "L-007", email: "thomas.mueller@mueller.test" };
  expect(buildOffer(live, TODAY).number).toBe("AN-2026-007");
});
