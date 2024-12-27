# Project Time Tracker API

A modern, efficient time tracking API built with Deno, featuring project management, time tracking, and financial operations.

## Features

- 👥 User Authentication & Management
- 📊 Project Management
- ⏱️ Time Tracking & Timer System
- 💰 Financial Operations & Budgeting
- 📈 Profit Sharing & Distribution
- 🔄 Real-time Timer Updates

## Tech Stack

- [Deno](https://deno.land/) - A modern runtime for JavaScript and TypeScript
- [Deno KV](https://deno.land/manual/runtime/kv) - Built-in key-value store
- [Deno Standard Library](https://deno.land/std) - Standard library modules

## Project Structure

```
/api
  /handlers        # Route handlers for different features
    - auth.ts      # Authentication handlers
    - projects.ts  # Project management handlers
    - timers.ts    # Time tracking handlers
    - financials.ts # Financial operations handlers
    - timeEntries.ts # Time entry handlers
    - budget.ts    # Budget management handlers
  /middleware
    - auth.ts      # Authentication middleware
  /utils
    - response.ts  # Response formatting utilities
  - router.ts      # Main API router with CORS and prefixing

/db.ts            # Database operations using Deno KV
/types.ts         # TypeScript interfaces and types
/tests           # Test files for each module
```

## Getting Started

1. Install Deno:
   ```bash
   curl -fsSL https://deno.land/x/install/install.sh | sh
   ```

2. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <project-directory>
   ```

3. Start the server:
   ```bash
   deno task start
   ```

The server will start on `http://localhost:8000` by default.

## Environment Variables

- `PORT` - Server port (default: 8000)
- `DENO_DEPLOYMENT_ID` - Set by Deno Deploy in production

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### Projects
- `POST /api/projects` - Create a project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `GET /api/projects/:id/members` - Get project members
- `POST /api/projects/:id/invite` - Invite member to project

### Time Tracking
- `POST /api/timers/start` - Start a timer
- `POST /api/timers/stop` - Stop active timer
- `GET /api/timers/active` - Get active timer
- `GET /api/projects/:id/timers` - Get project timers

### Time Entries
- `POST /api/time-entries` - Create time entry
- `GET /api/time-entries` - Get time entries
- `GET /api/time-entries/:id` - Get specific time entry
- `POST /api/time-entries/:id/complete` - Complete time entry

### Financial Operations
- `POST /api/pay-periods` - Create pay period
- `GET /api/pay-periods` - Get pay periods
- `GET /api/users/:id/financials` - Get user financials
- `GET /api/projects/:id/financials` - Get project financials
- `POST /api/projects/:id/distribute-profits` - Distribute project profits

## Development

### Running Tests
```bash
deno test
```

### Formatting Code
```bash
deno fmt
```

### Linting
```bash
deno lint
```

## Deployment

This project is designed to be deployed on Deno Deploy. Follow these steps:

1. Create a new project on [Deno Deploy](https://deno.com/deploy)
2. Link your repository
3. Configure environment variables
4. Deploy!

## License

MIT License - see LICENSE file for details 