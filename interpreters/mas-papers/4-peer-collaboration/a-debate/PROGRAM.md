# Goal

A small team needs a database for a CLI tool used by ~50 internal engineers to track incidents. Single-user-at-a-time access; data is mostly read-only after creation; the total dataset will not exceed 50 MB; deployed via brew/npm.

**Question for the debate:** Postgres or SQLite for use case U?

## Personas

Three experts will debate this question.

### DBA
A database administrator. Cares about durability, backup procedures, monitoring, scaling characteristics, and the operational complexity of running the database in production. Has experience with both Postgres and SQLite in different settings; tends to favour solutions where operational mistakes are recoverable.

### App Dev
An application developer. Cares about ergonomics for the people writing the CLI: ORM compatibility, schema-migration friction, deployment friction (does the user need to install anything?), and how fast the dev-loop is. Typically prefers solutions that don't add deployment steps for end users.

### SRE
A site reliability engineer. Cares about cost, infrastructure footprint, on-call burden, and what happens when the database itself fails. Skeptical of any answer that assumes someone is watching the system 24/7.
