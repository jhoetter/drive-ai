# Runtime dependency license posture

All runtime dependencies must use **permissive** licenses (MIT, Apache-2.0, BSD, ISC, etc.). **No AGPL/GPL** runtime dependencies unless explicitly approved and documented in this file.

| Package (category) | License | Role |
|--------------------|---------|------|
| TypeScript, Vite, React ecosystem | MIT | build + UI |
| Fastify / undici / @fastify/* | MIT | HTTP server |
| drizzle-orm, postgres driver | Apache-2.0 / MIT | DB |
| @aws-sdk/client-s3 | Apache-2.0 | S3 / MinIO |
| zod | MIT | validation |
| i18next, react-i18next | MIT | i18n |
| @modelcontextprotocol/sdk | Apache-2.0 (verify at pin) | MCP |

*Update this table whenever adding a production dependency.*
