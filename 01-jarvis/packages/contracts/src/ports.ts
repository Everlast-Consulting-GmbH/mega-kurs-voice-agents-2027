// Local development ports. Every service reads its own port from env with these defaults.
export const PORTS = {
  hud: 3000,
  orchestrator: 8787, // HTTP tool gateway, WS /events, MCP /mcp
  mockWorld: 8700, // REST API + web UIs (mail, crm, praxis)
  cuWorker: 8800, // task API
  cuVnc: 6080, // noVNC of the agent desktop
  voiceAgent: 8900, // optional telephony service for place_call (not included in this repo)
} as const;
