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

## Cloud Run persistence note

The Docker image stores SQLite at `/data/chase-desk.sqlite`. A Cloud Run
container filesystem is ephemeral; mount durable storage at `/data` before
using this database in Cloud Run. For this SQLite prototype, use a Filestore
NFS volume, keep the service to one instance, and verify Filestore NFS
connectivity and SQLite file locking for your deployment. Do not scale
multiple app instances against this SQLite file. Cloud SQL is the recommended
option if you need reliable multi-instance scaling.

The earlier deployment request specified public access. Until authentication
and authorization are added, use only fictional demo data: the case API can be
read and edited by anyone who can reach a public deployment. Do not store real
client information in a public instance.

CI/CD setup remains paused. No GitHub repository was created and no deployment
was started.
