import { config } from "dotenv";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

config();
const rl = readline.createInterface({ input, output });

async function startClient() {
  const client = new Client({ name: "tool-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000/mcp")
  );

  console.log("🔌 Connecting to MCP server...");
  await client.connect(transport);
  console.log("✅ Connected!");

  const tools = (await client.listTools()).tools;

  console.log("\n🧰 Available Tools:");
  tools.forEach((tool, i) => {
    console.log(`  [${i}] ${tool.name} - ${tool.description}`);
  });

  while (true) {
    const index = Number(await rl.question("\n🔢 Choose a tool (index): "));
    const tool = tools[index];

    if (!tool) {
      console.log("❌ Invalid selection. Try again.");
      continue;
    }

    const args: Record<string, any> = {};
    for (const key of Object.keys(tool.inputSchema.properties || {})) {
      const input = await rl.question(`📝 Enter value for "${key}": `);
      const property = tool.inputSchema.properties[key] as { type: string };
      const schemaType = property.type;
      args[key] = schemaType === "number" ? Number(input) : input;
    }

    const result = await client.callTool({ name: tool.name, arguments: args });
    const output = result.content?.[0]?.text ?? "⚠️ No tool output.";
    console.log(`\n✅ Tool Result: ${output}`);
  }
}

startClient().catch((err) => {
  console.error("💥 Client failed to start:", err);
});
