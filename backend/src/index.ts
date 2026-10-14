import "dotenv/config";
const { buildServer } = await import("./server.js");
const { env } = await import("./config/env.js");

const server = await buildServer();
await server.listen({ port: env.port, host: "0.0.0.0" });
console.log(`backend listening on ${env.port}`);