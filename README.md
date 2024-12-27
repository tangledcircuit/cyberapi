# Project Time Tracking API

A RESTful API for tracking project time entries with user authentication and project management.

## API Endpoints

All responses follow this format:
```json
{
  "success": true,
  "data": {}, // Response data
  "timestamp": "2023-09-20T12:34:56.789Z"
}
```

### Authentication

#### Create User
```bash
curl -X POST http://localhost:8000/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "yourpassword",
    "firstName": "John",
    "lastName": "Doe",
    "hourlyRate": 100
  }'
```

#### Login
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "yourpassword"
  }'
```
Response includes a token in format: `userId:token`

#### Logout
```bash
curl -X DELETE http://localhost:8000/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Projects

#### Create Project
```bash
curl -X POST http://localhost:8000/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Project Name",
    "description": "Project Description",
    "budget": 10000,
    "clientId": "client123"
  }'
```

### Time Entries

#### Create Time Entry
```bash
curl -X POST http://localhost:8000/time-entries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "projectId": "project123",
    "description": "Work description",
    "hours": 2,
    "date": "2023-09-20T12:00:00.000Z"
  }'
```

#### Get Time Entries
```bash
curl -X GET "http://localhost:8000/time-entries?startDate=2023-09-19T00:00:00.000Z&endDate=2023-09-21T00:00:00.000Z" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Notes for AI Integration

1. **Authentication Flow**:
   - Create user first
   - Login to get token
   - Use token in all subsequent requests
   - Logout when done

2. **Date Handling**:
   - All dates should be in ISO 8601 format
   - Time entries use UTC timezone

3. **Error Handling**:
   - Failed requests return error in format:
     ```json
     {
       "success": false,
       "error": "Error message",
       "timestamp": "2023-09-20T12:34:56.789Z"
     }
     ```
   - Common HTTP status codes:
     - 200: Success
     - 201: Created
     - 401: Unauthorized
     - 404: Not Found
     - 500: Server Error

4. **Token Format**:
   - Token format is `userId:token`
   - Must be included in Authorization header as `Bearer userId:token`
   - Tokens expire after 24 hours

5. **Rate Limits**:
   - No rate limits implemented yet
   - Plan for reasonable request frequency

## Example AI Integration Flow

```python
import requests
import json

# 1. Create user
user_response = requests.post(
    "http://localhost:8000/users",
    json={
        "email": "ai@example.com",
        "password": "aipassword",
        "firstName": "AI",
        "lastName": "Assistant",
        "hourlyRate": 0
    }
)

# 2. Login
login_response = requests.post(
    "http://localhost:8000/auth/login",
    json={
        "email": "ai@example.com",
        "password": "aipassword"
    }
)
token = login_response.json()["data"]["token"]

# 3. Create project
project_response = requests.post(
    "http://localhost:8000/projects",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "name": "AI Project",
        "description": "AI-managed project",
        "budget": 10000,
        "clientId": "ai_client"
    }
)
project_id = project_response.json()["data"]["id"]

# 4. Create time entry
time_entry_response = requests.post(
    "http://localhost:8000/time-entries",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "projectId": project_id,
        "description": "AI processing",
        "hours": 1,
        "date": "2023-09-20T12:00:00.000Z"
    }
)

# 5. Get time entries
from_date = "2023-09-19T00:00:00.000Z"
to_date = "2023-09-21T00:00:00.000Z"
entries_response = requests.get(
    f"http://localhost:8000/time-entries?startDate={from_date}&endDate={to_date}",
    headers={"Authorization": f"Bearer {token}"}
)

# 6. Logout when done
logout_response = requests.delete(
    "http://localhost:8000/auth/logout",
    headers={"Authorization": f"Bearer {token}"}
)
``` 