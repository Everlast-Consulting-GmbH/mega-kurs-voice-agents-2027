import { beforeEach, describe, expect, it } from "vitest";
import { demoData } from "@/lib/apps/fixtures";
import { canSend, mailLists, resolveFocusMail, unreadCount, useMailDemo, visibleMail } from "@/lib/apps/mailDemo";

const emails = demoData(new Date(2026, 9, 12, 9, 0)).emails;
const mueller = emails.find((e) => e.id === "M-101")!;
const klein = emails.find((e) => e.id === "M-103")!;
const store = () => useMailDemo.getState();
const act = () => store().actions;
const typeAll = () => {
  for (let i = 0; i < 500 && store().compose?.ai; i++) act().tick(7);
};

describe("interactive mail demo", () => {
  beforeEach(() => act().reset());

  it("replies to the selected fixture mail with recipient and Re: subject prefilled", () => {
    act().reply(mueller);
    expect(store().compose).toMatchObject({ mode: "reply", to: "t.mueller@mueller-gmbh.example", toName: "Thomas Müller", subject: "Re: Unterschrift heute möglich?", body: "" });
    expect(store().selectedId).toBe("M-101");
  });

  it("does not stack Re: prefixes", () => {
    act().reply({ ...klein, subject: "Re: Workshop-Termine Q4" });
    expect(store().compose?.subject).toBe("Re: Workshop-Termine Q4");
  });

  it("sending a reply lands in the sent folder, marks the mail replied and closes the editor", () => {
    act().reply(mueller);
    act().edit("body", "Passt, bis 15 Uhr.");
    expect(act().send()).toBe(true);
    const s = store();
    expect(s.compose).toBeNull();
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatchObject({ to: "t.mueller@mueller-gmbh.example", subject: "Re: Unterschrift heute möglich?", body: "Passt, bis 15 Uhr.", inReplyTo: "M-101" });
    expect(s.lastSent).toMatchObject({ toName: "Thomas Müller", seq: 1 });
    // M-101 and M-102 start unread; the answered one no longer counts
    expect(unreadCount(s, emails)).toBe(1);
  });

  it("a new mail needs a valid recipient and a body before it can be sent", () => {
    act().compose();
    act().edit("subject", "Kurzes Update");
    act().edit("body", "Hallo Mara, alles im Plan.");
    act().edit("to", "mara");
    expect(canSend(store().compose)).toBe(false);
    expect(act().send()).toBe(false);
    expect(store().sent).toHaveLength(0);
    act().edit("to", "mara.schulz@leos-agentur.example");
    expect(act().send()).toBe(true);
    expect(store().sent[0]).toMatchObject({ toName: "Mara Schulz", subject: "Kurzes Update", inReplyTo: null });
  });

  it("newest sent mail comes first and ids stay unique", () => {
    for (const body of ["Erste", "Zweite"]) {
      act().compose();
      act().edit("to", "team@leos-agentur.example");
      act().edit("body", body);
      act().send();
    }
    expect(store().sent.map((m) => m.body)).toEqual(["Zweite", "Erste"]);
    expect(new Set(store().sent.map((m) => m.id)).size).toBe(2);
    expect(store().lastSent?.seq).toBe(2);
  });

  it("the Jarvis draft types a deterministic German reply that only promises what was asked", () => {
    act().reply(mueller);
    act().aiDraft(mueller);
    expect(store().compose?.body).toBe("");
    act().tick(10);
    expect(store().compose?.body).toBe("Hallo Herr");
    typeAll();
    const body = store().compose!.body;
    expect(store().compose?.ai).toBeNull();
    expect(body).toMatch(/^Hallo Herr Müller,/);
    expect(body).toContain("15 Uhr");
    expect(body.trim().endsWith("Leo")).toBe(true);

    act().reset();
    act().reply(mueller);
    act().aiDraft(mueller);
    typeAll();
    expect(store().compose?.body).toBe(body);
  });

  it("cannot send while Jarvis is still typing", () => {
    act().reply(mueller);
    act().aiDraft(mueller);
    act().tick(40);
    expect(act().send()).toBe(false);
    typeAll();
    expect(act().send()).toBe(true);
  });

  it("typing stops on manual edit, on selecting another mail and on stop, keeping what is on screen", () => {
    act().reply(mueller);
    act().aiDraft(mueller);
    act().tick(12);
    act().edit("body", store().compose!.body + "!");
    expect(store().compose).toMatchObject({ ai: null, body: "Hallo Herr M!" });

    act().aiDraft(mueller);
    act().tick(5);
    act().select("M-102");
    expect(store().compose?.ai).toBeNull();
    act().tick(50);
    expect(store().compose?.body).toBe("Hallo");

    act().aiDraft(mueller);
    act().tick(5);
    act().stopTyping();
    act().tick(50);
    expect(store().compose?.body).toBe("Hallo");
  });

  it("drafts a sensible generic mail for a new message", () => {
    act().compose();
    act().edit("to", "lena.schuster@stadtwerke-innland.example");
    act().edit("subject", "Störungshotline");
    act().aiDraft(null);
    typeAll();
    expect(store().compose?.body).toBe(
      "Hallo Lena Schuster,\n\nich melde mich wegen „Störungshotline“. Haben Sie diese Woche Zeit für ein kurzes Gespräch? Ich richte mich gern nach Ihrem Kalender.\n\nViele Grüße\nLeo",
    );
  });

  it("discarding drops the draft but keeps sent mail", () => {
    act().compose();
    act().edit("to", "team@leos-agentur.example");
    act().edit("body", "Bleibt");
    act().send();
    act().reply(klein);
    act().edit("body", "Weg damit");
    act().discard();
    expect(store().compose).toBeNull();
    expect(store().sent.map((m) => m.body)).toEqual(["Bleibt"]);
  });

  it("an attached invitation travels with the sent mail", () => {
    act().reply(mueller);
    act().toggleInvite();
    act().edit("body", "Einladung anbei.");
    act().send();
    expect(store().sent[0]?.invite).toBe(true);
  });

  it("opening a folder clears the selection and reading marks a mail as read", () => {
    act().select("M-102");
    expect(unreadCount(store(), emails)).toBe(1);
    act().open("sent");
    expect(store()).toMatchObject({ folder: "sent", selectedId: null });
  });
});

describe("visible mail", () => {
  beforeEach(() => act().reset());
  const newest = [...emails].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]!;

  it("without a selection it is the newest inbox mail, like the list shows it", () => {
    expect(mailLists(store(), emails).inbox[0]!.id).toBe(newest.id);
    expect(visibleMail(store(), emails)).toMatchObject({ id: newest.id, folder: "inbox", subject: newest.subject, from: newest.from });
  });

  it("follows the search: the first hit, not the first fixture mail", () => {
    act().search("Rechnung");
    expect(visibleMail(store(), emails)).toMatchObject({ id: "M-104", subject: "Rechnung #2026-114" });
    act().search("gibt es nicht");
    expect(visibleMail(store(), emails)).toBeNull();
  });

  it("knows sent demo mails that are not in the app data", () => {
    act().reply(mueller);
    act().edit("body", "Passt, bis 15 Uhr.");
    act().send();
    act().open("sent");
    expect(visibleMail(store(), emails)).toMatchObject({ id: "S-1", folder: "sent", to: "t.mueller@mueller-gmbh.example", body: "Passt, bis 15 Uhr.", subject: "Re: Unterschrift heute möglich?" });
  });

  it("uses the visible compose rather than the selected underlying inbox mail", () => {
    act().prefill({ to: "demo@example.test", subject: "Mein Angebot", body: "Lokaler Entwurf" });
    expect(visibleMail(store(), emails)).toMatchObject({ draft: true, to: "demo@example.test", subject: "Mein Angebot", body: "Lokaler Entwurf" });
  });

  it("strips the company from the sender name", () => {
    act().select("M-103");
    expect(visibleMail(store(), emails)).toMatchObject({ fromName: "Sarah Klein", from: "s.klein@brandt-ag.example" });
  });

  it("focus opens the inbox, clears the search and selects the mail", () => {
    act().open("sent");
    act().search("xyz");
    act().focus("M-105");
    expect(store()).toMatchObject({ folder: "inbox", query: "", selectedId: "M-105" });
    expect(visibleMail(store(), emails)?.id).toBe("M-105");
  });
});

describe("ui.focus label resolver", () => {
  it("keeps known fixture ids", () => {
    expect(resolveFocusMail({ entityId: "M-101", label: "egal" }, emails)).toBe("M-101");
  });

  it("maps backend ids by subject, as the gateway sends it", () => {
    expect(resolveFocusMail({ entityId: "M-003", label: "KI-Empfang: erste Eindrücke" }, emails)).toBe("M-102");
  });

  it("maps backend ids by a unique sender name", () => {
    expect(resolveFocusMail({ entityId: "M-003", label: "Dr. Weber – Angebot?" }, emails)).toBe("M-102");
  });

  it("returns null instead of guessing when nothing matches", () => {
    expect(resolveFocusMail({ entityId: "M-009", label: "PraxisPilot: Testzugang bereit" }, emails)).toBeNull();
    expect(resolveFocusMail({ entityId: "M-009", label: "" }, emails)).toBeNull();
  });

  it("returns null when the label fits several mails", () => {
    const twins = [mueller, { ...klein, id: "M-200", fromName: "Petra Müller" }];
    expect(resolveFocusMail({ entityId: "M-003", label: "Mail von Müller" }, twins)).toBeNull();
  });
});

describe("prefilled mail (offer)", () => {
  beforeEach(() => act().reset());
  const offer = { to: "t.mueller@mueller-gmbh.example", subject: "Angebot (A-1)", body: "Hallo Herr Müller,\n\nanbei unser Angebot." };

  it("opens a new mail with recipient, subject and body", () => {
    act().prefill(offer);
    expect(store().compose).toMatchObject({ mode: "new", ...offer, toName: "T Mueller", ai: null });
    expect(canSend(store().compose)).toBe(true);
  });

  it("stashes a started draft and brings it back on discard", () => {
    act().reply(klein);
    act().edit("body", "Mein halber Satz");
    act().prefill(offer);
    expect(store().compose?.subject).toBe(offer.subject);
    expect(store().stash).toHaveLength(1);
    act().discard();
    expect(store().compose).toMatchObject({ mode: "reply", replyTo: "M-103", body: "Mein halber Satz" });
    expect(store().stash).toHaveLength(0);
  });

  it("brings the stashed draft back after sending the offer", () => {
    act().compose();
    act().edit("subject", "Notiz");
    act().prefill(offer);
    expect(act().send()).toBe(true);
    expect(store().sent[0]).toMatchObject({ subject: offer.subject });
    expect(store().compose).toMatchObject({ subject: "Notiz" });
  });

  it("an empty editor is not stashed", () => {
    act().compose();
    act().prefill(offer);
    act().discard();
    expect(store().compose).toBeNull();
  });

  it("keeps only what is on screen of a running AI draft", () => {
    act().reply(mueller);
    act().aiDraft(mueller);
    act().tick(10);
    act().prefill(offer);
    expect(store().stash[0]).toMatchObject({ ai: null });
    expect(store().stash[0]!.body).toHaveLength(10);
  });
});
