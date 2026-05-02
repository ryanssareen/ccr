import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuotaState } from "@ccr/core";
import { SettingsPanel } from "../components/SettingsPanel.js";

afterEach(() => cleanup());

describe("SettingsPanel", () => {
  it("persists model picks through onPickModel", async () => {
    const onPick = vi.fn(async () => undefined);
    render(
      <SettingsPanel
        auth={{ email: "u@ccr.test" }}
        model="llama-3.3-70b-versatile"
        mode="ask"
        quota={null}
        customModelDraft="llama-3.3-70b-versatile"
        onCustomDraft={() => undefined}
        onPickModel={(m) =>
          void onPick(m)}
        onModePick={() => undefined}
      />,
    );

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "llama-3.1-8b-instant" } });

    expect(onPick).toHaveBeenCalledWith("llama-3.1-8b-instant");
  });

  it("renders quota used / limit · resets", () => {
    const q: QuotaState = {
      used: 900,
      limit: 1000,
      resetAt: new Date("2026-05-31T00:00:00.000Z"),
    };
    render(
      <SettingsPanel
        auth={{ email: "u@ccr.test" }}
        model="m"
        mode="bypass"
        quota={q}
        customModelDraft="m"
        onCustomDraft={() => undefined}
        onPickModel={() => undefined}
        onModePick={() => undefined}
      />,
    );

    expect(screen.getByText(/900/)).toBeTruthy();
    expect(screen.getByText(/1,000/)).toBeTruthy();
    expect(screen.getByText(/May 31/)).toBeTruthy();
  });

  it("unsigned user sees login hint", () => {
    render(
      <SettingsPanel
        auth={null}
        model="m"
        mode="ask"
        quota={null}
        customModelDraft=""
        onCustomDraft={() => undefined}
        onPickModel={() => undefined}
        onModePick={() => undefined}
      />,
    );
    expect(screen.getByText(/ccr login/)).toBeTruthy();
  });
});
