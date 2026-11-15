// WelcomeCard.js - Initial friendly greeting screen with clean, localized suggestion cards
window.GUNi = window.GUNi || {};

window.GUNi.WelcomeCard = function WelcomeCard({ t, onSelectChip }) {
    const defaultCards = [
        {
            icon: 'bi bi-mortarboard-fill',
            title: 'Courses & Programs',
            desc: 'Explore MCA, BCA, BBA, Integrated MCA, and MMS programs',
            query: 'What courses and programs are offered at RCPET IMRD?'
        },
        {
            icon: 'bi bi-pencil-square',
            title: 'Admissions 2026',
            desc: 'Eligibility criteria, MAH-CET process & required documents',
            query: 'What is the admission procedure and eligibility for MCA and BCA?'
        },
        {
            icon: 'bi bi-cash-stack',
            title: 'Fees & Scholarships',
            desc: 'Annual fee structure and government scholarship schemes',
            query: 'What are the fees and available scholarships at RCPET IMRD?'
        },
        {
            icon: 'bi bi-book-half',
            title: 'Library & Koha',
            desc: 'Library books, e-resources, Koha system & opening timings',
            query: 'What are the library facilities and book borrowing rules?'
        },
        {
            icon: 'bi bi-briefcase-fill',
            title: 'Placements & T&P',
            desc: 'Campus recruitment, top recruiting companies & packages',
            query: 'Tell me about RCPET IMRD placements and top recruiters'
        },
        {
            icon: 'bi bi-geo-alt-fill',
            title: 'Campus & Contact',
            desc: 'College location at Shirpur, contact numbers & help desk',
            query: 'Where is RCPET IMRD located and how do I contact the college?'
        }
    ];

    const cards = (t && Array.isArray(t.promptCards) && t.promptCards.length > 0)
        ? t.promptCards
        : defaultCards;

    return (
        <div className="welcome-card" id="welcome-card">
            <div className="welcome-badge">
                <img
                    src="/images/rcpimrd-crest.png"
                    onError={(e) => {
                        if (e.target.src.indexOf('rcpimrd-crest.png') !== -1) {
                            e.target.src = '/images/rcpimrd-logo.png';
                        }
                    }}
                    alt="RCPET's IMRD"
                    className="welcome-badge-img"
                />
                <span className="welcome-badge-label">{t?.officialBadge || 'Official AI Assistant'}</span>
            </div>
            <h1 className="welcome-title">{t?.welcomeHeading || 'Hello, how can I help?'}</h1>
            <p className="welcome-sub">
                {t?.welcomeSub ||
                    "Ask me anything about RCPET's IMRD admissions, courses (MCA, BCA, BBA, MMS), eligibility, fees, campus facilities, or placements."}
            </p>

            <div className="welcome-grid">
                {cards.map((card, idx) => (
                    <button
                        key={idx}
                        type="button"
                        className="welcome-prompt-card"
                        onClick={() => onSelectChip(card.query)}
                    >
                        <div className="prompt-card-icon">
                            <i className={card.icon}></i>
                        </div>
                        <div className="prompt-card-text">
                            <span className="prompt-card-title">{card.title}</span>
                            <span className="prompt-card-desc">{card.desc}</span>
                        </div>
                        <i className="bi bi-arrow-up-right prompt-card-arrow"></i>
                    </button>
                ))}
            </div>
        </div>
    );
};
