# Chase Desk prototype

Chase Desk is a synthetic-data KYC operations prototype. A local SQLite
database stores clients, cases, and missing-document records. The supervised
chase workflow uses four sequential Gemini agents to review synthetic case
facts, draft a message, and perform an independent check. Gemini results
require human review; the prototype does not send emails or connect to bank
systems.

## Run locally

1. Copy `.env.example` to `.env` and add a Google AI Studio API key.
2. Install dependencies and start the app:

   ```powershell
   npm ci
   npm run dev
   ```

The SQLite database is created at `data/chase-desk.sqlite` and seeded with the
fictional sample cases on first startup. Client names and missing-document
lists can be edited in a case and are saved to SQLite. Set `SQLITE_DB_PATH` to
change the database file location.

The workflow uses `gemini-3.8-flash` by default. You can override the model
with `GEMINI_MODEL` in `.env`. The API key stays in the Node server and must
never be placed in browser code or committed.

Use synthetic demonstration data only. Running the workflow sends those case
facts to the Gemini API. No email or other external action is performed.

## CI/CD Pipeline

The repository uses GitHub Actions for automated testing, container packaging, and deployment:

- **Continuous Integration (`.github/workflows/ci.yml`):**
  - Runs on every push and pull request to `main`.
  - Installs dependencies on Node.js 22 (`npm ci`).
  - Runs syntax validation and TypeScript compilation (`npm test`).
  - Builds the production Vite frontend bundle (`npm run build`).
  - Validates container image packaging using Docker Buildx against the multi-stage `Dockerfile`.

- **Continuous Deployment (`.github/workflows/cd.yml`):**
  - Triggers automatically on push to `main`.
  - Builds the production Docker image.
  - Automatically publishes container images to **GitHub Container Registry (GHCR)**:
    - `ghcr.io/im-poojitha/chase-desk:latest`
    - `ghcr.io/im-poojitha/chase-desk:<commit-sha>`

### Running the Deployed Container

Pull and run the latest published container image directly with Docker:

```bash
docker pull ghcr.io/im-poojitha/chase-desk:latest
docker run -d -p 8080:8080 --name chase-desk ghcr.io/im-poojitha/chase-desk:latest
```

The application is reachable at `http://localhost:8080`.

## GCP Docker Orchestration

The repository includes Google Cloud Platform native orchestration specifications:

- **Google Cloud Build (`cloudbuild.yaml`):** Declarative GCP pipeline to build the container, push to Google Artifact Registry, and deploy to Cloud Run.
- **Google Cloud Run (`service.yaml`):** Knative service specification configuring container concurrency, resource limits, and health check probes.
