// Development-time parity capture; the Rust service never launches JavaScript.
// Run from the workspace root after an intentional retained contract change.
import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { commandSchema, observationSchema, appSpecSchema } from '../../../packages/hosting-contracts/src/index.ts';
const supported = commandSchema.options.filter(option => /^(?:apps\.|clusters\.|limits\.|usage\.get$|projects\.(?:get|list|create|update)$|operations\.(?:get|overview)$)/.test(option.shape.action.value));
const hostingCommands = z.discriminatedUnion('action', supported);
for (const [name, schema] of [['legacy-command', hostingCommands], ['observation', observationSchema], ['app-spec', appSpecSchema]]) {
  writeFileSync(new URL(`../src/${name}.schema.json`, import.meta.url), `${JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2)}\n`);
}
