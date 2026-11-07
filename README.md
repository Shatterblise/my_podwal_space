# MY WORLD

Autonomous character-world prototype. The first sample world contains Jacob and Penny; the platform is being developed toward user-created worlds, stories and character rosters.

## Run locally — no Cloudflare account required

Requirements: Node.js 22 or newer.

1. Extract the project archive.
2. Open a terminal in `MY_WORLD_0_5`.
3. Run `npm run start:local`.
4. Open `http://127.0.0.1:8787`. The first-run password is printed in the terminal and stored in `.my-world-data/app-password.txt`.

The local server uses only Node's built-in modules; npm package installation is not required for this local mode. The cognitive engine, world persistence and routine simulation work without a cloud account or an external AI API. To enable free-form dialogue and model-invented activities, optionally point it at a local OpenAI-compatible server (for example Ollama) using `LOCAL_LLM_BASE_URL` and `LOCAL_LLM_MODEL`.

By default the server listens only on the same device. Exposing it to a home network or the public internet requires deliberate network and HTTPS security configuration. Keep `.my-world-data` private and back it up.

## Hosted Cloudflare deployment (optional)

The GitHub Actions deploy workflow remains available for people who explicitly choose Cloudflare hosting. It requires Cloudflare credentials and an optional Groq key. It is not required for local operation.
