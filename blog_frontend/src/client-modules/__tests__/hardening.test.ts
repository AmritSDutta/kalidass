import {describe, it, expect} from "vitest";
import {isDevtoolsShortcut} from "../hardening";

describe("Devtools hardening (Hermetic)", () => {
  it("blocks F12 regardless of modifiers", () => {
    expect(isDevtoolsShortcut({key: "F12"})).toBe(true);
    expect(isDevtoolsShortcut({key: "F12", ctrlKey: true})).toBe(true);
  });

  it("blocks Ctrl/Cmd+Shift+I/J/C devtools shortcuts", () => {
    expect(isDevtoolsShortcut({key: "I", ctrlKey: true, shiftKey: true})).toBe(true);
    expect(isDevtoolsShortcut({key: "j", metaKey: true, shiftKey: true})).toBe(true);
    expect(isDevtoolsShortcut({key: "C", ctrlKey: true, shiftKey: true})).toBe(true);
  });

  it("blocks Ctrl/Cmd+U view-source shortcut", () => {
    expect(isDevtoolsShortcut({key: "u", ctrlKey: true})).toBe(true);
    expect(isDevtoolsShortcut({key: "U", metaKey: true})).toBe(true);
  });

  it("allows normal typing, copying, and unmodified letters", () => {
    expect(isDevtoolsShortcut({key: "a"})).toBe(false);
    expect(isDevtoolsShortcut({key: "c", ctrlKey: true})).toBe(false);
    expect(isDevtoolsShortcut({key: "i", ctrlKey: true, shiftKey: false})).toBe(false);
    expect(isDevtoolsShortcut({key: "u"})).toBe(false);
    expect(isDevtoolsShortcut({key: ""})).toBe(false);
  });
});
