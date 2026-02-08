import { STTLogic } from 'speech-to-speech/stt';
import { TTSLogic, sharedAudioPlayer } from 'speech-to-speech/tts';

// Configuration
const NVIDIA_API_KEY = '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';
const VOICE_ID = 'en_US-hfc_female-medium';

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

// Configure audio player
sharedAudioPlayer.configure({ autoPlay: true });

// Update status message
function updateStatus(message, type = 'default') {
  status.textContent = message;
  status.className = `status ${type}`;
}

// Add message to chat
function addMessage(text, sender = 'user') {
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
  
  // Scroll to bottom
  setTimeout(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 100);
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
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  return messageEl;
}

// Get AI response from NVIDIA Llama
async function getAIResponse(userMessage) {
  try {
    updateStatus('🤖 Omli is thinking...', 'thinking');
    
    conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    console.log('Sending request to NVIDIA API...');
    console.log('API Key available:', !!NVIDIA_API_KEY);
    
    // Use local proxy server instead of direct NVIDIA API
    const apiUrl = 'http://localhost:3001/api/chat';
    const payload = {
      messages: conversationHistory,
    };

    console.log('Request URL:', apiUrl);
    console.log('Payload:', payload);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', {
      'content-type': response.headers.get('content-type'),
      'x-request-id': response.headers.get('x-request-id')
    });

    const responseText = await response.text();
    console.log('Raw response:', responseText.substring(0, 200));

    if (!response.ok) {
      console.error('API Error:', response.status, responseText);
      
      if (response.status === 401) {
        throw new Error('Invalid API key');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded');
      } else if (response.status >= 500) {
        throw new Error('NVIDIA API server error');
      } else {
        throw new Error(`API error: ${response.status}`);
      }
    }

    const data = JSON.parse(responseText);
    console.log('Parsed response:', data);

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected response format:', data);
      throw new Error('Invalid response format from API');
    }

    const aiResponse = data.choices[0].message.content;
    console.log('AI Response:', aiResponse);

    conversationHistory.push({
      role: 'assistant',
      content: aiResponse
    });

    return aiResponse;
  } catch (error) {
    console.error('AI Error Details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    let errorMsg = 'Sorry, I encountered an error.';

    if (error instanceof TypeError) {
      // Network error or CORS issue
      errorMsg = '⚠️ Network/CORS issue. Try refreshing the page or check your internet.';
    } else if (error.message.includes('Invalid API key')) {
      errorMsg = '⚠️ API key invalid. Please check your credentials.';
    } else if (error.message.includes('Rate limit')) {
      errorMsg = '⏳ Rate limit exceeded. Please wait a moment.';
    } else if (error.message.includes('server error')) {
      errorMsg = '🔧 NVIDIA API server is having issues. Try again later.';
    } else if (error.message.includes('Invalid response')) {
      errorMsg = '📨 Received invalid response. Please try again.';
    } else {
      errorMsg = `⚠️ ${error.message}`;
    }

    updateStatus(errorMsg, 'error');
    
    // Return a fallback response for testing
    return errorMsg;
  }
}
    return errorMsg;
  }
}

// Synthesize and play speech
async function speakResponse(text) {
  try {
    updateStatus('🔊 Speaking...', 'default');
    
    if (!tts) {
      console.log('Initializing TTS...');
      tts = new TTSLogic({ voiceId: VOICE_ID });
      await tts.initialize();
      console.log('TTS initialized successfully');
    }

    console.log('Synthesizing text:', text.substring(0, 50) + '...');
    const result = await tts.synthesize(text);
    sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
    
    updateStatus('✨ Ready to listen', 'success');
  } catch (error) {
    console.error('TTS Error Details:', error);
    updateStatus(`🔇 Voice unavailable, but you can read the response`, 'error');
  }
}

// Initialize STT
function initSTT() {
  if (stt) return;
  
  console.log('Initializing STT...');
  
  stt = new STTLogic(
    (message, type = 'info') => {
      console.log(`STT [${type}]:`, message);
      if (type === 'error') {
        updateStatus(`⚠️ ${message}`, 'error');
      }
    },
    (transcript) => {
      console.log('Transcript received:', transcript);
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
  
  console.log('STT initialized successfully');
}

// Handle user input
async function handleUserInput(userMessage) {
  isProcessing = true;
  micBtn.disabled = true;
  
  // Remove thinking animation if exists
  const thinkingMsg = document.getElementById('thinking-message');
  if (thinkingMsg) thinkingMsg.remove();
  
  showThinking();

  try {
    const aiResponse = await getAIResponse(userMessage);
    
    // Remove thinking animation
    const thinking = document.getElementById('thinking-message');
    if (thinking) thinking.remove();
    
    addMessage(aiResponse, 'assistant');
    
    // Speak the response
    await speakResponse(aiResponse);
  } catch (error) {
    updateStatus(`Error: ${error.message}`, 'error');
  } finally {
    isProcessing = false;
    micBtn.disabled = false;
  }
}

// Microphone button handler
micBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  console.log('Mic button clicked, isListening:', isListening);
  
  try {
    if (isListening) {
      console.log('Stopping STT...');
      stt?.stop();
      isListening = false;
      micBtn.classList.remove('listening');
      micBtn.innerHTML = '<span class="icon">🎤</span><span>Start Listening</span>';
      updateStatus('✋ Stopped', 'default');
    } else {
      console.log('Starting STT...');
      
      if (!stt) {
        console.log('STT not initialized, initializing now...');
        initSTT();
      }
      
      isListening = true;
      micBtn.classList.add('listening');
      micBtn.innerHTML = '<span class="icon">🎙️</span><span>Listening...</span>';
      updateStatus('👂 Listening... (Click to stop)', 'default');
      
      console.log('Starting STT listening...');
      stt.start();
      console.log('STT started');
    }
  } catch (error) {
    console.error('Mic button error:', error);
    updateStatus(`Error: ${error.message}`, 'error');
    isListening = false;
    micBtn.classList.remove('listening');
    micBtn.innerHTML = '<span class="icon">🎤</span><span>Start Listening</span>';
  }
});

// Clear chat handler
clearBtn.addEventListener('click', () => {
  chatContainer.innerHTML = `
    <div class="message assistant">
      <div>
        <div class="message-label">Omli Assistant</div>
        <div class="message-content">
          Hello! I'm Omli, your AI assistant. Click the microphone button to start talking with me! 🎤
        </div>
      </div>
    </div>
  `;
  conversationHistory = [];
  updateStatus('✨ Chat cleared. Ready to talk!', 'success');
});

// Text input handler (for testing)
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');

if (textInput && sendBtn) {
  sendBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) {
      console.log('Text input:', text);
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

// Initialize
console.log('Application initialized');
console.log('NVIDIA API ready');
console.log('Buttons found:', { micBtn, clearBtn, textInput, sendBtn });

// Add visual feedback for button detection
if (micBtn) {
  console.log('Mic button element:', micBtn);
  console.log('Mic button click handler attached');
} else {
  console.error('Mic button NOT FOUND!');
}

updateStatus('✨ Ready! Click the microphone to start', 'default');