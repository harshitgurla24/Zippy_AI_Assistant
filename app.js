import { STTLogic } from 'speech-to-speech/stt';
import { TTSLogic, sharedAudioPlayer } from 'speech-to-speech/tts';

// Configuration
const VOICE_ID = 'en_US-hfc_female-medium';
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : 'https://backend-zippy.onrender.com';
const SYSTEM_PROMPT = "You are Zippy, a friendly and cheerful AI companion for kids! You're helpful, patient, and always encouraging. Speak in simple, easy-to-understand language. Give short, fun answers in 1-2 sentences. Be playful and curious! Use exciting words like 'awesome', 'cool', 'amazing'. Always be positive and make learning fun. If a kid asks a question, answer it in a way they can easily understand. Remember to be kind, safe, and age-appropriate. IMPORTANT: Never use emojis in your responses - only use words!";
const CONVERSATION_STORAGE_KEY = 'zippy.conversationHistory';
const MAX_HISTORY_MESSAGES = 5; // Limit history for faster API calls

function getConversationStorageKey() {
  if (isAuthenticated && currentUser?.id) {
    return `${CONVERSATION_STORAGE_KEY}:${currentUser.id}`;
  }

  return `${CONVERSATION_STORAGE_KEY}:guest`;
}

// DOM Elements
const chatContainer = document.getElementById('chatContainer');
const sidebarMessages = document.getElementById('sidebarMessages');
const chatSidebar = document.getElementById('chatSidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const micBtn = document.getElementById('micBtn');
const sidebarClearBtn = document.getElementById('sidebarClearBtn');
const status = document.getElementById('status');
const authSection = document.getElementById('authSection');
const chatPage = document.getElementById('chatPage');
const profilePage = document.getElementById('profilePage');
const profileContent = document.getElementById('profileContent');
const penguinImage = document.getElementById('penguinImage');
const penguinStatus = document.getElementById('penguinStatus');

// Penguin animation functions
function setPenguinListening() {
  if (penguinImage && penguinStatus) {
    penguinImage.classList.remove('speaking');
    penguinImage.classList.add('listening');
    penguinStatus.classList.remove('speaking');
    penguinStatus.classList.add('listening');
    penguinStatus.textContent = '🎤 Listening...';
    // Pause video when listening
    if (penguinImage.tagName === 'VIDEO') {
      penguinImage.pause();
      penguinImage.currentTime = 0;
    }
  }
}

function setPenguinSpeaking() {
  if (penguinImage && penguinStatus) {
    penguinImage.classList.remove('listening');
    penguinImage.classList.add('speaking');
    penguinStatus.classList.remove('listening');
    penguinStatus.classList.add('speaking');
    penguinStatus.textContent = '🗣️ Speaking...';
    // Play video when speaking
    if (penguinImage.tagName === 'VIDEO') {
      penguinImage.currentTime = 0;
      penguinImage.play().catch(err => console.log('Video play error:', err));
    }
  }
}

function setPenguinIdle() {
  if (penguinImage && penguinStatus) {
    penguinImage.classList.remove('listening', 'speaking');
    penguinStatus.classList.remove('listening', 'speaking');
    penguinStatus.textContent = 'Ready to chat!';
    // Pause video when idle
    if (penguinImage.tagName === 'VIDEO') {
      penguinImage.pause();
      penguinImage.currentTime = 0;
    }
  }
}

// Toggle sidebar function
window.toggleSidebar = function() {
  const isOpen = chatSidebar.classList.contains('open');
  if (isOpen) {
    chatSidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
  } else {
    chatSidebar.classList.add('open');
    sidebarOverlay.classList.add('open');
  }
};

// Close sidebar when clicking overlay
if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', () => {
    toggleSidebar();
  });
}

function getAccountAvatarUrl() {
  return '/zippy-avatar.png';
}

// State
let stt = null;
let tts = null;
let isListening = false;
let isProcessing = false;
let conversationHistory = [];
let currentUser = null;
let isAuthenticated = false;
let accountMenuReady = false;
let ttsReady = false; // Track TTS initialization status
let silenceTimeout = null;
let lastSoundTime = 0;
let transcriptProcessed = false; // Prevent duplicate transcript processing

// Check authentication on load
// Speak welcome message when app opens
async function speakWelcomeMessage() {
  const welcomeText = "Hello! I'm Zippy, your AI assistant. Click the microphone button to start talking with me!";
  
  if (ttsReady) {
    resetTTSQueue();
    queueSentenceForTTS(welcomeText);
  }
}

async function checkAuth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      currentUser = await response.json();
      isAuthenticated = true;
      renderAuthUI();
      loadConversationHistory();
      updateStatus('Ready! Click microphone to start', 'default');
      
      // Initialize TTS first, then speak welcome message
      await initTTS();
      initSTTNow();
      speakWelcomeMessage();
    } else {
      isAuthenticated = false;
      renderAuthUI();
      showLoginOverlay();
    }
  } catch (error) {
    console.error('[Auth] Check failed:', error);
    isAuthenticated = false;
    renderAuthUI();
    showLoginOverlay();
  }
}

// Show login overlay
function showLoginOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.id = 'authOverlay';
  overlay.innerHTML = `
    <h2>👋 Welcome to Zippy</h2>
    <p>Sign in with your Google account to start chatting with Zippy!</p>
    <button class="google-signin-btn" onclick="window.location.href='${API_BASE_URL}/auth/google'">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 01-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z" fill="#4285F4"/>
        <path d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0010 20z" fill="#34A853"/>
        <path d="M4.405 11.9c-.2-.6-.314-1.24-.314-1.9 0-.66.114-1.3.314-1.9V5.51H1.064A9.996 9.996 0 000 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59z" fill="#FBBC05"/>
        <path d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0 6.09 0 2.71 2.24 1.064 5.51l3.34 2.59C5.19 5.736 7.395 3.977 10 3.977z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    </button>
  `;
  document.querySelector('.container').appendChild(overlay);
}

// Hide login overlay
function hideLoginOverlay() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) {
    overlay.remove();
  }
}

// Render auth UI (login button or user profile)
function renderAuthUI() {
  if (isAuthenticated && currentUser) {
    const shortId = currentUser.id ? currentUser.id.slice(-6) : 'local';
    const avatarUrl = getAccountAvatarUrl();
    authSection.innerHTML = `
      <button id="accountButton" class="auth-button" type="button" title="Signed in" onclick="toggleAccountMenu()">
        <img src="${avatarUrl}" alt="${currentUser.name}" class="auth-avatar" />
        <span class="auth-name">${currentUser.name}</span>
      </button>
      <div id="accountMenu" class="auth-menu" role="menu" aria-hidden="true">
        <button class="auth-menu-item" type="button" onclick="openProfilePanel()">
          👤 Profile
        </button>
        <button class="auth-menu-item danger" type="button" onclick="handleLogout()">
          🚪 Logout
        </button>
      </div>
    `;
    showChatPage();
  } else {
    authSection.innerHTML = `
      <button class="auth-button auth-login" onclick="window.location.href='${API_BASE_URL}/auth/google'">
        <span>🔐 Sign In with Google</span>
      </button>
    `;
    showChatPage();
  }

  ensureAccountMenuListeners();
}

function showChatPage() {
  chatPage?.classList.add('is-active');
  profilePage?.classList.remove('is-active');
}

function showProfilePage() {
  chatPage?.classList.remove('is-active');
  profilePage?.classList.add('is-active');
}

function ensureAccountMenuListeners() {
  if (accountMenuReady) return;

  document.addEventListener('click', (event) => {
    const menu = document.getElementById('accountMenu');
    const button = document.getElementById('accountButton');
    if (!menu || !button) return;
    if (menu.contains(event.target) || button.contains(event.target)) return;
    menu.classList.remove('open');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = document.getElementById('accountMenu');
    menu?.classList.remove('open');
  });

  accountMenuReady = true;
}

window.toggleAccountMenu = function(forceState) {
  const menu = document.getElementById('accountMenu');
  if (!menu) return;
  if (typeof forceState === 'boolean') {
    menu.classList.toggle('open', forceState);
    return;
  }
  menu.classList.toggle('open');
};

window.openProfilePanel = function() {
  if (!isAuthenticated || !currentUser) return;
  const shortId = currentUser.id ? currentUser.id.slice(-6) : 'local';
  const avatarUrl = getAccountAvatarUrl();
  profileContent.innerHTML = `
    <div class="profile-card">
      <div class="account-card">
        <img src="${avatarUrl}" alt="${currentUser.name}" class="account-avatar" />
        <div class="account-details">
          <div class="account-name">${currentUser.name}</div>
          <div class="account-email">${currentUser.email}</div>
          <div class="account-meta">
            <span class="account-chip">Zippy Account</span>
            <span class="account-id">ID • ${shortId}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="profile-card">
      <div class="profile-row">
        <div class="profile-label">Provider</div>
        <div>Google</div>
      </div>
      <div class="profile-row">
        <div class="profile-label">Email</div>
        <div>${currentUser.email}</div>
      </div>
      <div class="profile-row">
        <div class="profile-label">Account ID</div>
        <div>${currentUser.id}</div>
      </div>
    </div>
  `;
  showProfilePage();
  toggleAccountMenu(false);
};

window.closeProfilePage = function() {
  showChatPage();
};

// Handle logout
window.handleLogout = async function() {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      credentials: 'include'
    });
    
    currentUser = null;
    isAuthenticated = false;
    conversationHistory = [];
    renderConversationHistory();
    renderAuthUI();
    showLoginOverlay();
  } catch (error) {
    console.error('[Auth] Logout failed:', error);
  }
};

// Load chat history from localStorage
function loadConversationHistory() {
  try {
    const raw = localStorage.getItem(getConversationStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    conversationHistory = Array.isArray(parsed) ? parsed : [];
    renderConversationHistory();
  } catch (error) {
    console.error('[Storage] Load failed:', error.message);
    conversationHistory = [];
  }
}

// Save chat history to localStorage
function saveConversationHistory() {
  try {
    localStorage.setItem(getConversationStorageKey(), JSON.stringify(conversationHistory));
  } catch (error) {
    console.error('[Storage] Save failed:', error.message);
  }
}

// Render conversation history
function renderConversationHistory() {
  if (!conversationHistory.length) {
    sidebarMessages.innerHTML = `
      <div class="message assistant">
        <div>
          <div class="message-label">Zippy Assistant</div>
          <div class="message-content">
            Hello! I'm Zippy, your AI assistant. Click the microphone button to start talking with me! 🎤
          </div>
        </div>
      </div>
    `;
    return;
  }

  sidebarMessages.innerHTML = '';
  conversationHistory.forEach((message) => {
    const sender = message.role === 'assistant' ? 'assistant' : 'user';
    addMessage(message.content, sender);
  });

  scrollChatToBottom();
}

// Configure audio player
sharedAudioPlayer.configure({ autoPlay: true });

// TTS Pre-initialization function (background init to avoid blocking)
async function initTTS() {
  if (tts || ttsReady) return;
  
  console.log('[TTS] Initializing...');
  tts = new TTSLogic({ voiceId: VOICE_ID });
  
  try {
    await tts.initialize();
    ttsReady = true;
    console.log('[TTS] Initialized successfully');
  } catch (err) {
    console.error('[TTS] Init error:', err);
    ttsReady = false;
  }
}

// STT Pre-initialization function for faster first use
function initSTTNow() {
  if (stt) return;
  
  console.log('[STT] Pre-initializing...');
  
  stt = new STTLogic(
    (message, type = 'info') => {
      console.log(`[STT] ${type}:`, message);
      // Track sound detection for 2-second silence timeout
      if (type !== 'silence' && message) {
        lastSoundTime = performance.now();
        // Clear any pending silence timeout
        if (silenceTimeout) {
          clearTimeout(silenceTimeout);
          silenceTimeout = null;
        }
      }
    },
    (transcript) => {
      console.log('[STT] Transcript:', transcript);
      
      // Prevent duplicate processing within same recording session
      if (transcriptProcessed) {
        console.log('[STT] Transcript already processed, ignoring');
        return;
      }
      
      if (transcript && transcript.trim()) {
        transcriptProcessed = true; // Mark as processed
        addMessage(transcript, 'user');
        // Stop listening and submit immediately
        stopListeningAndSubmit();
        handleUserInput(transcript);
      }
    },
    { 
      sessionDurationMs: 30000,
      interimSaveIntervalMs: 500,  // Check every 500ms
      recordingTimeout: 5000        // 5 seconds - let silence monitor handle stop
    }
  );
}

// Stop listening and turn off mic
function stopListeningAndSubmit() {
  if (!isListening) return;
  
  console.log('[Mic] Auto-stopping after transcript');
  
  // Clear any pending silence timeout
  if (silenceTimeout) {
    clearTimeout(silenceTimeout);
    silenceTimeout = null;
  }
  
  stt?.stop();
  isListening = false;
  micBtn.classList.remove('listening');
  micBtn.innerHTML = '<span class="icon">🎤</span><span>Tap to speak</span>';
  updateStatus('Listening stopped', 'default');
  setPenguinIdle();
}

// Update status message
function updateStatus(message, type = 'default') {
  console.log('[Status]', { message, type });
  status.textContent = message;
  status.className = `status ${type}`;
}

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    sidebarMessages.scrollTop = sidebarMessages.scrollHeight;
  });
}

// Add message to chat
function addMessage(text, sender = 'user') {
  console.log('[Chat]', { sender, text });
  const messageEl = document.createElement('div');
  messageEl.className = `message ${sender}`;
  
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;
  
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = sender === 'user' ? 'You' : 'Zippy Assistant';
  
  const wrapper = document.createElement('div');
  wrapper.appendChild(label);
  wrapper.appendChild(content);
  
  messageEl.appendChild(wrapper);
  sidebarMessages.appendChild(messageEl);

  scrollChatToBottom();
}

// Show thinking animation
function showThinking() {
  const messageEl = document.createElement('div');
  messageEl.className = 'message assistant';
  messageEl.id = 'thinking-message';
  
  const content = document.createElement('div');
  content.className = 'message-content thinking';
  content.innerHTML = '<span></span><span></span><span></span>';
  
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = 'Zippy is thinking...';
  
  const wrapper = document.createElement('div');
  wrapper.appendChild(label);
  wrapper.appendChild(content);
  
  messageEl.appendChild(wrapper);
  sidebarMessages.appendChild(messageEl);
  scrollChatToBottom();
  
  return messageEl;
}

// TTS streaming queue management
let ttsQueue = [];
let isTTSProcessing = false;
let firstAudioPlayed = false;

// Queue sentence for TTS synthesis
async function queueSentenceForTTS(sentence) {
  if (!sentence || !sentence.trim()) return;
  
  console.log('[TTS Queue] Adding sentence:', sentence);
  ttsQueue.push(sentence);
  
  // Start processing if not already running
  if (!isTTSProcessing) {
    processTTSQueue();
  }
}

// Process TTS queue
async function processTTSQueue() {
  if (isTTSProcessing) return;
  isTTSProcessing = true;

  while (ttsQueue.length > 0) {
    const sentence = ttsQueue.shift();
    
    try {
      console.log('[TTS Queue] Synthesizing:', sentence);
      
      // Track first audio
      if (!firstAudioPlayed) {
        updateStatus('Speaking...', 'speaking');
      }

      const audioData = await tts.synthesize(sentence);
      
      if (audioData) {
        console.log('[TTS Queue] Audio synthesized:', {
          sampleRate: audioData.sampleRate,
          samples: audioData.audio?.length ?? 0
        });
        
        // Add audio to player queue (will play automatically)
        sharedAudioPlayer.addAudioIntoQueue(audioData.audio, audioData.sampleRate);

        // Track first audio
        if (!firstAudioPlayed) {
          firstAudioPlayed = true;
          console.log('[TTS Queue] First audio ready');
          
          // Start penguin animation
          setPenguinSpeaking();
        }
      }
    } catch (error) {
      console.error('[TTS Queue] Error synthesizing sentence:', error);
    }
  }

  isTTSProcessing = false;
  console.log('[TTS Queue] Queue empty');
}

// Reset TTS queue (for new conversations)
function resetTTSQueue() {
  ttsQueue = [];
  isTTSProcessing = false;
  firstAudioPlayed = false;
  console.log('[TTS Queue] Reset');
}

// Get AI response from server with streaming
async function getAIResponse(userMessage) {
  try {
    updateStatus('Zippy is thinking...', 'thinking');
    
    conversationHistory.push({
      role: 'user',
      content: userMessage
    });
    saveConversationHistory();

    // Limit conversation history to last N messages for faster processing
    const recentHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
    
    console.log('[API] Sending streaming request to server:', `${API_BASE_URL}/api/chat`);
    console.log('[API] Payload messages (limited to last ${MAX_HISTORY_MESSAGES}):', [
      { role: 'system', content: SYSTEM_PROMPT },
      ...recentHistory,
    ]);

    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...recentHistory],
        stream: true
      }),
    });

    console.log('[API] Response status:', response.status);

    if (response.status === 401) {
      throw new Error('Not authenticated');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`API error ${response.status}`);
    }

    // Handle streaming response
    console.log('[Streaming] Starting to read response body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let firstChunkReceived = false;
    let lastSentenceEnd = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('[Streaming] Read complete');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      console.log('[Streaming] Received', lines.length, 'lines');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            console.log('[Streaming] Received [DONE] signal');
            continue;
          }
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            
            console.log('[Streaming] Token received:', content);
            
            if (content) {
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                console.log('[Streaming] First token received');
              }
              
              fullText += content;
              
              // Check for complete sentences and queue them for TTS
              const sentenceMatch = fullText.slice(lastSentenceEnd).match(/[^.!?]*[.!?]/);
              if (sentenceMatch) {
                const sentence = fullText.slice(lastSentenceEnd, lastSentenceEnd + sentenceMatch[0].length).trim();
                lastSentenceEnd += sentenceMatch[0].length;
                
                if (sentence) {
                  console.log('[Streaming] Queuing sentence for TTS:', sentence);
                  queueSentenceForTTS(sentence);
                }
              }
            }
          } catch (e) {
            console.error('[Streaming] JSON parse error:', e);
          }
        }
      }
    }

    // Queue any remaining text
    if (fullText.slice(lastSentenceEnd).trim()) {
      const remainingSentence = fullText.slice(lastSentenceEnd).trim();
      console.log('[Streaming] Queuing remaining text:', remainingSentence);
      queueSentenceForTTS(remainingSentence);
    }

    console.log('[API] AI Response complete:', fullText);

    conversationHistory.push({
      role: 'assistant',
      content: fullText
    });
    saveConversationHistory();

    return fullText;
  } catch (error) {
    console.error('[API] Error:', error.message);
    
    if (error.message === 'Not authenticated') {
      updateStatus('Session expired. Please sign in again.', 'error');
      isAuthenticated = false;
      currentUser = null;
      renderAuthUI();
      showLoginOverlay();
      return 'Please sign in again to continue.';
    }
    
    let errorMsg = 'Network error. Is the server running?';
    if (error.message.includes('Failed to fetch')) {
      errorMsg = 'Cannot connect to server.';
    } else if (error.message.includes('API error')) {
      errorMsg = 'Server error. Check console.';
    }
    
    updateStatus(errorMsg, 'error');
    return errorMsg;
  }
}

// Synthesize and play speech
async function speakResponse(text) {
  try {
    updateStatus('Preparing voice...', 'default');
    
    // Stop STT if it's currently listening (don't resume after)
    if (isListening && stt) {
      console.log('[STT] Stopping during TTS playback');
      stopListeningAndSubmit();
    }
    
    // Use pre-initialized TTS if ready, otherwise initialize
    if (!tts) {
      console.log('[TTS] Initializing (late)...');
      tts = new TTSLogic({ voiceId: VOICE_ID });
      await tts.initialize();
      ttsReady = true;
      console.log('[TTS] Initialized');
    } else if (!ttsReady) {
      // Wait for background initialization to complete (max 3 seconds)
      console.log('[TTS] Waiting for pre-init to complete...');
      let waitCount = 0;
      const maxWait = 60; // 3 seconds (60 * 50ms)
      while (!ttsReady && waitCount < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 50));
        waitCount++;
      }
      if (!ttsReady) console.warn('[TTS] Timeout waiting for init');
    }

    console.log('[TTS] Synthesizing text:', text);
    const result = await tts.synthesize(text);
    console.log('[TTS] Synthesis done:', {
      sampleRate: result.sampleRate,
      samples: result.audio?.length ?? 0,
    });
    
    // Calculate audio duration and wait for it to finish
    const audioDuration = (result.audio.length / result.sampleRate) * 1000; // in ms
    console.log('[TTS] Audio duration:', Math.round(audioDuration), 'ms');
    
    // Start video when audio actually starts playing
    setPenguinSpeaking();
    updateStatus('Speaking...', 'default');
    
    sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
    
    // Wait for audio to finish + small buffer
    await new Promise(resolve => setTimeout(resolve, audioDuration + 500));
    
    // Set penguin back to idle after speech finishes
    setPenguinIdle();
    updateStatus('Ready to listen', 'success');
  } catch (error) {
    console.error('[TTS] Error:', error.message);
    updateStatus('Voice unavailable (text only mode)', 'error');
    setPenguinIdle();
  }
}

// Handle user input
async function handleUserInput(userMessage) {
  console.log('[Input] User message:', userMessage);
  isProcessing = true;
  micBtn.disabled = true;
  setPenguinIdle();
  
  // Reset TTS queue for new conversation turn
  resetTTSQueue();
  
  const thinkingMsg = document.getElementById('thinking-message');
  if (thinkingMsg) thinkingMsg.remove();
  
  showThinking();

  try {
    // Streaming will automatically queue sentences for TTS as they arrive
    const aiResponse = await getAIResponse(userMessage);
    
    const thinking = document.getElementById('thinking-message');
    if (thinking) thinking.remove();
    
    addMessage(aiResponse, 'assistant');
    
    // No need to call speakResponse - streaming already handled TTS queueing
    console.log('[Input] Streaming complete, audio playing');
  } catch (error) {
    console.error('[Input] Error:', error);
  } finally {
    isProcessing = false;
    micBtn.disabled = false;
  }
}

// Microphone button handler
micBtn.addEventListener('click', async () => {
  try {
    if (isListening) {
      console.log('[Mic] Stopping listening');
      stopListeningAndSubmit();
    } else {
      if (!isAuthenticated) {
        updateStatus('Please sign in to use voice', 'error');
        return;
      }
      
      if (!stt) {
        initSTTNow();
      }
      
      console.log('[Mic] Starting listening');
      isListening = true;
      transcriptProcessed = false; // Reset for new recording session
      micBtn.classList.add('listening');
      micBtn.innerHTML = '<span class="icon">🎙️</span><span>Listening...</span>';
      updateStatus('Listening... Speak now', 'default');
      setPenguinListening();
      lastSoundTime = performance.now();
      
      stt.start();
      
      // Start monitoring for 2-second silence
      monitorSilence();
    }
  } catch (error) {
    console.error('[Mic] Error:', error);
    updateStatus(`Error: ${error.message}`, 'error');
    isListening = false;
    micBtn.classList.remove('listening');
    setPenguinIdle();
  }
});

// Monitor for 2 seconds of silence and auto-stop
function monitorSilence() {
  if (!isListening) return;
  
  if (silenceTimeout) clearTimeout(silenceTimeout);
  
  // Check every 500ms if 2 seconds have passed without sound
  silenceTimeout = setInterval(() => {
    if (!isListening) {
      clearInterval(silenceTimeout);
      silenceTimeout = null;
      return;
    }
    
    const timeSinceLast = performance.now() - lastSoundTime;
    if (timeSinceLast > 2000) {
      console.log('[Silence] 2 seconds detected - auto-stopping');
      clearInterval(silenceTimeout);
      silenceTimeout = null;
      stopListeningAndSubmit();
    }
  }, 500);
}

// Clear chat handler
sidebarClearBtn.addEventListener('click', () => {
  console.log('[UI] Clear chat');
  
  sidebarMessages.innerHTML = `
    <div class="message assistant">
      <div>
        <div class="message-label">Zippy Assistant</div>
        <div class="message-content">
          Hello! I'm Zippy, your AI assistant. Click the microphone button to start talking with me! 🎤
        </div>
      </div>
    </div>
  `;
  conversationHistory = [];
  saveConversationHistory();
  scrollChatToBottom();
  updateStatus('Chat cleared', 'success');
  setPenguinIdle();
});

// Initialize app
console.log('App initialized');
checkAuth();

// Setup audio player callback to control penguin animation
sharedAudioPlayer.setPlayingChangeCallback((isPlaying) => {
  console.log('[Audio Player] Playing state changed:', isPlaying);
  if (!isPlaying) {
    // Audio finished playing, stop penguin animation
    setPenguinIdle();
    updateStatus('Ready to listen', 'success');
  }
});
