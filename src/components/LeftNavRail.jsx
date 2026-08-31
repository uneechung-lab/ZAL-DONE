import React from 'react';

export default function LeftNavRail({ currentView, onNavigate }) {
  const isDashboard = currentView === 'dashboard';
  const isSync = currentView === 'sync';

  const navItems = [
    {
      id: 'dashboard',
      label: '대시보드',
      active: isDashboard,
      onClick: () => onNavigate('dashboard'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.2L7.5 4.8v4.8L12 12.2l4.5-2.6V4.8L12 2.2z"/>
          <path d="M7.5 4.8L12 7.4l4.5-2.6"/>
          <path d="M12 7.4v4.8"/>
          <path d="M7.5 12.2L3 14.8v4.8l4.5 2.6 4.5-2.6v-4.8L7.5 12.2z"/>
          <path d="M3 14.8l4.5 2.6 4.5-2.6"/>
          <path d="M7.5 17.4v4.8"/>
          <path d="M16.5 12.2L12 14.8v4.8l4.5 2.6 4.5-2.6v-4.8L16.5 12.2z"/>
          <path d="M12 14.8l4.5 2.6 4.5-2.6"/>
          <path d="M16.5 17.4v4.8"/>
        </svg>
      )
    },
    {
      id: 'sync',
      label: '칼렌다',
      active: isSync,
      onClick: () => onNavigate('sync'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      )
    },
    {
      id: 'mypage',
      label: '마이페이지',
      active: false,
      onClick: () => onNavigate('sync'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      )
    }
  ];

  return (
    <aside
      className="left-nav-rail"
      style={{
        width: isDashboard ? '142px' : '56px',
        minWidth: isDashboard ? '142px' : '56px',
        maxWidth: isDashboard ? '142px' : '56px',
        height: '100vh',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 8px 16px 8px',
        zIndex: 50,
        boxSizing: 'border-box',
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      {/* Top Nav Buttons (Icons fixed in identical 40x40 box at 8px from left edge) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            title={item.label}
            style={{
              width: '100%',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: item.active ? '#f1f5f9' : 'transparent',
              color: item.active ? '#0f172a' : '#94a3b8',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              padding: 0,
              cursor: 'pointer',
              overflow: 'hidden',
              boxSizing: 'border-box',
              transition: 'background-color 0.15s ease, color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (!item.active) {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.color = '#334155';
              }
            }}
            onMouseLeave={(e) => {
              if (!item.active) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#94a3b8';
              }
            }}
          >
            {/* Fixed-width Icon Box (Exactly 40x40px, centered - NEVER moves on screen transition!) */}
            <div style={{
              width: '40px',
              minWidth: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {item.icon}
            </div>

            {/* Menu Label (Slightly smaller 12.5px font, balanced right padding) */}
            {isDashboard && (
              <span style={{
                fontSize: '12.5px',
                fontWeight: item.active ? '700' : '600',
                color: item.active ? '#0f172a' : '#94a3b8',
                whiteSpace: 'nowrap',
                paddingRight: '14px',
                transition: 'color 0.15s ease'
              }}>
                {item.label}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bottom Settings Icon */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', width: '100%' }}>
        <button
          type="button"
          title="시스템 설정"
          style={{
            width: '100%',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: 'transparent',
            color: '#94a3b8',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: 0,
            cursor: 'pointer',
            overflow: 'hidden',
            boxSizing: 'border-box',
            transition: 'background-color 0.15s ease, color 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f8fafc';
            e.currentTarget.style.color = '#334155';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          <div style={{
            width: '40px',
            minWidth: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          {isDashboard && (
            <span style={{
              fontSize: '12.5px',
              fontWeight: '600',
              color: '#94a3b8',
              whiteSpace: 'nowrap',
              paddingRight: '14px',
              transition: 'color 0.15s ease'
            }}>
              설정
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
