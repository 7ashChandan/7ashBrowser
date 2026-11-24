# Contributing to 7ash Browser

Thank you for helping improve 7ash Browser.

## Development setup

Prerequisites:

- Windows 10 or 11
- Node.js 20 or newer
- npm

```powershell
npm install
npm start
```

## Before submitting

- Keep the change focused and describe the user-visible behavior.
- Test the Electron app on Windows.
- Test both normal and compact layouts if the change affects the browser shell.
- Verify that privacy and secure-storage paths do not expose secrets.
- Do not commit API keys, cookies, personal data, `node_modules/`, or build output.
- Update [README.md](README.md) when adding or changing user-visible features.

## Pull requests

1. Fork the repository and create a branch.
2. Make the change with clear, maintainable code.
3. Run `npm start` to verify startup and core behavior.
4. Run `npm run dist` for packaging changes.
5. Open a pull request that explains motivation, changes, and testing.
