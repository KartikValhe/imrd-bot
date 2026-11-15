// ChatHistoryItem.js - Single chat history item with hover (desktop) & swipe/long-press (mobile) delete action
window.GUNi = window.GUNi || {};

const { useState, useRef } = React;

window.GUNi.ChatHistoryItem = function ChatHistoryItem({ conversation, isActive, onSelect, onDelete, t }) {
    const [isRevealed, setIsRevealed] = useState(false);
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    const longPressTimer = useRef(null);

    const handleTouchStart = (e) => {
        if (!e.touches || e.touches.length === 0) return;
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;

        clearTimeout(longPressTimer.current);
        longPressTimer.current = setTimeout(() => {
            setIsRevealed(true);
        }, 450);
    };

    const handleTouchMove = (e) => {
        if (!e.touches || e.touches.length === 0) return;
        const deltaX = touchStartX.current - e.touches[0].clientX;
        const deltaY = Math.abs(touchStartY.current - e.touches[0].clientY);

        // Cancel long press if user is scrolling vertically
        if (deltaY > 10) {
            clearTimeout(longPressTimer.current);
        }

        // Swipe left (more than 30px) reveals delete button
        if (deltaX > 30 && deltaY < 25) {
            clearTimeout(longPressTimer.current);
            setIsRevealed(true);
        } else if (deltaX < -20) {
            // Swipe right hides delete button
            clearTimeout(longPressTimer.current);
            setIsRevealed(false);
        }
    };

    const handleTouchEnd = () => {
        clearTimeout(longPressTimer.current);
    };

    const handleItemClick = () => {
        if (isRevealed) {
            setIsRevealed(false);
            return;
        }
        onSelect(conversation.id);
    };

    return (
        <div
            className={`history-row${isActive ? ' active' : ''}${isRevealed ? ' revealed' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseLeave={() => setIsRevealed(false)}
        >
            <button
                type="button"
                className={`history-item${isActive ? ' active' : ''}`}
                title={conversation.title}
                onClick={handleItemClick}
            >
                <i className="bi bi-chat-left-text"></i>
                <span className="history-title">{conversation.title}</span>
            </button>
            <button
                type="button"
                className="history-delete"
                title={t?.deleteChat || "Delete chat"}
                aria-label={t?.deleteChat || "Delete chat"}
                onClick={(e) => {
                    e.stopPropagation();
                    setIsRevealed(false);
                    onDelete(conversation.id);
                }}
            >
                <i className="bi bi-trash3"></i>
            </button>
        </div>
    );
};
