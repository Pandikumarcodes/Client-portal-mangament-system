# System Context

The Client Management Portal is a multi-tenant product for managing organizations and their
clients. Its main actors are Super Admin, Organization Admin, and Client.

The backend follows a modular-monolith architecture and uses Node.js with JavaScript. It has a
centralized Mongoose connection lifecycle, an Express application composition boundary, and a Node
HTTP server lifecycle. MongoDB connects before the HTTP listener accepts traffic, and graceful
shutdown closes HTTP traffic before disconnecting MongoDB.

The only HTTP route is the operational database-readiness endpoint. Authentication and all
tenant-owned business capabilities remain unimplemented.

Cloudinary, Razorpay, email, and OpenAI may be integrated in later development phases. No external
integration is implemented yet.
