# Time Tracking & Profit Sharing API

A Deno-based API for tracking time, managing projects, and distributing profits among team members.

## Getting Started

### Prerequisites
- Deno 1.x or higher
- Deno KV enabled

### Installation
```bash
# Clone the repository
git clone [repository-url]

# Navigate to project directory
cd [project-directory]

# Start the development server
deno task dev
```

## API Documentation

### Authentication
All authenticated endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <userId>:<authToken>
```

### Users

#### Create User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "hourlyRate": 100
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "token": "auth-token-here",
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "hourlyRate": 100
    }
  }
}
```

### Projects

#### Create Project
```http
POST /projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Project Name",
  "description": "Project Description",
  "budget": 10000,
  "clientId": "client-id",
  "profitSharingEnabled": true
}
```

#### Invite User to Project
```http
POST /projects/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "project-id",
  "email": "user@example.com",
  "role": "MEMBER",
  "hourlyRate": 80
}
```

#### Accept Project Invitation
```http
POST /projects/invitations/respond
Authorization: Bearer <token>
Content-Type: application/json

{
  "invitationId": "invitation-id",
  "accept": true
}
```

### Time Tracking

#### Start Timer
```http
POST /api/timers/start
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "project-id",
  "description": "Task description"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "timer-id",
    "projectId": "project-id",
    "userId": "user-id",
    "description": "Task description",
    "startedAt": "2024-12-27T02:19:33.640Z"
  }
}
```

#### Stop Timer
```http
POST /api/timers/stop
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "time-entry-id",
    "projectId": "project-id",
    "userId": "user-id",
    "description": "Task description",
    "hours": 0.034,
    "costImpact": 3.43,
    "date": "2024-12-27T02:19:33.640Z"
  }
}
```

#### Get Active Timer Status
```http
GET /timer/status
Authorization: Bearer <token>
```

#### Get Project Active Timers
```http
GET /timer/project?projectId=project-id
Authorization: Bearer <token>
```

#### Get Time Entries
```http
GET /api/time-entries?startDate=2024-12-01&endDate=2024-12-31
Authorization: Bearer <token>
```

### Financial Management

#### Get User Financial Summary
```http
GET /api/financial/user-summary
Authorization: Bearer <token>
```

#### Get Project Financial Summary
```http
GET /api/financial/project-summary/{projectId}
Authorization: Bearer <token>
```

#### Distribute Project Profits
```http
POST /projects/profits/distribute
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "project-id",
  "amount": 1000
}
```

Response:
```json
{
  "success": true,
  "data": {
    "distributions": [
      {
        "userId": "user-id",
        "amount": 502.79,
        "percentage": 50.28
      }
    ]
  }
}
```

## Error Handling

All endpoints return errors in the following format:
```json
{
  "success": false,
  "error": "Error message here",
  "timestamp": "2024-12-27T02:21:37.175Z"
}
```

Common HTTP status codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Security Considerations

1. All passwords are hashed before storage
2. Authentication tokens expire after 24 hours
3. Project owners can view team member financials only for their projects
4. Users can only view their own financial data unless they have project owner permissions 