import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TskMissing } from "./TskMissing";

vi.mock("../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/client")>()) }));

afterEach(cleanup);

describe("TskMissing", () => {
  it("shows the seconds when tsk timed out", () => {
    render(<TskMissing tsk={null} error={{ kind: "timeout", seconds: 30 }} onChoosePath={() => {}} />);
    expect(screen.getByText("tsk didn't finish within 30 seconds.")).toBeInTheDocument();
  });
});
