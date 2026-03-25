# Licensing Scope

This repository contains a mix of licensing scopes.

## Apache-2.0

Original Gemini CLI source code, and existing files inherited from or derived
from the upstream Gemini CLI project, remain subject to Apache License 2.0.

The upstream Apache-2.0 license text remains in the root [LICENSE](./LICENSE)
file and must continue to be preserved for those portions.

## CNC-1.0

The following `gemini-api2cli`-specific files added in this fork are made
available under the Cooperative Non-Commercial License (`CNC-1.0`), whose text
is provided in [LICENSE-CNC-1.0.txt](./LICENSE-CNC-1.0.txt):

- `README.md`
- `README.zh-CN.md`
- `packages/a2a-server/README.md`
- `packages/a2a-server/src/http/promptApi.ts`
- `packages/a2a-server/src/http/promptApi.test.ts`
- `packages/a2a-server/src/http/promptApiAuth.ts`
- `packages/a2a-server/src/http/promptApiConsole.ts`
- `packages/a2a-server/src/http/promptCredentialStore.ts`
- `packages/a2a-server/src/http/adapters/types.ts`
- `packages/a2a-server/src/http/adapters/geminiAdapter.ts`
- `packages/a2a-server/src/http/adapters/openaiAdapter.ts`

## Important Note

This mixed-license note is intended to clarify the fork layout, not to remove or
replace Apache-2.0 rights that apply to upstream Gemini CLI code.

If you redistribute this repository, you should preserve:

- the root Apache-2.0 license and notices for upstream Gemini CLI portions
- the CNC-1.0 notice for the `gemini-api2cli`-specific files listed above
