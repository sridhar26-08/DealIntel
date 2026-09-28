const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messagesContainer');
const memoriesList = document.getElementById('memoriesList');
const refreshMemoriesBtn = document.getElementById('refreshMemoriesBtn');
const filterBtns = document.querySelectorAll('.filter-btn');
const quickChips = document.querySelectorAll('.chip');

let conversationHistory = [];
let allMemories = [];
let currentFilter = 'all';

// Auto-expand textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

// Enter to send
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

// Quick Chips
quickChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const text = chip.getAttribute('data-prompt');
    chatInput.value = text;
    sendMessage();
  });
});

// Memory filters
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    renderMemories();
  });
});

refreshMemoriesBtn.addEventListener('click', loadMemories);

// Render Markdown nicely
function formatMarkdown(text) {
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*$)/gim, '<h3 style="margin: 8px 0 4px; font-size: 15px; color:#93c5fd;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="margin: 10px 0 6px; font-size: 16px; color:#60a5fa;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="margin: 12px 0 8px; font-size: 18px; color:#3b82f6;">$1</h1>');

  const lines = html.split('\n');
  let result = [];
  let inList = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`<li>${trimmed.substring(2)}</li>`);
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (!inList) {
        result.push('<ol>');
        inList = true;
      }
      result.push(`<li>${trimmed.replace(/^\d+\.\s/, '')}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      if (trimmed) {
        result.push(`<p>${trimmed}</p>`);
      }
    }
  }
  if (inList) result.push('</ul>');

  return result.join('');
}

// Append message to UI
function appendMessage(role, content, memorySaved = false, dealHint = '') {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;

  const avatar = role === 'user' ? '👤' : '🤖';
  const name = role === 'user' ? 'You' : 'DealIntel Co-Pilot';

  let badgeHtml = '';
  if (memorySaved) {
    badgeHtml = `<div class="memory-saved-badge">💾 Stored to Hindsight Cloud for ${dealHint}</div>`;
  }

  msgEl.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="message-content">
      <div class="sender-name">${name}</div>
      ${badgeHtml}
      <div class="bubble">${role === 'user' ? `<p>${content}</p>` : formatMarkdown(content)}</div>
    </div>
  `;

  messagesContainer.appendChild(msgEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Append Typing indicator
function showTyping() {
  const typingEl = document.createElement('div');
  typingEl.id = 'typingIndicator';
  typingEl.className = 'message assistant';
  typingEl.innerHTML = `
    <div class="avatar">🤖</div>
    <div class="message-content">
      <div class="sender-name">DealIntel Co-Pilot</div>
      <div class="bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>
  `;
  messagesContainer.appendChild(typingEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeTyping() {
  const typingEl = document.getElementById('typingIndicator');
  if (typingEl) typingEl.remove();
}

// Send Message
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  appendMessage('user', text);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;

  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: conversationHistory })
    });

    const data = await res.json();
    removeTyping();
    sendBtn.disabled = false;

    if (data.success) {
      appendMessage('assistant', data.reply, data.memorySaved, data.dealHint);
      conversationHistory.push({ role: 'user', content: text });
      conversationHistory.push({ role: 'assistant', content: data.reply });
      if (conversationHistory.length > 8) conversationHistory.splice(0, 2);

      // If a memory was retained, refresh the memory list
      if (data.memorySaved) {
        loadMemories();
      }
    } else {
      appendMessage('assistant', `⚠️ Sorry, I encountered an issue: ${data.error}`);
    }
  } catch (err) {
    removeTyping();
    sendBtn.disabled = false;
    appendMessage('assistant', `⚠️ Network error: ${err.message}`);
  }

  chatInput.focus();
}

// Load Memories from Backend
async function loadMemories() {
  try {
    memoriesList.innerHTML = '<div class="loading-state">Syncing with Hindsight...</div>';
    const res = await fetch('/api/memories?q=deal');
    const data = await res.json();
    if (data.success && data.memories) {
      allMemories = data.memories;
      renderMemories();
    } else {
      memoriesList.innerHTML = '<div class="loading-state">No memories found.</div>';
    }
  } catch (e) {
    memoriesList.innerHTML = `<div class="loading-state">Error: ${e.message}</div>`;
  }
}

// Render memories according to current filter
function renderMemories() {
  let filtered = allMemories;
  if (currentFilter !== 'all') {
    filtered = allMemories.filter(m => 
      (m.text && m.text.toLowerCase().includes(currentFilter.toLowerCase())) ||
      (m.entities && m.entities.some(e => e.toLowerCase().includes(currentFilter.toLowerCase())))
    );
  }

  if (filtered.length === 0) {
    memoriesList.innerHTML = `<div class="loading-state">No memories matching "${currentFilter}".</div>`;
    return;
  }

  memoriesList.innerHTML = '';
  filtered.forEach(m => {
    const card = document.createElement('div');
    card.className = 'memory-card';

    let entityTags = '';
    if (m.entities && m.entities.length > 0) {
      entityTags = `<div class="memory-entities">${m.entities.map(e => `<span class="entity-tag">${e}</span>`).join('')}</div>`;
    }

    card.innerHTML = `
      <div class="memory-text">${m.text}</div>
      ${entityTags}
    `;
    memoriesList.appendChild(card);
  });
}

// Initial fetch
loadMemories();
