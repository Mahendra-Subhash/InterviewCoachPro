function handleKeyPress(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
}

function newChat() {
    document.getElementById("chat-box").innerHTML = "";
}

async function sendMessage() {

    const input = document.getElementById("user-input");
    const chatBox = document.getElementById("chat-box");

    const message = input.value.trim();

    if (!message) return;

    chatBox.innerHTML += `
        <div class="message user">
            <div class="bubble">
                ${message}
            </div>
        </div>
    `;

    input.value = "";

    chatBox.innerHTML += `
        <div class="message ai-message" id="typing">
            <div class="avatar">🤖</div>
            <div class="bubble">
                <div class="typing">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    `;

    chatBox.scrollTop = chatBox.scrollHeight;

    try {

        const response = await fetch(
            "https://interview-coach-pro-green.vercel.app/chat",
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    message:message
                })
            }
        );

        const data = await response.json();

        document.getElementById("typing").remove();

        chatBox.innerHTML += `
            <div class="message ai-message">
                <div class="avatar">🤖</div>
                <div class="bubble">
                    ${data.reply}
                </div>
            </div>
        `;

        chatBox.scrollTop = chatBox.scrollHeight;

    }
    catch(error){

        document.getElementById("typing").remove();

        chatBox.innerHTML += `
            <div class="message ai-message">
                <div class="avatar">⚠️</div>
                <div class="bubble">
                    Error connecting to AI server.
                </div>
            </div>
        `;
    }
}