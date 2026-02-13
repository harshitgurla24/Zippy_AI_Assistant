import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Validate environment variables
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;

if (!NVIDIA_API_KEY) {
  console.error('ERROR: NVIDIA_API_KEY is not set in .env file');
  process.exit(1);
}


if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('ERROR: Google OAuth credentials not set in .env file');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET (or SESSION_SECRET) is not set in .env file');
  process.exit(1);
}

// In-memory user store (MongoDB removed)
const userStore = new Map();

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-vercel-app.vercel.app'] // Update with your Vercel URL
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Initialize Passport (without sessions)
app.use(passport.initialize());

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const userId = profile.id;
      const existingUser = userStore.get(userId);

      if (existingUser) {
        return done(null, existingUser);
      }

      const user = {
        id: userId,
        googleId: profile.id,
        email: profile.emails?.[0]?.value || '',
        name: profile.displayName || 'Zippy User',
        picture: profile.photos?.[0]?.value || ''
      };

      userStore.set(userId, user);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }
));

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Auth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { 
    session: false,
    failureRedirect: process.env.NODE_ENV === 'production' 
      ? 'https://your-vercel-app.vercel.app' 
      : 'http://localhost:3000'
  }),
  (req, res) => {
    // Generate JWT token
    const token = jwt.sign(
      {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Set JWT as httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Redirect to frontend
    res.redirect(process.env.NODE_ENV === 'production' 
      ? 'https://your-vercel-app.vercel.app' 
      : 'http://localhost:3000'
    );
  }
);

app.get('/auth/logout', (req, res) => {
  // Clear JWT cookie
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  res.json({ message: 'Logged out successfully' });
});

// Get current user
app.get('/api/user', verifyToken, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    picture: req.user.picture
  });
});

// Chat endpoint (protected) - Proxy to NVIDIA API
app.post('/api/chat', verifyToken, async (req, res) => {
  try {
    const { messages } = req.body;

    console.log('Received request with messages:', messages.length);

    // Set abort timeout (8 seconds max - aggressive)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: messages,
        temperature: 0.1,   // Very low temp = fastest, most deterministic
        top_p: 0.3,         // Aggressive reduction for fastest inference
        max_tokens: 50,     // Aggressive reduction for 1-sentence responses only
        frequency_penalty: 0.8,  // Higher penalty to reduce repetition faster
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('NVIDIA API error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    console.log('NVIDIA API response received');

    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    const status = error.name === 'AbortError' ? 504 : 500;
    res.status(status).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
