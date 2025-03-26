# Legal Chat Backend

A NestJS-based backend for a client-attorney messaging platform using Sendbird for real-time chat and EmailJS for email notifications.

## Features

- Real-time messaging using Sendbird
- Email notifications for new messages
- Email reply synchronization
- File sharing and attachments
- Message reactions
- Contact management
- JWT authentication
- Webhook event handling
- Email tracking
- Enhanced file management
- Comprehensive webhook system

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Sendbird account and API credentials
- EmailJS account and API credentials

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
SENDBIRD_APP_ID=your_sendbird_app_id
SENDBIRD_API_TOKEN=your_sendbird_api_token
SENDBIRD_WEBHOOK_SECRET=your_webhook_secret

EMAILJS_PUBLIC_KEY=your_emailjs_public_key
EMAILJS_PRIVATE_KEY=your_emailjs_private_key
EMAILJS_SERVICE_ID=your_service_id
EMAILJS_TEMPLATE_ID=your_template_id
EMAILJS_REPLIES_TEMPLATE_ID=your_replies_template_id

JWT_SECRET=your_jwt_secret
```

## Running the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Authanticating a gmail account for the first time

copy and paste the credentials.json file into the root directory of the project.
navigate to v1/email in your browser with a gmail api enabled account and follow the instructions to authenticate the account.
token.json will be created in the root directory of the project and you have successfully authenticated the gmail account.

## API Documentation

All endpoints require JWT authentication unless specified otherwise. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Authentication

#### Login
```http
POST /auth/login
```
Request body:
```json
{
  "email": "string",
  "password": "string"
}
```
Response:
```json
{
  "access_token": "string"
}
```

### Users

#### Register User
```http
POST /users/register
```
Request body:
```json
{
  "email": "string",
  "password": "string",
  "name": "string",
  "role": "client | attorney"
}
```

#### Get User Profile
```http
GET /users/profile
```

### Messages

#### Send Message
```http
POST /messages/send
```
Request body:
```json
{
  "channelUrl": "string",
  "message": "string",
  "fileUrl": "string?",
  "fileName": "string?"
}
```

#### Get Channel Messages
```http
GET /messages/:channelUrl
```
Query parameters:
- `messageTs`: number (optional)
- `limit`: number (optional)
- `reverse`: boolean (optional)

#### React to Message
```http
POST /messages/react
```
Request body:
```json
{
  "channelUrl": "string",
  "messageId": "string",
  "reaction": "string"
}
```

### Contacts

#### Create Contact
```http
POST /v1/contacts
```
Request body:
```json
{
  "email": "string",     // Required, must be a valid email
  "name": "string",      // Required, contact's full name
  "role": "string",      // Required, e.g., 'client' or 'attorney'
  "sendbirdUserId": "string",  // Required, Sendbird user ID
  "metadata": {          // Optional, additional custom data
    "company": "string?",
    "phone": "string?",
    "preferredLanguage": "string?",
    // ... any other custom fields
  }
}
```
Response:
```json
{
  "id": "string",
  "email": "string",
  "name": "string",
  "sendbirdUserId": "string",
  "role": "string",
  "metadata": {
    // Custom fields
  },
  "createdAt": "string (ISO date)",
  "updatedAt": "string (ISO date)"
}
```

#### Get Contact by ID
```http
GET /v1/contacts/:id
```

#### Get Contact by Email
```http
GET /v1/contacts/email/:email
```

#### Get Contact by Sendbird User ID
```http
GET /v1/contacts/sendbird/:sendbirdUserId
```

### Email Notifications

#### Send Email Notification
```http
POST /v1/email/send
```
Request body:
```json
{
  "to": "string",
  "subject": "string",
  "body": "string",
  "from_name": "string",
  "attachments": [
    {
      "name": "string",
      "data": "string (base64)",
      "type": "string"
    }
  ]
}
```

### Email Reply Synchronization

The system automatically processes email replies and syncs them back to the Sendbird chat. This is handled through the following endpoints:

#### Process Email Reply
```http
POST /v1/email/replies/process
```
Request body:
```json
{
  "from": "string",        // Sender's email address
  "reply_body": "string",  // Content of the reply
  "thread_id": "string",   // Original message ID
  "attachments": [         // Optional file attachments
    {
      "url": "string",     // File URL
      "filename": "string" // Original filename
    }
  ]
}
```

#### Check for New Replies
```http
GET /v1/email/replies/check
```
Response:
```json
{
  "newReplies": [
    {
      "from": "string",
      "reply_body": "string",
      "thread_id": "string",
      "timestamp": "string",
      "attachments": [
        {
          "url": "string",
          "filename": "string"
        }
      ]
    }
  ]
}
```

The email reply system:
1. Receives email replies through a webhook or periodic check
2. Validates the sender's email against the contacts database
3. Finds the original message in Sendbird using the thread ID
4. Posts the reply content as a new message in the same channel
5. Handles any attachments by uploading them to Sendbird
6. Maintains the conversation thread context

### Email Tracking

The system now includes comprehensive email tracking capabilities:

- **Event Types**: Tracks multiple event types including sent, delivered, opened, clicked, bounced, spam, and unsubscribed
- **Engagement Metrics**: Detailed analytics for opens and clicks with timestamps
- **Event History**: Complete event history for each email
- **Statistics**: Aggregated stats by event type

#### Track Email Event
```http
POST /v1/email/tracking/event
```
```json
{
  "emailId": "string",
  "type": "sent|delivered|opened|clicked|bounced|spam|unsubscribed",
  "metadata": {
    "userAgent": "string",
    "ipAddress": "string",
    "location": "string"
  }
}
```

### File Management

Enhanced file handling system with robust validation and metadata:

- **File Validation**:
  - MIME type validation
  - File size limits
  - Magic number verification
  - Blocked file extensions
  - Content type verification

- **File Metadata**:
  - Basic: name, size, type, upload time
  - Security: hash, virus scan status
  - Media: dimensions, duration, page count
  - Custom metadata support

- **Security Features**:
  - Automatic virus scanning
  - File type restrictions
  - Content validation
  - Hash verification

### Webhook System

Comprehensive webhook system with enhanced reliability:

- **Event Types**:
  - Message events (sent, updated, deleted, read)
  - Channel events (created, updated, deleted)
  - User events (joined, left, banned, unbanned)
  - File events (uploaded, deleted)
  - Email events (delivered, opened, clicked, bounced)
  - System events (errors, warnings)

- **Features**:
  - Signature verification
  - Automatic retries with exponential backoff
  - Event status tracking
  - Error handling and logging
  - Event querying by type
  - Failed event reporting

- **Webhook Processing**:
  - Asynchronous processing
  - Retry mechanism (3 attempts)
  - Event status tracking
  - Error logging and monitoring

### Webhooks

#### Sendbird Webhook Handler
```http
POST /webhooks/sendbird
```
Headers:
```
x-sendbird-signature: string
```

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Error Handling

The API uses standard HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

Error responses follow this format:
```json
{
  "statusCode": number,
  "message": "string",
  "error": "string"
}
```

## Security Features

- JWT authentication
- Rate limiting
- Input validation
- Webhook signature verification
- Secure file handling
- CORS protection

## License

[MIT licensed](LICENSE)
