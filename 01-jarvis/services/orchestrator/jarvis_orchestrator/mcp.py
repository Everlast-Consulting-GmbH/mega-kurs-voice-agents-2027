import json

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

from .contracts import catalog


class McpEndpoint:
    def __init__(self, gateway):
        self.server = Server("jarvis-orchestrator")

        @self.server.list_tools()
        async def list_tools():
            return [
                types.Tool(
                    name=item["name"],
                    description=item["description"],
                    inputSchema=item["inputSchema"],
                )
                for item in catalog()
            ]

        @self.server.call_tool()
        async def call_tool(name, arguments):
            request = self.server.request_context.request
            session_id = request.query_params.get("sessionId", "demo") if request else "demo"
            if not session_id.strip():
                raise ValueError("sessionId darf nicht leer sein")
            result = await gateway.call(name, arguments, session_id)
            return types.CallToolResult(
                content=[
                    types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False))
                ],
                structuredContent=result,
                isError=not result["ok"],
            )

        self.manager = StreamableHTTPSessionManager(self.server, json_response=True, stateless=True)

    async def __call__(self, scope, receive, send):
        await self.manager.handle_request(scope, receive, send)
