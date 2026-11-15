// SidebarBrand.js - College logo, branding and collapse/close toggle
window.GUNi = window.GUNi || {};

window.GUNi.SidebarBrand = function SidebarBrand({ onToggleSidebar, t }) {
    return (
        <div className="brand">
            <a
                href="https://www.rcpimrd.ac.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="brand-link"
                title="Visit official RCPET's IMRD website (rcpimrd.ac.in)"
            >
                <div className="brand-icon">
                    <img
                        src="/images/rcpimrd-crest.png"
                        onError={(e) => {
                            if (e.target.src.indexOf('rcpimrd-crest.png') !== -1) {
                                e.target.src = '/images/rcpimrd-logo.png';
                            }
                        }}
                        alt="RCPET's IMRD Logo"
                        className="brand-logo-img"
                    />
                </div>
                <div className="brand-titles">
                    <div className="brand-name">{t?.brandName || 'IMRD Assistant'}</div>
                    <div className="brand-sub">{t?.brandSub || "RCPET's IMRD, Shirpur"}</div>
                </div>
            </a>
            <button
                type="button"
                className="sidebar-toggle-btn"
                id="sidebar-collapse-btn"
                title={t?.toggleSidebar || "Hide sidebar"}
                aria-label={t?.toggleSidebar || "Hide sidebar"}
                onClick={onToggleSidebar}
            >
                <i className="bi bi-layout-sidebar-inset"></i>
                <i className="bi bi-x-lg"></i>
            </button>
        </div>
    );
};
