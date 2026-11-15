// TypingIndicator.js - Animated 3-dot indicator when assistant is generating reply
window.GUNi = window.GUNi || {};

window.GUNi.TypingIndicator = function TypingIndicator() {
    return (
        <div className="typing-row typing-indicator px-4 mb-2" id="typing-indicator" role="status" aria-label="Assistant is typing">
            <div className="typing-bubble">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
            </div>
        </div>
    );
};
