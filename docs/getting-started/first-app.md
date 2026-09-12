# Your First Zudojs App

## Scaffold a Project

Use the Zudojs CLI to create a new project:

```bash
npx zudojs create my-app
cd my-app
```

## Run the App

```bash
npm run dev
```

## Project Structure

```
my-app/
├── .zudojs/
│   └── manifest.json    # project type, architecture, capabilities
├── src/
│   ├── app.ts           # application assembly
│   ├── server.ts        # entry point
│   ├── modules/
│   │   └── app.module.ts
│   ├── services/
│   │   └── app.service.ts
│   └── controllers/
│       └── health.controller.ts
├── package.json
└── tsconfig.json
```

## Add Features

```bash
npx zudojs add database
npx zudojs add events
npx zudojs add queue
```

## Next Steps

- Read the [Architecture Overview](../architecture/overview.md)
- Explore [Concepts](../concepts/application.md)
