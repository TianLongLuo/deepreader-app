# DeepReader Ubuntu Deployment

This package is prepared for:

- Ubuntu 24.04
- Node.js 22
- `npm` or `pnpm` available
- SQLite local storage

It already includes:

- current application source
- current SQLite database at `prisma/dev.db`
- current uploaded books at `storage/`
- current saved DeepSeek provider configuration in the database
- the matching `ENCRYPTION_KEY` in `.env.production`
- Ubuntu deployment scripts

## Fastest deploy

1. Upload this folder to the server.
2. Enter the folder.
3. Run:

```bash
chmod +x deploy-ubuntu.sh start-production.sh stop-production.sh status-production.sh
./deploy-ubuntu.sh http://YOUR_SERVER_IP:3000
```

If you already have a domain or reverse proxy, replace the URL with your final public URL, for example:

```bash
./deploy-ubuntu.sh https://reader.yourdomain.com
```

## After deploy

Check logs:

```bash
tail -f logs/app.out.log
tail -f logs/app.err.log
```

Stop:

```bash
./stop-production.sh
```

Start again without rebuilding:

```bash
./start-production.sh
```

Status:

```bash
./status-production.sh
```

## Important notes

- `.env.production` is already included.
- The current SQLite database already contains your working DeepSeek configuration.
- `ENCRYPTION_KEY` must stay unchanged, otherwise the saved AI provider key in the database cannot be decrypted.
- This package uses SQLite, so no MySQL or PostgreSQL setup is required for first deployment.
- Redis is optional. If Redis is not installed, the app will fall back to no-cache mode.
- Max upload size is already set to `200MB`.

## Optional systemd setup

You can use `systemd/deepreader.service.template` as a base and replace:

- `__APP_DIR__` with your upload directory
- `__RUN_USER__` with your Linux user
- `__RUN_GROUP__` with your Linux group
