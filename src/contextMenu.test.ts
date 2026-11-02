import { afterEach, describe, expect, it } from "vitest";
import { keepsContextMenu, suppressChromeContextMenu } from "./contextMenu";

let stop = () => {};
afterEach(() => {
  stop();
  document.body.innerHTML = "";
});

function rightClick(target: Element): boolean {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("suppressChromeContextMenu", () => {
  it("turns the menu off over the toolbar, sidebar and board", () => {
    document.body.innerHTML = `
      <header class="toolbar"><button>New Task</button></header>
      <nav class="sidebar"><span>Desk</span></nav>
      <div class="board"><div class="row">T1</div></div>`;
    stop = suppressChromeContextMenu();
    for (const selector of [".toolbar button", ".sidebar span", ".board .row"]) {
      expect(rightClick(document.querySelector(selector)!)).toBe(true);
    }
  });

  it("keeps the menu in text fields and content", () => {
    document.body.innerHTML = `
      <header class="toolbar"><input type="search" /></header>
      <aside class="task-pane"><p>Notes</p></aside>`;
    stop = suppressChromeContextMenu();
    expect(rightClick(document.querySelector("input")!)).toBe(false);
    expect(rightClick(document.querySelector("p")!)).toBe(false);
  });
});

describe("keepsContextMenu", () => {
  it("keeps the menu for targets that are not elements", () => {
    expect(keepsContextMenu(null)).toBe(true);
  });
});
