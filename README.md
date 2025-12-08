# AutoShopReceptionist AI - Retell AI Analytics Dashboard

A multi-tenant analytics dashboard for Retell AI voice agents with call recordings, analytics charts, and admin management.

## Features

- **User Authentication**: Session-based login/signup with role-based access
- **Analytics Dashboard**: KPI cards, charts for call metrics, sentiment, and success rates
- **Call Management**: View call history, play recordings, filter by agent/date/status
- **Admin Panel**: Manage users and assign Retell AI agents to users
- **Multi-tenant**: Users only see data from their assigned agents

## Tech Stack

- **Backend**: Express.js + EJS templates
- **Database**: MongoDB with Mongoose
- **Styling**: Tailwind CSS
- **Charts**: Chart.js
- **Auth**: express-session + bcrypt + connect-mongo
- **API**: retell-sdk

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   Create a `.env` file with:
   ```
   RETELL_API_KEY=your_retell_api_key
   MONGODB_URI=mongodb://localhost:27017/ai-telle
   SESSION_SECRET=your_secret_key
   PORT=3000
   ```

3. **Build CSS**:
   ```bash
   npm run build:css:prod
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

## First Admin User

The first user to sign up will automatically be assigned the admin role.

## Project Structure

```
ai-telle/
├── config/db.js          # MongoDB connection
├── models/               # Mongoose models
├── routes/               # Express routes
├── middleware/           # Auth & admin middleware
├── services/             # Retell API wrapper
├── views/                # EJS templates
├── public/               # Static assets
└── server.js             # App entry point
```

## License

MIT

