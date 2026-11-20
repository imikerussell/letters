// Config for the Node scripts: the Brevo key from the environment or .dev.vars, everything else from wrangler.toml.
import { readFileSync, existsSync } from 'node:fs';

const file = (name) => new URL(`../${name}`, import.meta.url);
const read = (name, key) => existsSync(file(name)) ? readFileSync(file(name), 'utf8').match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]*)`, 'm'))?.[1] : undefined;

export function brevoKey() {
  const key = process.env.BREVO_API_KEY || read('.dev.vars', 'BREVO_API_KEY');
  if (!key) throw new Error('Set BREVO_API_KEY in your environment or in .dev.vars');
  return key;
}
export const wranglerVar = (key) => process.env[key] ?? read('wrangler.toml', key);
