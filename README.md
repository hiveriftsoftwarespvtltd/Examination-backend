# HiveRift Examination Portal - Backend Engine

Authoritative, secure, and production-ready NestJS assessment engine powering the HiveRift Examination Portal.

## Features
- **Authoritative Server Timer**: Server-side countdown enforcement preventing client-side timer manipulation.
- **Link Locking & Lifecycle Control**: Automatically locks exam links once an attempt is in-progress or completed; unlocks on admin restart.
- **Zero-Leakage Security**: Candidate responses and questions omit correct answers and scoring keys until final administrative evaluation.
- **Auto-Evaluation & Scoring**: Real-time evaluation pipeline with configurable passing thresholds and detailed candidate results.
- **Question Repository & Bulk Import**: Modular question bank supporting single creation and CSV bulk imports.
- **JWT Authentication & RBAC**: Admin authentication with secure password hashing (bcrypt) and refresh token management.

## Tech Stack
- **Framework**: NestJS (Node.js)
- **Database**: MongoDB with Mongoose ODM
- **Language**: TypeScript
- **Security**: Helmet, Express Rate Limit, Passport JWT

## Setup & Running

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in the values:
```bash
cp .env.example .env
```

### 3. Build & Run
```bash
# Development mode
npm run start:dev

# Production build
npm run build
node dist/main.js
```

Default port: `9009` (`http://localhost:9009/api/v1`)

