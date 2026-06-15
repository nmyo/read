# @readany/cli

`@readany/cli` is the local command and MCP entry point for external AI access to ReadAny.

Current phase:

- `readany --version`
- `readany doctor`
- `readany install`
- `readany uninstall`
- `readany skill install`
- `readany skill uninstall`
- `readany skill status`
- `readany tools list`
- `readany books list`
- `readany books search`
- `readany book get`
- `readany notes search`
- `readany highlights search`

The MCP server command is intentionally present but not implemented yet:

```bash
readany mcp serve --profile readonly
```

Development:

```bash
pnpm cli -- --version
pnpm cli:test
pnpm cli:build
```

Design docs live in `docs/readany-cli`.
