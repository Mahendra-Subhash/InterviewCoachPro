// API Base URL Auto-Detection
let API_BASE_URL = "";

// Split deploy (Vercel frontend + Render API): set <meta name="api-base-url" content="https://your-api.onrender.com">
const apiMeta = document.querySelector('meta[name="api-base-url"]');
if (apiMeta && apiMeta.content.trim()) {
    API_BASE_URL = apiMeta.content.trim().replace(/\/$/, "");
} else if (window.location.protocol === "file:" || (!window.location.port && !window.location.hostname)) {
    API_BASE_URL = "http://127.0.0.1:8000"; // Fallback to local default uvicorn port if opened as local file
} else if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    // If running on a different port than 8000 (like 5500 for Live Server), point to uvicorn on 8000
    if (window.location.port !== "8000") {
        API_BASE_URL = "http://127.0.0.1:8000";
    }
}

// Escape HTML utility to prevent XSS
function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Local Storage Sync helper
function saveSessionsToLocalStorage() {
    localStorage.setItem("icp_sessions", JSON.stringify(sessions));
}

// State Management
let sessions = [];
let activeSessionId = null;
let selectedFeedbackIndex = null;
let currentSelectedRating = 10; // Default rating

// Initialize Application
window.addEventListener("DOMContentLoaded", () => {
    initApp();
});

// App Initialization Flow
async function initApp() {
    setupInputAutoGrow();
    setupRatingSelector();
    
    // Show App Loader while fetching sessions
    const appLoader = document.getElementById("app-loader");
    if (appLoader) {
        appLoader.style.display = "flex";
    }

    try {
        await fetchSessions();
    } catch (error) {
        console.error("Failed to fetch sessions on startup:", error);
    } finally {
        if (appLoader) {
            appLoader.style.display = "none";
        }
    }
}

// Setup Textarea Auto-Growing
function setupInputAutoGrow() {
    const input = document.getElementById("user-input");
    if (!input) return;
    input.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
    });
}

// Setup Feedback Modal Rating Buttons
function setupRatingSelector() {
    const ratingBtns = document.querySelectorAll(".rating-btn");
    ratingBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            ratingBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentSelectedRating = parseInt(btn.textContent);
        });
    });
}

// Fetch all sessions from the Backend Supabase Store
async function fetchSessions() {
    try {
        const response = await fetch(API_BASE_URL + "/sessions");
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }
        
        sessions = await response.json();
        
        // Retrieve persistent active ID if it exists and is valid
        const savedActiveId = localStorage.getItem("icp_active_session_id");
        
        if (sessions.length === 0) {
            // Create initial default session in DB automatically
            await createNewSession();
        } else {
            activeSessionId = savedActiveId || sessions[0].id;
            
            // Validate if activeSessionId actually exists in sessions
            const sessionExists = sessions.some(s => s.id === activeSessionId);
            if (!sessionExists) {
                activeSessionId = sessions[0].id;
            }
            
            localStorage.setItem("icp_active_session_id", activeSessionId);
            
            // Load messages for the selected session
            await fetchSessionMessages(activeSessionId);
            renderSidebar();
            renderChat();
        }
    } catch (err) {
        console.error("Error loading sessions from backend:", err);
        // Fallback to local storage if API is offline during initial load
        fallbackToLocalStorage();
    }
}

// Fallback to local storage in case backend is unreachable on startup
function fallbackToLocalStorage() {
    const savedSessions = localStorage.getItem("icp_sessions");
    const savedActiveId = localStorage.getItem("icp_active_session_id");
    
    if (savedSessions) {
        try {
            sessions = JSON.parse(savedSessions);
            activeSessionId = savedActiveId || (sessions[0] ? sessions[0].id : null);
        } catch (e) {
            sessions = [];
        }
    }
    
    if (sessions.length === 0) {
        // Create local session object
        const localSess = {
            id: "local_temp_" + Date.now(),
            title: "Offline Chat Session",
            messages: [],
            created_at: new Date().toISOString()
        };
        sessions.push(localSess);
        activeSessionId = localSess.id;
    }
    
    renderSidebar();
    renderChat();
}

// Fetch Messages for a specific session from backend
async function fetchSessionMessages(sessionId) {
    // If it is a local offline session, skip API
    if (String(sessionId).startsWith("local_temp_")) return;

    try {
        const response = await fetch(API_BASE_URL + `/messages/${sessionId}`);
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }
        
        const dbMessages = await response.json();
        
        // Find session in local state array and set its messages
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            // Map DB format to UI expectations (DB uses role and message)
            session.messages = dbMessages.map(m => ({
                role: m.role, // 'user' or 'model'
                text: m.message
            }));
        }
    } catch (err) {
        console.error(`Error fetching messages for session ${sessionId}:`, err);
    }
}

// Create New Session
async function createNewSession() {
    const input = document.getElementById("user-input");
    const newTitle = "New Interview Session";

    try {
        const response = await fetch(API_BASE_URL + "/session", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ title: newTitle })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }
        
        const sessionObj = await response.json();
        sessionObj.messages = []; // Init empty local messages array
        
        sessions.unshift(sessionObj); // Put at top
        activeSessionId = sessionObj.id;
        localStorage.setItem("icp_active_session_id", activeSessionId);
        saveSessionsToLocalStorage();
        
        renderSidebar();
        renderChat();
        
    } catch (err) {
        console.error("Error creating new session on backend:", err);
        // Offline fallback
        const offlineSession = {
            id: "local_temp_" + Date.now(),
            title: "Offline Chat Session",
            messages: [],
            created_at: new Date().toISOString()
        };
        sessions.unshift(offlineSession);
        activeSessionId = offlineSession.id;
        localStorage.setItem("icp_active_session_id", activeSessionId);
        saveSessionsToLocalStorage();
        renderSidebar();
        renderChat();
    }
    
    if (input) {
        input.focus();
    }
}

// Switch Active Session
async function switchSession(sessionId) {
    activeSessionId = sessionId;
    localStorage.setItem("icp_active_session_id", activeSessionId);
    
    // Fetch latest messages from DB before rendering
    const appLoader = document.getElementById("app-loader");
    if (appLoader) {
        appLoader.style.display = "flex";
        appLoader.querySelector("p").textContent = "Loading conversation...";
    }
    
    try {
        await fetchSessionMessages(sessionId);
    } catch (err) {
        console.error(err);
    } finally {
        if (appLoader) {
            appLoader.style.display = "none";
        }
    }
    
    renderSidebar();
    renderChat();
    toggleSidebar(false); // Close on mobile if open
}

// Rename Session Title
async function renameSession(sessionId, event) {
    if (event) event.stopPropagation();
    
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    
    const newTitle = prompt("Enter new title for this session:", session.title);
    if (newTitle && newTitle.trim()) {
        const trimmedTitle = newTitle.trim();
        
        if (String(sessionId).startsWith("local_temp_")) {
            session.title = trimmedTitle;
            renderSidebar();
            saveSessionsToLocalStorage();
            return;
        }

        try {
            const response = await fetch(API_BASE_URL + "/session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    id: sessionId,
                    title: trimmedTitle
                })
            });
            
            if (!response.ok) {
                throw new Error("Failed to rename on backend");
            }
            
            const updatedSessionObj = await response.json();
            session.title = updatedSessionObj.title;
            renderSidebar();
            saveSessionsToLocalStorage();
        } catch (err) {
            console.error("Error renaming session:", err);
            alert("Error: Unable to rename session. Connection failed.");
        }
    }
}

// Delete Session
async function deleteSession(sessionId, event) {
    if (event) event.stopPropagation();
    
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) return;
    
    if (confirm("Are you sure you want to delete this conversation?")) {
        const idToDelete = sessions[sessionIndex].id;
        
        sessions.splice(sessionIndex, 1);
        saveSessionsToLocalStorage();
        
        if (String(idToDelete).startsWith("local_temp_")) {
            postDeleteNavigation(sessionId);
            return;
        }

        try {
            await fetch(API_BASE_URL + `/session/${idToDelete}`, {
                method: "DELETE"
            });
        } catch (err) {
            console.error("Error deleting session on server:", err);
        }
        
        postDeleteNavigation(idToDelete);
    }
}

// Handles switching logic after deleting a session
function postDeleteNavigation(deletedId) {
    if (sessions.length === 0) {
        createNewSession();
    } else {
        if (activeSessionId === deletedId) {
            activeSessionId = sessions[0].id;
            localStorage.setItem("icp_active_session_id", activeSessionId);
            fetchSessionMessages(activeSessionId).then(() => {
                renderSidebar();
                renderChat();
            });
        } else {
            renderSidebar();
            renderChat();
        }
    }
}

// Toggle Mobile Sidebar Drawer
function toggleSidebar(forceState) {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    if (forceState !== undefined) {
        if (forceState) sidebar.classList.add("open");
        else sidebar.classList.remove("open");
    } else {
        sidebar.classList.toggle("open");
    }
}

// Render Sidebar Sessions List
function renderSidebar() {
    const container = document.getElementById("chat-history");
    if (!container) return;
    container.innerHTML = "";

    sessions.forEach(session => {
        const item = document.createElement("div");
        item.className = `history-item ${session.id === activeSessionId ? 'active' : ''}`;
        item.onclick = () => switchSession(session.id);

        item.innerHTML = `
            <div class="history-item-details">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <span class="history-title" title="${escapeHTML(session.title)}">${escapeHTML(session.title)}</span>
            </div>
            <div class="history-actions">
                <button class="history-action-btn" onclick="renameSession('${session.id}', event)" title="Rename">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
                </button>
                <button class="history-action-btn" onclick="deleteSession('${session.id}', event)" title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Render Chat Messages bubble UI
function renderChat() {
    const chatBox = document.getElementById("chat-box");
    const welcomeScreen = document.getElementById("welcome-screen");
    if (!chatBox || !welcomeScreen) return;
    
    // Clear old message bubbles
    const messages = chatBox.querySelectorAll(".message");
    messages.forEach(m => m.remove());
    
    const activeSession = sessions.find(s => s.id === activeSessionId);
    if (!activeSession || !activeSession.messages || activeSession.messages.length === 0) {
        welcomeScreen.style.display = "flex";
        return;
    }

    welcomeScreen.style.display = "none";

    activeSession.messages.forEach((msg, idx) => {
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${msg.role === 'user' ? 'user' : 'ai'}`;
        
        const avatar = msg.role === 'user' ? 'M' : '🤖';
        const formattedBubble = formatMarkdown(msg.text);

        // Feedback options for assistant messages
        let actionHTML = "";
        if (msg.role === 'model') {
            actionHTML = `
                <div class="message-actions">
                    <button class="action-btn" onclick="openFeedbackModal(${idx}, 'up')" title="Good response">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                    </button>
                    <button class="action-btn" onclick="openFeedbackModal(${idx}, 'down')" title="Bad response">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm12-7h-3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path></svg>
                    </button>
                </div>
            `;
        }

        messageDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <div class="bubble">${formattedBubble}</div>
                ${actionHTML}
            </div>
        `;
        
        chatBox.appendChild(messageDiv);
    });

    // Run Syntax Highlighting and Code Wrapper additions
    postProcessCodeBlocks();

    // Auto-Scroll to bottom
    scrollToBottom(chatBox);
}

// Parse Markdown content safely using Marked.js
function formatMarkdown(text) {
    if (!text) return "";
    // Escape raw HTML tags to prevent XSS
    const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    try {
        if (window.marked && typeof window.marked.parse === 'function') {
            return window.marked.parse(escapedText);
        }
    } catch (e) {
        console.error("Marked parsing failed. Using text fallback:", e);
    }
    
    // Fallback basic renderer if Marked fails
    return escapedText.replace(/\n/g, "<br>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

// Enhance code blocks parsed by marked (highlighting, title headers, copy code button)
function postProcessCodeBlocks() {
    if (!window.hljs) return;

    document.querySelectorAll('#chat-box pre code').forEach((el) => {
        // Highlight content if not already processed
        if (!el.classList.contains('hljs')) {
            window.hljs.highlightElement(el);
            
            const pre = el.parentElement;
            if (pre && !pre.parentElement.classList.contains('code-container')) {
                // Get the coding language name
                let lang = 'code';
                el.classList.forEach(cls => {
                    if (cls.startsWith('language-')) {
                        lang = cls.replace('language-', '');
                    }
                });
                
                // Build Premium Code Container Layout
                const container = document.createElement('div');
                container.className = 'code-container';
                
                const header = document.createElement('div');
                header.className = 'code-header';
                header.innerHTML = `
                    <span>${lang.toUpperCase()}</span>
                    <button class="copy-btn" onclick="copyCode(this)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span>Copy code</span>
                    </button>
                `;
                
                // Insert components
                pre.parentNode.insertBefore(container, pre);
                container.appendChild(header);
                container.appendChild(pre);
            }
        }
    });
}

// Copy Code Block Action
function copyCode(button) {
    const codeContainer = button.closest(".code-container");
    if (!codeContainer) return;
    const codeElement = codeContainer.querySelector("code");
    const textToCopy = codeElement.textContent;
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        const label = button.querySelector("span");
        const originalText = label.textContent;
        label.textContent = "Copied!";
        button.style.color = "var(--success-color)";
        
        setTimeout(() => {
            label.textContent = originalText;
            button.style.color = "";
        }, 2000);
    }).catch(err => {
        console.error("Failed to copy code: ", err);
    });
}

// Auto-scroller with smooth animation
function scrollToBottom(container) {
    container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
    });
}

// Preset Prompts Card click handler
function usePresetPrompt(promptText) {
    const input = document.getElementById("user-input");
    if (!input) return;
    input.value = promptText;
    
    // Trigger auto-grow
    input.dispatchEvent(new Event("input"));
    sendMessage();
}

// Key Press Listeners
function handleKeyPress(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault(); // Prevent default newline
        sendMessage();
    }
}

// Main Send Message Flow
async function sendMessage(retryMessageText = null) {
    const input = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");
    const chatBox = document.getElementById("chat-box");
    
    if (!input || !sendBtn || !chatBox) return;

    const activeSession = sessions.find(s => s.id === activeSessionId);
    if (!activeSession) return;

    const messageText = retryMessageText || input.value.trim();
    if (!messageText) return;

    // Reset UI input elements
    if (!retryMessageText) {
        input.value = "";
        input.style.height = "auto";
    }
    
    input.disabled = true;
    sendBtn.disabled = true;

    // Clear previous error bubbles if retry runs
    const errorBubble = document.getElementById("error-bubble");
    if (errorBubble) errorBubble.remove();

    // 1. Append User Message
    if (!retryMessageText) {
        if (!activeSession.messages) {
            activeSession.messages = [];
        }
        activeSession.messages.push({
            role: "user",
            text: messageText
        });
        saveSessionsToLocalStorage();
        
        // Auto rename default session title based on first user query
        if (activeSession.title === "New Interview Session" && activeSession.messages.length === 1) {
            let truncatedTitle = messageText;
            if (truncatedTitle.length > 28) {
                truncatedTitle = truncatedTitle.substring(0, 25) + "...";
            }
            
            activeSession.title = truncatedTitle;
            renderSidebar();
            saveSessionsToLocalStorage();
            
            // Sync new title rename to Supabase
            if (!String(activeSessionId).startsWith("local_temp_")) {
                fetch(API_BASE_URL + "/session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: activeSessionId, title: truncatedTitle })
                }).catch(e => console.error("Session rename save error:", e));
            }
        }
    }

    renderChat();

    // 2. Append Typing Indicator
    const typingDiv = document.createElement("div");
    typingDiv.className = "message ai";
    typingDiv.id = "typing-indicator";
    typingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <div class="typing-bubble">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    chatBox.appendChild(typingDiv);
    scrollToBottom(chatBox);

    try {
        // Post current query along with session id to let the API retrieve DB history context
        const response = await fetch(API_BASE_URL + "/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: messageText,
                session_id: activeSessionId
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // Remove typing indicator
        const typingIndicator = document.getElementById("typing-indicator");
        if (typingIndicator) typingIndicator.remove();

        if (data.error) {
            throw new Error(data.reply || "API generated internal exception");
        }

        // 4. Save and Render AI Reply
        activeSession.messages.push({
            role: "model",
            text: data.reply
        });
        saveSessionsToLocalStorage();
        
        renderChat();

    } catch (error) {
        console.error("Communication error:", error);
        
        // Remove typing indicator
        const typingIndicator = document.getElementById("typing-indicator");
        if (typingIndicator) typingIndicator.remove();

        // Render Error Bubble
        const errorDiv = document.createElement("div");
        errorDiv.className = "message ai";
        errorDiv.id = "error-bubble";
        errorDiv.innerHTML = `
            <div class="message-avatar">⚠️</div>
            <div class="message-content">
                <div class="bubble error-bubble">
                    <h4>Connection Failure</h4>
                    <p>Unable to connect to the Interview Coach Pro AI server. Please verify your connection status and try again.</p>
                    <button class="retry-btn">
                        Retry Send
                    </button>
                </div>
            </div>
        `;
        const retryBtn = errorDiv.querySelector(".retry-btn");
        retryBtn.addEventListener("click", () => {
            retryMessage(messageText);
        });
        chatBox.appendChild(errorDiv);
        scrollToBottom(chatBox);
    } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

// Retry failed message trigger
function retryMessage(messageText) {
    const errorBubble = document.getElementById("error-bubble");
    if (errorBubble) errorBubble.remove();
    sendMessage(messageText);
}

// Open Feedback Modal
function openFeedbackModal(messageIndex, type) {
    selectedFeedbackIndex = messageIndex;
    
    // Pre-populate rating buttons
    const ratingBtns = document.querySelectorAll(".rating-btn");
    ratingBtns.forEach(btn => btn.classList.remove("active"));
    
    // Default 10 for Thumbs Up, 3 for Thumbs Down
    const defaultRating = type === 'up' ? 10 : 3;
    const targetBtn = Array.from(ratingBtns).find(btn => parseInt(btn.textContent) === defaultRating);
    if (targetBtn) {
        targetBtn.classList.add("active");
        currentSelectedRating = defaultRating;
    }

    const modalText = document.getElementById("feedback-text");
    const modalError = document.getElementById("modal-error");
    const modal = document.getElementById("feedback-modal");
    
    if (modalText) modalText.value = "";
    if (modalError) modalError.style.display = "none";
    if (modal) modal.classList.add("open");
}

// Close Feedback Modal
function closeFeedbackModal() {
    const modal = document.getElementById("feedback-modal");
    if (modal) modal.classList.remove("open");
    selectedFeedbackIndex = null;
}

// Select rating button programmatically
function selectRating(ratingValue) {
    currentSelectedRating = ratingValue;
}

// Submit feedback form data to the FastAPI database
async function submitFeedbackForm() {
    const errorDiv = document.getElementById("modal-error");
    const feedbackTextEl = document.getElementById("feedback-text");
    const feedbackText = feedbackTextEl ? feedbackTextEl.value.trim() : "";
    
    const activeSession = sessions.find(s => s.id === activeSessionId);
    if (!activeSession || selectedFeedbackIndex === null) {
        closeFeedbackModal();
        return;
    }

    // Get the AI reply and corresponding user prompt
    const aiMessage = activeSession.messages[selectedFeedbackIndex];
    let userPrompt = "No prompt recorded";
    
    // Find the closest preceding user message
    for (let i = selectedFeedbackIndex - 1; i >= 0; i--) {
        if (activeSession.messages[i].role === 'user') {
            userPrompt = activeSession.messages[i].text;
            break;
        }
    }

    const payload = {
        question: userPrompt,
        answer: aiMessage.text,
        feedback: feedbackText || "UI Thumbs Feedback",
        score: currentSelectedRating
    };

    try {
        if (errorDiv) errorDiv.style.display = "none";
        
        const response = await fetch(API_BASE_URL + "/feedback", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }

        const resData = await response.json();
        if (resData.error) {
            throw new Error(resData.error);
        }

        closeFeedbackModal();
        alert("Thank you! Your feedback has been saved successfully.");

    } catch (err) {
        console.error("Feedback submission error: ", err);
        if (errorDiv) {
            errorDiv.textContent = `Error: ${err.message || "Could not save feedback"}`;
            errorDiv.style.display = "block";
        }
    }
}