import { describe, expect, it } from "vitest";
import { isJsonRpc, mcpToolDescriptors, MCP_TOOLS, writeRequiresApproval } from "./index.ts";

describe("BlakID MCP tools", () => {
  it("lists the initial read and write tools", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("blakid_get_user");
    expect(names).toContain("blakid_list_security_findings");
    expect(names).toContain("blakid_suspend_user");
  });

  it("requires human approval for high-impact writes", () => {
    expect(writeRequiresApproval("blakid_list_users")).toBe(false);
    expect(writeRequiresApproval("blakid_suspend_user")).toBe(true);
    expect(writeRequiresApproval("blakid_invite_user")).toBe(true);
    expect(writeRequiresApproval("blakid_revoke_session")).toBe(true);
  });

  it("describes tools for MCP JSON-RPC", () => {
    expect(isJsonRpc({ jsonrpc: "2.0", method: "tools/list", id: 1 })).toBe(true);
    expect(mcpToolDescriptors().some((t) => t.name === "blakid_suspend_user")).toBe(true);
  });
});

