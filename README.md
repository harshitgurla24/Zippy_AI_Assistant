# 🎯 Zippy AI Assistant

A cute, playful voice-based AI assistant powered by NVIDIA Llama 3.1 with real-time speech-to-speech capabilities. Zippy is designed as a friendly 6-year-old AI kid who gives accurate answers in a fun, kid-like way!

## ✨ Features

- 🎤 **Voice Input**: Real-time speech recognition with voice activity detection
- 🗣️ **Natural Voice Output**: High-quality neural TTS using Piper (en_US-hfc_female-medium voice)
- 🤖 **AI Powered**: NVIDIA Llama 3.1 8B Instruct model via API
- 💬 **Dual Input**: Both voice and text input support
- 📜 **Conversation History**: Auto-saves chat history in localStorage
- 🎨 **Modern UI**: Beautiful gradient theme with smooth animations
- 🔄 **Auto-Resume**: Automatically pauses listening during AI speech to prevent echo
- 🧹 **Clear Chat**: Reset conversation anytime

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Setup Environment Variables:**
   ```bash
   # Copy the example file
   cp .env.example .env
   
   # Edit .env and add your NVIDIA API key
   # NVIDIA_API_KEY=your_actual_api_key_here
   ```

3. **Run Backend Server (Terminal 1):**
   ```bash
   node server.js
   ```
   Server will start on `http://localhost:3001`

4. **Run Frontend Dev Server (Terminal 2):**
   ```bash
   npm run dev
   ```
   Frontend will start on `http://localhost:3000`

5. **Open in browser:**
   - Navigate to `http://localhost:3000`
   - Allow microphone access when prompted

### Alternative: Run Both Servers Together
```bash
npm run dev-full
```

## 📖 How to Use

### Voice Input:
1. Click the **"Start Listening"** 🎤 button
2. Speak your question clearly
3. Zippy will automatically detect when you're done
4. Wait for AI response and voice playback
5. Voice input resumes automatically after Zippy speaks

### Text Input:
1. Type your message in the input box at the bottom
2. Press **Enter** or click **Send**
3. Zippy will respond in both text and voice

### Clear Chat:
- Click the **"Clear"** 🗑️ button to reset the conversation

## 🛠️ Technology Stack

### Frontend
- **Framework**: Vite + Vanilla JavaScript
- **Speech-to-Text**: `speech-to-speech/stt` library (VAD-based)
- **Text-to-Speech**: `speech-to-speech/tts` library (Piper TTS)
- **Audio Processing**: ONNX Runtime Web
- **Storage**: localStorage for conversation persistence

### Backend
- **Server**: Node.js + Express
- **AI Model**: NVIDIA Llama 3.1 8B Instruct (via API)
- **API Proxy**: Handles NVIDIA API authentication
- **CORS**: Enabled for local development

## 📁 Project Structure

```
zippy-ai-assistant/
├── index.html           # Main HTML with styled UI
├── app.js               # Frontend application logic
├── server.js            # Express backend API proxy
├── package.json         # Dependencies and scripts
├── vite.config.js       # Vite dev server configuration
└── README.md            # Project documentation
```

## 🧩 Key Features Explained

### Auto-Pause During Speech
- Microphone automatically stops during Zippy's response
- Prevents the AI from recording its own voice
- Auto-resumes listening after speech completes

### Conversation Memory
- All conversations saved in browser localStorage
- Persists across page refreshes
- Maintains context for follow-up questions

### Smart Audio Management
- Calculates audio duration for proper timing
- Queue-based audio playback
- Smooth transitions between listening and speaking states

## 🔧 Configuration

### Change Voice:
Edit `VOICE_ID` in `app.js`:
```javascript
const VOICE_ID = 'en_US-hfc_female-medium';
```

### Modify AI Personality:
Update `SYSTEM_PROMPT` in `app.js`:
```javascript
const SYSTEM_PROMPT = "Your custom personality here...";
```

### Change Ports:
- Backend: Edit `PORT` in `server.js` (default: 3001)
- Frontend: Edit `server.port` in `vite.config.js` (default: 3000)

## 📦 Available Scripts

```bash
# Development
npm run dev          # Start frontend only
npm run server       # Start backend only
npm run dev-full     # Start both frontend and backend

# Production
npm run build        # Build for production
npm run preview      # Preview production build
```

## 🐛 Troubleshooting

### "Cannot connect to server" Error
- Ensure backend is running: `node server.js`
- Check if port 3001 is available
- Verify `API_URL` in `app.js` matches your backend port

### Microphone Not Working
- Allow microphone permissions in browser
- Check browser console for errors
- Verify HTTPS (or localhost)

### Voice Output Not Playing
- Check browser audio permissions
- Verify ONNX Runtime loads correctly
- Check network tab for voice model downloads

## 📝 API Configuration

The backend uses NVIDIA API for AI responses. The API key is stored securely in the `.env` file:

1. **Get your NVIDIA API key** from [NVIDIA API Catalog](https://build.nvidia.com/)
2. **Add it to `.env` file:**
   ```env
   NVIDIA_API_KEY=your_actual_api_key_here
   PORT=3001
   ```
3. The server will automatically load these environment variables on startup

**Security Note:** Never commit `.env` file to Git. Use `.env.example` as a template.

## 🎨 Customization

### UI Colors
Edit CSS variables in `index.html`:
```css
:root {
  --ink: #0f1b2b;
  --accent: #ff8a3d;
  --accent-2: #2aa7a1;
  /* ... more variables */
}
```

## 🌟 Future Enhancements

- [ ] Multi-language support
- [ ] Voice selection UI
- [ ] Export conversation history
- [ ] Dark mode toggle
- [ ] Mobile app version

## 📄 License

Built with ❤️ using open source technologies.

---

**Note**: This project uses the NVIDIA AI API and requires an active API key for AI functionality.
