export const MCP_READ_TOOLS = [
  "blakid_get_user",
  "blakid_list_users",
  "blakid_get_group",
  "blakid_list_groups",
  "blakid_list_applications",
  "blakid_get_identity_risk",
  "blakid_list_security_findings",
  "blakid_get_audit_events",
] as const;

export const MCP_WRITE_TOOLS = [
  "blakid_invite_user",
  "blakid_suspend_user",
  "blakid_add_group_member",
  "blakid_remove_group_member",
  "blakid_revoke_session",
] as const;

export type McpReadTool = (typeof MCP_READ_TOOLS)[number];
export type McpWriteTool = (typeof MCP_WRITE_TOOLS)[number];
export type McpToolName = McpReadTool | McpWriteTool;

export type McpTool = {
  name: McpToolName;
  description: string;
  write: boolean;
  requiresApproval: boolean;
};

export const MCP_TOOLS: McpTool[] = [
  { name: "blakid_get_user", description: "Get one organisation identity", write: false, requiresApproval: false },
  { name: "blakid_list_users", description: "List organisation identities", write: false, requiresApproval: false },
  { name: "blakid_get_group", description: "Get a group", write: false, requiresApproval: false },
  { name: "blakid_list_groups", description: "List groups", write: false, requiresApproval: false },
  { name: "blakid_list_applications", description: "List applications", write: false, requiresApproval: false },
  { name: "blakid_get_identity_risk", description: "Get organisation identity risk summary", write: false, requiresApproval: false },
  { name: "blakid_list_security_findings", description: "List identity security findings", write: false, requiresApproval: false },
  { name: "blakid_get_audit_events", description: "List audit events", write: false, requiresApproval: false },
  { name: "blakid_invite_user", description: "Invite a person", write: true, requiresApproval: true },
  { name: "blakid_suspend_user", description: "Suspend an identity and revoke sessions", write: true, requiresApproval: true },
  { name: "blakid_add_group_member", description: "Add a group member", write: true, requiresApproval: true },
  { name: "blakid_remove_group_member", description: "Remove a group member", write: true, requiresApproval: true },
  { name: "blakid_revoke_session", description: "Revoke sessions for an identity", write: true, requiresApproval: true },
];

export function mcpTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

export function writeRequiresApproval(name: string): boolean {
  return mcpTool(name)?.requiresApproval === true;
}
