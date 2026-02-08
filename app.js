import { STTLogic } from 'speech-to-speech/stt';
import { TTSLogic, sharedAudioPlayer } from 'speech-to-speech/tts';

// Configuration
const VOICE_ID = 'en_US-hfc_female-medium';
const API_URL = 'https://backend-zippy.onrender.com/api/chat';
const SYSTEM_PROMPT = "You are Zippy, a cute 6-year-old AI kid who is super smart and playful! Your personality: You are innocent, playful, and curious like a real 6-year-old kid. You give accurate and truthful answers but in a fun, kid-like way. You use simple words, sometimes make cute mistakes or say funny things. You can be silly and playful! You speak in English. You remember what the user tells you and ask follow-up questions. IMPORTANT: Always give CORRECT, ACCURATE information even though you sound like a kid. Keep responses short (1-2 sentences). Be warm, friendly, and make the user smile!";
const CONVERSATION_STORAGE_KEY = 'zippy.conversationHistory';

// DOM Elements
const chatContainer = document.getElementById('chatContainer');
const micBtn = document.getElementById('micBtn');
const clearBtn = document.getElementById('clearBtn');
const status = document.getElementById('status');

// State
let stt = null;
let tts = null;
let isListening = false;
let isProcessing = false;
let conversationHistory = [];
let shouldResumeSTT = false; // Track if STT should resume after TTS

function saveConversationHistory() {
  try {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(conversationHistory));
  } catch (error) {
    console.error('[Storage] Save failed:', error.message);
  }
}

function loadConversationHistory() {
  try {
    const raw = localStorage.getItem(CONVERSATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[Storage] Load failed:', error.message);
    return [];
  }
}

function renderConversationHistory() {
  if (!conversationHistory.length) {
    return;
  }

  chatContainer.innerHTML = '';
  conversationHistory.forEach((message) => {
    const sender = message.role === 'assistant' ? 'assistant' : 'user';
    addMessage(message.content, sender);
  });

  scrollChatToBottom();
}

conversationHistory = loadConversationHistory();
renderConversationHistory();

// Configure audio player
sharedAudioPlayer.configure({ autoPlay: true });

// Update status message
function updateStatus(message, type = 'default') {
  console.log('[Status]', { message, type });
  status.textContent = message;
  status.className = `status ${type}`;
}

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
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
  label.textContent = sender === 'user' ? 'You' : 'Omli Assistant';
  
  const wrapper = document.createElement('div');
  wrapper.appendChild(label);
  wrapper.appendChild(content);
  
  messageEl.appendChild(wrapper);
  chatContainer.appendChild(messageEl);

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
  label.textContent = 'Omli is thinking...';
  
  const wrapper = document.createElement('div');
  wrapper.appendChild(label);
  wrapper.appendChild(content);
  
  messageEl.appendChild(wrapper);
  chatContainer.appendChild(messageEl);
  scrollChatToBottom();
  
  return messageEl;
}

// Get AI response from proxy server
async function getAIResponse(userMessage) {
  try {
    updateStatus('Omli is thinking...', 'thinking');
    
    conversationHistory.push({
      role: 'user',
      content: userMessage
    });
    saveConversationHistory();

    console.log('[API] Sending request to proxy server:', API_URL);
    console.log('[API] Payload messages:', [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
    ]);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...conversationHistory],
      }),
    });

    console.log('[API] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`API error ${response.status}`);
    }

    const data = await response.json();
    console.log('[API] AI Response received');

    const aiResponse = data.choices[0].message.content;
    console.log('[API] AI Response text:', aiResponse);

    conversationHistory.push({
      role: 'assistant',
      content: aiResponse
    });
    saveConversationHistory();

    return aiResponse;
  } catch (error) {
    console.error('[API] Error:', error.message);
    
    let errorMsg = 'Network error. Is the proxy server running?';
    if (error.message.includes('Failed to fetch')) {
      errorMsg = 'Cannot connect to server. Run: npm run server';
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
    updateStatus('Speaking...', 'default');
    
    // Pause STT if it's currently listening
    if (isListening && stt) {
      console.log('[STT] Pausing during TTS playback');
      stt.stop();
      shouldResumeSTT = true;
    }
    
    if (!tts) {
      console.log('[TTS] Initializing...');
      tts = new TTSLogic({ voiceId: VOICE_ID });
      await tts.initialize();
      console.log('[TTS] Initialized');
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
    
    sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
    
    // Wait for audio to finish + small buffer
    await new Promise(resolve => setTimeout(resolve, audioDuration + 500));
    
    // Resume STT if it was paused
    if (shouldResumeSTT && isListening) {
      console.log('[STT] Resuming after TTS playback');
      stt.start();
      shouldResumeSTT = false;
    }
    
    updateStatus('Ready to listen', 'success');
  } catch (error) {
    console.error('[TTS] Error:', error.message);
    updateStatus('Voice unavailable (text only mode)', 'error');
    
    // Try to resume STT even if there's an error
    if (shouldResumeSTT && isListening) {
      console.log('[STT] Resuming after TTS error');
      stt?.start();
      shouldResumeSTT = false;
    }
  }
}

// Initialize STT
function initSTT() {
  if (stt) return;
  
  console.log('[STT] Initializing...');
  
  stt = new STTLogic(
    (message, type = 'info') => {
      console.log(`[STT] ${type}:`, message);
    },
    (transcript) => {
      console.log('[STT] Transcript:', transcript);
      if (transcript && transcript.trim()) {
        addMessage(transcript, 'user');
        handleUserInput(transcript);
      }
    },
    { 
      sessionDurationMs: 30000, 
      interimSaveIntervalMs: 1000,
      recordingTimeout: 5000 
    }
  );
}

// Handle user input
async function handleUserInput(userMessage) {
  console.log('[Input] User message:', userMessage);
  isProcessing = true;
  micBtn.disabled = true;
  
  const thinkingMsg = document.getElementById('thinking-message');
  if (thinkingMsg) thinkingMsg.remove();
  
  showThinking();

  try {
    const aiResponse = await getAIResponse(userMessage);
    
    const thinking = document.getElementById('thinking-message');
    if (thinking) thinking.remove();
    
    addMessage(aiResponse, 'assistant');
    
    // Wait for speech to finish
    await speakResponse(aiResponse);
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
      stt?.stop();
      isListening = false;
      shouldResumeSTT = false; // Don't resume if user manually stops
      micBtn.classList.remove('listening');
      micBtn.innerHTML = '<span class="icon">🎤</span><span>Start Listening</span>';
      updateStatus('Stopped', 'default');
    } else {
      if (!stt) {
        initSTT();
      }
      
      console.log('[Mic] Starting listening');
      isListening = true;
      shouldResumeSTT = false;
      micBtn.classList.add('listening');
      micBtn.innerHTML = '<span class="icon">🎙️</span><span>Listening...</span>';
      updateStatus('Listening...', 'default');
      
      stt.start();
    }
  } catch (error) {
    console.error('[Mic] Error:', error);
    updateStatus(`Error: ${error.message}`, 'error');
    isListening = false;
    shouldResumeSTT = false;
    micBtn.classList.remove('listening');
  }
});

// Clear chat handler
clearBtn.addEventListener('click', () => {
  console.log('[UI] Clear chat');
  chatContainer.innerHTML = `
    <div class="message assistant">
      <div>
        <div class="message-label">Omli Assistant</div>
        <div class="message-content">
          Hello! I am Zippy AI Assistant. Click microphone to start talking!
        </div>
      </div>
    </div>
  `;
  conversationHistory = [];
  saveConversationHistory();
  scrollChatToBottom();
  updateStatus('Chat cleared', 'success');
});

// Text input handler
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');

if (textInput && sendBtn) {
  sendBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) {
      console.log('[Input] Text send:', text);
      addMessage(text, 'user');
      handleUserInput(text);
      textInput.value = '';
    }
  });

  textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendBtn.click();
    }
  });
}

console.log('App initialized');
updateStatus('Ready! Click microphone to start', 'default');
