import React from 'react';

export default function LeftNavRail({ currentView, onNavigate }) {
  const isDashboard = currentView === 'dashboard';
  const isSync = currentView === 'sync';

  // When on dashboard screen, show expanded navigation bar with menu names
  if (isDashboard) {
    return (
      <aside
        className="left-nav-rail expanded"
        style={{
          width: '180px',
          minWidth: '180px',
          maxWidth: '180px',
          height: '100vh',
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '24px 12px 20px 12px',
          zIndex: 50,
          boxSizing: 'border-box',
          userSelect: 'none',
          flexShrink: 0,
          transition: 'all 0.2s ease'
        }}
      >
        {/* Top Nav Menu Items with Icons + Labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          
          {/* 1. 대시보드 */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            style={{
              width: '100%',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: isDashboard ? '#f1f5f9' : 'transparent',
              color: isDashboard ? '#0f172a' : '#64748b',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '0 14px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: isDashboard ? '700' : '600',
              transition: 'all 0.15s ease',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => {
              if (!isDashboard) {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.color = '#0f172a';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDashboard) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#64748b';
              }
            }}
          >
            {/* Isometric 3-Cubes Icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
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
            <span>대시보드</span>
          </button>

          {/* 2. 데일리싱크 */}
          <button
            type="button"
            onClick={() => onNavigate('sync')}
            style={{
              width: '100%',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: isSync ? '#f1f5f9' : 'transparent',
              color: isSync ? '#0f172a' : '#64748b',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '0 14px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: isSync ? '700' : '600',
              transition: 'all 0.15s ease',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => {
              if (!isSync) {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.color = '#0f172a';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSync) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#64748b';
              }
            }}
          >
            {/* Users / Team Icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>데일리싱크</span>
          </button>

          {/* 3. 마이페이지 */}
          <button
            type="button"
            onClick={() => onNavigate('sync')}
            style={{
              width: '100%',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'transparent',
              color: '#64748b',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '0 14px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.15s ease',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f8fafc';
              e.currentTarget.style.color = '#0f172a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#64748b';
            }}
          >
            {/* User Profile / MyPage Icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>마이페이지</span>
          </button>
        </div>
      </aside>
    );
  }

  // On other screens (e.g. Sync screen), keep the slim 56px icon rail
  return (
    <aside
      className="left-nav-rail"
      style={{
        width: '56px',
        minWidth: '56px',
        maxWidth: '56px',
        height: '100vh',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0 16px 0',
        zIndex: 50,
        boxSizing: 'border-box',
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      {/* Top Nav Icons Group */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
        
        {/* 1. Feed Dashboard (3D Cubes Icon) */}
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          title="대시보드"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: isDashboard ? '#f1f5f9' : 'transparent',
            color: isDashboard ? '#0f172a' : '#475569',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (!isDashboard) {
              e.currentTarget.style.backgroundColor = '#f8fafc';
              e.currentTarget.style.color = '#0f172a';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDashboard) {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#475569';
            }
          }}
        >
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
        </button>

        {/* 2. Timeline Sync (Users / Team Icon) */}
        <button
          type="button"
          onClick={() => onNavigate('sync')}
          title="데일리싱크"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: isSync ? '#f1f5f9' : 'transparent',
            color: isSync ? '#0f172a' : '#475569',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (!isSync) {
              e.currentTarget.style.backgroundColor = '#f8fafc';
              e.currentTarget.style.color = '#0f172a';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSync) {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#475569';
            }
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </button>

        {/* 3. MyPage Icon */}
        <button
          type="button"
          onClick={() => onNavigate('sync')}
          title="마이페이지"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: 'transparent',
            color: '#475569',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f8fafc';
            e.currentTarget.style.color = '#0f172a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#475569';
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </button>
      </div>

      {/* Bottom Settings Icon */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <button
          type="button"
          title="시스템 설정"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: 'transparent',
            color: '#475569',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f8fafc';
            e.currentTarget.style.color = '#0f172a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#475569';
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}
