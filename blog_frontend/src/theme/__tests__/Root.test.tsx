import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";
import Root from "../Root";

describe("Root Theme Wrapper", () => {
  it("renders children wrapped within AuthProvider and FaroAwareErrorBoundary", () => {
    render(
      <Root>
        <div data-testid="child-content">Kalidass Content</div>
      </Root>
    );

    expect(screen.getByTestId("child-content")).toBeTruthy();
    expect(screen.getByText("Kalidass Content")).toBeTruthy();
  });
});
