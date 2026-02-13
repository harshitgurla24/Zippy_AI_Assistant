# Authentication Setup Guide

## 🎯 Overview
This guide will help you set up Google Authentication and MongoDB for Zippy AI Assistant.

---

## 📋 Prerequisites
- Google Account
- MongoDB Atlas Account (free tier available)

---

## 🔐 Step 1: Google OAuth Setup

### 1.1 Go to Google Cloud Console
- Visit: https://console.cloud.google.com/
- Sign in with your Google account

### 1.2 Create a New Project (or select existing)
1. Click on project dropdown (top left, near "Google Cloud")
2. Click "NEW PROJECT"
3. Name it: `Zippy AI Assistant`
4. Click "CREATE"

### 1.3 Enable Google+ API
1. Click "APIs & Services" → "Enable APIs and Services"
2. Search for "Google+ API"
3. Click on it and press "ENABLE"

### 1.4 Create OAuth Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "CREATE CREDENTIALS" → "OAuth client ID"
3. If asked, configure OAuth consent screen:
   - User Type: External
   - App name: `Zippy AI Assistant`
   - User support email: Your email
   - Developer contact: Your email
   - Save and Continue (skip optional fields)
   - Add test users (your email)
   - Save

4. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: `Zippy Web Client`
   - **Authorized JavaScript origins:**
     - `http://localhost:5173`
     - `http://localhost:3001`
   - **Authorized redirect URIs:**
     - `http://localhost:3001/auth/google/callback`
     - `https://backend-zippy.onrender.com/auth/google/callback`
   - Click "CREATE"

5. **COPY** the Client ID and Client Secret!

---

## 🗄️ Step 2: MongoDB Atlas Setup

### 2.1 Create MongoDB Atlas Account
- Visit: https://www.mongodb.com/cloud/atlas/register
- Sign up for free

### 2.2 Create a Cluster
1. Choose "FREE" shared cluster
2. Select cloud provider (AWS recommended)
3. Select region (closest to you)
4. Cluster name: `ZippyCluster`
5. Click "Create"

### 2.3 Create Database User
1. Go to "Database Access" (left sidebar)
2. Click "ADD NEW DATABASE USER"
3. Authentication Method: Password
4. Username: `zippyuser`
5. **Generate & COPY password** (save it safely!)
6. Database User Privileges: "Read and write to any database"
7. Click "Add User"

### 2.4 Whitelist IP Address
1. Go to "Network Access" (left sidebar)
2. Click "ADD IP ADDRESS"
3. Click "ALLOW ACCESS FROM ANYWHERE" (for deployment)
4. Confirm (add `0.0.0.0/0`)

### 2.5 Get Connection String
1. Go to "Database" (left sidebar)
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Driver: Node.js, Version: 5.5 or later
5. **COPY** the connection string
6. Replace `<password>` with your actual password
7. Replace `<dbname>` with `zippy`

Example format:
```
mongodb+srv://zippyuser:YOUR_PASSWORD@zippycluster.xxxxx.mongodb.net/zippy?retryWrites=true&w=majority
```

---

## ⚙️ Step 3: Update .env File

### 3.1 Generate SESSION_SECRET
Run this command in your terminal:
```bash
node generate-secret.js
```
Copy the generated secret.

### 3.2 Update .env
Open `zippy-ai-assistant/.env` and fill in:

```env
# NVIDIA API Configuration
NVIDIA_API_KEY=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

# Server Configuration
PORT=3001

# MongoDB Configuration
MONGODB_URI=mongodb+srv://zippyuser:YOUR_PASSWORD@zippycluster.xxxxx.mongodb.net/zippy?retryWrites=true&w=majority

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-client-id-from-google-console.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-from-google-console
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback

# Session Secret (from generate-secret.js)
SESSION_SECRET=your-generated-session-secret-here
```

---

## 🚀 Step 4: Test Locally

### 4.1 Start Backend
```bash
cd zippy-ai-assistant
npm run server
```

You should see:
```
✅ MongoDB connected successfully
🚀 Server running on http://localhost:3001
```

### 4.2 Start Frontend
Open a new terminal:
```bash
cd zippy-ai-assistant
npm run dev
```

### 4.3 Test Authentication
1. Open browser: http://localhost:5173
2. Click "Sign in with Google"
3. Authorize the app
4. You should be redirected back and see your profile!

---

## 🌐 Step 5: Deploy to Production

### 5.1 Update Render.com Environment Variables
1. Go to your Render dashboard: https://dashboard.render.com/
2. Select your backend service (`backend-zippy`)
3. Go to "Environment"
4. Add new variables:
   - `MONGODB_URI` = Your MongoDB connection string
   - `GOOGLE_CLIENT_ID` = Your Google Client ID
   - `GOOGLE_CLIENT_SECRET` = Your Google Client Secret
   - `GOOGLE_CALLBACK_URL` = `https://backend-zippy.onrender.com/auth/google/callback`
   - `SESSION_SECRET` = Your generated session secret
   - `NODE_ENV` = `production`

5. Click "Save Changes" (this will redeploy)

### 5.2 Update Google OAuth for Production
1. Go back to Google Cloud Console
2. Go to "Credentials"
3. Edit your OAuth Client ID
4. Add to **Authorized redirect URIs:**
   - `https://your-vercel-app.vercel.app` (your Vercel URL)
5. Save

### 5.3 Update server.js CORS URLs
Before deploying, update the CORS URLs in `server.js`:
```javascript
origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-actual-vercel-url.vercel.app']
    : ['http://localhost:5173', 'http://localhost:5174'],
```

### 5.4 Push to GitHub
```bash
git add .
git commit -m "Add Google Authentication and MongoDB integration"
git push origin main
```

### 5.5 Redeploy Frontend to Vercel
- Vercel will auto-deploy on push

---

## ✅ Verification

### Backend Health Check
Visit: https://backend-zippy.onrender.com/health

Should return:
```json
{"status":"ok"}
```

### Test Authentication Flow
1. Visit your deployed frontend
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Chat with Zippy
5. Logout and login again - chat history should persist!

---

## 🐛 Troubleshooting

### MongoDB Connection Failed
- Verify IP whitelist includes `0.0.0.0/0`
- Check username/password in connection string
- Ensure database user has proper permissions

### Google OAuth Error
- Verify redirect URIs match exactly (no trailing slashes)
- Check OAuth consent screen is configured
- Ensure app is not in "Testing" mode (or add yourself as test user)

### Session Issues
- Clear browser cookies
- Verify SESSION_SECRET is set
- Check CORS credentials: true

### "Not authenticated" errors
- Verify cookies are being sent (credentials: 'include')
- Check browser console for CORS errors
- Ensure backend and frontend URLs are correct

---

## 📝 Notes

- Keep your `.env` file secure (never commit to Git)
- The `.env.example` is just a template
- MongoDB free tier has 512MB storage limit
- Google OAuth may require app verification for production use with many users

---

## 🎉 Success!

If everything is working, you should be able to:
- ✅ Sign in with Google
- ✅ Chat with Zippy
- ✅ See chat history persist across sessions
- ✅ Logout and login with different accounts

Enjoy your authenticated AI assistant! 🚀
