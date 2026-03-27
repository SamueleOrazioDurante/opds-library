# OPDS Library

A lightweight, zero-configuration OPDS library server for managing and serving ePub books — built for Kobo e-readers and minimalists.

## Motivation

I couldn't find anything decent, lightweight, and with a modern aesthetic to manage my ePubs on my Kobo via OPDS. The alternatives were too heavy (requiring a database or entire Java instances) or didn't let me maintain my folder structure. I built this to consume **< 50 MB of RAM** and do exactly two things: serve a perfect OPDS feed and provide a clean React UI to manage files.

## Features

- 📁 **Folder navigation** — browse your library exactly as it sits on disk
- 📖 **OPDS feed** — folder-based and alphabetical feeds for Kobo and other readers
- 🖼️ **On-the-fly cover extraction** — covers are read directly from ePub ZIP archives, no pre-caching
- 🌙 **Dark / Light mode** — system-aware with manual toggle
- 🚫 **Zero configuration** — no database, no config files; the file system is the source of truth
- ⚡ **Low RAM** — Bun runtime keeps memory usage under 30–50 MB
- 📤 **Upload & Delete** — manage books and folders from the web UI
- 🔗 **Copy OPDS URL** — one click to copy the OPDS feed URL for your reader

## Deployment

### Docker Compose (recommended)

#### Production (image)

1. Edit `docker-compose.yml` to point to your books folder:

```yaml
volumes:
  - /your/actual/books/path:/books
```

2. Run:

```bash
docker compose up -d
```

3. Open `http://localhost:3000` for the web UI.

4. Add the OPDS feed to your Kobo: `http://<your-server-ip>:3000/opds`

#### Development (build from source)

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### Environment Variables

| Variable    | Default  | Description                     |
|-------------|----------|---------------------------------|
| `PORT`      | `3000`   | Port the server listens on      |
| `BOOKS_DIR` | `/books` | Path to the ePub library root   |

## API Reference

| Method   | Endpoint                    | Description                              |
|----------|-----------------------------|------------------------------------------|
| `GET`    | `/opds`                     | OPDS root catalog                        |
| `GET`    | `/opds/folder?path=...`     | OPDS folder catalog                      |
| `GET`    | `/opds/alpha?letter=A`      | OPDS alphabetical catalog                |
| `GET`    | `/api/explore?path=...`     | List folders and books at path           |
| `GET`    | `/api/cover?file=...`       | Serve ePub cover image                   |
| `GET`    | `/api/metadata?file=...`    | Return title, author, language           |
| `GET`    | `/api/download?file=...`    | Download an ePub file                    |
| `POST`   | `/api/upload?path=...`      | Upload an ePub (multipart/form-data)     |
| `DELETE` | `/api/book?file=...`        | Delete a book file                       |
| `DELETE` | `/api/folder?path=...`      | Delete a folder and its contents         |

## Project Structure

```
opds-library/
├── backend/
│   ├── src/
│   │   ├── index.ts      # Elysia entry point, API & OPDS routing
│   │   ├── opds.ts       # OPDS/Atom XML feed generation
│   │   ├── scanner.ts    # File system reading (no DB)
│   │   └── epub.ts       # On-the-fly metadata & cover extraction
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Main layout, dark mode, OPDS URL
│   │   └── components/
│   │       ├── Breadcrumb.tsx         # File-explorer-style navigation
│   │       ├── BookCard.tsx           # Cover, download, metadata, delete
│   │       └── FolderCard.tsx         # Folder icon, name, delete
│   └── package.json
├── Dockerfile             # Multi-stage: builds frontend, runs backend
├── docker-compose.yml     # Production image
├── docker-compose.dev.yml # Build from source
└── README.md
```

## Tech Stack

- **Backend**: [Bun](https://bun.sh) + [ElysiaJS](https://elysiajs.com)
- **ePub parsing**: [yauzl](https://github.com/thejoshwolfe/yauzl) (ZIP stream reader, no DOM)
- **Frontend**: React 18 + Vite + Tailwind CSS + [Lucide React](https://lucide.dev)
- **Containerisation**: Docker multi-stage build (Node for frontend, `oven/bun:alpine` for backend)

## Contributing

Feel free to open issues if you find bugs or have ideas, but the project will stay true to its minimalist philosophy.

## License

MIT
