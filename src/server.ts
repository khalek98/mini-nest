import "reflect-metadata";
import { Container } from "./container.js";
import { createApp } from "./dispatcher.js";
import { HealthController } from "./controllers/health.controller.js";
import { UsersController } from "./controllers/users.controller.js";

const PORT = Number(process.env.PORT ?? 3000);
const container = new Container();
const server = createApp(container, [HealthController, UsersController]);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`mini-nest on :${PORT}`);
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    console.log(`\n[${sig}] Gracefully shutting down...`);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    process.exit(0);
  });
}
