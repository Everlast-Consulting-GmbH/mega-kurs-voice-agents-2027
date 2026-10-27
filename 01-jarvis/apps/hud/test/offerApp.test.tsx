// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OfferApp } from "@/components/apps/OfferApp";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("does not replace an unknown requested company with another company's offer", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  try {
    await act(async () => root.render(<OfferApp selectedLeadId="L-999" onSelect={onSelect} />));
    expect(host.querySelector('[data-testid="offer-document"]')).toBeNull();
    expect(host.textContent).toContain("Der angefragte Lead ist nicht geladen");
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => root.render(<OfferApp selectedLeadId="L-002" onSelect={onSelect} />));
    expect(host.querySelector('[data-testid="offer-document"]')?.textContent).toContain("Hansa Kliniken");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "L-002" }));
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
