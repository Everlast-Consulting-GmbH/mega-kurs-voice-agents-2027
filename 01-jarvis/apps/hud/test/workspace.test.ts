import { beforeEach, describe, expect, it } from "vitest";
import { useHud } from "@/lib/events/store";
import { useCrmDemo } from "@/lib/apps/crmDemo";
import { useMailDemo } from "@/lib/apps/mailDemo";
import { isTyping, useUi } from "@/lib/ui";

describe("interactive workspace", () => {
  beforeEach(() => useUi.setState({ workspace: null, hiddenStageKey: null }));

  it("keeps a manually opened app until explicitly closed and can open a specific deal", () => {
    useUi.getState().openApp("crm", "L-007");
    expect(useUi.getState().workspace).toMatchObject({ app: "crm", entityId: "L-007" });
    useUi.getState().openApp("mail");
    expect(useUi.getState().workspace).toMatchObject({ app: "mail" });
    expect(useUi.getState().workspace?.entityId).toBeUndefined();
    useUi.getState().closeApp("focus-lead-L-007-1");
    expect(useUi.getState().workspace).toBeNull();
    expect(useUi.getState().hiddenStageKey).toBe("focus-lead-L-007-1");
    useUi.getState().openApp("offer", "L-007");
    expect(useUi.getState().hiddenStageKey).toBeNull();
  });

  it("all HUD reset entry points clear local app state", () => {
    useUi.getState().openApp("mail");
    useMailDemo.getState().actions.compose();
    useCrmDemo.getState().dispatch({ type: "search", query: "Müller" });
    useHud.getState().reset();
    expect(useUi.getState().workspace).toBeNull();
    expect(useMailDemo.getState().compose).toBeNull();
    expect(useCrmDemo.getState().state.query).toBe("");
  });
  it("does not interpret typing a reply as demo director shortcuts", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isTyping({ target: { tagName } } as unknown as KeyboardEvent)).toBe(true);
    }
    expect(isTyping({ target: { tagName: "DIV", isContentEditable: true } } as unknown as KeyboardEvent)).toBe(true);
    expect(isTyping({ target: { tagName: "BUTTON" } } as unknown as KeyboardEvent)).toBe(false);
  });
});
