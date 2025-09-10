# Repository Guidelines

## Project Structure & Module Organization
- `contracts/`: Solidity sources (one contract per file; file name matches contract name, e.g., `VibeToken.sol`).
- `test/`: Hardhat test suite in JavaScript (`*.test.js` preferred), plus legacy `Lock.js`.
- `scripts/`: Deployment and verification scripts (e.g., `deploy.js`, `verify.js`).
- `hardhat.config.js`: Network, compiler, plugins, gas reporter.
- `artifacts/`, `cache/`: Build outputs (do not edit).
- `.env` (use `.env.example` as a template) for keys and RPC URLs.

## Build, Test, and Development Commands
- Install: `npm install`
- Compile: `npm run build` (alias for `hardhat compile`)
- Test: `npm test` or `npx hardhat test`
- Coverage: `npx hardhat coverage`
- Local deploy: `npm run deploy:local` (Hardhat network)
- Sepolia deploy: `npm run deploy:sepolia`
- Verify on Etherscan: `npm run verify` (requires `ETHERSCAN_API_KEY`)

## Coding Style & Naming Conventions
- Solidity: 0.8.x, 4‑space indent, one contract per file, `PascalCase` contracts/events, `camelCase` functions/variables, `UPPER_CASE` constants. Order: state vars → events → errors → modifiers → constructor → functions.
- JavaScript tests/scripts: 2‑space indent, `camelCase` variables/functions, `PascalCase` contract factories. Keep files small and focused.
- Comments: prefer concise NatSpec (`///`) for public Solidity APIs.

## Testing Guidelines
- Frameworks: Hardhat + Mocha/Chai + Hardhat Toolbox.
- File names: `*.test.js` (e.g., `VibeToken.test.js`).
- Coverage: aim to cover deploy paths, access control, fees/limits, and failure cases. Run `npx hardhat coverage` locally before PRs.
- Avoid network flakiness: use Hardhat Network; mock external calls where applicable.

## Commit & Pull Request Guidelines
- Commits: imperative mood, concise subject (≤72 chars), scope when useful (e.g., "token: loosen limits"). Reference issues like `#123`.
- PRs: clear description, rationale, screenshots/logs when relevant (tests, Etherscan verify), checklist of changed contracts/scripts, and linked issues.
- Require: all tests green; no secrets committed; CI/lint (if configured) passes.

## Security & Configuration Tips
- Never commit private keys or RPC URLs; use `.env` (see `.env.example`).
- For Sepolia: set `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY`.
- Validate limits/fees before enabling trading; verify addresses passed to constructors.

## Agent‑Specific Instructions
- Do not rename or relocate modules without need; keep changes minimal and focused.
- Prefer `npx hardhat test` to validate changes; avoid modifying `artifacts/` or `cache/`.
