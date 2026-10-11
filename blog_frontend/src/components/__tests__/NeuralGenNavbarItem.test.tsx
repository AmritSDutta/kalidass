import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import NeuralGenNavbarItem from "../NeuralGenNavbarItem";

describe("NeuralGenNavbarItem (Hermetic)", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete (window as any).location;
    window.location = {
      ...originalLocation,
      href: "https://kalidass.amrit.fyi/",
    } as any;
  });

  afterEach(() => {
    (window as any).location = originalLocation;
  });

  it("renders a native anchor tag pointing to /generate_article", () => {
    render(<NeuralGenNavbarItem />);
    const link = screen.getByRole("link", {name: "Neural Gen"});
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/generate_article");
  });

  it("applies desktop navbar classes by default", () => {
    render(<NeuralGenNavbarItem className="custom-test-class" />);
    const link = screen.getByRole("link", {name: "Neural Gen"});
    expect(link.className).toContain("navbar__item");
    expect(link.className).toContain("navbar__link");
    expect(link.className).toContain("custom-test-class");
  });

  it("applies mobile drawer classes when mobile is true", () => {
    render(<NeuralGenNavbarItem mobile={true} />);
    const link = screen.getByRole("link", {name: "Neural Gen"});
    expect(link.className).toContain("menu__link");
    expect(link.className).not.toContain("navbar__item");
  });

  it("forces hard window.location.href assignment on standard click", () => {
    render(<NeuralGenNavbarItem />);
    const link = screen.getByRole("link", {name: "Neural Gen"});
    fireEvent.click(link);
    expect(window.location.href).toBe("/generate_article");
  });

  it("does not prevent default when modifier keys are pressed (e.g. ctrlKey/metaKey)", () => {
    render(<NeuralGenNavbarItem />);
    const link = screen.getByRole("link", {name: "Neural Gen"});
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    link.dispatchEvent(event);
    expect(window.location.href).toBe("https://kalidass.amrit.fyi/");
  });
});
