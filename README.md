# E4Square - 2-Player Chess Game

A real-time multiplayer chess game built with React, Socket.IO, and Firebase authentication.

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Firebase project with Authentication enabled

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm run install-all
   ```

2. **Set up Firebase:**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication (Email/Password and Google)
   - Create a service account and download the JSON key

3. **Configure environment variables:**

   **Server (.env in server folder):**
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-service-account-email
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key\n-----END PRIVATE KEY-----\n"
   PORT=5000
   NODE_ENV=development
   ```

   **Client (.env in client folder):**
   ```env
   REACT_APP_FIREBASE_API_KEY=your-api-key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   REACT_APP_FIREBASE_PROJECT_ID=your-project-id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   REACT_APP_FIREBASE_APP_ID=your-app-id
   ```

### Running the Application

**Option 1: Run both server and client simultaneously**
```bash
npm run dev
```

**Option 2: Run separately**

1. **Start the server:**
   ```bash
   npm run start-server
   ```
   You should see: `Server is running on 5000`

2. **Start the client (in another terminal):**
   ```bash
   npm run start-client
   ```
   This opens the React app on http://localhost:3000

## 🎮 How to Play

1. **Login/Register** using email or Google authentication
2. **Create a new game** from the home page
3. **Share the game URL** with your opponent
4. **Start playing!** White moves first
