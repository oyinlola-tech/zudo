// A plugin whose start() never settles, run as a real process: the manager's
// timeout and its grace wait must keep Node alive until start() rejects.
import { PluginManager, createPluginContext } from "../../dist/index.js";

const manager = new PluginManager({ hookTimeout: 20 });
manager.register({ metadata: { name: "hang" }, start: () => new Promise(() => {}) });

try {
  await manager.start(createPluginContext({ name: "host-app", version: "2.0.0" }));
  console.log("started");
} catch (error) {
  console.log(error.name);
}
