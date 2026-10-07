import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";
import KalidasaEpigraph from "../KalidasaEpigraph";

describe("KalidasaEpigraph (Hermetic)", () => {
  it("renders the Sanskrit verse with proper quotation semantics", () => {
    render(<KalidasaEpigraph />);
    const section = screen.getByRole("region", {name: "Kalidasa Epigraph"});
    expect(section).toBeTruthy();

    const sanskritText = screen.getByText(/पुराणमित्येव न साधु सर्वं/);
    expect(sanskritText).toBeTruthy();
    expect(sanskritText.textContent).toContain("सन्तः परीक्ष्यान्यतरद्भजन्ते");
  });

  it("renders the English translation and meaning", () => {
    render(<KalidasaEpigraph />);
    expect(screen.getByText("Translation & Meaning:")).toBeTruthy();
    expect(
      screen.getByText(
        /Everything is not good simply because it is old, nor is a creation flawed merely because it is new/
      )
    ).toBeTruthy();
    expect(
      screen.getByText(/The wise examine with an open, discerning mind/)
    ).toBeTruthy();
  });

  it("displays the play attribution and verse badge", () => {
    render(<KalidasaEpigraph />);
    expect(screen.getByText("Mālavikāgnimitra // Act 1, Verse 2")).toBeTruthy();
    expect(screen.getByText("Prologue by Kalidasa")).toBeTruthy();
  });
});
