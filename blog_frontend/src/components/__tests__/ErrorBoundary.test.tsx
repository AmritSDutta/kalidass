import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import ErrorBoundary from "../ErrorBoundary";

vi.mock("../../client-modules/faro", () => ({getFaro: vi.fn()}));

import {getFaro} from "../../client-modules/faro";

const mockedGetFaro = vi.mocked(getFaro);

function Bomb(): never {
  throw new Error("render explosion");
}

describe("FaroAwareErrorBoundary (Hermetic)", () => {
  it("renders children when no error occurs", () => {
    mockedGetFaro.mockReturnValue(null);
    render(
      <ErrorBoundary fallback={<div>Fallback UI</div>}>
        <div>Healthy child</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Healthy child")).toBeTruthy();
  });

  it("renders fallback and reports the error to Faro when a child throws", () => {
    const pushError = vi.fn();
    mockedGetFaro.mockReturnValue({api: {pushError}} as never);

    const originalError = console.error;
    console.error = () => {};
    try {
      render(
        <ErrorBoundary fallback={<div>Fallback UI</div>}>
          <Bomb />
        </ErrorBoundary>
      );
    } finally {
      console.error = originalError;
    }

    expect(screen.getByText("Fallback UI")).toBeTruthy();
    expect(pushError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({type: "ErrorBoundary"}));
  });

  it("still renders fallback when Faro telemetry itself throws", () => {
    mockedGetFaro.mockImplementation(() => {
      throw new Error("telemetry down");
    });

    const originalError = console.error;
    console.error = () => {};
    try {
      render(
        <ErrorBoundary fallback={<div>Safe Fallback</div>}>
          <Bomb />
        </ErrorBoundary>
      );
    } finally {
      console.error = originalError;
    }

    expect(screen.getByText("Safe Fallback")).toBeTruthy();
  });
});
