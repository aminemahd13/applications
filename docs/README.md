# Math&Maroc Event Platform Documentation

Welcome to the comprehensive documentation for the Math&Maroc Event Platform. This documentation covers everything from high-level architecture to detailed code guides for both development and production environments.

## Table of Contents

### 1. [Overview](./overview.md)
   - High-level architecture (Monorepo, NestJS, Next.js)
   - Technology Stack
   - Repository Structure
   - Key Concepts (Events, Microsites, Workflows)

### 2. [Development Guide](./development.md)
   - Prerequisites & Local Environment Setup
   - Running the Application (Dev Mode)
   - Database Management (Migrations, Seeding)
   - Code Style & Linting
   - Testing

### 3. [Production Guide](./production.md)
   - Docker Architecture
   - Deployment Strategy (Single Server)
   - Environment Variables Reference
   - Security Practices
   - Backups & Maintenance

### 4. [Database Schema](./database.md)
   - Entity Relationship Diagrams (ERD) descriptions
   - Core Models (Users, Events, Applications)
   - Workflow & State Management Models
   - Microsite & CMS Models

### 5. [API Documentation](./api.md)
   - Module Breakdown
   - Authentication & Authorization (Guards, Strategies)
   - File Storage Implementation
   - Queueing & Background Tasks (Redis)

### 6. [Frontend Documentation](./frontend.md)
   - Next.js App Router Structure
   - Component System (shadcn/ui, Tailwind)
   - Microsite Builder Architecture
   - State Management (React Query, Server Actions)

### 7. [Troubleshooting](./troubleshooting.md)
   - Common Error messages
   - Diagnostic Commands
   - Logs & Monitoring
