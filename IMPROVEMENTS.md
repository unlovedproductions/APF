# APF - Project Improvement Proposal

After reviewing the current codebase, environment configuration, and project structure of the Affiliate Product Finder (APF), I have identified several key areas for improvement. These suggestions aim to enhance the project's security, scalability, and overall developer experience.

## 1. Environment and Configuration Management

### Issues Identified
*   **Missing `.env.example`:** The repository lacks a template for environment variables, making initial setup difficult for new contributors.
*   **Hardcoded Fallbacks:** Some environment variables have hardcoded fallbacks in the code (e.g., `OAUTH_SERVER_URL` in `server/_core/env.ts`), which can lead to confusion between development and production environments.

### Proposed Improvements
*   **Create `.env.example`:** Provide a comprehensive template with all required and optional variables, including comments explaining each one.
*   **Type-Safe Environment Variables:** Use a library like `t3-oss/t3-env` or `zod` to validate environment variables at runtime, ensuring the application fails fast if critical configuration is missing.

## 2. Security Enhancements

### Issues Identified
*   **JWT Secret Management:** The `JWT_SECRET` is currently a manually managed string. In production, this should be handled with more rigor.
*   **CORS and Cookie Security:** The current cookie configuration (`sameSite: 'none'`, `secure: isSecureRequest(req)`) is functional but could be more restrictive depending on the deployment environment.

### Proposed Improvements
*   **Secret Rotation:** Implement a mechanism for rotating JWT secrets without invalidating all active sessions.
*   **Enhanced CORS Policy:** Explicitly define allowed origins in the `.env` file rather than relying on broad defaults, especially when deploying to production.

## 3. Database and Data Integrity

### Issues Identified
*   **Schema Documentation:** While Drizzle provides a clear schema, there is little documentation on the relationships and the "Hidden Gem" scoring logic within the database layer.
*   **Data Validation:** Ensure that all incoming data from external scrapers (Digistore24) is strictly validated before being persisted.

### Proposed Improvements
*   **Database Indexing:** Audit the current schema and add indexes to frequently queried columns (e.g., `products.score`, `products.category`) to improve search performance as the dataset grows.
*   **Soft Deletes:** Implement a `deleted_at` column for bookmarks and products to allow for data recovery and better auditing.

## 4. Scalability and Performance

### Issues Identified
*   **Real-Time Scraping:** Scraping Digistore24 in real-time during a user request can be slow and may lead to timeouts.
*   **Large JSON Payloads:** The server entry point explicitly increases the JSON limit to 50MB, which could be a potential vector for DoS attacks if not properly managed.

### Proposed Improvements
*   **Background Jobs:** Move marketplace scraping and data refreshing to background workers (e.g., using `BullMQ` or simple `cron` jobs) and cache the results in the database.
*   **Rate Limiting:** Implement rate limiting on the tRPC API and OAuth endpoints to protect the server from abuse.

## 5. Developer Experience (DX)

### Issues Identified
*   **Testing Coverage:** While some test files exist (`warriorplus.test.ts`), the overall test coverage for core business logic (like the scoring algorithm) could be improved.
*   **Documentation:** The `SETUP.md` is detailed, but it lacks information on the project's architecture and how to add new marketplace integrations.

### Proposed Improvements
*   **Architecture Documentation:** Add a `CONTRIBUTING.md` or update the `README.md` with a high-level architecture diagram and a guide for adding new integrations.
*   **CI/CD Pipeline:** Set up GitHub Actions to automatically run tests and linting on every pull request to ensure code quality.

---

## Summary of Recommended Actions

| Category | Priority | Action Item |
| :--- | :--- | :--- |
| **Configuration** | High | Create `.env.example` and implement Zod validation for env vars. |
| **Security** | High | Audit and tighten CORS and Cookie policies for production. |
| **Performance** | Medium | Move scraping logic to background tasks. |
| **DX** | Medium | Set up CI/CD for automated testing and linting. |
| **Database** | Low | Add indexes to performance-critical columns. |

---

## References

[1] Zod Documentation: [https://zod.dev/](https://zod.dev/)
[2] BullMQ - Background Jobs: [https://docs.bullmq.io/](https://docs.bullmq.io/)
[3] GitHub Actions: [https://github.com/features/actions](https://github.com/features/actions)
