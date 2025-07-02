import express from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
app.use(express.json());

const memoryStore: string[] = []; // 🧠 memory-based storage

const server = new McpServer({
  name: "gemini-server",
  version: "1.0.0",
});

// Tool: Add two numbers
server.registerTool(
  "add",
  {
    title: "Addition Tool",
    description: "Adds two numbers together",
    inputSchema: {
      a: z.number(),
      b: z.number(),
    },
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: `Result: ${a + b}` }],
  })
);

// Tool: Create note in memory
server.registerTool(
  "create-note",
  {
    title: "Note Creator",
    description: "Saves a note",
    inputSchema: {
      content: z.string(),
    },
  },
  async ({ content }) => {
    memoryStore.push(content);
    return {
      content: [
        {
          type: "text",
          text: `Note saved: "${content}" (total: ${memoryStore.length})`,
        },
      ],
    };
  }
);

// Tool: List all notes stored in memory
server.registerTool(
  "list-notes",
  {
    title: "Note Lister",
    description: "Returns all notes saved so far",
    inputSchema: {}, 
  },
  async () => {
    if (memoryStore.length === 0) {
      return {
        content: [{ type: "text", text: "📝 No notes found yet." }],
      };
    }

    const formatted = memoryStore
      .map((note, i) => `${i + 1}. ${note}`)
      .join("\n");
    return {
      content: [{ type: "text", text: `🗒 Notes:\n${formatted}` }],
    };
  }
);
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  let transport = sessionId && transports[sessionId];

  // Create new transport if one doesn't exist
  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId ?? randomUUID(),
      onsessioninitialized: (id) => (transports[id] = transport!),
    });

    transport.onclose = () => {
      if (transport!.sessionId) delete transports[transport.sessionId];
    };

    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (
  req: express.Request,
  res: express.Response
) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};
app.get("/mcp", handleSessionRequest);

// Handle DELETE requests for session termination
app.delete("/mcp", handleSessionRequest);
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["mcp-session-id"],
    allowedHeaders: ["Content-Type", "mcp-session-id"],
  })
);

app.listen(3000, () => {
  console.log("✅ MCP Server running on http://localhost:3000/mcp");
});
